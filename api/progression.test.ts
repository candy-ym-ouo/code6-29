import assert from 'node:assert/strict';
import { applyXp, migrateActor, migrateTour, MAX_LEVEL, xpThreshold, type Progressive } from './progression.js';

// —— 经验扣除：升级时只扣离开的那一级阈值，经验绝不为负 ——
{
  const a:Progressive = { level:1, xp:90 };
  const r = applyXp(a, 20); // 90+20=110，跨过 L1 的 100
  assert.equal(a.level, 2, '应升到 2 级');
  assert.equal(a.xp, 10, '溢出 10 结转到 2 级，而非 110-200=-90');
  assert.ok(r.leveledUp && r.leveledTo === 2);
}
{
  const a:Progressive = { level:1, xp:0 };
  const r = applyXp(a, 100); // 恰好等于阈值
  assert.deepEqual({ level:a.level, xp:a.xp }, { level:2, xp:0 });
  assert.ok(r.leveledUp);
}
{
  const a:Progressive = { level:1, xp:0 };
  applyXp(a, 99);
  assert.deepEqual({ level:a.level, xp:a.xp }, { level:1, xp:99 }, '差一点不升级');
}

// —— 溢出 + 连续升级：一次大额经验逐级结算，不跳级、不丢经验 ——
{
  const a:Progressive = { level:1, xp:0 };
  applyXp(a, 100 + 200 + 50); // 越过 L1(100)、L2(200)，剩余 50
  assert.equal(a.level, 3, '应连续升到 3 级');
  assert.equal(a.xp, 50, '溢出经验按级结转');
}
{
  // 总账守恒：升级次数越多阈值越高，循环逐次扣减才正确
  const a:Progressive = { level:2, xp:150 };
  applyXp(a, 550); // 150+550=700 = 200(L2) + 300(L3) + 200
  assert.deepEqual({ level:a.level, xp:a.xp }, { level:4, xp:200 });
}

// —— 等级上限：满级后溢出经验封顶，不再升级 ——
{
  const a:Progressive = { level:MAX_LEVEL, xp:0 };
  applyXp(a, 99999);
  assert.equal(a.level, MAX_LEVEL);
  assert.equal(a.xp, xpThreshold(MAX_LEVEL), '满级经验条封顶');
}
{
  const a:Progressive = { level:MAX_LEVEL - 1, xp:0 };
  applyXp(a, 99999); // 从 9 级一路升到满级，剩余溢出封顶
  assert.equal(a.level, MAX_LEVEL);
  assert.equal(a.xp, xpThreshold(MAX_LEVEL));
}

// —— 非法经验输入：忽略非有限值与负数，不改动进度 ——
for (const bad of [-5, NaN, Infinity, undefined, null, '100', {}]) {
  const a:Progressive = { level:2, xp:30 };
  const r = applyXp(a, bad as any);
  assert.equal(r.gained, 0);
  assert.deepEqual({ level:a.level, xp:a.xp }, { level:2, xp:30 });
}

// —— 旧存档迁移：负经验回滚还原真实进度 ——
{
  // 复现旧 bug：level++ 后按新等级阈值扣经验。1 级 90 经验时获得 20：
  //   level=2, xp=110-200=-90（旧实现）
  const legacy:any = { level:2, xp:-90 };
  assert.ok(migrateActor(legacy));
  assert.deepEqual({ level:legacy.level, xp:legacy.xp }, { level:2, xp:10 }, '还原为 2 级 10 经验');
}
{
  // 连续演出触发的多段升级：旧公式每升一级多扣 100。
  // 从 1 级累计 800 经验经旧结算后停在 4 级 -100 经验；重新结算后为 4 级 200。
  const chained:any = { level:4, xp:-100 };
  migrateActor(chained);
  assert.equal(chained.level, 4);
  assert.equal(chained.xp, 200);
}
{
  // 非负的合法记录无法区分来自哪一版旧公式（另一版升级后清零经验），
  // 迁移必须原样保留，不能凭空补发经验。
  const zeroed:any = { level:3, xp:0 };
  assert.equal(migrateActor(zeroed), false);
  assert.deepEqual({ level:zeroed.level, xp:zeroed.xp }, { level:3, xp:0 });
  const mid:any = { level:2, xp:40 };
  assert.equal(migrateActor(mid), false);
  assert.deepEqual({ level:mid.level, xp:mid.xp }, { level:2, xp:40 });
  const fresh:any = { level:1, xp:0 };
  assert.equal(migrateActor(fresh), false);
}
{
  // 缺失字段的更老存档
  const old:any = { name:'旧演员' };
  migrateActor(old);
  assert.deepEqual({ level:old.level, xp:old.xp }, { level:1, xp:0 });
}
{
  // 积压溢出（从未触发过升级的存档）：一次性结清，连跨两级
  const stale:any = { level:1, xp:300 };
  migrateActor(stale);
  assert.deepEqual({ level:stale.level, xp:stale.xp }, { level:3, xp:0 });
}
{
  // 非法/超限等级收敛
  const broken:any = { level:99, xp:5 };
  migrateActor(broken);
  assert.equal(broken.level, MAX_LEVEL);
  assert.equal(broken.xp, 5);
  const nan:any = { level:'二', xp:-50 };
  migrateActor(nan);
  assert.deepEqual({ level:nan.level, xp:nan.xp }, { level:1, xp:0 });
}

// —— 迁移幂等：迁移后的数据再次迁移不应变化；schema 版本被标记 ——
{
  const tour:any = { actors:[{ level:2, xp:-90 }, { level:1, xp:0 }] };
  assert.ok(migrateTour(tour));
  const snap = JSON.parse(JSON.stringify(tour));
  assert.equal(tour.schemaVersion, 2);
  assert.equal(migrateTour(tour), false, '重复迁移不应产生改动');
  assert.deepEqual(tour, snap);
  assert.deepEqual(tour.actors[0], { level:2, xp:10 });
}
{
  // 迁移后的记录再走新结算流程：升级扣的是离开等级的阈值，经验不再为负
  const tour:any = { actors:[{ level:2, xp:-90 }] };
  migrateTour(tour);
  const a = tour.actors[0];
  applyXp(a, 90); // 2 级 10 经验 + 90 = 100，距阈值 200 仍不够
  assert.deepEqual({ level:a.level, xp:a.xp }, { level:2, xp:100 });
  applyXp(a, 100);
  assert.deepEqual({ level:a.level, xp:a.xp }, { level:3, xp:0 });
}

console.log('progression tests passed');
