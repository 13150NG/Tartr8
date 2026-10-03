// Each game renders into `area` and returns a cleanup function that stops its timers.

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} }
};

function setResult(el, text, tone) {
  el.textContent = text;
  el.className = 'result' + (tone ? ' ' + tone : '');
}

function reaction() {
  area.innerHTML = `<h2 class="game-title">Reaction</h2>
    <p class="game-sub">Press START, wait for green, then hit it as fast as you can. Clicking too early is a false start.</p>
    <div class="play-stage">
      <div class="score-line"><div>BEST<strong id="best">—</strong></div><div>LAST<strong id="last">—</strong></div></div>
      <button class="big-button" id="reactBtn">START</button>
      <div class="result" id="result" aria-live="polite"></div>
      <div id="submitSlot"></div>
    </div>`;
  const btn = document.getElementById('reactBtn'), res = document.getElementById('result');
  const bestEl = document.getElementById('best'), lastEl = document.getElementById('last');
  let state = 'idle', start = 0, timer;
  let best = store.get('tartr8Best') ? Number(store.get('tartr8Best')) : null;
  if (best !== null) bestEl.textContent = best + 'ms';

  function reset(label) { state = 'idle'; btn.className = 'big-button'; btn.textContent = label; }

  btn.onclick = () => {
    if (state === 'idle') {
      state = 'waiting';
      btn.className = 'big-button waiting';
      btn.textContent = 'WAIT…';
      setResult(res, '');
      document.getElementById('submitSlot').innerHTML = '';
      timer = setTimeout(() => {
        state = 'ready';
        start = performance.now();
        btn.className = 'big-button ready';
        btn.textContent = 'CLICK!';
      }, 900 + Math.random() * 2600);
    } else if (state === 'waiting') {
      clearTimeout(timer);
      reset('TRY AGAIN');
      setResult(res, 'Too early — false start.', 'bad');
    } else if (state === 'ready') {
      const ms = Math.round(performance.now() - start);
      reset('AGAIN');
      lastEl.textContent = ms + 'ms';
      offerScoreSubmit(document.getElementById('submitSlot'), 'reaction', ms);
      if (best === null || ms < best) {
        best = ms;
        store.set('tartr8Best', ms);
        bestEl.textContent = ms + 'ms';
        setResult(res, `${ms}ms — new personal best!`, 'good');
      } else {
        setResult(res, ms < 250 ? 'Excellent reaction.' : ms < 400 ? 'Nice one.' : 'Keep practicing.', ms < 400 ? 'good' : '');
      }
    }
  };
  btn.focus();
  return () => clearTimeout(timer);
}

function memory() {
  area.innerHTML = `<h2 class="game-title">Memory</h2>
    <p class="game-sub">Watch the highlighted sequence, then repeat it by clicking the cells. Each round adds one more step.</p>
    <div class="score-line"><div>ROUND<strong id="round">—</strong></div><div>BEST<strong id="mbest">${store.get('tartr8Memory') || 0}</strong></div></div>
    <div class="memory-board locked" id="board"></div>
    <div class="result" id="mres" aria-live="polite">Press START to begin.</div>
    <button class="restart" id="mstart">START</button>
    <div id="submitSlot"></div>`;
  const board = document.getElementById('board'), res = document.getElementById('mres');
  const roundEl = document.getElementById('round'), startBtn = document.getElementById('mstart');
  let seq = [], input = [], round = 0, accepting = false, timers = [];

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  for (let i = 0; i < 16; i++) {
    const c = document.createElement('button');
    c.className = 'memory-cell';
    c.setAttribute('aria-label', 'Cell ' + (i + 1));
    c.onclick = () => pick(i);
    board.appendChild(c);
  }
  const cells = [...board.children];

  function flash(i, cls = 'lit') {
    cells[i].classList.add(cls);
    later(() => cells[i].classList.remove(cls), 350);
  }
  function lock(on) { accepting = !on; board.classList.toggle('locked', on); }

  function next() {
    lock(true);
    input = [];
    round++;
    roundEl.textContent = round;
    seq.push(Math.floor(Math.random() * 16));
    setResult(res, 'Watch…');
    seq.forEach((cell, n) => later(() => flash(cell), 500 + n * 650));
    later(() => { lock(false); setResult(res, 'Your turn.'); }, 500 + seq.length * 650);
  }

  function pick(i) {
    if (!accepting) return;
    input.push(i);
    if (i !== seq[input.length - 1]) {
      lock(true);
      flash(i, 'wrong');
      const reached = round - 1;
      const best = Math.max(Number(store.get('tartr8Memory') || 0), reached);
      store.set('tartr8Memory', best);
      document.getElementById('mbest').textContent = best;
      setResult(res, `Game over — you completed ${reached} round${reached === 1 ? '' : 's'}.`, 'bad');
      startBtn.textContent = 'PLAY AGAIN';
      startBtn.disabled = false;
      offerScoreSubmit(document.getElementById('submitSlot'), 'memory', reached);
      return;
    }
    flash(i);
    if (input.length === seq.length) {
      lock(true);
      setResult(res, 'Correct!', 'good');
      later(next, 700);
    }
  }

  startBtn.onclick = () => {
    seq = [];
    round = 0;
    startBtn.disabled = true;
    document.getElementById('submitSlot').innerHTML = '';
    next();
  };
  startBtn.focus();
  return () => timers.forEach(clearTimeout);
}

