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
export const REWARD_TURN_MIN = 1;
export const REWARD_TURN_MAX = 2;
export const REWARD_MAX_TURN_STAGE_STEP = 5;
export const REWARD_MIN_TURN_STAGE_STEP = 10;
export const CAMERA_RANGE_SCALE_BONUS = 0.1;
export const SHOCK_DEFENSE_DELAY_BONUS = 1;
export const DISCOUNT_SLOT_COST_REDUCTION = 1;
export const CAMERA_DELAY_BONUS = 0.35;
export const SHOCK_SLOW_REDUCTION = 0.6;
export const SKILL_ENERGY_COST_REDUCTION = 0.15;
export const DASH_DURATION_BONUS = 0.05;
export const FIREWALL_BLOCK_REDUCTION = 1.5;
export const LASER_BASE_LENGTH = 83;
export const LASER_LENGTH_REWARD_BONUS = 24;

export const DEFENSE_OBJECTIVE_EPSILON = 0.01;

export const DEFENSE_OBJECTIVES = {
  2: {
    delay: 2,
    energyDrained: 20,
    maxTraps: 2,
  },
  4: {
    detections: 2,
    delay: 6,
    maxTraps: 3,
    requiredTrapTypes: ["laser"],
  },
  6: {
    detections: 2,
    delay: 1.8,
    maxTraps: 3,
    requiredTrapTypes: ["camera", "shock"],
  },
  8: {
    detections: 2,
    delay: 1.8,
    energyDrained: 20,
    maxTraps: 4,
    requiredTrapTypes: ["camera", "shock", "emp"],
  },
  10: {
    detections: 2,
    delay: 4,
    maxTraps: 4,
    requiredTrapTypes: ["camera", "firewall"],
  },
};

