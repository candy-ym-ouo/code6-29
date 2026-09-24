// 演员成长：经验结算、升级阈值扣除、溢出结转、连续升级与旧存档迁移。
export const MAX_LEVEL = 10;
export const SCHEMA_VERSION = 2;

export interface Progressive { level:number; xp:number }

// 离开 L 级需要积满 L*100 经验；升级时只扣除这一级的阈值，剩余经验结转到下一级。
export function xpThreshold(level:number):number { return level*100 }

function normalizeGain(gain:unknown):number {
  const n = typeof gain === 'number' && Number.isFinite(gain) ? Math.trunc(gain) : 0;
  return Math.max(0, n);
}

// 用循环逐级结算当前经验条：跨阈值就扣除“离开等级”的阈值并升级，
// 溢出经验结转到下一级，直到不再越阈；满级后溢出封顶，经验永不为负。
function resolveLevels(actor:Progressive):void {
  while (actor.level < MAX_LEVEL && actor.xp >= xpThreshold(actor.level)) {
    actor.xp -= xpThreshold(actor.level); // 先扣“离开的这一级”的阈值，再升级
    actor.level += 1;
  }
  if (actor.level >= MAX_LEVEL) {
    actor.level = MAX_LEVEL; // 满级后无法再升级，溢出经验不再累积（经验条封顶）
    actor.xp = Math.min(actor.xp, xpThreshold(MAX_LEVEL));
  }
}

// 从累计获得的总经验重建等级（用于旧存档迁移）。
function settleFromTotal(actor:Progressive, totalXp:number):void {
  actor.level = 1;
  actor.xp = Number.isFinite(totalXp) && totalXp > 0 ? Math.trunc(totalXp) : 0;
  resolveLevels(actor);
}

export type XpResult = { gained:number; leveledUp:boolean; leveledTo:number };

// 为演员发放一次经验：自动完成阈值扣减、溢出结转与连续升级。
export function applyXp(actor:Progressive, gain:unknown):XpResult {
  const amount = normalizeGain(gain);
  const from = actor.level;
  actor.xp = (Number.isFinite(actor.xp) ? actor.xp : 0) + amount;
  resolveLevels(actor);
  if (actor.xp < 0) actor.xp = 0;
  return { gained: amount, leveledUp: actor.level > from, leveledTo: actor.level };
}

// 旧版升级公式曾留下两类历史记录：
//   A) level++ 后把经验清零（丢失溢出，经验条永远合法）；
//   B) level++ 后按“新等级”阈值扣经验（每级多扣 100，单场结算后经验必为负）。
// 存档里只有 level/xp，非负的合法记录无法区分来自哪一版，不能擅补经验；
// 而 B 版在每场最多 +25 经验的规则下升级后经验必然为负——因此：
// 只对负经验按 B 版公式反推累计总经验重新结算，合法记录原样保留。
function legacyTotalEarned(level:number, xp:number):number {
  let charged = 0;
  for (let l = 1; l < level; l++) charged += (l + 1) * 100;
  return xp + charged;
}

// 迁移单个旧角色记录，返回是否发生过修正。
export function migrateActor(actor:any):boolean {
  const hadLevel = typeof actor.level === 'number' && Number.isFinite(actor.level);
  const hadXp = typeof actor.xp === 'number' && Number.isFinite(actor.xp);
  const level0 = hadLevel ? Math.trunc(actor.level) : 1;
  const xp0 = hadXp ? Math.trunc(actor.xp) : 0;
  if (level0 > MAX_LEVEL) {
    // 超出上限的异常等级无法反推历史，直接收敛到上限并封顶经验。
    actor.level = MAX_LEVEL;
    actor.xp = Math.min(Math.max(xp0, 0), xpThreshold(MAX_LEVEL));
    return true;
  }
  const baseLevel = Math.max(1, level0);
  if (xp0 < 0) {
    // B 版负经验：按旧公式反推累计获得的总经验，再重新逐级结算。
    settleFromTotal(actor, legacyTotalEarned(baseLevel, xp0));
    return true;
  }
  // 字段缺失/非法，或经验积压越过阈值（含一次跨多级）：就地结清。
  actor.level = baseLevel;
  actor.xp = xp0;
  resolveLevels(actor);
  return !hadLevel || !hadXp || actor.level !== level0 || actor.xp !== xp0;
}

// 迁移整份剧团存档；幂等：已带当前 schemaVersion 的存档直接跳过。
export function migrateTour(tour:any):boolean {
  if (!tour || tour.schemaVersion === SCHEMA_VERSION) return false;
  let changed = tour.schemaVersion !== SCHEMA_VERSION;
  if (Array.isArray(tour.actors)) {
    for (const a of tour.actors) changed = migrateActor(a) || changed;
  }
  tour.schemaVersion = SCHEMA_VERSION;
  return changed;
}