function numberGame() {
  area.innerHTML = `<h2 class="game-title">Number Rush</h2>
    <p class="game-sub">Solve as many equations as you can in 30 seconds. Faster answers score more points.</p>
    <div class="score-line"><div>TIME<strong id="ntime">30</strong></div><div>SCORE<strong id="nscore">0</strong></div><div>BEST<strong id="nbest">${store.get('tartr8Number') || 0}</strong></div></div>
    <div class="number-box">
      <div class="equation" id="eq">—</div>
      <div class="answer-row"><input id="ans" type="number" inputmode="numeric" placeholder="Answer" aria-label="Your answer" disabled><button id="submit">START</button></div>
      <div class="result" id="nres" aria-live="polite">Press START, then type answers and hit Enter.</div>
      <div id="submitSlot"></div>
    </div>`;
  let score = 0, time = 30, running = false, timer, correct = 0, a, b, op;
  const eq = document.getElementById('eq'), ans = document.getElementById('ans'), submit = document.getElementById('submit');
  const res = document.getElementById('nres'), timeEl = document.getElementById('ntime'), scoreEl = document.getElementById('nscore');

  function question() {
    a = 2 + Math.floor(Math.random() * 18);
    b = 2 + Math.floor(Math.random() * 18);
    op = ['+', '−', '×'][Math.floor(Math.random() * 3)];
    if (op === '−' && b > a) [a, b] = [b, a];
    eq.textContent = `${a} ${op} ${b}`;
    ans.value = '';
    ans.focus();
  }
  function finish() {
    clearInterval(timer);
    running = false;
    ans.disabled = true;
    eq.textContent = 'TIME';
    const best = Number(store.get('tartr8Number') || 0);
    if (score > best) {
      store.set('tartr8Number', score);
      document.getElementById('nbest').textContent = score;
      setResult(res, `New best: ${score} points — ${correct} correct.`, 'good');
    } else {
      setResult(res, `Final score: ${score} — ${correct} correct.`);
    }
    submit.textContent = 'RESTART';
    submit.focus();
    offerScoreSubmit(document.getElementById('submitSlot'), 'number', score);
  }
  function start() {
    running = true;
    score = 0; correct = 0; time = 30;
    scoreEl.textContent = 0;
    timeEl.textContent = 30;
    setResult(res, '');
    document.getElementById('submitSlot').innerHTML = '';
    submit.textContent = 'GO';
    ans.disabled = false;
    question();
    clearInterval(timer);
    timer = setInterval(() => {
      time--;
      timeEl.textContent = time;
      if (time <= 0) finish();
    }, 1000);
  }
  function check() {
    if (!running) { start(); return; }
    if (ans.value === '') { ans.focus(); return; }
    const expected = op === '+' ? a + b : op === '−' ? a - b : a * b;
    if (Number(ans.value) === expected) {
      score += Math.max(5, time);
      correct++;
      scoreEl.textContent = score;
      setResult(res, '✓ Correct', 'good');
    } else {
      setResult(res, `✕ ${a} ${op} ${b} = ${expected}`, 'bad');
    }
    question();
  }
  submit.onclick = check;
  ans.onkeydown = e => { if (e.key === 'Enter') check(); };
  submit.focus();
  return () => clearInterval(timer);
}
