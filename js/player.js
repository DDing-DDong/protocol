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

    // 대시 거리 조정: 약 4칸 정도 이동하도록 속도/시간을 낮춤
    dashSpeed: 580,
    dashDuration: 0.16,

    dashCost: 18,
    dashInputLock: false,
    isDashing: false,
    dashTime: 0,
    dashDirection: 1,

    // 대시 직후 장애물 끝부분에 걸리는 문제 방지
    dashHazardGrace: 0,

    shield: false,
    shieldTime: 0,
    shieldDuration: 3,
    shieldInputLock: false,
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
  h.dashHazardGrace = Math.max(0, h.dashHazardGrace - dt);

  h.dashTime = Math.max(0, h.dashTime - dt);
  h.isDashing = h.dashTime > 0;

  h.shieldTime = Math.max(0, h.shieldTime - dt);
  h.shield = h.shieldTime > 0;
  h.slowTime = Math.max(0, (h.slowTime || 0) - dt);
  tickBaseHazardTimers(game, dt);

  const left = keys.has("ArrowLeft");
  const right = keys.has("ArrowRight");
  const jump = keys.has("ArrowUp");
  const dash = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const shield = keys.has("Space");
  const moveSpeed = h.slowTime > 0 ? h.speed * h.slowMultiplier : h.speed;

  if (dash && !h.dashInputLock) {
    tryDash(game, keys, flashLog);
    h.dashInputLock = true;
  }

  if (!dash) {
    h.dashInputLock = false;
  }

  if (h.isDashing) {
    h.vx = h.dashDirection * h.dashSpeed;
  } else if (left && !right) {
    h.vx = -moveSpeed;
    h.facing = -1;
  } else if (right && !left) {
    h.vx = moveSpeed;
    h.facing = 1;
  } else {
    h.vx = approach(h.vx, 0, 1800 * dt);
  }

  if (jump && h.onGround) {
    h.vy = -h.jumpPower;
    h.onGround = false;
  }

  if (shield && !h.shieldInputLock) {
    activateShield(game, flashLog);
    h.shieldInputLock = true;
  }

  if (!shield) {
    h.shieldInputLock = false;
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

function tryDash(game, keys, flashLog) {
  if (game.turn !== TURN.ATTACK || !game.hacker) return;

  const h = game.hacker;

  if (h.dashCooldown > 0) return;

  if (h.energy < h.dashCost) {
    flashLog("대시를 사용하기 위한 에너지가 부족합니다.");
    return;
  }

  const left = keys.has("ArrowLeft");
  const right = keys.has("ArrowRight");

  if (left && !right) {
    h.dashDirection = -1;
  } else if (right && !left) {
    h.dashDirection = 1;
  } else {
    h.dashDirection = h.facing || 1;
  }

  h.facing = h.dashDirection;
  h.vx = h.dashDirection * h.dashSpeed;

  h.energy -= h.dashCost;
  game.metrics.energyUsed += h.dashCost;
  h.dashCooldown = game.mods.dashCooldown;

  h.isDashing = true;
  h.dashTime = h.dashDuration;

  // 대시 중 + 대시 직후까지 짧게 장애물 판정을 무시
  h.dashHazardGrace = h.dashDuration + 0.22;
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
  h.shieldTime = h.shieldDuration;
  h.shield = true;

  flashLog(`실드 활성화. ${h.shieldDuration.toFixed(1)}초 동안 1회 방어합니다.`);
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
    entity.isDashing = false;
    entity.dashTime = 0;
    entity.dashHazardGrace = 0;
  }
}

function applyAttackHazards(h, game, flashLog) {
  for (const hazard of game.baseHazards) {
    if (hazard.type === "camera" && !isEntityInCameraView(h, hazard)) continue;
    if (!rectsOverlap(h, getHazardHitbox(hazard))) continue;

    if (game.turn === TURN.ATTACK && game.stage % 2 === 1 && h.dashHazardGrace > 0) {
      continue;
    }

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
      h.isDashing = false;
      h.dashTime = 0;
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
      flashLog(`EMP패널이 에너지를 ${drain} 흡수했습니다.`);
      return;
    }

    if (hazard.type === "laser" && hazard.empowered) {
      game.metrics.detections += 1;
      hazard.empowered = false;
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
    entity.isDashing = false;
    entity.dashTime = 0;
  }
}