export const rewardPool = {
  attack: [
    createEffectReward({
      name: "함정 토큰 +2",
      desc: "다음 방어 턴에서 함정 토큰이 2개 증가합니다.",
      target: "defense",
      applyEffect: (game) => { game.mods.defenseBudgetBonus += 2; },
    }),
    createEffectReward({
      name: "감시 네트워크",
      desc: "카메라 탐지 시 다음 함정 1개를 추가로 강화합니다.",
      target: "defense",
      applyEffect: (game) => { game.mods.cameraNetworkBonus += CAMERA_NETWORK_EMPOWER_BONUS; },
    }),
    createEffectReward({
      name: "레이저 길이 증가",
      desc: "방어 턴 레이저의 길이가 증가합니다.",
      target: "defense",
      applyEffect: (game) => { game.mods.laserBoost += LASER_LENGTH_REWARD_BONUS; },
    }),
    createEffectReward({
      id: "firewall_delay_bonus",
      name: "방화벽 강화",
      desc: "방화벽의 차단 시간이 1초 증가합니다.",
      target: "defense",
      applyEffect: (game) => { game.mods.firewallDelay += FIREWALL_REWARD_BLOCK_BONUS; },
    }),
    createEffectReward({
      name: "카메라 범위 확장",
      desc: "카메라 탐지 판정의 좌우 범위가 10% 증가합니다.",
      target: "defense",
      applyEffect: (game) => { game.mods.cameraRangeScale += CAMERA_RANGE_SCALE_BONUS; },
    }),
    createEffectReward({
      name: "첫 함정 무료",
      desc: "방어 준비 때 처음 설치하는 함정 1개의 비용이 0이 됩니다.",
      target: "defense",
      applyEffect: (game) => { game.mods.freeTrapPlacements += 1; },
    }),
    createEffectReward({
      id: "shock_delay_bonus",
      name: "감전패널에 닿은 해커 지연 시간 +1초",
      desc: "감전패널에 닿은 해커의 지연 시간이 1초 증가합니다.",
      target: "defense",
      applyEffect: (game) => { game.mods.shockDelayBonus += SHOCK_DEFENSE_DELAY_BONUS; },
    }),
    createEffectReward({
      name: "할인 설치 슬롯",
      desc: "방어 준비 때 무작위 슬롯 1칸의 설치 비용이 1 감소합니다.",
      target: "defense",
      applyEffect: (game) => {
        game.mods.discountSlotCount += 1;
        game.mods.discountSlotCostReduction += DISCOUNT_SLOT_COST_REDUCTION;
      },
    }),
    createEffectReward({
      name: "카메라 지연 모듈",
      desc: "카메라 탐지에 짧은 지연 효과가 추가됩니다.",
      target: "defense",
      applyEffect: (game) => { game.mods.cameraDelay += CAMERA_DELAY_BONUS; },
    }),
    createDynamicEffectReward({
      target: "defense",
      createChoice: () => {
        const trapType = pickRandomTrapType();
        return {
          name: `${TRAPS[trapType].name} 추가 배치권`,
          desc: `함정 토큰은 소모하지만 ${TRAPS[trapType].name} 1개를 함정 개수 제한에 포함하지 않고 추가로 배치합니다.`,
          data: { trapType },
          applyEffect: (game, effect) => {
            const type = effect.data.trapType;
            game.mods.extraTrapUsesByType[type] = (game.mods.extraTrapUsesByType[type] || 0) + 1;
          },
        };
      },
    }),
  ],
  defense: [
    createEffectReward({
      name: "최대 에너지 +20",
      desc: "다음 공격 턴의 에너지 최대치가 증가합니다.",
      target: "attack",
      applyEffect: (game) => { game.mods.maxEnergy += 20; },
    }),
    createEffectReward({
      name: "대시 쿨다운 감소",
      desc: "공격 턴에서 대시를 더 자주 사용할 수 있습니다.",
      target: "attack",
      applyEffect: (game) => { game.mods.dashCooldown = Math.max(0.45, game.mods.dashCooldown - 0.12); },
    }),
    createEffectReward({
      name: "해킹 효율 증가",
      desc: "해킹이 소모하는 에너지가 줄어듭니다.",
      target: "attack",
      applyEffect: (game) => { game.mods.shieldDrain = Math.max(28, game.mods.shieldDrain - 6); },
    }),
    createEffectReward({
      name: "보호막 1회",
      desc: "공격 턴에서 함정 피해를 한 번 무시합니다.",
      target: "attack",
      applyEffect: (game) => { game.mods.freeHit += 1; },
    }),
    createEffectReward({
      name: "첫 해킹 무료",
      desc: "공격 턴에서 첫 해킹 사용의 에너지 소모가 0이 됩니다.",
      target: "attack",
      applyEffect: (game) => { game.mods.freeShieldUses += 1; },
    }),
    createEffectReward({
      name: "감전 저항",
      desc: "공격 턴에서 감전패널의 감속 지속 시간이 감소합니다.",
      target: "attack",
      applyEffect: (game) => { game.mods.shockSlowReduction += SHOCK_SLOW_REDUCTION; },
    }),
    createEffectReward({
      name: "스킬 절전",
      desc: "대시와 해킹의 에너지 비용이 15% 감소합니다.",
      target: "attack",
      applyEffect: (game) => { game.mods.skillEnergyCostMultiplier *= 1 - SKILL_ENERGY_COST_REDUCTION; },
    }),
    createEffectReward({
      id: "dash_duration_bonus",
      name: "슬라이딩 거리 증가",
      desc: "공격 턴 대시 지속 시간이 증가해 더 멀리 이동합니다.",
      target: "attack",
      applyEffect: (game) => { game.mods.dashDurationBonus += DASH_DURATION_BONUS; },
    }),
    createEffectReward({
      name: "방화벽 약화",
      desc: "공격 턴에서 방화벽 차단 시간이 감소합니다.",
      target: "attack",
      applyEffect: (game) => { game.mods.firewallBlockReduction += FIREWALL_BLOCK_REDUCTION; },
    }),
    createEffectReward({
      name: "카메라 은폐",
      desc: "공격 턴에서 카메라 탐지 1회를 무시합니다.",
      target: "attack",
      applyEffect: (game) => { game.mods.cameraIgnoreUses += 1; },
    }),
    createEffectReward({
      name: "랜덤 슬롯 폐쇄",
      desc: "다음 방어 준비 때 무작위 함정 슬롯 1칸이 설치 불가칸이 됩니다.",
      target: "defense",
      applyEffect: (game) => { game.mods.blockedSlotCount += 1; },
    }),
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
    timeLimit: 30,
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
      description: "Replay를 완전히 막기보다 Laser 또는 Shock로 3초 이상 늦추는 첫 방어 튜토리얼 관문",
      pacing: {
        start: "Stage 1에서 기록된 이동 경로를 다시 관찰하고 초반 바닥 슬롯의 방어 가치를 판단하게 한다.",
        middle: "중앙 방화벽 관문 주변에 제한된 함정 토큰으로 Laser와 Shock 중 무엇을 놓을지 선택하게 한다.",
        end: "Goal 직전 서버 패널 구간에서 Replay Delay가 누적되면 방어 목표가 달성된다는 점을 확인시킨다.",
      },
    },
    backgroundLayers: {
      far: ["future-city", "firewall-grid"],
      mid: ["server-rack", "security-panel", "access-gate"],
      front: ["large-square-tile", "platform-floor", "gate-frame", "glow-line"],
      fx: ["scan-line", "warning-pulse"],
    },
    objective: "해커를 3초 이상 지연",
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
        intent: "Goal 직전 마지막 방어 슬롯의 의미를 보여주고 3초 지연 달성을 확인시키는 접근 발판",
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
        intent: "Goal 접근 전 수직 Laser로 Replay 경로를 압박하고 Shock와 조합해 3초 지연을 노리게 한다.",
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
        intent: "함정 토큰이 제한된 상황에서 두 번째 Shock를 선택하면 지연 목표가 더 안정적으로 달성됨을 보여주는 후보 위치",
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

export const STAGE_ONE_LAYOUT_PRESETS = [
  {
    id: "server-rack-bypass",
    name: "Server Rack Bypass",
    description: "중앙 서버 랙을 기준으로 좌우 우회 루트와 바닥 지연 지점을 만드는 Stage 1 프리셋",
    platforms: [
      {
        id: "stage-1-a-ground",
        x: 0,
        y: 462,
        w: 1200,
        h: 78,
        role: "main-route",
        mapObject: "research-lab-floor",
        intent: "중앙 Choke Point 전후의 바닥 이동과 방어 슬롯을 모두 받쳐주는 기준 바닥",
      },
      {
        id: "stage-1-a-entry-step",
        x: 240,
        y: 366,
        w: 144,
        h: 48,
        role: "entry-step",
        mapObject: "server-rack-step",
        intent: "중앙 서버 랙에 진입하기 전 기본 점프와 착지를 유도하는 진입 발판",
      },
      {
        id: "stage-1-a-left-bypass",
        x: 384,
        y: 414,
        w: 144,
        h: 48,
        role: "low-bypass",
        mapObject: "cooling-unit",
        intent: "Wall Jump 없이도 중앙 기둥 왼쪽에서 낮은 우회 루트를 탈 수 있게 하는 보조 발판",
      },
      {
        id: "stage-1-a-security-pillar",
        x: 576,
        y: 222,
        w: 48,
        h: 144,
        role: "chokepoint-wall",
        mapObject: "security-pillar",
        intent: "상단 빠른 루트와 하단 우회 루트를 나누는 중앙 랜드마크로 이동 선택과 벽면 함정 설치 이유를 만든다.",
      },
      {
        id: "stage-1-a-wall-jump-landing",
        x: 624,
        y: 270,
        w: 144,
        h: 48,
        role: "wall-jump-fast-route",
        mapObject: "data-bridge",
        intent: "Wall Jump를 사용한 플레이어가 중앙 기둥을 넘어 빠르게 착지하는 상단 연결 발판",
      },
      {
        id: "stage-1-a-right-bypass",
        x: 720,
        y: 414,
        w: 144,
        h: 48,
        role: "exit-step",
        mapObject: "server-rack-step",
        intent: "중앙 기둥을 넘거나 돌아 나온 플레이어가 Goal 방향으로 회복하는 우측 발판",
      },
      {
        id: "stage-1-a-goal-approach",
        x: 912,
        y: 318,
        w: 144,
        h: 48,
        role: "goal-approach",
        mapObject: "data-bridge",
        intent: "Goal 직전 마지막 점프 흐름을 유지하면서 Replay 경로를 조금 더 길게 만든다.",
      },
    ],
    trapNodes: [
      {
        id: "stage-1-a-laser-entry",
        type: "laser",
        x: 336,
        y: 354,
        w: 15,
        h: 108,
        intent: "진입 발판 이후 타이밍 학습은 유지하되 중앙 Choke Point 전에 속도를 조절하게 한다.",
        recommendedTrap: "laser",
        teaches: ["timing", "vertical-threat"],
      },
      {
        id: "stage-1-a-shock-choke-exit",
        type: "shock",
        x: 744,
        y: 400,
        w: 96,
        h: 14,
        intent: "중앙 기둥을 우회한 뒤 착지하기 쉬운 바닥에 지연 위험을 배치한다.",
        recommendedTrap: "shock",
        teaches: ["ground-threat", "route-choice"],
      },
      {
        id: "stage-1-a-camera-pillar",
        type: "camera",
        x: 528,
        y: 150,
        w: 144,
        h: 72,
        intent: "중앙 서버 랙 상단 루트와 벽면 접근을 감시해 방어 턴의 Trap 설치 후보를 읽게 한다.",
        recommendedTrap: "camera",
        teaches: ["detection", "platform-risk", "wall-surface"],
      },
    ],
    wallTrapSlots: [
      {
        id: "stage-1-a-wall-entry",
        x: 408,
        y: 336,
        surface: "entry-server-rack",
        allowedTraps: ["laser", "camera"],
        intent: "초반 발판과 중앙 랙 사이를 읽는 벽면 감시 후보 위치",
      },
      {
        id: "stage-1-a-wall-pillar-left",
        x: 564,
        y: 210,
        surface: "security-pillar-left",
        allowedTraps: ["laser", "shock", "emp"],
        intent: "중앙 Choke Point 왼쪽 면에 방해형 함정을 붙일 수 있는 핵심 벽면 슬롯",
      },
      {
        id: "stage-1-a-wall-pillar-right",
        x: 630,
        y: 210,
        surface: "security-pillar-right",
        allowedTraps: ["camera", "firewall"],
        intent: "기둥을 넘어 나온 Replay를 다시 압박하는 우측 벽면 슬롯",
      },
    ],
  },
  {
    id: "offset-firewall-gate",
    name: "Offset Firewall Gate",
    description: "오른쪽으로 치우친 방화벽 기둥과 작은 보조 플랫폼으로 바닥/상단 선택을 만드는 Stage 1 프리셋",
    platforms: [
      {
        id: "stage-1-b-ground",
        x: 0,
        y: 462,
        w: 1200,
        h: 78,
        role: "main-route",
        mapObject: "research-lab-floor",
        intent: "오른쪽으로 밀린 Choke Point 때문에 Replay가 더 오래 관찰되는 기준 바닥",
      },
      {
        id: "stage-1-b-entry-step",
        x: 240,
        y: 366,
        w: 144,
        h: 48,
        role: "entry-step",
        mapObject: "server-rack-step",
        intent: "기존 초반 점프 감각을 유지하면서 중앙 진입 각도를 조금 바꾼다.",
      },
      {
        id: "stage-1-b-aux-platform",
        x: 432,
        y: 414,
        w: 144,
        h: 48,
        role: "aux-bypass",
        mapObject: "cooling-unit",
        intent: "일반 점프로 오른쪽 기둥을 돌아갈 수 있게 하는 작은 보조 플랫폼",
      },
      {
        id: "stage-1-b-firewall-barrier",
        x: 624,
        y: 222,
        w: 48,
        h: 144,
        role: "chokepoint-wall",
        mapObject: "firewall-barrier",
        intent: "오른쪽으로 치우친 수직 충돌면으로 하단 우회와 상단 빠른 루트를 분리하는 병목을 만든다.",
      },
      {
        id: "stage-1-b-high-route",
        x: 672,
        y: 270,
        w: 144,
        h: 48,
        role: "fast-exit",
        mapObject: "data-bridge",
        intent: "벽면을 활용한 플레이어가 더 빠르게 Goal 쪽으로 빠지는 상단 Wall Jump 루트",
      },
      {
        id: "stage-1-b-low-exit",
        x: 720,
        y: 414,
        w: 144,
        h: 48,
        role: "low-route-exit",
        mapObject: "server-rack-step",
        intent: "Wall Jump를 쓰지 않는 플레이어가 방화벽 아래를 지나 Goal 접근 발판으로 이어지는 하단 출구",
      },
      {
        id: "stage-1-b-goal-approach",
        x: 912,
        y: 318,
        w: 144,
        h: 48,
        role: "goal-approach",
        mapObject: "server-rack-step",
        intent: "상단 루트와 바닥 우회 루트를 Goal 앞에서 다시 합류시킨다.",
      },
    ],
    trapNodes: [
      {
        id: "stage-1-b-laser-gate",
        type: "laser",
        x: 600,
        y: 344,
        w: 15,
        h: 118,
        intent: "오프셋 기둥 진입 전에 세로 압박을 만들어 Wall Jump와 바닥 우회 선택을 분리한다.",
        recommendedTrap: "laser",
        teaches: ["timing", "vertical-threat", "route-choice"],
      },
      {
        id: "stage-1-b-shock-low-route",
        type: "shock",
        x: 744,
        y: 400,
        w: 96,
        h: 14,
        intent: "Wall Jump를 쓰지 않는 바닥 우회 경로에 작은 지연 위험을 제공한다.",
        recommendedTrap: "shock",
        teaches: ["ground-threat", "delay"],
      },
      {
        id: "stage-1-b-camera-high-route",
        type: "camera",
        x: 672,
        y: 198,
        w: 144,
        h: 72,
        intent: "상단 빠른 루트를 감시해 방어 턴에서 카메라와 Shock 조합을 고민하게 한다.",
        recommendedTrap: "camera",
        teaches: ["detection", "platform-risk"],
      },
    ],
    wallTrapSlots: [
      {
        id: "stage-1-b-wall-barrier-left",
        x: 612,
        y: 210,
        surface: "firewall-barrier-left",
        allowedTraps: ["laser", "shock", "emp"],
        intent: "오프셋 기둥 왼쪽 면에서 진입 Replay를 늦추는 핵심 벽면 슬롯",
      },
      {
        id: "stage-1-b-wall-barrier-right",
        x: 678,
        y: 210,
        surface: "firewall-barrier-right",
        allowedTraps: ["camera", "firewall"],
        intent: "기둥을 통과한 뒤 상단 루트와 바닥 루트를 동시에 읽을 수 있는 벽면 슬롯",
      },
      {
        id: "stage-1-b-wall-goal-panel",
        x: 1032,
        y: 288,
        surface: "goal-server-panel",
        allowedTraps: ["laser", "camera"],
        intent: "Goal 직전 합류 지점에서 마지막 압박을 줄 수 있는 후보 슬롯",
      },
    ],
  },
  {
    id: "core-pillar-overpass",
    name: "Core Pillar Overpass",
    description: "중앙 기둥과 상단 발판으로 Wall Jump 빠른 루트와 일반 우회 루트를 함께 제공하는 Stage 1 프리셋",
    platforms: [
      {
        id: "stage-1-c-ground",
        x: 0,
        y: 462,
        w: 1200,
        h: 78,
        role: "main-route",
        mapObject: "research-lab-floor",
        intent: "Wall Jump 루트 실패 시에도 정상 클리어 가능한 바닥 우회 루트를 유지한다.",
      },
      {
        id: "stage-1-c-entry-step",
        x: 240,
        y: 366,
        w: 144,
        h: 48,
        role: "entry-step",
        mapObject: "server-rack-step",
        intent: "중앙 상단 루트와 일반 우회 루트로 갈라지기 전 안정적인 진입 발판",
      },
      {
        id: "stage-1-c-low-bypass",
        x: 384,
        y: 414,
        w: 144,
        h: 48,
        role: "low-bypass",
        mapObject: "cooling-unit",
        intent: "Wall Jump 없이도 중앙 기둥을 돌아갈 수 있게 하는 낮은 보조 발판",
      },
      {
        id: "stage-1-c-ai-core-pillar",
        x: 576,
        y: 174,
        w: 48,
        h: 192,
        role: "chokepoint-wall",
        mapObject: "ai-core-pillar",
        intent: "프리셋 중 가장 강한 수직 랜드마크로 벽점프 접촉면과 Trap 설치 이유를 동시에 확보한다.",
      },
      {
        id: "stage-1-c-overpass",
        x: 624,
        y: 222,
        w: 144,
        h: 48,
        role: "wall-jump-fast-route",
        mapObject: "data-overpass",
        intent: "Wall Jump를 활용하면 빠르게 올라탈 수 있는 상단 발판",
      },
      {
        id: "stage-1-c-exit-step",
        x: 720,
        y: 414,
        w: 144,
        h: 48,
        role: "exit-step",
        mapObject: "server-rack-step",
        intent: "상단 빠른 루트와 낮은 우회 루트가 다시 합쳐지는 출구 발판",
      },
      {
        id: "stage-1-c-goal-approach",
        x: 912,
        y: 318,
        w: 144,
        h: 48,
        role: "goal-approach",
        mapObject: "data-bridge",
        intent: "Goal 직전 접근을 조금 더 길게 만들어 Defense 분석 시간을 늘린다.",
      },
    ],
    trapNodes: [
      {
        id: "stage-1-c-laser-pillar",
        type: "laser",
        x: 672,
        y: 344,
        w: 15,
        h: 118,
        intent: "상단 발판에서 내려오는 빠른 루트와 낮은 우회 루트 사이에 수직 위협을 둔다.",
        recommendedTrap: "laser",
        teaches: ["vertical-threat", "route-choice"],
      },
      {
        id: "stage-1-c-shock-bypass",
        type: "shock",
        x: 768,
        y: 400,
        w: 96,
        h: 14,
        intent: "일반 우회 루트의 착지 지점에 지연 위험을 만들어 Wall Jump 빠른 루트의 가치를 만든다.",
        recommendedTrap: "shock",
        teaches: ["ground-threat", "delay"],
      },
      {
        id: "stage-1-c-camera-overpass",
        type: "camera",
        x: 600,
        y: 150,
        w: 144,
        h: 72,
        intent: "상단 발판과 중앙 기둥 접촉면을 감시해 벽점프 루트를 방어 분석 대상으로 만든다.",
        recommendedTrap: "camera",
        teaches: ["detection", "wall-surface", "platform-risk"],
      },
    ],
    wallTrapSlots: [
      {
        id: "stage-1-c-wall-pillar-left",
        x: 564,
        y: 186,
        surface: "ai-core-pillar-left",
        allowedTraps: ["laser", "shock", "emp"],
        intent: "상단 발판으로 오르려는 접촉면을 직접 압박하는 벽면 슬롯",
      },
      {
        id: "stage-1-c-wall-pillar-right",
        x: 630,
        y: 186,
        surface: "ai-core-pillar-right",
        allowedTraps: ["camera", "firewall"],
        intent: "기둥을 넘어 나온 빠른 루트 Replay를 읽는 우측 벽면 슬롯",
      },
      {
        id: "stage-1-c-wall-overpass-panel",
        x: 684,
        y: 210,
        surface: "data-overpass-panel",
        allowedTraps: ["laser", "camera"],
        intent: "상단 발판 출구에서 빠른 루트와 Goal 접근을 연결해 감시하는 후보 슬롯",
      },
    ],
  },
];

const STAGE_ONE_LAYOUT_PRESET_BY_ID = new Map(
  STAGE_ONE_LAYOUT_PRESETS.map((preset) => [preset.id, preset])
);

export const WIDTH = 1200;
export const HEIGHT = 540;
export const GRAVITY = 1600;
export const GROUND_Y = 462;
export const SAMPLE_STEP = 0.03;
export const TILE_SIZE = 32;
export const CORE_X = 1088;
export const SHIELD_DURATION = 2.5;
export const HIT_INVINCIBLE_TIME = 0.9;
export const SHIELD_BLOCK_INVINCIBLE_TIME = 0.75;

export function getStageOneLayoutPresetIds() {
  return STAGE_ONE_LAYOUT_PRESETS.map((preset) => preset.id);
}

export function pickStageOneLayoutPresetId(random = Math.random) {
  const index = Math.floor(clamp(random(), 0, 0.999999) * STAGE_ONE_LAYOUT_PRESETS.length);
  return STAGE_ONE_LAYOUT_PRESETS[index]?.id || STAGE_ONE_LAYOUT_PRESETS[0].id;
}

export function getStageById(stageId, options = {}) {
  const stageData = stages.find((stage) => stage.id === Number(stageId));
  if (!stageData) return null;

  const clonedStage = cloneStageData(stageData);
  return applyStageLayoutPreset(clonedStage, options);
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
    firewallBlockReduction: 0,
    cameraRangeScale: 1,
    freeTrapPlacements: 0,
    shockDelayBonus: 0,
    discountSlotCount: 0,
    discountSlotCostReduction: 0,
    cameraDelay: 0,
    extraTrapUsesByType: createTrapTriggerCounts(),
    freeShieldUses: 0,
    shockSlowReduction: 0,
    skillEnergyCostMultiplier: 1,
    dashDurationBonus: 0,
    cameraIgnoreUses: 0,
    blockedSlotCount: 0,
  };
}

