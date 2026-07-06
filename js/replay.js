// replay.js
// 책임: 기록 저장 및 방어 리플레이 로직만 담당합니다.

import {
  TURN,
  TRAPS,
  getStageTime,
  getFirewallBlockTime,
  getCameraEmpowerCount,
  getShockDelay,
  getDefenseObjectiveItems,
  rectsOverlap,
} from "./data.js";
import {
  getTrapHitbox,
  getOrientedTrapBox,
  hasLineOfSight,
  isEntityInCameraView,
  empowerNextTrapsByPlacementOrder,
  tickPlacedTrapTimers,
} from "./trap.js";

const REPLAY_PLAYBACK_SPEED = 1.5;
const DETECTION_EFFECT_DURATION = 0.95;
const OBJECTIVE_SPARK_DURATION = 1.1;

export function createReplayHacker(game) {
  const first = game.lastAttackRecording[0] || { x: 64, y: 388, h: 54, facing: 1 };
  return {
    x: first.x,
    y: first.y,
    w: 30,
    h: first.h || 54,
    facing: first.facing || 1,
    isSliding: Boolean(first.isSliding),
    hp: 3,
    glitchTime: 0,
    trapCooldowns: new Map(),
    triggeredTraps: new Set(),
  };
}

export function recordHacker(game, dt) {
  game.recordTimer += dt;
  if (game.recordTimer < game.sampleStep) return;
  game.recordTimer = 0;

  const h = game.hacker;
  game.currentRecording.push({
    t: getStageTime(game.stage) - game.timer,
    x: h.x,
    y: h.y,
    h: h.h,
    facing: h.facing,
    isSliding: Boolean(h.isSliding),
    shield: h.shield,
    energyUsed: game.metrics.energyUsed,
  });
}

export function startReplay(game) {
  if (game.turn !== TURN.DEFENSE_BUILD) return;
  game.turn = TURN.DEFENSE_REPLAY;
  game.replayIndex = 0;
  game.replayPause = 0;
  game.replayStepTimer = 0;
  game.replayFinished = false;
  game.replayDelaySourceTrapId = null;
  game.completedObjectiveEffectIds = new Set(
    getDefenseObjectiveItems(game)
      .filter((item) => item.complete)
      .map((item) => item.id)
  );
  game.objectiveSparkTimer = 0;
  game.objectiveSparkDuration = 0;
  for (const trap of game.placedTraps || []) clearTrapEffects(trap);
  game.replayHacker = createReplayHacker(game);
}

