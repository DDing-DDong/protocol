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
  shock: { name: "감전패널", cost: 2, color: "#ffcc33" },
  camera: { name: "카메라", cost: 1, color: "#bb5cff" },
  firewall: { name: "방화벽", cost: 1, color: "#ff7040" },
  emp: { name: "EMP패널", cost: 1, color: "#33e6ff" },
};

export const FIREWALL_BLOCK_TIME = 5;
export const FIREWALL_REWARD_BLOCK_BONUS = 1;
export const SHOCK_SLOW_TIME = 2;
export const SHOCK_SLOW_MULTIPLIER = 0.55;
export const SHOCK_EMPOWERED_DURATION_BONUS = 0.8;
export const CAMERA_NETWORK_EMPOWER_BONUS = 1;
export const STORY_STAGE_COUNT = 11;
export const INFINITE_STAGE_START = STORY_STAGE_COUNT + 1;

export const rewardPool = {
  attack: [
    {
      name: "방어 예산 +2",
      desc: "다음 방어 턴에서 함정을 더 배치할 수 있습니다.",
      apply: (game) => { game.mods.defenseBudgetBonus += 2; },
    },
    {
      name: "감시 네트워크",
      desc: "카메라 탐지 시 다음 함정 1개를 추가로 강화합니다.",
      apply: (game) => { game.mods.cameraNetworkBonus += CAMERA_NETWORK_EMPOWER_BONUS; },
    },
    {
      name: "레이저 강화",
      desc: "방어 턴 레이저의 판정 높이가 증가합니다.",
      apply: (game) => { game.mods.laserBoost += 18; },
    },
    {
      name: "방화벽 강화",
      desc: "방화벽의 차단 시간이 1초 증가합니다.",
      apply: (game) => { game.mods.firewallDelay += FIREWALL_REWARD_BLOCK_BONUS; },
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

export const stages = [
  {
    id: 1,
    name: "데이터 코어 탈취",
    mode: "story",
    securityLevel: 1,
    theme: {
      id: "access-room",
      name: "Access Room",
      palette: "cyan",
      securityTone: "low",
      background: "server-room",
    },
    mapIntent: {
      role: "tutorial",
      learningGoals: ["movement", "platform", "goal", "trap-slot", "wall-surface"],
      difficulty: 1,
      description: "기본 이동과 Goal 도달 흐름을 학습하는 첫 번째 서버실 맵",
      pacing: {
        start: "초반에는 함정 압박이 낮은 안전한 이동 구간을 제공한다.",
        middle: "중간 플랫폼에서는 함정과 감지 범위의 의미를 자연스럽게 인지시킨다.",
        end: "마지막 구간에서는 데이터 코어를 명확히 보여주고 도달 목표를 강조한다.",
      },
    },
    backgroundLayers: {
      far: ["future-city"],
      mid: ["server-rack", "cable", "security-panel"],
      front: ["large-square-tile", "platform-floor", "pipe-line", "glow-line"],
      fx: ["scan-line", "soft-glow"],
    },
    objective: "데이터 코어 탈취",
    timeLimit: 48,
    playerStart: {
      x: 72,
      y: 392,
      intent: "플레이어가 바닥 이동과 점프 타이밍을 안전하게 익히는 시작 위치",
    },
    goal: {
      x: 1088,
      y: 392,
      w: 42,
      h: 70,
      type: "core",
      label: "Data Core",
      intent: "첫 스테이지의 최종 목적지를 화면 오른쪽 끝에 명확히 배치한다.",
    },
    platforms: [
      {
        id: "stage-1-ground",
        x: 0,
        y: 462,
        w: 1200,
        h: 78,
        role: "main-route",
        intent: "기본 이동, 함정 슬롯 배치, Goal 접근을 모두 받쳐주는 기준 바닥",
      },
      {
        id: "stage-1-platform-start",
        x: 250,
        y: 360,
        w: 150,
        h: 18,
        role: "movement-step",
        intent: "첫 점프와 플랫폼 착지를 학습시키는 낮은 난이도의 디딤대",
      },
      {
        id: "stage-1-platform-mid",
        x: 520,
        y: 300,
        w: 150,
        h: 18,
        role: "trap-learning",
        intent: "중간 구간에서 카메라 감지와 함정 배치의 의미를 학습시키는 플랫폼",
      },
      {
        id: "stage-1-platform-goal",
        x: 810,
        y: 365,
        w: 150,
        h: 18,
        role: "goal-approach",
        intent: "Goal 직전 접근 경로를 정리하고 마지막 점프 흐름을 만든다.",
      },
    ],
    trapNodes: [
      {
        id: "stage-1-laser-1",
        type: "laser",
        x: 340,
        y: 352,
        w: 15,
        h: 110,
        intent: "초반 플랫폼 이후 세로 장애물을 보여주되 우회와 타이밍 학습이 가능하게 한다.",
        recommendedTrap: "laser",
        teaches: ["timing", "vertical-threat"],
      },
      {
        id: "stage-1-shock-1",
        type: "shock",
        x: 680,
        y: 448,
        w: 90,
        h: 14,
        intent: "지상 이동 중 바닥 함정의 위험을 짧고 명확하게 학습시키는 위치",
        recommendedTrap: "shock",
        teaches: ["ground-threat", "route-choice"],
      },
      {
        id: "stage-1-camera-1",
        type: "camera",
        x: 540,
        y: 252,
        w: 120,
        h: 70,
        intent: "플레이어가 중간 플랫폼을 통과할 때 감지 위험을 학습하게 하는 위치",
        recommendedTrap: "camera",
        teaches: ["detection", "platform-risk"],
      },
    ],
    wallTrapSlots: [
      {
        id: "stage-1-wall-left-upper",
        x: 220,
        y: 328,
        surface: "left-wall",
        allowedTraps: ["laser", "camera"],
        intent: "향후 벽타기 구간 진입 전에 벽면 함정의 방향성과 감지 위험을 실험할 슬롯",
      },
      {
        id: "stage-1-wall-mid-panel",
        x: 500,
        y: 268,
        surface: "mid-server-wall",
        allowedTraps: ["camera", "emp"],
        intent: "중간 플랫폼 주변 서버 패널에 설치되는 감지/방해형 벽면 함정 후보 위치",
      },
      {
        id: "stage-1-wall-goal-guard",
        x: 982,
        y: 336,
        surface: "goal-side-wall",
        allowedTraps: ["laser", "firewall"],
        intent: "Goal 직전 압박을 만들 수 있지만 현재 방어 턴 바닥 슬롯과는 분리된 벽면 후보 위치",
      },
    ],
    reward: {
      choices: 3,
      pools: {
        attack: "attack",
        defense: "defense",
      },
    },
  },
  {
    id: 2,
    name: "Firewall Gate",
    mode: "story",
    securityLevel: 2,
    theme: {
      id: "firewall-gate",
      name: "Firewall Gate",
      palette: "amber",
      securityTone: "medium-low",
      background: "server-gate",
    },
    mapIntent: {
      role: "defense-tutorial",
      learningGoals: ["replay-analysis", "limited-budget", "delay", "laser", "shock", "wall-surface"],
      difficulty: 2,
      description: "Replay를 완전히 막기보다 Laser 또는 Shock로 2초 이상 늦추는 첫 방어 튜토리얼 관문",
      pacing: {
        start: "Stage 1에서 기록된 이동 경로를 다시 관찰하고 초반 바닥 슬롯의 방어 가치를 판단하게 한다.",
        middle: "중앙 방화벽 관문 주변에 제한된 예산으로 Laser와 Shock 중 무엇을 놓을지 선택하게 한다.",
        end: "Goal 직전 서버 패널 구간에서 Replay Delay가 누적되면 방어 목표가 달성된다는 점을 확인시킨다.",
      },
    },
    backgroundLayers: {
      far: ["future-city", "firewall-grid"],
      mid: ["server-rack", "security-panel", "access-gate"],
      front: ["large-square-tile", "platform-floor", "gate-frame", "glow-line"],
      fx: ["scan-line", "warning-pulse"],
    },
    objective: "해커를 2초 이상 지연",
    timeLimit: 48,
    playerStart: {
      x: 72,
      y: 392,
      intent: "Replay가 Stage 1 공격 기록의 시작 위치에서 출발하므로 방어자는 같은 진입선을 기준으로 분석한다.",
    },
    goal: {
      x: 1088,
      y: 392,
      w: 42,
      h: 70,
      type: "core",
      label: "Firewall Gate",
      intent: "해커가 통과하려는 보안 관문을 코어 위치에 유지해 기존 진입 흐름을 깨지 않는다.",
    },
    platforms: [
      {
        id: "stage-2-ground",
        x: 0,
        y: 462,
        w: 1200,
        h: 78,
        role: "main-defense-route",
        intent: "Replay가 주로 지나가는 바닥 경로에 충분한 방어 슬롯을 제공하는 기준 바닥",
      },
      {
        id: "stage-2-platform-entry-sensor",
        x: 245,
        y: 360,
        w: 160,
        h: 18,
        role: "entry-analysis",
        intent: "초반 점프 기록을 분석하고 Laser가 진입선에 닿는지 실험할 수 있는 첫 서버 발판",
      },
      {
        id: "stage-2-platform-firewall-gate",
        x: 500,
        y: 318,
        w: 210,
        h: 18,
        role: "gate-chokepoint",
        intent: "중앙 관문 주변을 지나가는 Replay 경로에 Shock 또는 Laser를 배치하도록 유도하는 핵심 방어 구간",
      },
      {
        id: "stage-2-platform-delay-check",
        x: 790,
        y: 365,
        w: 180,
        h: 18,
        role: "delay-confirmation",
        intent: "Goal 직전 마지막 방어 슬롯의 의미를 보여주고 2초 지연 달성을 확인시키는 접근 발판",
      },
    ],
    trapNodes: [
      {
        id: "stage-2-shock-1",
        type: "shock",
        x: 620,
        y: 448,
        w: 96,
        h: 14,
        intent: "중앙 방화벽 관문을 통과하는 바닥 Replay 경로를 1초 이상 늦추는 추천 Shock 위치",
        recommendedTrap: "shock",
        teaches: ["delay", "ground-route", "budget-choice"],
      },
      {
        id: "stage-2-laser-1",
        type: "laser",
        x: 844,
        y: 344,
        w: 15,
        h: 118,
        intent: "Goal 접근 전 수직 Laser로 Replay 경로를 압박하고 Shock와 조합해 2초 지연을 노리게 한다.",
        recommendedTrap: "laser",
        teaches: ["vertical-threat", "route-read", "timing"],
      },
      {
        id: "stage-2-shock-2",
        type: "shock",
        x: 930,
        y: 448,
        w: 84,
        h: 14,
        intent: "예산이 제한된 상황에서 두 번째 Shock를 선택하면 지연 목표가 더 안정적으로 달성됨을 보여주는 후보 위치",
        recommendedTrap: "shock",
        teaches: ["delay-stack", "late-route", "limited-budget"],
      },
    ],
    wallTrapSlots: [
      {
        id: "stage-2-wall-entry-left",
        x: 205,
        y: 326,
        surface: "left-gate-wall",
        allowedTraps: ["laser", "camera"],
        intent: "향후 벽타기 진입 시 좌측 관문 벽에서 감지 또는 수직 압박을 실험할 후보 슬롯",
      },
      {
        id: "stage-2-wall-firewall-panel",
        x: 732,
        y: 286,
        surface: "firewall-server-panel",
        allowedTraps: ["laser", "shock", "emp"],
        intent: "중앙 서버 패널에 벽면 방해형 함정을 붙일 수 있도록 남겨둔 데이터 전용 후보 위치",
      },
      {
        id: "stage-2-wall-goal-right",
        x: 1014,
        y: 334,
        surface: "right-gate-wall",
        allowedTraps: ["laser", "firewall"],
        intent: "Goal 직전 우측 벽면에서 관문 폐쇄나 수직 레이저를 실험할 미래 벽면 슬롯",
      },
    ],
    reward: {
      choices: 3,
      pools: {
        attack: "attack",
        defense: "defense",
      },
    },
  },
];

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

export function getStageById(stageId) {
  const stageData = stages.find((stage) => stage.id === Number(stageId));
  return stageData ? cloneStageData(stageData) : null;
}

export function createDefaultMods() {
  return {
    maxEnergy: 100,
    dashCooldown: 0.85,
    shieldDrain: 48,
    freeHit: 0,
    defenseBudgetBonus: 0,
    cameraNetworkBonus: 0,
    laserBoost: 0,
    firewallDelay: 0,
  };
}

export function getFirewallBlockTime(game) {
  return FIREWALL_BLOCK_TIME + (game?.mods?.firewallDelay || 0);
}

export function getShockSlowTime(trap) {
  return SHOCK_SLOW_TIME + (trap?.empowered ? SHOCK_EMPOWERED_DURATION_BONUS : 0);
}

export function getShockDelay(trap) {
  return 1 + (trap?.empowered ? SHOCK_EMPOWERED_DURATION_BONUS : 0);
}

export function getCameraEmpowerCount(game) {
  return 1 + (game?.mods?.cameraNetworkBonus || 0);
}

export function createMetrics() {
  return {
    detections: 0,
    alertCharge: 0,
    delay: 0,
    energyUsed: 0,
    clearTime: 0,
    reachedCore: false,
    hpLost: 0,
  };
}

export function getStageTime(stage) {
  const stageData = getStageById(stage);
  if (stageData && stageData.timeLimit) return stageData.timeLimit;

  if (stage <= 3) return 48;
  if (stage <= 7) return 42;
  if (stage <= STORY_STAGE_COUNT) return 38;
  return Math.max(24, 40 - Math.floor((stage - INFINITE_STAGE_START) * 1.2));
}

export function getObjective(stage) {
  const stageData = getStageById(stage);
  if (stageData && stageData.objective) return stageData.objective;

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
  if (stage <= STORY_STAGE_COUNT && table[stage]) return table[stage];
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

function cloneStageData(stageData) {
  return {
    ...stageData,
    theme: stageData.theme ? { ...stageData.theme } : null,
    mapIntent: {
      ...(stageData.mapIntent || {}),
      learningGoals: stageData.mapIntent && stageData.mapIntent.learningGoals
        ? stageData.mapIntent.learningGoals.slice()
        : [],
      pacing: stageData.mapIntent && stageData.mapIntent.pacing
        ? { ...stageData.mapIntent.pacing }
        : {},
    },
    backgroundLayers: {
      far: stageData.backgroundLayers && stageData.backgroundLayers.far
        ? stageData.backgroundLayers.far.slice()
        : [],
      mid: stageData.backgroundLayers && stageData.backgroundLayers.mid
        ? stageData.backgroundLayers.mid.slice()
        : [],
      front: stageData.backgroundLayers && stageData.backgroundLayers.front
        ? stageData.backgroundLayers.front.slice()
        : [],
      fx: stageData.backgroundLayers && stageData.backgroundLayers.fx
        ? stageData.backgroundLayers.fx.slice()
        : [],
    },
    playerStart: { ...stageData.playerStart },
    goal: { ...stageData.goal },
    platforms: stageData.platforms.map((platform) => ({ ...platform })),
    trapNodes: stageData.trapNodes.map((trapNode) => ({
      ...trapNode,
      teaches: trapNode.teaches ? trapNode.teaches.slice() : [],
    })),
    wallTrapSlots: stageData.wallTrapSlots
      ? stageData.wallTrapSlots.map((slot) => ({
        ...slot,
        allowedTraps: slot.allowedTraps ? slot.allowedTraps.slice() : [],
      }))
      : [],
    reward: {
      ...stageData.reward,
      pools: { ...stageData.reward.pools },
    },
  };
}
