// Leaderboard rules per game. `lowerIsBetter` flips the sort order;
// min/max reject scores that can't come from a real play.
module.exports = {
  reaction: { name: 'Reaction', unit: 'ms', lowerIsBetter: true, min: 10, max: 5000 },
  memory: { name: 'Memory', unit: 'rounds', lowerIsBetter: false, min: 1, max: 200 },
  number: { name: 'Number Rush', unit: 'pts', lowerIsBetter: false, min: 1, max: 3000 },
  catch: { name: 'Catch', unit: 'pts', lowerIsBetter: false, min: 1, max: 100000 }
};
