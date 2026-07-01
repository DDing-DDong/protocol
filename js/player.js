// player.js
// 책임: 플레이어(해커) 이동과 공격 턴 상태만 담당합니다.

import {
  TURN,
  TRAPS,
  getStageTime,
  getFirewallBlockTime,
  getCameraEmpowerCount,
  getShockSlowTime,
  SHOCK_SLOW_MULTIPLIER,
  clamp,
  rectsOverlap,
  approach,
} from "./data.js";
import {
  empowerNextHazardsByPlacementOrder,
  getHazardHitbox,
  isEntityInCameraView,
  tickBaseHazardTimers,
} from "./trap.js";
import { recordHacker } from "./replay.js";

export function createHacker(game) {
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
    slowTime: 0,
    slowMultiplier: 1,
  };
}

export function updateAttack(game, dt, keys, flashLog, endStage) {
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
  h.slowTime = Math.max(0, (h.slowTime || 0) - dt);
  tickBaseHazardTimers(game, dt);

  const left = keys.has("ArrowLeft") || keys.has("KeyA");
  const right = keys.has("ArrowRight") || keys.has("KeyD");
  const moveSpeed = h.slowTime > 0 ? h.speed * h.slowMultiplier : h.speed;

  if (left && !right) {
    h.vx = -moveSpeed;
    h.facing = -1;
  } else if (right && !left) {
    h.vx = moveSpeed;
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

  h.vy += 1600 * dt;

  moveAndCollide(h, dt, game);
  applyAttackHazards(h, game, flashLog);
  recordHacker(game, dt);

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

export function activateShield(game, flashLog) {
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
  h.shieldTime = 2.5;
  h.shield = true;
  flashLog(`실드 활성화. ${2.5.toFixed(1)}초 동안 1회 방어합니다.`);
}

function moveAndCollide(entity, dt, game) {
  const previousX = entity.x;
  entity.x += entity.vx * dt;
  entity.x = clamp(entity.x, 0, 1200 - entity.w);
  collideClosedFirewallsX(entity, previousX, game);

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

  if (entity.y + entity.h > 462 && entity.vy >= 0) {
    entity.y = 462 - entity.h;
    entity.vy = 0;
    entity.onGround = true;
  }

  if (entity.y > 540 + 80) {
    entity.x = 64;
    entity.y = 320;
    entity.vx = 0;
    entity.vy = 0;
  }
}

function applyAttackHazards(h, game, flashLog) {
  for (const hazard of game.baseHazards) {
    if (hazard.type === "camera" && !isEntityInCameraView(h, hazard)) continue;
    if (!rectsOverlap(h, getHazardHitbox(hazard))) continue;
    if (h.invincible > 0) continue;

    if (hazard.type === "firewall" && hazard.empowered && !hazard.closed) {
      hazard.closed = true;
      hazard.closedTime = getFirewallBlockTime(game);
    }

    if (hazard.type === "firewall" && !hazard.closed) {
      continue;
    }

    if (hazard.type === "firewall") {
      h.vx = 0;
      h.invincible = 0.25;
      flashLog("닫힌 방화벽이 해커의 이동을 막았습니다.");
      return;
    }

    if (hazard.type === "camera") {
      game.metrics.detections += 1;
      game.metrics.alertCharge = Math.min(8, game.metrics.alertCharge + getCameraEmpowerCount(game));
      const empoweredHazards = empowerNextHazardsByPlacementOrder(game);
      h.invincible = 0.9;
      flashLog(formatCameraAlertLog(empoweredHazards));
      return;
    }

    if (hazard.type === "shock") {
      const slowTime = getShockSlowTime(hazard);
      const wasEmpowered = hazard.empowered;
      h.slowTime = Math.max(h.slowTime || 0, slowTime);
      h.slowMultiplier = SHOCK_SLOW_MULTIPLIER;
      hazard.empowered = false;
      h.invincible = 0.9;
      flashLog(wasEmpowered
        ? `강화 감전패널이 이동속도를 ${formatSeconds(slowTime)} 동안 낮춰 이동을 지연시켰습니다.`
        : `감전패널이 이동속도를 ${formatSeconds(slowTime)} 동안 낮춰 이동을 지연시켰습니다.`);
      return;
    }

    if (h.shield) {
      h.shield = false;
      h.shieldTime = 0;
      h.invincible = 0.75;
      flashLog(hazard.type === "emp" ? "실드가 EMP 충격을 막고 사라졌습니다." : "실드가 함정을 막고 사라졌습니다.");
      return;
    }

    if (hazard.type === "emp") {
      const drain = hazard.empowered ? 30 : 20;
      h.energy = Math.max(0, h.energy - drain);
      game.metrics.energyUsed += drain;
      hazard.empowered = false;
      h.invincible = 0.9;
      // EMP는 체력 피해를 주지 않으며, 실드가 켜져 있으면 실드가 EMP를 막고 사라집니다.
      flashLog(`EMP패널이 에너지를 ${drain} 흡수했습니다.`);
      return;
    }

    if (hazard.type === "laser") {
      if (hazard.empowered) {
        game.metrics.detections += 1;
        hazard.empowered = false;
      }
    }

    if (game.mods.freeHit > 0) {
      game.mods.freeHit -= 1;
      h.invincible = 0.9;
      flashLog("보호막으로 피해를 1회 무시했습니다.");
      return;
    }

    h.hp -= 1;
    game.metrics.hpLost += 1;
    h.invincible = 0.9;
    flashLog(`${TRAPS[hazard.type].name}에 걸렸습니다. 체력 -1`);
    return;
  }
}

function formatCameraAlertLog(empoweredHazards) {
  if (!empoweredHazards || empoweredHazards.length === 0) return "카메라가 해커를 탐지했습니다.";
  const names = empoweredHazards.map((hazard) => TRAPS[hazard.type].name).join(", ");
  return `카메라 경보로 ${names}이 강화되었습니다.`;
}

function formatSeconds(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}초`;
}

function collideClosedFirewallsX(entity, previousX, game) {
  const previousBox = {
    x: previousX,
    y: entity.y,
    w: entity.w,
    h: entity.h,
  };

  for (const hazard of game.baseHazards || []) {
    if (hazard.type !== "firewall") continue;
    if (hazard.empowered && !hazard.closed) {
      hazard.closed = true;
      hazard.closedTime = getFirewallBlockTime(game);
    }
    if (!hazard.closed) continue;
    if (!rectsOverlap(entity, getHazardHitbox(hazard))) continue;

    const wall = getHazardHitbox(hazard);
    if (previousBox.x + previousBox.w <= wall.x) {
      entity.x = wall.x - entity.w;
    } else if (previousBox.x >= wall.x + wall.w) {
      entity.x = wall.x + wall.w;
    } else {
      const pushLeft = Math.abs((wall.x - entity.w) - entity.x);
      const pushRight = Math.abs((wall.x + wall.w) - entity.x);
      entity.x = pushLeft <= pushRight ? wall.x - entity.w : wall.x + wall.w;
    }
    entity.vx = 0;
  }
}

// 수정 이유:
// - EMP 공격턴 에너지 피해 처리를 위해 applyAttackHazards에서 emp 타입 분기 추가
// - 기본 방화벽이 공격턴 체력 피해 함정처럼 작동하지 않도록 firewall 타입 분리
// - 공격턴 카메라 탐지에도 수비턴과 동일한 경보 충전 및 다음 함정 강화 흐름을 적용하기 위함
// - 감전패널 적중 시 공격턴 해커 이동속도 감소 효과를 적용하기 위함
// - 감시 네트워크 보상에 따라 카메라가 여러 함정을 강화할 수 있도록 하기 위함