export function getFirewallBlockTime(game) {
  const mods = game?.mods || {};
  return Math.max(1, FIREWALL_BLOCK_TIME + (mods.firewallDelay || 0) - (mods.firewallBlockReduction || 0));
}

export function getShockSlowTime(trap, game) {
  const mods = game?.mods || {};
  return Math.max(0.4, SHOCK_SLOW_TIME + (trap?.empowered ? SHOCK_EMPOWERED_DURATION_BONUS : 0) - (mods.shockSlowReduction || 0));
}

export function getShockDelay(trap, game) {
  return 1 + (trap?.empowered ? SHOCK_EMPOWERED_DURATION_BONUS : 0) + (game?.mods?.shockDelayBonus || 0);
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
    energyDrained: 0,
    clearTime: 0,
    reachedCore: false,
    hpLost: 0,
    trapTriggers: createTrapTriggerCounts(),
  };
}

export function getStageTime(stage) {
  if (stage % 2 === 1) return 30;

  const stageData = getStageById(stage);
  if (stageData && stageData.timeLimit) return stageData.timeLimit;

  if (stage <= 3) return 48;
  if (stage <= 7) return 42;
  if (stage <= STORY_STAGE_COUNT) return 38;
  return Math.max(24, 40 - Math.floor((stage - INFINITE_STAGE_START) * 1.2));
}

