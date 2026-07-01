// replay.js
// 책임: 기록 저장 및 방어 리플레이 로직만 담당합니다.

import {
  TURN,
  TRAPS,
  getStageTime,
  getFirewallBlockTime,
  getCameraEmpowerCount,
  getShockDelay,
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

export function createReplayHacker(game) {
  const first = game.lastAttackRecording[0] || { x: 64, y: 388, facing: 1 };
  return {
    x: first.x,
    y: first.y,
    w: 30,
    h: 54,
    facing: first.facing || 1,
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
    facing: h.facing,
    shield: h.shield,
    energyUsed: game.metrics.energyUsed,
  });
}

export function startReplay(game) {
  if (game.turn !== TURN.DEFENSE_BUILD) return;
  game.turn = TURN.DEFENSE_REPLAY;
  game.replayIndex = 0;
  game.replayPause = 0;
  game.replayFinished = false;
  game.replayHacker = createReplayHacker(game);
}

export function updateDefenseReplay(game, dt, flashLog, endStage) {
  const r = game.replayHacker;
  if (!r || game.replayFinished) return;

  tickTrapCooldowns(r, dt);
  tickPlacedTrapTimers(game, dt);
  r.glitchTime = Math.max(0, (r.glitchTime || 0) - dt);

  if (game.replayPause > 0) {
    const pauseDt = Math.min(game.replayPause, dt);
    game.replayPause -= pauseDt;
    game.metrics.delay += pauseDt;
    if (evaluateDefenseSuccess(game.stage, game.metrics)) {
      endStage(true, "방어 목표를 달성했습니다.");
    }
    return;
  }

  const path = game.lastAttackRecording;
  if (game.replayIndex >= path.length - 1) {
    game.replayFinished = true;
    const success = evaluateDefenseSuccess(game.stage, game.metrics);
    endStage(success, success ? "방어 목표를 달성했습니다." : "해커의 침투를 충분히 방해하지 못했습니다.");
    return;
  }

  game.replayIndex += 1;
  const sample = path[game.replayIndex];
  r.x = sample.x;
  r.y = sample.y;
  r.facing = sample.facing || r.facing;
  game.metrics.energyUsed = Math.max(game.metrics.energyUsed, sample.energyUsed || 0);

  checkDefenseTraps(r, game, flashLog);

  if (r.hp <= 0) {
    endStage(true, "해커를 완전히 차단했습니다.");
  } else if (evaluateDefenseSuccess(game.stage, game.metrics)) {
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
    if (trap.type === "camera" && !isEntityInCameraView(r, trap)) continue;
    if (!rectsOverlap(r, getTrapHitbox(trap, game))) continue;
    if (trap.type === "camera" && !cameraCanSeeHacker(trap, r, game)) continue;

    const key = `${trap.id}-${trap.type}`;
    if (r.triggeredTraps.has(key)) continue;
    if (r.trapCooldowns.has(key)) continue;
    r.triggeredTraps.add(key);

    if (trap.type === "laser") {
      const wasEmpowered = trap.empowered;
      const detections = trap.empowered ? 2 : 1;
      game.metrics.detections += detections;
      r.hp -= 1;
      r.trapCooldowns.set(key, 0.7);
      trap.empowered = false;
      flashLog(wasEmpowered ? "강화 레이저가 해커를 강하게 탐지했습니다." : "레이저가 해커를 탐지하고 피해를 줬습니다.");
    }

    if (trap.type === "camera") {
      game.metrics.detections += 1;
      game.metrics.alertCharge = Math.min(8, game.metrics.alertCharge + getCameraEmpowerCount(game));
      trap.detectFlash = 0.35;
      r.trapCooldowns.set(key, 1.2);
      const empoweredTraps = empowerNextTrapsByPlacementOrder(game);
      flashLog(formatCameraAlertLog(empoweredTraps));
    }

    if (trap.type === "shock") {
      const delay = getShockDelay(trap);
      game.replayPause = Math.max(game.replayPause, delay);
      r.glitchTime = Math.max(r.glitchTime || 0, delay);
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
      r.trapCooldowns.set(key, 1.8);
      flashLog(`강화 방화벽이 닫히며 해커를 ${delay}초 지연시켰습니다.`);
    }

    if (trap.type === "emp") {
      const drain = trap.empowered ? 30 : 20;
      game.metrics.energyUsed += drain;
      r.trapCooldowns.set(key, 1.0);
      trap.empowered = false;
      flashLog(`EMP패널이 에너지 사용 지표를 ${drain} 증가시켰습니다.`);
    }
  }
}

function formatCameraAlertLog(empoweredTraps) {
  if (!empoweredTraps || empoweredTraps.length === 0) return "카메라가 해커를 탐지했습니다.";
  const names = empoweredTraps.map((trap) => TRAPS[trap.type].name).join(", ");
  return `카메라 경보로 ${names}이 강화되었습니다.`;
}

function cameraCanSeeHacker(trap, hacker, game) {
  const box = getOrientedTrapBox(trap, game);
  const cameraPoint = getCameraOrigin(trap, box);
  const hackerPoint = {
    x: hacker.x + hacker.w / 2,
    y: hacker.y + hacker.h / 2,
  };
  return hasLineOfSight(cameraPoint, hackerPoint, game.platforms);
}

function getCameraOrigin(trap, box) {
  return { x: box.x + box.w - 30, y: box.y + 18 };
}

function evaluateDefenseSuccess(stage, metrics) {
  if (stage === 2) return metrics.delay >= 2;
  if (stage === 4) return metrics.detections >= 2;
  if (stage === 6) return metrics.delay >= 5 || metrics.detections >= 3;
  if (stage === 8) return metrics.delay >= 3 || metrics.detections >= 2 || metrics.energyUsed >= 25;
  if (stage === 10) return metrics.delay >= 4 || metrics.detections >= 3;
  return metrics.detections >= 2 || metrics.delay >= 4;
}

// 수정 이유:
// - 카메라 탐지 시 경보 충전과 설치 순서 기반 함정 강화 처리를 연결하기 위함
// - EMP, 열린 방화벽, 강화 방화벽, 강화 함정 효과를 수비 리플레이 판정에서 타입별로 분리하기 위함
// - 수비턴 지연 중 리플레이 해커 글리치 표시 시간을 관리하기 위함
// - 감시 네트워크 보상에 따라 카메라가 여러 함정을 강화할 수 있도록 하기 위함
