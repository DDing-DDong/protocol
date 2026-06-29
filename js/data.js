// data.js
// 책임: 스테이지 데이터, 보상 데이터, 게임 상수 및 공통 유틸리티를 관리합니다.

export const TURN = {
  ATTACK: "attack",
  DEFENSE_BUILD: "defense_build",
  DEFENSE_REPLAY: "defense_replay",
  ENDING: "ending",
};

export const TRAPS = {
  laser: { name: "레이저", cost: 2, color: "#ff3b67" },
  shock: { name: "감전 바닥", cost: 2, color: "#ffcc33" },
  camera: { name: "카메라", cost: 1, color: "#bb5cff" },
  firewall: { name: "방화벽", cost: 3, color: "#ff7040" },
};

export const rewardPool = {
  attack: [
    {
      name: "방어 예산 +2",
      desc: "다음 방어 턴에서 함정을 더 배치할 수 있습니다.",
      apply: (game) => { game.mods.defenseBudgetBonus += 2; },
    },
    {
      name: "카메라 비용 -1",
      desc: "카메라 배치 비용이 최소 1까지 줄어듭니다.",
      apply: (game) => { game.mods.cameraDiscount = Math.min(1, game.mods.cameraDiscount + 1); },
    },
    {
      name: "레이저 강화",
      desc: "방어 턴 레이저의 판정 높이가 증가합니다.",
      apply: (game) => { game.mods.laserBoost += 18; },
    },
    {
      name: "방화벽 강화",
      desc: "방화벽의 지연 시간이 증가합니다.",
      apply: (game) => { game.mods.firewallDelay += 0.45; },
    },
  ],
  defense: [
    {
      name: "최대 에너지 +20",
      desc: "다음 공격 턴의 에너지 최대치가 증가합니다.",
      apply: (game) => { game.mods.maxEnergy += 20; },
    },
    {
      name: "대시 쿨다운 감소",
      desc: "공격 턴에서 대시를 더 자주 사용할 수 있습니다.",
      apply: (game) => { game.mods.dashCooldown = Math.max(0.45, game.mods.dashCooldown - 0.12); },
    },
    {
      name: "실드 효율 증가",
      desc: "실드가 소모하는 에너지가 줄어듭니다.",
      apply: (game) => { game.mods.shieldDrain = Math.max(28, game.mods.shieldDrain - 6); },
    },
    {
      name: "보호막 1회",
      desc: "공격 턴에서 함정 피해를 한 번 무시합니다.",
      apply: (game) => { game.mods.freeHit += 1; },
    },
  ],
};

export const WIDTH = 1200;
export const HEIGHT = 540;
export const GRAVITY = 1600;
export const GROUND_Y = 462;
export const SAMPLE_STEP = 0.06;
export const TILE_SIZE = 32;
export const CORE_X = 1088;
export const SHIELD_DURATION = 2.5;
export const HIT_INVINCIBLE_TIME = 0.9;
export const SHIELD_BLOCK_INVINCIBLE_TIME = 0.75;

export function createDefaultMods() {
  return {
    maxEnergy: 100,
    dashCooldown: 0.85,
    shieldDrain: 48,
    freeHit: 0,
    defenseBudgetBonus: 0,
    cameraDiscount: 0,
    laserBoost: 0,
    firewallDelay: 1.2,
  };
}

export function createMetrics() {
  return {
    detections: 0,
    delay: 0,
    energyUsed: 0,
    clearTime: 0,
    reachedCore: false,
    hpLost: 0,
  };
}

export function getStageTime(stage) {
  if (stage <= 3) return 48;
  if (stage <= 7) return 42;
  if (stage <= 11) return 38;
  return Math.max(24, 40 - Math.floor((stage - 12) * 1.2));
}

export function getObjective(stage) {
  const table = {
    1: "데이터 코어 탈취",
    2: "해커를 2초 이상 지연",
    3: "강화 보안 구역 돌파",
    4: "탐지 2회 이상",
    5: "제한 시간 안에 탈취",
    6: "해커 차단 또는 5초 지연",
    7: "복합 함정 구역 돌파",
    8: "에너지 소모 유도",
    9: "고위험 구역 침투",
    10: "최종 접근 방해",
    11: "중앙 데이터 코어 탈취",
  };
  if (table[stage]) return table[stage];
  return stage % 2 === 1 ? "무한 모드: 코어 탈취" : "무한 모드: 탐지 또는 지연";
}

export function pickRewards(type, rewardPoolList) {
  const pool = rewardPoolList[type].slice();
  shuffle(pool);
  return pool.slice(0, 3);
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function approach(value, target, amount) {
  if (value < target) return Math.min(value + amount, target);
  if (value > target) return Math.max(value - amount, target);
  return value;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function cryptoSafeId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return `trap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