export function getObjective(stage) {
  const defenseObjective = getDefenseObjective(stage);
  if (defenseObjective) return "수비 목표 확인";

  const stageData = getStageById(stage);
  if (stageData && stageData.objective) return stageData.objective;

  const table = {
    1: "데이터 코어 탈취",
    3: "강화 보안 구역 돌파",
    5: "제한 시간 안에 탈취",
    7: "복합 함정 구역 돌파",
    9: "고위험 구역 침투",
    11: "중앙 데이터 코어 탈취",
  };
  if (stage <= STORY_STAGE_COUNT && table[stage]) return table[stage];
  return "무한 모드: 코어 탈취";
}

export function getDefenseObjective(stage) {
  if (stage % 2 === 1) return null;

  const objective = DEFENSE_OBJECTIVES[stage];
  if (objective) return normalizeDefenseObjective(cloneDefenseObjective(objective));

  const infiniteTier = Math.max(0, Math.floor((stage - INFINITE_STAGE_START) / 2));
  const cycle = infiniteTier % 4;
  const scale = Math.floor(infiniteTier / 4);
  const objectives = [
    {
      detections: 2,
      delay: 2,
      maxTraps: 4,
      requiredTrapTypes: ["laser", "shock"],
    },
    {
      detections: 3,
      delay: 2,
      maxTraps: 4,
      requiredTrapTypes: ["camera", "laser", "shock"],
    },
    {
      detections: 3,
      delay: 2,
      energyDrained: 20,
      maxTraps: 5,
      requiredTrapTypes: ["camera", "laser", "shock", "emp"],
    },
    {
      detections: 2,
      delay: 4,
      energyDrained: 20,
      maxTraps: 5,
      requiredTrapTypes: ["camera", "firewall", "emp"],
    },
  ];

  const generated = cloneDefenseObjective(objectives[cycle]);
  generated.maxTraps = Math.min(6, generated.maxTraps + Math.floor(scale / 2));
  return normalizeDefenseObjective(generated);
}

