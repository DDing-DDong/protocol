// replay.js
// 책임: 기록 저장 및 방어 리플레이 로직만 담당합니다.

import { TURN, TRAPS, getStageTime, rectsOverlap } from "./data.js";
import { getTrapHitbox } from "./trap.js";

export function createReplayHacker(game) {
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
    if (!rectsOverlap(r, getTrapHitbox(trap, game))) continue;

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

function evaluateDefenseSuccess(stage, metrics) {
  if (stage === 2) return metrics.delay >= 2;
  if (stage === 4) return metrics.detections >= 2;
  if (stage === 6) return metrics.delay >= 5 || metrics.detections >= 3;
  if (stage === 8) return metrics.delay >= 3 || metrics.detections >= 2 || metrics.energyUsed >= 25;
  if (stage === 10) return metrics.delay >= 4 || metrics.detections >= 3;
  return metrics.detections >= 2 || metrics.delay >= 4;
}
