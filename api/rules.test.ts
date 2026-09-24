import assert from 'node:assert/strict';
import { actions, towns } from './content.js';
import {
  addXp,
  applyXp,
  canSpendXp,
  carryOverflow,
  deductXp,
  gainXp,
  migrateActorProgression,
  spendXp,
  totalXp,
  xpRequired,
} from './progression.js';

assert.equal(towns.length,8);
assert.equal(actions.length,12);
assert.ok(actions.every(a=>a.duration>0&&a.stamina>=0));

assert.equal(xpRequired(1),100);
assert.equal(xpRequired(2),200);
assert.equal(totalXp({level:1,xp:0}),0);
assert.equal(totalXp({level:2,xp:0}),100);
assert.equal(totalXp({level:3,xp:50}),350);

assert.deepEqual(gainXp({level:1,xp:0},100).actor,{level:2,xp:0});
assert.deepEqual(gainXp({level:1,xp:99},2).actor,{level:2,xp:1});
assert.deepEqual(gainXp({level:2,xp:150},350).actor,{level:4,xp:0});

const exactThreshold = gainXp({level:2,xp:0},200);
assert.deepEqual(exactThreshold.actor,{level:3,xp:0});
assert.equal(exactThreshold.levelsChanged,1);

const overflow = gainXp({level:1,xp:80},225);
assert.deepEqual(overflow.actor,{level:3,xp:5});
assert.equal(overflow.levelsChanged,2);

assert.deepEqual(carryOverflow({level:1,xp:250}),{level:2,xp:150});
assert.deepEqual(carryOverflow({level:3,xp:300}),{level:4,xp:0});

const sameLevelDeduction = applyXp({level:3,xp:120},-120);
assert.deepEqual(sameLevelDeduction.actor,{level:3,xp:0});
assert.equal(sameLevelDeduction.levelsChanged,0);

const levelDownDeduction = applyXp({level:3,xp:50},-300,{allowLevelDown:true});
assert.deepEqual(levelDownDeduction.actor,{level:1,xp:50});
assert.equal(levelDownDeduction.levelsChanged,-2);

assert.deepEqual(deductXp({level:3,xp:50},300).actor,{level:3,xp:0});
assert.deepEqual(deductXp({level:3,xp:50},300,{allowLevelDown:true}).actor,{level:1,xp:50});

assert.equal(canSpendXp({level:2,xp:50},151),false);
assert.equal(canSpendXp({level:2,xp:50},150),true);
assert.equal(spendXp({level:2,xp:50},151),null);
assert.deepEqual(spendXp({level:2,xp:50},150)!.actor,{level:1,xp:0});

assert.deepEqual(migrateActorProgression({name:'旧角色'}),{name:'旧角色',level:1,xp:0});
assert.deepEqual(migrateActorProgression({level:2,xp:-100}),{level:2,xp:0});
assert.deepEqual(migrateActorProgression({level:3,xp:-1}),{level:3,xp:99});
assert.deepEqual(migrateActorProgression({level:0,xp:0}),{level:1,xp:0});
assert.deepEqual(migrateActorProgression({level:1,xp:250}),{level:2,xp:150});
assert.deepEqual(migrateActorProgression({level:2,experience:50}),{level:2,experience:50,xp:50});

assert.deepEqual(addXp({level:1,xp:0},100).actor,gainXp({level:1,xp:0},100).actor);

console.log('rules smoke tests passed');