export function formatDefenseObjective(objective) {
  const parts = [];
  if (objective.detections) parts.push(`탐지 ${objective.detections}회`);
  if (objective.delay) parts.push(`지연 ${formatSeconds(objective.delay)}`);
  if (objective.energyDrained) parts.push(`에너지 ${objective.energyDrained} 흡수`);
  if (objective.maxTraps) parts.push(`함정 ${objective.maxTraps}개 이하`);
  if (objective.requiredTrapTypes?.length) {
    const names = objective.requiredTrapTypes.map((type) => TRAPS[type].name).join("/");
    parts.push(`${names} 사용`);
  }
  return parts.join(" · ");
}

export function getDefenseObjectiveItems(game) {
  const objective = getDefenseObjective(game.stage);
  if (!objective) return [];

  const metrics = game.metrics || createMetrics();
  const placedTraps = game.placedTraps || [];
  const items = [];

  if (objective.detections) {
    items.push({
      id: "detections",
      label: `탐지 ${objective.detections}회`,
      progress: `${Math.min(metrics.detections || 0, objective.detections)} / ${objective.detections}`,
      complete: (metrics.detections || 0) + DEFENSE_OBJECTIVE_EPSILON >= objective.detections,
    });
  }

  if (objective.delay) {
    items.push({
      id: "delay",
      label: `지연 ${formatSeconds(objective.delay)}`,
      progress: `${formatSeconds(Math.min(metrics.delay || 0, objective.delay))} / ${formatSeconds(objective.delay)}`,
      complete: (metrics.delay || 0) + DEFENSE_OBJECTIVE_EPSILON >= objective.delay,
    });
  }

  if (objective.energyDrained) {
    items.push({
      id: "energyDrained",
      label: `에너지 ${objective.energyDrained} 흡수`,
      progress: `${Math.min(metrics.energyDrained || 0, objective.energyDrained)} / ${objective.energyDrained}`,
      complete: (metrics.energyDrained || 0) + DEFENSE_OBJECTIVE_EPSILON >= objective.energyDrained,
    });
  }

  if (objective.maxTraps) {
    const count = placedTraps.filter((trap) => !trap.extraUse).length;
    const extraCount = placedTraps.length - count;
    items.push({
      id: "maxTraps",
      label: `함정 ${objective.maxTraps}개 이하`,
      progress: extraCount > 0 ? `${count} / ${objective.maxTraps}개 (+${extraCount})` : `${count} / ${objective.maxTraps}개`,
      complete: count <= objective.maxTraps,
    });
  }

  for (const type of objective.requiredTrapTypes || []) {
    const triggered = metrics.trapTriggers?.[type] || 0;
    const placed = placedTraps.some((trap) => trap.type === type);
    items.push({
      id: `trap-${type}`,
      label: `${TRAPS[type].name} 사용`,
      progress: triggered > 0 ? "작동 완료" : placed ? "배치됨" : "미배치",
      complete: triggered > 0,
    });
  }

  return items;
}

