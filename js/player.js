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

const ATTACK_INPUT_CODES = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "ShiftLeft",
  "ShiftRight",
  "Space",
]);
const WORLD_TOP = 0;
const WALL_GRAB_SLIDE_SPEED = 70;
const WALL_JUMP_X_SPEED = 280;
const WALL_JUMP_Y_SPEED = 700;
const WALL_JUMP_BUFFER_TIME = 0.12;
const WALL_MIN_CONTACT_HEIGHT = 16;
const HACKER_STAND_HEIGHT = 54;
const HACKER_SLIDE_HEIGHT = 30;
const SLIDE_POSE_DURATION = 0.42;
const WALL_JUMP_DASH_WINDOW = 0.7;
const WALL_DASH_DURATION = 0.155;

export function createHacker(game) {
  return {
    x: 64,
    y: 388,
    w: 30,
    h: HACKER_STAND_HEIGHT,
    standHeight: HACKER_STAND_HEIGHT,
    slideHeight: HACKER_SLIDE_HEIGHT,
    vx: 0,
    vy: 0,

    speed: 250,
    jumpPower: 620,
    facing: 1,
    onGround: false,
    wallGrab: false,
    wallSide: 0,
    wallContactSide: 0,
    wallContactTimer: 0,
    wallJumpInputLock: false,
    wallJumpDashTimer: 0,

    hp: 3,
    maxHp: 3,

    energy: game.mods.maxEnergy,
    maxEnergy: game.mods.maxEnergy,

    invincible: 0,

    dashCooldown: 0,

    // 대시 거리 조정: 약 4칸 정도 이동하도록 속도/시간을 낮춤
    dashSpeed: 580,
    dashDuration: 0.18,

    dashCost: 18,
    dashInputLock: false,
    isDashing: false,
    isSliding: false,
    dashTime: 0,
    slidePoseTime: 0,
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

  if (!game.attackTimerStarted && hasAttackInput(keys)) {
    game.attackTimerStarted = true;
  }

  if (game.attackTimerStarted) {
    game.timer -= dt;
    if (game.timer <= 0) {
      endStage(false, "제한 시간이 끝났습니다.");
      return;
    }
  }

  h.dashCooldown = Math.max(0, h.dashCooldown - dt);
  h.invincible = Math.max(0, h.invincible - dt);
  h.dashHazardGrace = Math.max(0, h.dashHazardGrace - dt);
  h.wallContactTimer = Math.max(0, (h.wallContactTimer || 0) - dt);
  h.wallJumpDashTimer = Math.max(0, (h.wallJumpDashTimer || 0) - dt);

  h.dashTime = Math.max(0, h.dashTime - dt);
  h.isDashing = h.dashTime > 0;
  h.slidePoseTime = Math.max(0, (h.slidePoseTime || 0) - dt);
  updateSlidePose(h);

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
    h.vx = h.vx < -moveSpeed ? approach(h.vx, -moveSpeed, 1800 * dt) : -moveSpeed;
    h.facing = -1;
  } else if (right && !left) {
    h.vx = h.vx > moveSpeed ? approach(h.vx, moveSpeed, 1800 * dt) : moveSpeed;
    h.facing = 1;
  } else {
    h.vx = approach(h.vx, 0, 1800 * dt);
  }

  const wallJumpSide = getWallJumpSide(h);
  const pressingAwayFromWall = isPressingAwayFromWall(wallJumpSide, left, right);

  if (jump && wallJumpSide && (!h.wallJumpInputLock || pressingAwayFromWall)) {
    performWallJump(h, wallJumpSide, dash && pressingAwayFromWall);
  } else if (jump && h.onGround) {
    h.vy = -h.jumpPower;
    h.onGround = false;
  }

  if (!jump) {
    h.wallJumpInputLock = false;
  }

  if (shield && !h.shieldInputLock) {
    activateShield(game, flashLog);
    h.shieldInputLock = true;
  }

  if (!shield) {
    h.shieldInputLock = false;
  }

  h.vy += 1600 * dt;

  moveAndCollide(h, dt, game, keys);
  applyAttackHazards(h, game, flashLog);
  if (game.attackTimerStarted) {
    recordHacker(game, dt);
  }

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

function getWallJumpSide(h) {
  if (h.wallGrab && h.wallSide) return h.wallSide;
  if (h.wallContactTimer > 0 && h.wallContactSide) return h.wallContactSide;
  return 0;
}

function isPressingAwayFromWall(wallSide, left, right) {
  if (wallSide < 0) return right;
  if (wallSide > 0) return left;
  return false;
}

function performWallJump(h, wallSide, useSlideBoost = false) {
  endSlide(h);
  const jumpDirection = -wallSide;
  h.vx = jumpDirection * (useSlideBoost ? h.dashSpeed : WALL_JUMP_X_SPEED);
  h.vy = -WALL_JUMP_Y_SPEED;
  h.facing = jumpDirection;
  h.wallGrab = false;
  h.wallSide = 0;
  h.wallContactSide = 0;
  h.wallContactTimer = 0;
  h.wallJumpDashTimer = WALL_JUMP_DASH_WINDOW;
  h.wallJumpInputLock = true;

  if (useSlideBoost) {
    h.dashDirection = jumpDirection;
    h.isDashing = true;
    h.dashTime = WALL_DASH_DURATION;
    h.slidePoseTime = SLIDE_POSE_DURATION;
    startSlide(h);
  }
}

function hasAttackInput(keys) {
  for (const code of ATTACK_INPUT_CODES) {
    if (keys.has(code)) return true;
  }
  return false;
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
  h.dashTime = !h.onGround && h.wallJumpDashTimer > 0 ? WALL_DASH_DURATION : h.dashDuration;
  h.slidePoseTime = SLIDE_POSE_DURATION;
  startSlide(h);

  // 대시 중 + 대시 직후까지 짧게 장애물 판정을 무시
  h.dashHazardGrace = h.dashDuration + 0.22;
}

function updateSlidePose(h) {
  if (h.isDashing || h.slidePoseTime > 0) {
    startSlide(h);
  } else {
    endSlide(h);
  }
}

function startSlide(h) {
  if (h.isSliding) return;
  setHackerHeight(h, h.slideHeight || HACKER_SLIDE_HEIGHT);
  h.isSliding = true;
}

function endSlide(h) {
  if (!h.isSliding) return;
  setHackerHeight(h, h.standHeight || HACKER_STAND_HEIGHT);
  h.isSliding = false;
}

function setHackerHeight(h, nextHeight) {
  const feetY = h.y + h.h;
  h.h = nextHeight;
  h.y = feetY - h.h;
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

function moveAndCollide(entity, dt, game, keys) {
  const holdingLeft = keys.has("ArrowLeft");
  const holdingRight = keys.has("ArrowRight");

  entity.wallGrab = false;
  entity.wallSide = 0;

  const previousX = entity.x;
  entity.x += entity.vx * dt;
  const edgeWallSide = getEdgeWallSide(entity, holdingLeft, holdingRight);
  entity.x = clamp(entity.x, 0, 1200 - entity.w);
  if (edgeWallSide) {
    grabWall(entity, edgeWallSide);
  }
  collidePlatformWallsX(entity, previousX, game, holdingLeft, holdingRight);
  collideClosedFirewallsX(entity, previousX, game);

  if (entity.wallGrab) {
    entity.vy = WALL_GRAB_SLIDE_SPEED;
  }

  const previousY = entity.y;
  entity.y += entity.vy * dt;
  entity.onGround = false;

  if (entity.y < WORLD_TOP) {
    entity.y = WORLD_TOP;
    entity.vy = Math.max(0, entity.vy);
  }

  for (const p of game.platforms) {
    if (!rectsOverlap(entity, p)) continue;

    const prevTop = previousY;
    const prevBottom = previousY + entity.h;

    if (entity.vy >= 0 && prevBottom <= p.y + 6) {
      entity.y = p.y - entity.h;
      entity.vy = 0;
      entity.onGround = true;
      entity.wallGrab = false;
      entity.wallSide = 0;
      entity.wallContactSide = 0;
      entity.wallContactTimer = 0;
      entity.wallJumpDashTimer = 0;
    } else if (entity.vy < 0 && prevTop >= p.y + p.h - 2) {
      entity.y = p.y + p.h;
      entity.vy = 0;
    }
  }

  if (entity.y + entity.h > 462 && entity.vy >= 0) {
    entity.y = 462 - entity.h;
    entity.vy = 0;
    entity.onGround = true;
    entity.wallGrab = false;
    entity.wallSide = 0;
    entity.wallContactSide = 0;
    entity.wallContactTimer = 0;
    entity.wallJumpDashTimer = 0;
  }

  if (entity.y > 540 + 80) {
    setHackerHeight(entity, entity.standHeight || HACKER_STAND_HEIGHT);
    entity.x = 64;
    entity.y = 320;
    entity.vx = 0;
    entity.vy = 0;
    entity.isDashing = false;
    entity.isSliding = false;
    entity.dashTime = 0;
    entity.slidePoseTime = 0;
    entity.dashHazardGrace = 0;
    entity.wallGrab = false;
    entity.wallSide = 0;
    entity.wallContactSide = 0;
    entity.wallContactTimer = 0;
    entity.wallJumpDashTimer = 0;
  }
}

function getEdgeWallSide(entity, holdingLeft, holdingRight) {
  if (entity.x <= 0 && holdingLeft) return -1;
  if (entity.x + entity.w >= 1200 && holdingRight) return 1;
  return 0;
}

function collidePlatformWallsX(entity, previousX, game, holdingLeft, holdingRight) {
  const previousBox = {
    x: previousX,
    y: entity.y,
    w: entity.w,
    h: entity.h,
  };

  for (const platform of game.platforms || []) {
    const wallBox = getPlatformWallBox(platform);
    if (!rectsOverlap(entity, wallBox)) continue;
    if (getVerticalOverlap(entity, wallBox) < WALL_MIN_CONTACT_HEIGHT) continue;

    const hitLeftFace = previousBox.x + previousBox.w <= wallBox.x && entity.x + entity.w >= wallBox.x;
    const hitRightFace = previousBox.x >= wallBox.x + wallBox.w && entity.x <= wallBox.x + wallBox.w;

    if (hitLeftFace) {
      entity.x = wallBox.x - entity.w;
      entity.vx = Math.min(0, entity.vx);
      if (holdingRight) grabWall(entity, 1);
    } else if (hitRightFace) {
      entity.x = wallBox.x + wallBox.w;
      entity.vx = Math.max(0, entity.vx);
      if (holdingLeft) grabWall(entity, -1);
    }
  }
}

function getVerticalOverlap(a, b) {
  return Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
}

function getPlatformWallBox(platform) {
  return {
    x: platform.x,
    y: platform.y,
    w: platform.w,
    h: getPlatformWallHeight(platform),
  };
}

function getPlatformWallHeight(platform) {
  return Math.max(platform.h, 48);
}

function grabWall(entity, side) {
  if (entity.onGround) return;
  entity.wallGrab = true;
  entity.wallSide = side;
  entity.wallContactSide = side;
  entity.wallContactTimer = WALL_JUMP_BUFFER_TIME;
  entity.wallJumpDashTimer = 0;
  entity.isDashing = false;
  entity.isSliding = false;
  entity.dashTime = 0;
  entity.slidePoseTime = 0;
  setHackerHeight(entity, entity.standHeight || HACKER_STAND_HEIGHT);
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
      endSlide(h);
      h.dashTime = 0;
      h.slidePoseTime = 0;
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
    endSlide(entity);
    entity.dashTime = 0;
    entity.slidePoseTime = 0;
  }
}