export function updateDefenseReplay(game, dt, flashLog, endStage) {
  const r = game.replayHacker;
  if (!r || game.replayFinished) return;

  tickTrapCooldowns(r, dt);
  tickPlacedTrapTimers(game, dt);
  tickObjectiveSpark(game, dt);
  r.glitchTime = Math.max(0, (r.glitchTime || 0) - dt);

  if (game.replayPause > 0) {
    const pauseDt = Math.min(game.replayPause, dt);
    game.replayPause = normalizeTime(game.replayPause - pauseDt);
    game.metrics.delay = normalizeTime(game.metrics.delay + pauseDt);
    updateObjectiveCompletionEffects(game, findTrapById(game, game.replayDelaySourceTrapId));
    if (evaluateDefenseSuccess(game)) {
      endStage(true, "방어 목표를 달성했습니다.");
    }
    return;
  }

  const path = game.lastAttackRecording;
  const sampleStep = game.sampleStep || 0.06;
  game.replayStepTimer = (game.replayStepTimer || 0) + dt * REPLAY_PLAYBACK_SPEED;
  if (game.replayStepTimer < sampleStep) return;
  game.replayStepTimer = normalizeTime(game.replayStepTimer - sampleStep);

  if (game.replayIndex >= path.length - 1) {
    game.replayFinished = true;
    const success = evaluateDefenseSuccess(game);
    endStage(success, success ? "방어 목표를 달성했습니다." : "방어 목표를 모두 달성하지 못했습니다.");
    return;
  }

  game.replayIndex += 1;
  const sample = path[game.replayIndex];
  r.x = sample.x;
  r.y = sample.y;
  r.h = sample.h || 54;
  r.facing = sample.facing || r.facing;
  r.isSliding = Boolean(sample.isSliding);
  game.metrics.energyUsed = Math.max(game.metrics.energyUsed, sample.energyUsed || 0);

  checkDefenseTraps(r, game, flashLog);

  if (evaluateDefenseSuccess(game)) {
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

function checkDefenseTraps(r, game, flashLog) {
  for (const trap of game.placedTraps) {
    if (trap.type === "camera" && !isEntityInCameraView(r, trap, game)) continue;
    if (!rectsOverlap(r, getTrapHitbox(trap, game))) continue;
    if (trap.type === "camera" && !cameraCanSeeHacker(trap, r, game)) continue;
    if (canSlidePastFloorTrap(r, trap)) continue;

    const key = `${trap.id}-${trap.type}`;
    if (r.triggeredTraps.has(key)) continue;
    if (r.trapCooldowns.has(key)) continue;
    r.triggeredTraps.add(key);

    if (trap.type === "laser") {
      const wasEmpowered = trap.empowered;
      const detections = trap.empowered ? 2 : 1;
      game.metrics.detections += detections;
      recordTrapTrigger(game.metrics, trap.type);
      startTrapTriggerEffect(trap, "detect", `탐지 +${detections}`, DETECTION_EFFECT_DURATION);
      updateObjectiveCompletionEffects(game, trap);
      r.trapCooldowns.set(key, 0.7);
      trap.empowered = false;
      flashLog(wasEmpowered ? "강화 레이저가 해커를 강하게 탐지했습니다." : "레이저가 해커를 탐지했습니다.");
    }

    if (trap.type === "camera") {
      game.metrics.detections += 1;
      game.metrics.alertCharge = Math.min(8, game.metrics.alertCharge + getCameraEmpowerCount(game));
      recordTrapTrigger(game.metrics, trap.type);
      trap.detectFlash = 0.35;
      r.trapCooldowns.set(key, 1.2);
      if (game.mods.cameraDelay > 0) {
        game.replayPause = Math.max(game.replayPause, game.mods.cameraDelay);
        r.glitchTime = Math.max(r.glitchTime || 0, game.mods.cameraDelay);
        game.replayDelaySourceTrapId = trap.id;
      }
      startTrapTriggerEffect(
        trap,
        game.mods.cameraDelay > 0 ? "mixed" : "detect",
        game.mods.cameraDelay > 0
          ? `탐지 +1 · 지연 ${formatShortSeconds(game.mods.cameraDelay)}`
          : "탐지 +1",
        Math.max(DETECTION_EFFECT_DURATION, game.mods.cameraDelay || 0)
      );
      const empoweredTraps = empowerNextTrapsByPlacementOrder(game);
      updateObjectiveCompletionEffects(game, trap);
      flashLog(formatCameraAlertLog(empoweredTraps));
    }

    if (trap.type === "shock") {
      const delay = getShockDelay(trap, game);
      game.replayPause = Math.max(game.replayPause, delay);
      r.glitchTime = Math.max(r.glitchTime || 0, delay);
      recordTrapTrigger(game.metrics, trap.type);
      game.replayDelaySourceTrapId = trap.id;
      startTrapTriggerEffect(trap, "delay", `지연 ${formatShortSeconds(delay)}`, Math.max(0.9, delay));
      updateObjectiveCompletionEffects(game, trap);
      r.trapCooldowns.set(key, 1.4);
      trap.empowered = false;
      flashLog(`감전패널이 해커를 ${delay.toFixed(1)}초 지연시켰습니다.`);
    }

    if (trap.type === "firewall") {
      if (!trap.empowered && !trap.closed) {
        flashLog("방화벽은 열린 상태라 해커를 통과시켰습니다.");
        continue;
      }
      const delay = getFirewallBlockTime(game);
      trap.closed = true;
      trap.closedTime = delay;
      game.replayPause = Math.max(game.replayPause, delay);
      r.glitchTime = Math.max(r.glitchTime || 0, delay);
      recordTrapTrigger(game.metrics, trap.type);
      game.replayDelaySourceTrapId = trap.id;
      startTrapTriggerEffect(trap, "delay", `지연 ${formatShortSeconds(delay)}`, Math.max(0.9, delay));
      updateObjectiveCompletionEffects(game, trap);
      r.trapCooldowns.set(key, 1.8);
      flashLog(`강화 방화벽이 닫히며 해커를 ${delay}초 지연시켰습니다.`);
    }

    if (trap.type === "emp") {
      const drain = trap.empowered ? 30 : 20;
      game.metrics.energyUsed += drain;
      game.metrics.energyDrained = (game.metrics.energyDrained || 0) + drain;
      recordTrapTrigger(game.metrics, trap.type);
      updateObjectiveCompletionEffects(game, trap);
      r.trapCooldowns.set(key, 1.0);
      trap.empowered = false;
      flashLog(`EMP패널이 에너지를 ${drain} 흡수했습니다.`);
    }
  }
}

function canSlidePastFloorTrap(hacker, trap) {
  return Boolean(hacker?.isSliding) && (trap?.type === "shock" || trap?.type === "emp");
}

function formatCameraAlertLog(empoweredTraps) {
  if (!empoweredTraps || empoweredTraps.length === 0) return "카메라가 해커를 탐지했습니다.";
  const names = empoweredTraps.map((trap) => TRAPS[trap.type].name).join(", ");
  return `카메라 경보로 ${names}이 강화되었습니다.`;
}

function cameraCanSeeHacker(trap, hacker, game) {
  const box = getOrientedTrapBox(trap, game);
  const cameraPoint = getCameraOrigin(box);
  const hackerPoint = {
    x: hacker.x + hacker.w / 2,
    y: hacker.y + hacker.h / 2,
  };
  return hasLineOfSight(cameraPoint, hackerPoint, game.platforms);
}

function getCameraOrigin(box) {
  return { x: box.x + box.w - 30, y: box.y + 18 };
}

function evaluateDefenseSuccess(game) {
  const items = getDefenseObjectiveItems(game);
  return items.length > 0 && items.every((item) => item.complete);
}

function updateObjectiveCompletionEffects(game, sourceTrap) {
  const items = getDefenseObjectiveItems(game);
  if (items.length === 0) return;
  if (!(game.completedObjectiveEffectIds instanceof Set)) {
    game.completedObjectiveEffectIds = new Set(game.completedObjectiveEffectIds || []);
  }

  const newlyCompleted = [];
  for (const item of items) {
    if (!item.complete || game.completedObjectiveEffectIds.has(item.id)) continue;
    game.completedObjectiveEffectIds.add(item.id);
    newlyCompleted.push(item);
  }

  if (newlyCompleted.length === 0) return;

  const allComplete = items.every((item) => item.complete);
  const label = allComplete ? "목표 완료" : "조건 완료";
  game.objectiveSparkTimer = OBJECTIVE_SPARK_DURATION;
  game.objectiveSparkDuration = OBJECTIVE_SPARK_DURATION;
  game.objectiveSparkLabel = label;

  if (sourceTrap) {
    sourceTrap.objectiveSparkTimer = OBJECTIVE_SPARK_DURATION;
    sourceTrap.objectiveSparkDuration = OBJECTIVE_SPARK_DURATION;
    sourceTrap.objectiveSparkLabel = label;
  }
}

function startTrapTriggerEffect(trap, kind, label, duration) {
  trap.triggerEffect = {
    kind,
    label,
    timer: duration,
    duration,
  };
}

function clearTrapEffects(trap) {
  delete trap.triggerEffect;
  delete trap.objectiveSparkTimer;
  delete trap.objectiveSparkDuration;
  delete trap.objectiveSparkLabel;
}

function tickObjectiveSpark(game, dt) {
  if (!game.objectiveSparkTimer || game.objectiveSparkTimer <= 0) return;
  game.objectiveSparkTimer = Math.max(0, game.objectiveSparkTimer - dt);
  if (game.objectiveSparkTimer <= 0) {
    delete game.objectiveSparkTimer;
    delete game.objectiveSparkDuration;
    delete game.objectiveSparkLabel;
  }
}

function findTrapById(game, id) {
  if (!id) return null;
  return (game.placedTraps || []).find((trap) => trap.id === id) || null;
}

function formatShortSeconds(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}초`;
}

function normalizeTime(value) {
  return Math.max(0, Math.round(value * 1000) / 1000);
}

function recordTrapTrigger(metrics, type) {
  if (!metrics.trapTriggers) metrics.trapTriggers = {};
  metrics.trapTriggers[type] = (metrics.trapTriggers[type] || 0) + 1;
}

// 수정 이유:
// - 카메라 탐지 시 경보 충전과 설치 순서 기반 함정 강화 처리를 연결하기 위함
// - EMP, 열린 방화벽, 강화 방화벽, 강화 함정 효과를 수비 리플레이 판정에서 타입별로 분리하기 위함
// - 수비턴 지연 중 리플레이 해커 글리치 표시 시간을 관리하기 위함
// - 감시 네트워크 보상에 따라 카메라가 여러 함정을 강화할 수 있도록 하기 위함
