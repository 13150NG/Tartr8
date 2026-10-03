const modal=document.getElementById('gameModal'), area=document.getElementById('gameArea');
document.querySelector('.menu-toggle').onclick=()=>document.querySelector('.nav').classList.toggle('mobile');
document.querySelector('.modal-close').onclick=closeModal;
modal.onclick=e=>{if(e.target===modal)closeModal()};
function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
document.querySelectorAll('.game-launch').forEach(b=>b.onclick=()=>openGame(b.closest('.game-card').dataset.game));
function openGame(game){modal.classList.add('open');modal.setAttribute('aria-hidden','false');({reaction:reaction,memory:memory,number:numberGame})[game]();}

function reaction(){
 area.innerHTML=`<h2 class="game-title">Reaction</h2><p class="game-sub">Click the circle when it turns green. Too early = false start.</p>
 <div class="play-stage"><div class="score-line"><div>BEST<strong id="best">—</strong></div><div>LAST<strong id="last">—</strong> ms</div></div>
 <button class="big-button" id="reactBtn">START</button><div class="result" id="result"></div></div>`;
 let start=0,timer,best=localStorage.tartr8Best?Number(localStorage.tartr8Best):null;
 document.getElementById('best').textContent=best??'—';
 const btn=document.getElementById('reactBtn'),res=document.getElementById('result');
 btn.onclick=()=>{
  if(btn.dataset.waiting){clearTimeout(timer);btn.dataset.waiting='';btn.classList.remove('ready');btn.textContent='START';res.textContent='Too early — try again.';return}
  btn.dataset.waiting='1';btn.textContent='WAIT...';res.textContent='';
  timer=setTimeout(()=>{start=performance.now();btn.classList.add('ready');btn.textContent='CLICK!';btn.dataset.waiting='ready'},700+Math.random()*2600);
 };
 btn.addEventListener('click',()=>{
  if(btn.dataset.waiting==='ready'){let ms=Math.round(performance.now()-start);btn.dataset.waiting='';btn.classList.remove('ready');btn.textContent='START';document.getElementById('last').textContent=ms;res.textContent=ms<250?'Excellent reaction.':ms<400?'Nice one.':'Keep practicing.';if(best===null||ms<best){best=ms;localStorage.tartr8Best=ms;document.getElementById('best').textContent=ms;}}
 });
}

function memory(){
 area.innerHTML=`<h2 class="game-title">Memory</h2><p class="game-sub">Watch the highlighted sequence. Repeat it by clicking the cells.</p><div class="score-line"><div>ROUND<strong id="round">1</strong></div><div>BEST<strong id="mbest">${localStorage.tartr8Memory||0}</strong></div></div><div class="memory-board" id="board"></div><div class="result" id="mres">Press START to begin.</div><button class="restart" id="mstart">START</button>`;
 const board=document.getElementById('board'),res=document.getElementById('mres'),roundEl=document.getElementById('round');let seq=[],input=[],round=1,playing=false;
 for(let i=0;i<16;i++){let c=document.createElement('button');c.className='memory-cell';c.onclick=()=>pick(i);board.appendChild(c)}
 const cells=[...board.children];
 function flash(i){cells[i].classList.add('lit');setTimeout(()=>cells[i].classList.remove('lit'),350)}
 function next(){playing=true;input=[];roundEl.textContent=round;seq.push(Math.floor(Math.random()*16));let i=0;res.textContent='Watch...';let t=setInterval(()=>{flash(seq[i++]);if(i>=seq.length){clearInterval(t);setTimeout(()=>{playing=false;res.textContent='Your turn.'},450)}},650)}
 function pick(i){if(playing)return;flash(i);input.push(i);if(input[input.length-1]!==seq[input.length-1]){res.textContent=`Game over — you reached round ${round}.`;let b=Math.max(Number(localStorage.tartr8Memory||0),round-1);localStorage.tartr8Memory=b;document.getElementById('mbest').textContent=b;seq=[];round=1;return}if(input.length===seq.length){round++;setTimeout(next,500)}}
 document.getElementById('mstart').onclick=()=>{seq=[];round=1;next()}
}
function numberGame(){
 area.innerHTML=`<h2 class="game-title">Number Rush</h2><p class="game-sub">Solve 10 quick equations. Your score is based on correct answers and speed.</p><div class="score-line"><div>TIME<strong id="ntime">30</strong></div><div>SCORE<strong id="nscore">0</strong></div></div><div class="number-box"><div class="equation" id="eq">—</div><div class="answer-row"><input id="ans" type="number" inputmode="numeric" placeholder="Answer"><button id="submit">GO</button></div><div class="result" id="nres">Press GO to start.</div></div>`;
 let score=0,time=30,running=false,timer,correct=0,a,b,op;
 const eq=document.getElementById('eq'),ans=document.getElementById('ans'),submit=document.getElementById('submit'),res=document.getElementById('nres'),timeEl=document.getElementById('ntime'),scoreEl=document.getElementById('nscore');
 function question(){a=2+Math.floor(Math.random()*18);b=2+Math.floor(Math.random()*18);op=['+','−','×'][Math.floor(Math.random()*3)];if(op==='−'&&b>a)[[a,b]]=[[b,a]];eq.textContent=`${a} ${op} ${b}`;ans.value='';ans.focus()}
 function start(){running=true;score=0;correct=0;time=30;scoreEl.textContent=0;timeEl.textContent=30;res.textContent='';question();clearInterval(timer);timer=setInterval(()=>{time--;timeEl.textContent=time;if(time<=0){clearInterval(timer);running=false;eq.textContent='TIME';res.textContent=`Final score: ${score} — ${correct} correct.`;submit.textContent='RESTART'}},1000);submit.textContent='GO'}
 function check(){if(!running){start();return}let expected=op==='+'?a+b:op==='−'?a-b:a*b;if(Number(ans.value)===expected){score+=Math.max(5,time);correct++;scoreEl.textContent=score;res.textContent='✓ Correct';}else res.textContent=`✕ Answer: ${expected}`;question()}
 submit.onclick=check;ans.onkeydown=e=>{if(e.key==='Enter')check()}
}