export function getDefenseObjectiveSummary(game) {
  const items = getDefenseObjectiveItems(game);
  if (items.length === 0) return "";
  const completed = items.filter((item) => item.complete).length;
  return `목표 ${completed}/${items.length}`;
}

export function pickRewards(type, rewardPoolList, stage = 1, options = {}) {
  const pool = rewardPoolList[type].slice();
  const preferredIndex = options.preferredRewardId
    ? pool.findIndex((reward) => reward.id === options.preferredRewardId)
    : -1;
  const preferredReward = preferredIndex >= 0 ? pool.splice(preferredIndex, 1)[0] : null;
  shuffle(pool);
  const selectedRewards = preferredReward
    ? [preferredReward, ...pool].slice(0, 3)
    : pool.slice(0, 3);

  return selectedRewards.map((reward, index) => {
    const choice = materializeRewardChoice(reward, stage);
    if (preferredReward && index === 0 && options.markPreferred) {
      choice.recommended = true;
    }
    return choice;
  });
}

function createEffectReward(config) {
  return {
    ...config,
    apply: addActiveRewardEffect,
  };
}

function createDynamicEffectReward(config) {
  return createEffectReward(config);
}

function materializeRewardChoice(template, stage) {
  const dynamic = typeof template.createChoice === "function" ? template.createChoice() : {};
  const reward = {
    ...template,
    ...dynamic,
  };
  const turnRange = getRewardTurnRange(stage);
  const minTurns = reward.minTurns || turnRange.min;
  const maxTurns = reward.maxTurns || turnRange.max;
  const durationTurns = randomInt(minTurns, Math.max(minTurns, maxTurns));
  const baseDesc = reward.desc;
  return {
    ...reward,
    baseDesc,
    durationTurns,
    desc: `${baseDesc} (${durationTurns}턴 지속)`,
  };
}

