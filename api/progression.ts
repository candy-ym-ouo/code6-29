export type ActorProgression = {
  level: number;
  xp: number;
};

export type ProgressionResult<T extends ActorProgression> = {
  actor: T;
  levelsChanged: number;
  fromLevel: number;
};

export const XP_PER_LEVEL = 100;

export function xpRequired(level: number): number {
  return Math.max(1, Math.trunc(level)) * XP_PER_LEVEL;
}

export function cumulativeXp(level: number): number {
  const normalizedLevel = Math.max(1, Math.trunc(level));
  return (XP_PER_LEVEL / 2) * (normalizedLevel - 1) * normalizedLevel;
}

function readLevel(value: Partial<ActorProgression> | null | undefined): number {
  const rawLevel = Number((value as ActorProgression | null | undefined)?.level);
  return Number.isFinite(rawLevel) ? Math.max(1, Math.trunc(rawLevel)) : 1;
}

function readLegacyXp(value: Partial<ActorProgression> | null | undefined): number {
  const source = value as (ActorProgression & { experience?: number }) | null | undefined;
  const rawXp = Number(source?.xp ?? source?.experience);
  if (!Number.isFinite(rawXp)) return 0;

  const xp = Math.trunc(rawXp);
  // 旧版本在升级后错误地扣除了新等级阈值，存档误差固定为 100。
  return xp < 0 ? xp + XP_PER_LEVEL : xp;
}

function readXp(value: Partial<ActorProgression> | null | undefined): number {
  return Math.max(0, readLegacyXp(value));
}

export function totalXp(actor: Partial<ActorProgression>): number {
  return cumulativeXp(readLevel(actor)) + readXp(actor);
}

export function progressionFromTotal(total: number): ActorProgression {
  const safeTotal = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(Number(total))));
  if (!Number.isFinite(safeTotal)) return { level: 1, xp: 0 };

  let crossedLevels = Math.max(0, Math.floor((Math.sqrt(1 + (8 * safeTotal) / XP_PER_LEVEL) - 1) / 2));
  while (cumulativeXp(crossedLevels + 2) <= safeTotal) crossedLevels++;

  const level = crossedLevels + 1;
  return { level, xp: safeTotal - cumulativeXp(level) };
}

export function carryOverflow<T extends ActorProgression>(actor: T): T {
  return { ...actor, ...progressionFromTotal(totalXp(actor)) };
}

export function migrateActorProgression<T extends object>(actor: T): T & ActorProgression {
  const source = actor as Partial<ActorProgression>;
  const level = readLevel(source);
  const xp = Math.max(0, readLegacyXp(source));
  return { ...actor, ...progressionFromTotal(cumulativeXp(level) + xp) };
}

export function gainXp<T extends ActorProgression>(actor: T, amount: number): ProgressionResult<T> {
  const fromLevel = readLevel(actor);
  const gain = Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
  const next = progressionFromTotal(totalXp(actor) + gain);
  return {
    actor: { ...actor, ...next },
    fromLevel,
    levelsChanged: next.level - fromLevel,
  };
}

export function applyXp<T extends ActorProgression>(
  actor: T,
  amount: number,
  options: { allowLevelDown?: boolean } = {},
): ProgressionResult<T> {
  if (!Number.isFinite(amount)) {
    const current = migrateActorProgression(actor);
    return { actor: current as T, levelsChanged: 0, fromLevel: current.level };
  }

  if (amount >= 0) return gainXp(actor, amount);

  const fromLevel = readLevel(actor);
  const currentXp = Math.max(0, readXp(actor));
  const currentTotal = cumulativeXp(fromLevel) + currentXp;
  const delta = Math.trunc(amount);
  const nextTotal = options.allowLevelDown
    ? Math.max(0, currentTotal + delta)
    : cumulativeXp(fromLevel) + Math.max(0, currentXp + delta);
  const next = progressionFromTotal(nextTotal);

  return {
    actor: { ...actor, ...next },
    fromLevel,
    levelsChanged: next.level - fromLevel,
  };
}

export function canSpendXp(actor: Partial<ActorProgression>, amount: number): boolean {
  if (!Number.isFinite(amount)) return false;
  const cost = Math.trunc(amount);
  return cost >= 0 && totalXp(actor) >= cost;
}

export function spendXp<T extends ActorProgression>(actor: T, amount: number): ProgressionResult<T> | null {
  const cost = Math.trunc(amount);
  if (!Number.isFinite(cost) || cost < 0 || !canSpendXp(actor, cost)) return null;
  return applyXp(actor, -cost, { allowLevelDown: true });
}

export function deductXp<T extends ActorProgression>(
  actor: T,
  amount: number,
  options: { allowLevelDown?: boolean } = {},
): ProgressionResult<T> {
  const cost = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  return applyXp(actor, -Math.max(0, cost), options);
}

export const addXp = gainXp;
export const addExperience = gainXp;
export const grantXp = gainXp;
export const subtractXp = deductXp;
export const migrateActor = migrateActorProgression;
export const normalizeActorProgression = migrateActorProgression;
