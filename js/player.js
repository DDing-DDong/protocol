// player.js
// 책임: 플레이어(해커) 이동과 공격 턴 상태만 담당합니다.

import { TURN, TRAPS, getStageTime, clamp, rectsOverlap, approach } from "./data.js";
import { getHazardHitbox } from "./trap.js";
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
  entity.x += entity.vx * dt;
  entity.x = clamp(entity.x, 0, 1200 - entity.w);

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
    if (!rectsOverlap(h, getHazardHitbox(hazard))) continue;
    if (h.invincible > 0) continue;

    if (h.shield) {
      h.shield = false;
      h.shieldTime = 0;
      h.invincible = 0.75;
      flashLog("실드가 함정을 막고 사라졌습니다.");
      return;
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