export function getRewardTurnRange(stage) {
  const stageNumber = Math.max(1, Number(stage) || 1);
  const maxBonus = Math.floor((stageNumber - 1) / REWARD_MAX_TURN_STAGE_STEP);
  const minBonus = Math.floor((stageNumber - 1) / REWARD_MIN_TURN_STAGE_STEP);
  const min = REWARD_TURN_MIN + minBonus;
  const max = Math.max(min, REWARD_TURN_MAX + maxBonus);
  return { min, max };
}

function addActiveRewardEffect(game, reward) {
  if (!game.activeEffects) game.activeEffects = [];
  game.activeEffects.push({
    id: cryptoSafeId(),
    name: reward.name,
    desc: reward.baseDesc || reward.desc,
    target: reward.target,
    remainingTurns: reward.durationTurns || 1,
    data: reward.data ? { ...reward.data } : {},
    applyEffect: reward.applyEffect,
  });
}

function randomInt(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return low + Math.floor(Math.random() * (high - low + 1));
}

function pickRandomTrapType() {
  const types = Object.keys(TRAPS);
  return types[Math.floor(Math.random() * types.length)];
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

function createTrapTriggerCounts() {
  return Object.fromEntries(Object.keys(TRAPS).map((type) => [type, 0]));
}

function cloneDefenseObjective(objective) {
  return {
    ...objective,
    requiredTrapTypes: objective.requiredTrapTypes ? objective.requiredTrapTypes.slice() : [],
  };
}

function normalizeDefenseObjective(objective) {
  if (objective.energyUsed && !objective.energyDrained) {
    objective.energyDrained = objective.energyUsed;
    delete objective.energyUsed;
  }
  const required = new Set(objective.requiredTrapTypes || []);
  if (objective.energyDrained) required.add("emp");
  if (objective.delay >= 4 && required.has("firewall")) required.add("camera");
  objective.requiredTrapTypes = Array.from(required);
  objective.maxTraps = Math.max(objective.maxTraps || 0, objective.requiredTrapTypes.length);
  return objective;
}

function formatSeconds(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}초`;
}

function applyStageLayoutPreset(stageData, options) {
  if (!usesStageOneLayoutPreset(stageData.id)) return stageData;

  const preset = STAGE_ONE_LAYOUT_PRESET_BY_ID.get(options.layoutId);
  if (!preset) return stageData;

  return {
    ...stageData,
    layoutId: preset.id,
    layoutName: preset.name,
    mapIntent: {
      ...stageData.mapIntent,
      selectedLayoutId: preset.id,
      selectedLayoutName: preset.name,
      description: stageData.id === 1 ? preset.description : stageData.mapIntent.description,
    },
    platforms: cloneLayoutPlatforms(preset.platforms, stageData.id),
    trapNodes: cloneLayoutTrapNodes(preset.trapNodes, stageData.id),
    wallTrapSlots: cloneLayoutWallTrapSlots(preset.wallTrapSlots, stageData.id),
  };
}

function usesStageOneLayoutPreset(stageId) {
  return Number(stageId) === 1 || Number(stageId) === 2;
}

function cloneLayoutPlatforms(platforms, stageId) {
  return platforms.map((platform) => ({
    ...platform,
    id: retargetStageOneId(platform.id, stageId),
    trapSlots: cloneTrapSlotSetting(platform.trapSlots),
    defenseTrapSlots: cloneTrapSlotSetting(platform.defenseTrapSlots),
  }));
}

function cloneLayoutTrapNodes(trapNodes, stageId) {
  return trapNodes.map((trapNode) => ({
    ...trapNode,
    id: retargetStageOneId(trapNode.id, stageId),
    teaches: trapNode.teaches ? trapNode.teaches.slice() : [],
  }));
}

function cloneLayoutWallTrapSlots(wallTrapSlots, stageId) {
  return wallTrapSlots.map((slot) => ({
    ...slot,
    id: retargetStageOneId(slot.id, stageId),
    allowedTraps: slot.allowedTraps ? slot.allowedTraps.slice() : [],
  }));
}

function retargetStageOneId(id, stageId) {
  return Number(stageId) === 2 ? String(id).replace("stage-1", "stage-2") : id;
}

function cloneTrapSlotSetting(trapSlots) {
  if (Array.isArray(trapSlots)) {
    return trapSlots.map((slot) => (
      slot && typeof slot === "object" ? { ...slot } : slot
    ));
  }
  return trapSlots;
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
    platforms: stageData.platforms.map((platform) => ({
      ...platform,
      trapSlots: cloneTrapSlotSetting(platform.trapSlots),
      defenseTrapSlots: cloneTrapSlotSetting(platform.defenseTrapSlots),
    })),
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
