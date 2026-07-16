(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    stageLabel: document.getElementById("stageLabel"),
    turnLabel: document.getElementById("turnLabel"),
    objectiveLabel: document.getElementById("objectiveLabel"),
    timerLabel: document.getElementById("timerLabel"),
    hpLabel: document.getElementById("hpLabel"),
    energyLabel: document.getElementById("energyLabel"),
    hpBar: document.getElementById("hpBar"),
    energyBar: document.getElementById("energyBar"),
    budgetLabel: document.getElementById("budgetLabel"),
    detectLabel: document.getElementById("detectLabel"),
    delayLabel: document.getElementById("delayLabel"),
    defenseTools: document.getElementById("defenseTools"),
    logText: document.getElementById("logText"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayButton: document.getElementById("overlayButton"),
    rewardList: document.getElementById("rewardList"),
    startReplayBtn: document.getElementById("startReplayBtn"),
    undoTrapBtn: document.getElementById("undoTrapBtn"),
    restartBtn: document.getElementById("restartBtn"),
    helpBtn: document.getElementById("helpBtn"),
  };

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const GRAVITY = 1600;
  const GROUND_Y = 462;
  const SAMPLE_STEP = 0.06;
  const TILE_SIZE = 32;
  const CORE_X = 1088;
  const SHIELD_DURATION = 2.5;
  const HIT_INVINCIBLE_TIME = 0.9;
  const SHIELD_BLOCK_INVINCIBLE_TIME = 0.75;

  const TURN = {
    ATTACK: "attack",
    DEFENSE_BUILD: "defense_build",
    DEFENSE_REPLAY: "defense_replay",
    ENDING: "ending",
  };

  const TRAPS = {
    laser: { name: "레이저", cost: 2, color: "#ff3b67" },
    shock: { name: "감전 바닥", cost: 2, color: "#ffcc33" },
    camera: { name: "카메라", cost: 1, color: "#bb5cff" },
    firewall: { name: "방화벽", cost: 3, color: "#ff7040" },
  };

  const rewardPool = {
    attack: [
      {
        name: "방어 예산 +2",
        desc: "다음 방어 턴에서 함정을 더 배치할 수 있습니다.",
        apply: () => game.mods.defenseBudgetBonus += 2,
      },
      {
        name: "카메라 비용 -1",
        desc: "카메라 배치 비용이 최소 1까지 줄어듭니다.",
        apply: () => game.mods.cameraDiscount = Math.min(1, game.mods.cameraDiscount + 1),
      },
      {
        name: "레이저 강화",
        desc: "방어 턴 레이저의 판정 높이가 증가합니다.",
        apply: () => game.mods.laserBoost += 18,
      },
      {
        name: "방화벽 강화",
        desc: "방화벽의 지연 시간이 증가합니다.",
        apply: () => game.mods.firewallDelay += 0.45,
      },
    ],
    defense: [
      {
        name: "최대 에너지 +20",
        desc: "다음 공격 턴의 에너지 최대치가 증가합니다.",
        apply: () => game.mods.maxEnergy += 20,
      },
      {
        name: "대시 쿨다운 감소",
        desc: "공격 턴에서 대시를 더 자주 사용할 수 있습니다.",
        apply: () => game.mods.dashCooldown = Math.max(0.45, game.mods.dashCooldown - 0.12),
      },
      {
        name: "실드 효율 증가",
        desc: "실드가 소모하는 에너지가 줄어듭니다.",
        apply: () => game.mods.shieldDrain = Math.max(28, game.mods.shieldDrain - 6),
      },
      {
        name: "보호막 1회",
        desc: "공격 턴에서 함정 피해를 한 번 무시합니다.",
        apply: () => game.mods.freeHit += 1,
      },
    ],
  };

  const keys = new Set();
  let lastTime = performance.now();
  let selectedTrap = "laser";
  let selectedRotation = 0;
  let overlayAction = null;

  const game = {
    stage: 1,
    turn: TURN.ATTACK,
    timer: 15,
    messageCooldown: 0,
    recordTimer: 0,
    replayIndex: 0,
    replayPause: 0,
    replayFinished: false,
    currentRecording: [],
    lastAttackRecording: [],
    placedTraps: [],
    carriedTrapsByStage: new Map(),
    trapSlots: [],
    platforms: [],
    baseHazards: [],
    core: { x: CORE_X, y: 392, w: 42, h: 70 },
    metrics: createMetrics(),
    mods: createDefaultMods(),
    defenseBudget: 4,
    infiniteBest: Number(localStorage.getItem("traceProtocolBest") || 0),
    hacker: null,
    replayHacker: null,
  };

  function createDefaultMods() {
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

  function createMetrics() {
    return {
      detections: 0,
      delay: 0,
      energyUsed: 0,
      clearTime: 0,
      reachedCore: false,
      hpLost: 0,
    };
  }

  function createHacker() {
    return {
      x: 64,
      y: 388,
      w: 30,
      h: 54,
      vx: 0,
      vy: 0,
      speed: 250,
      jumpPower: 620,
      facing: 1,
      onGround: false,
      hp: 3,
      maxHp: 3,
      energy: game.mods.maxEnergy,
      maxEnergy: game.mods.maxEnergy,
      invincible: 0,
      dashCooldown: 0,
      shield: false,
      shieldTime: 0,
    };
  }

  function setupStage() {
    hideOverlay();
    const isAttack = isAttackStage(game.stage);
    game.turn = isAttack ? TURN.ATTACK : TURN.DEFENSE_BUILD;
    game.timer = getStageTime(game.stage);
    game.metrics = createMetrics();
    game.recordTimer = 0;
    game.replayIndex = 0;
    game.replayPause = 0;
    game.replayFinished = false;
    game.currentRecording = [];
    game.placedTraps = [];
    game.platforms = createPlatforms(game.stage);
    game.trapSlots = createTrapSlots(game.stage);
    game.baseHazards = createBaseHazards(game.stage);
    game.core = { x: CORE_X, y: 392, w: 42, h: 70 };

    if (isAttack) {
      game.hacker = createHacker();
      game.replayHacker = null;
      ui.logText.textContent = "공격 턴입니다. 데이터 코어까지 도달하세요.";
    } else {
      if (game.lastAttackRecording.length < 2) {
        game.stage -= 1;
        setupStage();
        return;
      }
      game.hacker = null;
      game.replayHacker = createReplayHacker();
      game.defenseBudget = getDefenseBudget(game.stage);
      ui.logText.textContent = "방어 턴입니다. 이전 공격 경로 위에 함정을 배치하세요.";
    }

    updateUI();
  }

  function isAttackStage(stage) {
    return stage % 2 === 1;
  }

  function getStageTime(stage) {
    if (isAttackStage(stage)) return 15;

    if (stage <= 3) return 48;
    if (stage <= 7) return 42;
    if (stage <= 11) return 38;
    return Math.max(24, 40 - Math.floor((stage - 12) * 1.2));
  }

  function getDefenseBudget(stage) {
    const base = 4 + Math.floor(stage / 4) + game.mods.defenseBudgetBonus;
    if (stage >= 12) return base + Math.floor((stage - 12) / 3);
    return base;
  }

  function getObjective(stage) {
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
    return isAttackStage(stage) ? "무한 모드: 코어 탈취" : "무한 모드: 탐지 또는 지연";
  }

  function createPlatforms(stage) {
    const platforms = [
      { x: 0, y: GROUND_Y, w: WIDTH, h: 78 },
      { x: 250, y: 360, w: 150, h: 18 },
      { x: 520, y: 300, w: 150, h: 18 },
      { x: 810, y: 365, w: 150, h: 18 },
    ];

    if (stage >= 5) platforms.push({ x: 650, y: 405, w: 96, h: 18 });
    if (stage >= 9) platforms.push({ x: 970, y: 280, w: 96, h: 18 });
    return platforms;
  }

  function createBaseHazards(stage) {
    if (!isAttackStage(stage)) return [];
    const hazards = [
      { type: "laser", x: 340, y: 352, w: 15, h: 110 },
      { type: "shock", x: 680, y: 448, w: 90, h: 14 },
      { type: "camera", x: 540, y: 252, w: 120, h: 70 },
    ];

    if (stage >= 5) hazards.push({ type: "laser", x: 890, y: 272, w: 15, h: 190 });
    if (stage >= 7) hazards.push({ type: "shock", x: 185, y: 448, w: 90, h: 14 });
    if (stage >= 9) hazards.push({ type: "camera", x: 930, y: 232, w: 140, h: 80 });
    if (stage >= 12) hazards.push({ type: "laser", x: 1040, y: 310, w: 15, h: 152 });
    hazards.push(...getCarriedHazards(stage));
    return hazards;
  }

  function getCarriedHazards(stage) {
    const traps = game.carriedTrapsByStage.get(stage) || [];
    return traps.map((trap) => trapToAttackHazard(trap));
  }

  function trapToAttackHazard(trap) {
    return { type: trap.type, ...getOrientedTrapBox(trap), carried: true };
  }

  function createTrapSlots(stage) {
    const slots = [];
    let id = 0;

    for (const platform of game.platforms) {
      const cols = Math.floor(platform.w / TILE_SIZE);
      if (cols <= 0) continue;

      for (let col = 0; col < cols; col += 1) {
        const x = platform.x + col * TILE_SIZE + TILE_SIZE / 2;
        const y = platform.y;
        if (x < 80 || x > WIDTH - 70) continue;
        if (Math.abs(x - game.core.x) < 46 && y >= GROUND_Y - 4) continue;
        slots.push({ x, y, id, occupied: false });
        id += 1;
      }
    }

    return slots;
  }

  function createReplayHacker() {
    const first = game.lastAttackRecording[0] || { x: 64, y: 388, facing: 1 };
    return {
      x: first.x,
      y: first.y,
      w: 30,
      h: 54,
      facing: first.facing || 1,
      hp: 3,
      trapCooldowns: new Map(),
      triggeredTraps: new Set(),
    };
  }

  function update(dt) {
    game.messageCooldown = Math.max(0, game.messageCooldown - dt);
    if (game.turn === TURN.ATTACK) updateAttack(dt);
    if (game.turn === TURN.DEFENSE_REPLAY) updateDefenseReplay(dt);
    updateUI();
  }

  function updateAttack(dt) {
    const h = game.hacker;
    if (!h) return;

    game.timer -= dt;
    if (game.timer <= 0) {
      endStage(false, "제한 시간이 끝났습니다.");
      return;
    }

    h.dashCooldown = Math.max(0, h.dashCooldown - dt);
    h.invincible = Math.max(0, h.invincible - dt);
    h.shieldTime = Math.max(0, h.shieldTime - dt);
    h.shield = h.shieldTime > 0;

    const left = keys.has("ArrowLeft") || keys.has("KeyA");
    const right = keys.has("ArrowRight") || keys.has("KeyD");

    if (left && !right) {
      h.vx = -h.speed;
      h.facing = -1;
    } else if (right && !left) {
      h.vx = h.speed;
      h.facing = 1;
    } else {
      h.vx = approach(h.vx, 0, 1800 * dt);
    }

    if ((keys.has("Space") || keys.has("KeyW") || keys.has("ArrowUp")) && h.onGround) {
      h.vy = -h.jumpPower;
      h.onGround = false;
    }

    if ((keys.has("ShiftLeft") || keys.has("ShiftRight")) && h.dashCooldown <= 0 && h.energy >= 18) {
      h.vx = h.facing * 620;
      h.energy -= 18;
      game.metrics.energyUsed += 18;
      h.dashCooldown = game.mods.dashCooldown;
    }

    h.vy += GRAVITY * dt;

    moveAndCollide(h, dt);
    applyAttackHazards(h);
    recordHacker(dt);

    if (rectsOverlap(h, game.core)) {
      game.metrics.reachedCore = true;
      game.metrics.clearTime = getStageTime(game.stage) - game.timer;
      game.lastAttackRecording = game.currentRecording.slice();
      endStage(true, "데이터 코어 탈취에 성공했습니다.");
    }

    if (h.hp <= 0) {
      endStage(false, "해커가 무력화되었습니다.");
    }
  }

  function activateShield() {
    if (game.turn !== TURN.ATTACK || !game.hacker) return;
    const h = game.hacker;
    const cost = game.mods.shieldDrain;
    if (h.shieldTime > 0) return;
    if (h.energy < cost) {
      flashLog("실드를 켜기 위한 에너지가 부족합니다.");
      return;
    }

    h.energy -= cost;
    game.metrics.energyUsed += cost;
    h.shieldTime = SHIELD_DURATION;
    h.shield = true;
    flashLog(`실드 활성화. ${SHIELD_DURATION.toFixed(1)}초 동안 1회 방어합니다.`);
  }

  function moveAndCollide(entity, dt) {
    entity.x += entity.vx * dt;
    entity.x = clamp(entity.x, 0, WIDTH - entity.w);

    const previousY = entity.y;
    entity.y += entity.vy * dt;
    entity.onGround = false;

    for (const p of game.platforms) {
      if (!rectsOverlap(entity, p)) continue;
      const prevTop = previousY;
      const prevBottom = previousY + entity.h;

      if (entity.vy >= 0 && prevBottom <= p.y + 6) {
        entity.y = p.y - entity.h;
        entity.vy = 0;
        entity.onGround = true;
      } else if (entity.vy < 0 && prevTop >= p.y + p.h - 2) {
        entity.y = p.y + p.h;
        entity.vy = 0;
      }
    }

    if (entity.y + entity.h > GROUND_Y && entity.vy >= 0) {
      entity.y = GROUND_Y - entity.h;
      entity.vy = 0;
      entity.onGround = true;
    }

    if (entity.y > HEIGHT + 80) {
      entity.x = 64;
      entity.y = 320;
      entity.vx = 0;
      entity.vy = 0;
    }
  }

  function applyAttackHazards(h) {
    for (const hazard of game.baseHazards) {
      if (!rectsOverlap(h, getHazardHitbox(hazard))) continue;
      if (h.invincible > 0) continue;

      if (h.shield) {
        h.shield = false;
        h.shieldTime = 0;
        h.invincible = SHIELD_BLOCK_INVINCIBLE_TIME;
        flashLog("실드가 함정을 막고 사라졌습니다.");
        return;
      }

      if (game.mods.freeHit > 0) {
        game.mods.freeHit -= 1;
        h.invincible = HIT_INVINCIBLE_TIME;
        flashLog("보호막으로 피해를 1회 무시했습니다.");
        return;
      }

      h.hp -= 1;
      game.metrics.hpLost += 1;
      h.invincible = HIT_INVINCIBLE_TIME;
      flashLog(`${TRAPS[hazard.type].name}에 걸렸습니다. 체력 -1`);
      return;
    }
  }

  function recordHacker(dt) {
    game.recordTimer += dt;
    if (game.recordTimer < SAMPLE_STEP) return;
    game.recordTimer = 0;

    const h = game.hacker;
    game.currentRecording.push({
      t: getStageTime(game.stage) - game.timer,
      x: h.x,
      y: h.y,
      facing: h.facing,
      shield: h.shield,
      energyUsed: game.metrics.energyUsed,
    });
  }

  function updateDefenseReplay(dt) {
    const r = game.replayHacker;
    if (!r || game.replayFinished) return;

    tickTrapCooldowns(r, dt);

    if (game.replayPause > 0) {
      const pauseDt = Math.min(game.replayPause, dt);
      game.replayPause -= pauseDt;
      game.metrics.delay += pauseDt;
      if (evaluateDefenseSuccess()) {
        endStage(true, "방어 목표를 달성했습니다.");
      }
      return;
    }

    const path = game.lastAttackRecording;
    if (game.replayIndex >= path.length - 1) {
      game.replayFinished = true;
      const success = evaluateDefenseSuccess();
      endStage(success, success ? "방어 목표를 달성했습니다." : "해커의 침투를 충분히 방해하지 못했습니다.");
      return;
    }

    game.replayIndex += 1;
    const sample = path[game.replayIndex];
    r.x = sample.x;
    r.y = sample.y;
    r.facing = sample.facing || r.facing;
    game.metrics.energyUsed = Math.max(game.metrics.energyUsed, sample.energyUsed || 0);

    checkDefenseTraps(r);

    if (r.hp <= 0) {
      endStage(true, "해커를 완전히 차단했습니다.");
    } else if (evaluateDefenseSuccess()) {
      endStage(true, "방어 목표를 달성했습니다.");
    }
  }

  function tickTrapCooldowns(r, dt) {
    for (const [key, value] of r.trapCooldowns.entries()) {
      const next = value - dt;
      if (next <= 0) r.trapCooldowns.delete(key);
      else r.trapCooldowns.set(key, next);
    }
  }

  function checkDefenseTraps(r) {
    for (const trap of game.placedTraps) {
      if (!rectsOverlap(r, getTrapHitbox(trap))) continue;

      const key = `${trap.id}-${trap.type}`;
      if (r.triggeredTraps.has(key)) continue;
      if (r.trapCooldowns.has(key)) continue;
      r.triggeredTraps.add(key);

      if (trap.type === "laser") {
        game.metrics.detections += 1;
        r.hp -= 1;
        r.trapCooldowns.set(key, 0.7);
        flashLog("레이저가 해커를 탐지하고 피해를 줬습니다.");
      }

      if (trap.type === "camera") {
        game.metrics.detections += 1;
        r.trapCooldowns.set(key, 1.2);
        flashLog("카메라가 해커를 탐지했습니다.");
      }

      if (trap.type === "shock") {
        game.replayPause = Math.max(game.replayPause, 1.0);
        r.trapCooldowns.set(key, 1.4);
        flashLog("감전 바닥이 해커를 지연시켰습니다.");
      }

      if (trap.type === "firewall") {
        game.replayPause = Math.max(game.replayPause, game.mods.firewallDelay);
        r.hp -= 1;
        r.trapCooldowns.set(key, 1.8);
        flashLog("방화벽이 해커를 붙잡았습니다.");
      }
    }
  }

  function evaluateDefenseSuccess() {
    const stage = game.stage;
    if (stage === 2) return game.metrics.delay >= 2;
    if (stage === 4) return game.metrics.detections >= 2;
    if (stage === 6) return game.metrics.delay >= 5 || game.metrics.detections >= 3;
    if (stage === 8) return game.metrics.delay >= 3 || game.metrics.detections >= 2 || game.metrics.energyUsed >= 25;
    if (stage === 10) return game.metrics.delay >= 4 || game.metrics.detections >= 3;
    return game.metrics.detections >= 2 || game.metrics.delay >= 4;
  }

  function endStage(success, text) {
    if (game.turn === TURN.ENDING) return;
    const completedStage = game.stage;
    const completedTurn = game.turn;
    game.turn = TURN.ENDING;
    updateBest(completedStage, success);
    if (success && completedStage % 2 === 0) {
      carryDefenseTrapsToNextStage(completedStage + 1);
    }

    if (!success) {
      showOverlay({
        title: "스테이지 실패",
        text: `${text}\n같은 스테이지를 다시 시도합니다.`,
        buttonText: "재도전",
        onButton: () => {
          game.stage = completedStage;
          setupStage();
        },
      });
      return;
    }

    if (completedStage === 11) {
      showOverlay({
        title: "엔딩",
        text: "중앙 데이터 코어 탈취에 성공했습니다. 이제 12스테이지부터 무한 모드가 열립니다.",
        buttonText: "무한 모드 시작",
        onButton: () => {
          game.stage = 12;
          setupStage();
        },
      });
      return;
    }

    showOverlay({
      title: "스테이지 클리어",
      text: `${text}\n보상 1개를 선택하면 다음 스테이지로 진행합니다.`,
      rewards: pickRewards(completedTurn === TURN.ATTACK ? "attack" : "defense"),
      buttonText: "보상 없이 진행",
      onButton: () => {
        game.stage += 1;
        setupStage();
      },
    });
  }

  function carryDefenseTrapsToNextStage(stage) {
    const traps = game.placedTraps.map((trap) => ({
      id: trap.id,
      type: trap.type,
      rotation: trap.rotation,
      x: trap.x,
      y: trap.y,
      slotId: trap.slotId,
    }));
    game.carriedTrapsByStage.set(stage, traps);
  }

  function pickRewards(type) {
    const pool = rewardPool[type].slice();
    shuffle(pool);
    return pool.slice(0, 3);
  }

  function applyReward(reward) {
    reward.apply();
    game.stage += 1;
    setupStage();
  }

  function updateBest(stage, success) {
    if (success && stage > game.infiniteBest) {
      game.infiniteBest = stage;
      localStorage.setItem("traceProtocolBest", String(stage));
    }
  }

  function startReplay() {
    if (game.turn !== TURN.DEFENSE_BUILD) return;
    game.turn = TURN.DEFENSE_REPLAY;
    game.replayIndex = 0;
    game.replayPause = 0;
    game.replayFinished = false;
    game.replayHacker = createReplayHacker();
    ui.logText.textContent = "리플레이 중입니다. 해커가 이전 공격 경로를 따라갑니다.";
  }

  function placeTrapAtSlot(slot) {
    if (game.turn !== TURN.DEFENSE_BUILD || slot.occupied) return;
    const cost = getTrapCost(selectedTrap);
    if (game.defenseBudget < cost) {
      flashLog("예산이 부족합니다.");
      return;
    }

    const trap = {
      id: cryptoSafeId(),
      type: selectedTrap,
      rotation: selectedRotation,
      x: slot.x,
      y: slot.y,
      slotId: slot.id,
    };

    slot.occupied = true;
    game.placedTraps.push(trap);
    game.defenseBudget -= cost;
    flashLog(`${TRAPS[selectedTrap].name} 배치 완료. 남은 예산 ${game.defenseBudget}`);
  }

  function undoTrap() {
    if (game.turn !== TURN.DEFENSE_BUILD) return;
    const trap = game.placedTraps.pop();
    if (!trap) return;
    const slot = game.trapSlots.find((s) => s.id === trap.slotId);
    if (slot) slot.occupied = false;
    game.defenseBudget += getTrapCost(trap.type);
  }

  function getTrapCost(type) {
    if (type === "camera") return Math.max(1, TRAPS[type].cost - game.mods.cameraDiscount);
    return TRAPS[type].cost;
  }

  function normalizeRotation(value) {
    const rotation = Number(value) || 0;
    return ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  }

  function getOrientedTrapBox(trap) {
    const rotation = normalizeRotation(trap.rotation);
    const horizontal = rotation === 0 || rotation === 180;
    const positive = rotation === 0 || rotation === 90;

    if (trap.type === "laser") {
      const length = 118 + game.mods.laserBoost;
      if (horizontal) {
        return {
          x: positive ? trap.x : trap.x - length,
          y: trap.y - 18,
          w: length,
          h: 16,
        };
      }
      return {
        x: trap.x - 8,
        y: positive ? trap.y - length : trap.y,
        w: 16,
        h: length,
      };
    }

    if (trap.type === "shock") {
      return horizontal
        ? { x: trap.x - 36, y: trap.y - 8, w: 72, h: 14 }
        : { x: trap.x - 8, y: positive ? trap.y - 72 : trap.y, w: 16, h: 72 };
    }

    if (trap.type === "camera") {
      if (horizontal) {
        return {
          x: positive ? trap.x : trap.x - 100,
          y: trap.y - 35,
          w: 100,
          h: 70,
        };
      }
      return {
        x: trap.x - 35,
        y: positive ? trap.y - 100 : trap.y,
        w: 70,
        h: 100,
      };
    }

    if (trap.type === "firewall") {
      return horizontal
        ? { x: positive ? trap.x : trap.x - 92, y: trap.y - 34, w: 92, h: 34 }
        : { x: trap.x - 17, y: positive ? trap.y - 92 : trap.y, w: 34, h: 92 };
    }

    return { x: trap.x, y: trap.y, w: 1, h: 1 };
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawPlatforms();
    drawCore();
    drawBaseHazards();

    if (game.turn === TURN.DEFENSE_BUILD || game.turn === TURN.DEFENSE_REPLAY) {
      drawReplayPath();
      drawTrapSlots();
      drawPlacedTraps();
    }

    if (game.turn === TURN.ATTACK && game.hacker) drawHacker(game.hacker, false);
    if ((game.turn === TURN.DEFENSE_BUILD || game.turn === TURN.DEFENSE_REPLAY) && game.replayHacker) {
      drawHacker(game.replayHacker, true);
    }

    drawStageBanner();
  }

  function drawBackground() {
    ctx.save();
    ctx.fillStyle = "#071019";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = "rgba(24, 224, 255, 0.07)";
    ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255, 59, 103, 0.05)";
    ctx.fillRect(0, 0, WIDTH, 70);
    ctx.restore();
  }

  function drawPlatforms() {
    for (const p of game.platforms) {
      drawTilePlatform(p);
    }
  }

  function drawTilePlatform(platform) {
    const cols = Math.ceil(platform.w / TILE_SIZE);
    const rows = Math.ceil(platform.h / TILE_SIZE);

    ctx.save();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = platform.x + col * TILE_SIZE;
        const y = platform.y + row * TILE_SIZE;
        const w = Math.min(TILE_SIZE, platform.x + platform.w - x);
        const h = Math.min(TILE_SIZE, platform.y + platform.h - y);
        if (w <= 0 || h <= 0) continue;

        ctx.fillStyle = row === 0 ? "#12324a" : "#0f2638";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(24, 224, 255, 0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));

        if (row === 0) {
          ctx.fillStyle = "rgba(24, 224, 255, 0.62)";
          ctx.fillRect(x, y, w, 3);
        }
      }
    }
    ctx.restore();
  }

  function drawCore() {
    const c = game.core;
    ctx.save();
    ctx.fillStyle = "#27ffc8";
    ctx.shadowColor = "#27ffc8";
    ctx.shadowBlur = 18;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#06251f";
    ctx.fillRect(c.x + 10, c.y + 12, c.w - 20, c.h - 24);
    ctx.fillStyle = "#27ffc8";
    ctx.font = "12px monospace";
    ctx.fillText("CORE", c.x + 5, c.y - 8);
    ctx.restore();
  }

  function drawBaseHazards() {
    if (!isAttackStage(game.stage)) return;
    for (const hazard of game.baseHazards) {
      if (hazard.type === "laser") drawLaser(hazard.x, hazard.y, hazard.w, hazard.h);
      if (hazard.type === "shock") drawShock(hazard.x, hazard.y, hazard.w, hazard.h);
      if (hazard.type === "camera") drawCamera(hazard.x, hazard.y, hazard.w, hazard.h);
      if (hazard.type === "firewall") drawFirewall(hazard.x, hazard.y, hazard.w, hazard.h);
    }
  }

  function drawTrapSlots() {
    for (const slot of game.trapSlots) {
      ctx.save();
      ctx.strokeStyle = slot.occupied ? "rgba(255,255,255,0.18)" : "#18e0ff";
      ctx.fillStyle = slot.occupied ? "rgba(255,255,255,0.06)" : "rgba(24,224,255,0.08)";
      ctx.lineWidth = 2;
      roundRect(ctx, slot.x - TILE_SIZE / 2 + 2, slot.y - TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlacedTraps() {
    for (const trap of game.placedTraps) {
      const box = getOrientedTrapBox(trap);
      if (trap.type === "laser") drawLaser(box.x, box.y, box.w, box.h);
      if (trap.type === "shock") drawShock(box.x, box.y, box.w, box.h);
      if (trap.type === "camera") drawCamera(box.x, box.y, box.w, box.h, normalizeRotation(trap.rotation));
      if (trap.type === "firewall") drawFirewall(box.x, box.y, box.w, box.h);
    }
  }

  function drawLaser(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 59, 103, 0.22)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#ff3b67";
    ctx.shadowColor = "#ff3b67";
    ctx.shadowBlur = 12;
    ctx.fillRect(x + w / 2 - 2, y, 4, h);
    ctx.restore();
  }

  function drawShock(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 204, 51, 0.26)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#ffcc33";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= w; i += 16) {
      ctx.lineTo(x + i, y + (i % 32 === 0 ? 0 : h));
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCamera(x, y, w, h, rotation = 0) {
    ctx.save();
    ctx.fillStyle = "rgba(187, 92, 255, 0.16)";
    ctx.beginPath();
    if (rotation === 0) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x, y + h);
    } else if (rotation === 90) {
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
    } else if (rotation === 180) {
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x + w, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#bb5cff";
    ctx.shadowColor = "#bb5cff";
    ctx.shadowBlur = 10;
    if (rotation === 0) ctx.fillRect(x - 10, y + h / 2 - 9, 28, 18);
    else if (rotation === 90) ctx.fillRect(x + w / 2 - 14, y + h - 10, 28, 18);
    else if (rotation === 180) ctx.fillRect(x + w - 18, y + h / 2 - 9, 28, 18);
    else ctx.fillRect(x + w / 2 - 14, y - 8, 28, 18);
    ctx.restore();
  }

  function drawFirewall(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 112, 64, 0.28)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#ff7040";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#ff7040";
    for (let yy = y + 8; yy < y + h; yy += 16) ctx.fillRect(x + 5, yy, w - 10, 4);
    ctx.restore();
  }

  function drawReplayPath() {
    const path = game.lastAttackRecording;
    if (path.length < 2) return;

    ctx.save();
    ctx.strokeStyle = "rgba(24, 224, 255, 0.65)";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(path[0].x + 15, path[0].y + 27);
    for (let i = 1; i < path.length; i += 3) ctx.lineTo(path[i].x + 15, path[i].y + 27);
    ctx.stroke();
    ctx.restore();
  }

  function drawHacker(h, isGhost) {
    ctx.save();
    ctx.globalAlpha = isGhost ? 0.72 : 1;
    ctx.translate(h.x + h.w / 2, h.y + h.h / 2);
    ctx.scale(h.facing || 1, 1);
    ctx.fillStyle = isGhost ? "#8af2ff" : "#18e0ff";
    ctx.shadowColor = isGhost ? "#8af2ff" : "#18e0ff";
    ctx.shadowBlur = 12;
    ctx.fillRect(-h.w / 2, -h.h / 2, h.w, h.h);
    ctx.fillStyle = "#071019";
    ctx.fillRect(2, -14, 9, 6);
    ctx.fillStyle = "#e9f8ff";
    ctx.fillRect(9, -8, 16, 4);

    if (h.shield) {
      ctx.strokeStyle = "#27ffc8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 38, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStageBanner() {
    ctx.save();
    ctx.fillStyle = "rgba(3, 8, 13, 0.66)";
    ctx.fillRect(16, 16, 390, 54);
    ctx.fillStyle = "#18e0ff";
    ctx.font = "bold 16px system-ui";
    ctx.fillText(`STAGE ${game.stage} / ${isAttackStage(game.stage) ? "HACKER ATTACK" : "AI DEFENSE"}`, 30, 40);
    ctx.fillStyle = "#c4e9f4";
    ctx.font = "13px system-ui";
    ctx.fillText(getObjective(game.stage), 30, 60);

    if (game.stage >= 12) {
      ctx.fillStyle = "#ffcc33";
      ctx.fillText(`INFINITE MODE · BEST ${game.infiniteBest}`, 700, 40);
    }
    ctx.restore();
  }

  function getHazardHitbox(hazard) {
    if (hazard.type === "camera") return { x: hazard.x, y: hazard.y, w: hazard.w, h: hazard.h };
    return hazard;
  }

  function getTrapHitbox(trap) {
    return getOrientedTrapBox(trap);
  }

  function updateUI() {
    ui.stageLabel.textContent = String(game.stage);
    ui.turnLabel.textContent = getTurnLabel();
    ui.objectiveLabel.textContent = getObjective(game.stage);
    ui.timerLabel.textContent = game.turn === TURN.ATTACK ? game.timer.toFixed(1) : "-";

    const h = game.hacker;
    if (h) {
      ui.hpLabel.textContent = `${h.hp} / ${h.maxHp}`;
      ui.energyLabel.textContent = `${Math.floor(h.energy)} / ${h.maxEnergy}`;
      ui.hpBar.style.width = `${(h.hp / h.maxHp) * 100}%`;
      ui.energyBar.style.width = `${(h.energy / h.maxEnergy) * 100}%`;
    } else {
      const r = game.replayHacker;
      ui.hpLabel.textContent = r ? `${Math.max(0, r.hp)} / 3` : "-";
      ui.energyLabel.textContent = "-";
      ui.hpBar.style.width = r ? `${clamp(r.hp / 3, 0, 1) * 100}%` : "0%";
      ui.energyBar.style.width = "0%";
    }

    ui.budgetLabel.textContent = game.turn === TURN.DEFENSE_BUILD
      ? String(game.defenseBudget)
      : game.turn === TURN.DEFENSE_REPLAY ? "리플레이 중" : "-";
    ui.detectLabel.textContent = String(game.metrics.detections);
    ui.delayLabel.textContent = `${game.metrics.delay.toFixed(1)}s`;
    ui.defenseTools.classList.toggle("hidden", game.turn !== TURN.DEFENSE_BUILD);
    ui.startReplayBtn.disabled = game.turn !== TURN.DEFENSE_BUILD;
    ui.helpBtn.disabled = game.turn === TURN.ENDING;
  }

  function getTurnLabel() {
    if (game.turn === TURN.ATTACK) return "해커 공격";
    if (game.turn === TURN.DEFENSE_BUILD) return "AI 방어 준비";
    if (game.turn === TURN.DEFENSE_REPLAY) return "AI 방어 리플레이";
    return "결과";
  }

  function showOverlay({ title, text, rewards = [], buttonText = "확인", onButton }) {
    overlayAction = typeof onButton === "function" ? onButton : hideOverlay;
    ui.overlay.classList.remove("hidden");
    ui.overlayTitle.textContent = title;
    ui.overlayText.textContent = text;
    ui.overlayButton.textContent = buttonText;
    ui.rewardList.innerHTML = "";

    for (const reward of rewards) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reward-card";
      btn.innerHTML = `<strong>${escapeHTML(reward.name)}</strong><span>${escapeHTML(reward.desc)}</span>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        applyReward(reward);
      });
      ui.rewardList.appendChild(btn);
    }
  }

  function hideOverlay() {
    ui.overlay.classList.add("hidden");
    ui.rewardList.innerHTML = "";
    overlayAction = null;
  }

  function flashLog(text) {
    if (game.messageCooldown > 0) return;
    game.messageCooldown = 0.2;
    ui.logText.textContent = text;
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function approach(value, target, amount) {
    if (value < target) return Math.min(value + amount, target);
    if (value > target) return Math.max(value - amount, target);
    return value;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function cryptoSafeId() {
    if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
    return `trap-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[ch]));
  }

  function getCanvasPos(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onCanvasClick(event) {
    if (game.turn !== TURN.DEFENSE_BUILD) return;
    const pos = getCanvasPos(event);
    const slot = game.trapSlots.find((s) => (
      pos.x >= s.x - TILE_SIZE / 2 &&
      pos.x <= s.x + TILE_SIZE / 2 &&
      pos.y >= s.y - TILE_SIZE &&
      pos.y <= s.y
    ));
    if (slot) placeTrapAtSlot(slot);
  }

  function selectTrap(type) {
    selectedTrap = type;
    for (const btn of document.querySelectorAll(".trap-btn")) {
      btn.classList.toggle("selected", btn.dataset.trap === type);
    }
  }

  function rotateTrapPreview() {
    selectedRotation = (selectedRotation + 90) % 360;
    updateRotationButton();
  }

  function updateRotationButton() {
    const btn = ui.defenseTools?.querySelector(".rotation-btn");
    if (btn) btn.textContent = `회전 ${selectedRotation}도`;
  }

  function createRotationControl() {
    if (!ui.defenseTools || ui.defenseTools.querySelector(".rotation-grid")) return;

    const grid = document.createElement("div");
    grid.className = "rotation-grid";
    grid.innerHTML = `<button class="rotation-btn" type="button">회전 0도</button>`;

    const actions = ui.defenseTools.querySelector(".tool-actions");
    ui.defenseTools.insertBefore(grid, actions);

    grid.querySelector(".rotation-btn").addEventListener("click", rotateTrapPreview);
    updateRotationButton();
  }

  function showHelp() {
    if (game.turn === TURN.ENDING) {
      flashLog("결과 화면에서는 보상 카드나 진행 버튼을 선택하세요.");
      return;
    }

    showOverlay({
      title: "조작법",
      text: "공격 턴에는 A/D 이동, Space 점프, Shift 대시, E 실드를 사용합니다. 방어 턴에는 표시된 슬롯에 함정을 배치하고 리플레이를 시작하세요.",
      buttonText: "닫기",
      onButton: hideOverlay,
    });
  }

  function resetGame() {
    localStorage.removeItem("traceProtocolBest");
    game.stage = 1;
    game.infiniteBest = 0;
    game.lastAttackRecording = [];
    game.carriedTrapsByStage.clear();
    game.mods = createDefaultMods();
    setupStage();
  }

  function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + w - r, y);
    context.quadraticCurveTo(x + w, y, x + w, y + r);
    context.lineTo(x + w, y + h - r);
    context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    context.lineTo(x + r, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function bindEvents() {
    createRotationControl();

    window.addEventListener("keydown", (event) => {
      if (event.code === "KeyE" && !event.repeat) {
        activateShield();
      }
      keys.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }
    });

    window.addEventListener("keyup", (event) => keys.delete(event.code));
    canvas.addEventListener("click", onCanvasClick);
    ui.overlay.addEventListener("click", (event) => event.stopPropagation());
    ui.overlayButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = overlayAction;
      if (typeof action === "function") action();
      else hideOverlay();
    });
    ui.startReplayBtn.addEventListener("click", startReplay);
    ui.undoTrapBtn.addEventListener("click", undoTrap);
    ui.restartBtn.addEventListener("click", resetGame);
    ui.helpBtn.addEventListener("click", showHelp);

    for (const btn of document.querySelectorAll(".trap-btn")) {
      btn.addEventListener("click", () => selectTrap(btn.dataset.trap));
    }
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  bindEvents();
  setupStage();
  requestAnimationFrame(loop);
})();
