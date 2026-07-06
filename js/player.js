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
const NO_INPUT_KEYS = new Set();
const WORLD_TOP = 0;
const WALL_GRAB_SLIDE_SPEED = 70;
const WALL_STICK_TIME = 1;
const WALL_RELEASE_SLIDE_SPEED = 115;
const WALL_JUMP_X_SPEED = 280;
const WALL_JUMP_Y_SPEED = 700;
const WALL_JUMP_BUFFER_TIME = 0.12;
const WALL_MIN_CONTACT_HEIGHT = 16;
const HACKER_STAND_HEIGHT = 54;
const HACKER_SLIDE_HEIGHT = 30;
const SLIDE_POSE_DURATION = 0.16;
const DASH_DISTANCE = 53;
const DASH_SPEED = 580;
const DASH_DURATION = DASH_DISTANCE / DASH_SPEED;
const DASH_FLOOR_HAZARD_GRACE = 0.34;
const WALL_JUMP_DASH_WINDOW = 0.7;
const WALL_DASH_DURATION = 0.155;
const HIT_INVINCIBLE_TIME = 0.55;
const HIT_FLASH_TIME = 0.32;
const BLOCK_INVINCIBLE_TIME = 0.45;
const HACK_DELAY = 1;
const HACK_DURATION = 1;
const HACK_RANGE = 220;
const HACK_SCAN_VERTICAL_PADDING = 120;

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
    wallStickSide: 0,
    wallStickTimer: 0,
    wallAttachEffectTime: 0,
    wallSlideEffectTime: 0,
    wallContactSide: 0,
    wallContactTimer: 0,
    wallJumpInputLock: false,
    wallJumpDashTimer: 0,

    hp: 3,
    maxHp: 3,

    energy: game.mods.maxEnergy,
    maxEnergy: game.mods.maxEnergy,

    invincible: 0,
    damageFlashTime: 0,
    damageFlashColor: "#ff3b67",

    dashCooldown: 0,

    // 대시 거리 조정: 감전패널 앞에서 과하게 넘어가지 않도록 짧게 유지
    dashSpeed: DASH_SPEED,
    dashDuration: DASH_DURATION + (game.mods.dashDurationBonus || 0),

    dashCost: 18,
    dashInputLock: false,
    isDashing: false,
    isSliding: false,
    dashTime: 0,
    slidePoseTime: 0,
    dashDirection: 1,

    // 대시/슬라이딩 중 바닥 함정 끝부분에 걸리는 문제 방지
    dashHazardGrace: 0,

    shield: false,
    shieldTime: 0,
    shieldBlockFlashTime: 0,
    shieldDuration: HACK_DURATION,
    shieldInputLock: false,
    hackChargeTime: 0,
    hackChargeDuration: HACK_DELAY,
    hackEffectTime: 0,
    hackTarget: null,
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
  h.damageFlashTime = Math.max(0, (h.damageFlashTime || 0) - dt);
  h.dashHazardGrace = Math.max(0, h.dashHazardGrace - dt);
  h.wallContactTimer = Math.max(0, (h.wallContactTimer || 0) - dt);
  h.wallAttachEffectTime = Math.max(0, (h.wallAttachEffectTime || 0) - dt);
  h.wallSlideEffectTime = Math.max(0, (h.wallSlideEffectTime || 0) - dt);
  h.wallJumpDashTimer = Math.max(0, (h.wallJumpDashTimer || 0) - dt);

  h.dashTime = Math.max(0, h.dashTime - dt);
  h.isDashing = h.dashTime > 0;
  h.slidePoseTime = Math.max(0, (h.slidePoseTime || 0) - dt);
  updateSlidePose(h);

  h.shieldTime = Math.max(0, h.shieldTime - dt);
  h.shield = false;
  h.shieldBlockFlashTime = 0;
  updateHackState(h, dt, flashLog);
  h.slowTime = Math.max(0, (h.slowTime || 0) - dt);
  tickBaseHazardTimers(game, dt);

  const left = keys.has("ArrowLeft");
  const right = keys.has("ArrowRight");
  const jump = keys.has("ArrowUp");
  const dash = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const hack = keys.has("Space");
  const moveSpeed = h.slowTime > 0 ? h.speed * h.slowMultiplier : h.speed;

  if (hack && !h.shieldInputLock) {
    activateHack(game, flashLog);
    h.shieldInputLock = true;
  }

  if (!hack) {
    h.shieldInputLock = false;
  }

  const hackMovementLocked = h.hackChargeTime > 0;
  if (hackMovementLocked) {
    lockHackerMovementForHack(h);
  } else {
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
  }

  if (!hackMovementLocked) {
    h.vy += 1600 * dt;
  }

  moveAndCollide(h, dt, game, hackMovementLocked ? NO_INPUT_KEYS : keys);
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
  h.wallStickSide = 0;
  h.wallStickTimer = 0;
  h.wallAttachEffectTime = 0;
  h.wallSlideEffectTime = 0;
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

function lockHackerMovementForHack(h) {
  h.vx = 0;
  h.vy = 0;
  h.isDashing = false;
  h.dashTime = 0;
  h.slidePoseTime = 0;
  h.dashHazardGrace = 0;
  h.wallGrab = false;
  h.wallSide = 0;
  h.wallStickSide = 0;
  h.wallStickTimer = 0;
  h.wallAttachEffectTime = 0;
  h.wallSlideEffectTime = 0;
  h.wallContactSide = 0;
  h.wallContactTimer = 0;
  h.wallJumpDashTimer = 0;
  endSlide(h);
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
  const cost = getSkillEnergyCost(game, h.dashCost);

  if (h.dashCooldown > 0) return;

  if (h.energy < cost) {
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

  h.energy -= cost;
  game.metrics.energyUsed += cost;
  h.dashCooldown = game.mods.dashCooldown;

  h.isDashing = true;
  h.dashTime = !h.onGround && h.wallJumpDashTimer > 0 ? WALL_DASH_DURATION : h.dashDuration;
  h.slidePoseTime = SLIDE_POSE_DURATION;
  startSlide(h);

  // 대시 중 + 대시 직후까지 바닥류 함정 판정을 짧게 무시
  h.dashHazardGrace = h.dashDuration + DASH_FLOOR_HAZARD_GRACE;
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

export function activateHack(game, flashLog) {
  if (game.turn !== TURN.ATTACK || !game.hacker) return;

  const h = game.hacker;
  const freeShield = canUseFreeShield(game);
  const cost = freeShield ? 0 : getSkillEnergyCost(game, game.mods.shieldDrain);

  if (h.hackChargeTime > 0) return;

  if (h.energy < cost) {
    flashLog("해킹을 실행하기 위한 에너지가 부족합니다.");
    return;
  }

  const target = findHackTarget(game, h);
  if (!target) {
    flashLog("해킹 가능한 레이저나 카메라가 전방에 없습니다.");
    return;
  }

  h.energy -= cost;
  game.metrics.energyUsed += cost;
  if (freeShield) game.stageState.freeShieldUsesUsed += 1;
  h.hackChargeTime = HACK_DELAY;
  h.hackChargeDuration = HACK_DELAY;
  h.hackEffectTime = HACK_DELAY;
  h.hackTarget = target;
  target.hackPendingTime = HACK_DELAY;
  target.hackPendingDuration = HACK_DELAY;

  flashLog(freeShield
    ? "해킹 시작. 첫 사용 보상으로 에너지를 소모하지 않았습니다."
    : `해킹 시작. ${HACK_DELAY.toFixed(1)}초 뒤 전방 보안장치를 무력화합니다.`);
}

function updateHackState(h, dt, flashLog) {
  const previousChargeTime = h.hackChargeTime || 0;
  h.hackChargeTime = Math.max(0, previousChargeTime - dt);
  h.hackEffectTime = Math.max(0, (h.hackEffectTime || 0) - dt);

  if (previousChargeTime <= 0 || h.hackChargeTime > 0) return;

  const target = h.hackTarget;
  h.hackTarget = null;
  if (!target || !isHackableHazard(target)) {
    flashLog("해킹 대상 연결이 끊겼습니다.");
    return;
  }

  target.hackedTime = HACK_DURATION;
  target.hackedDuration = HACK_DURATION;
  target.hackEffectTime = HACK_DURATION;
  target.hackPendingTime = 0;
  h.hackEffectTime = 0.28;
  flashLog(`${TRAPS[target.type].name} 해킹 완료. ${HACK_DURATION.toFixed(0)}초 동안 무력화됩니다.`);
}

function findHackTarget(game, h) {
  const scanBox = getHackScanBox(h);
  const candidates = [];

  for (const hazard of game.baseHazards || []) {
    if (!isHackableHazard(hazard)) continue;
    if ((hazard.hackedTime || 0) > 0 || (hazard.hackPendingTime || 0) > 0) continue;

    const box = getHazardHitbox(hazard, game);
    if (!rectsOverlap(scanBox, box)) continue;
    candidates.push({ hazard, distance: getForwardDistance(h, box) });
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.hazard || null;
}

function getHackScanBox(h) {
  const centerY = h.y + h.h / 2;
  const top = centerY - h.h / 2 - HACK_SCAN_VERTICAL_PADDING;
  const height = h.h + HACK_SCAN_VERTICAL_PADDING * 2;

  if ((h.facing || 1) < 0) {
    return {
      x: h.x - HACK_RANGE,
      y: top,
      w: HACK_RANGE,
      h: height,
    };
  }

  return {
    x: h.x + h.w,
    y: top,
    w: HACK_RANGE,
    h: height,
  };
}

function getForwardDistance(h, box) {
  if ((h.facing || 1) < 0) return Math.max(0, h.x - (box.x + box.w));
  return Math.max(0, box.x - (h.x + h.w));
}

function isHackableHazard(hazard) {
  return hazard?.type === "laser" || hazard?.type === "camera";
}

function getSkillEnergyCost(game, baseCost) {
  return Math.ceil(baseCost * (game.mods.skillEnergyCostMultiplier || 1));
}

function canUseFreeShield(game) {
  return (game?.stageState?.freeShieldUsesUsed || 0) < (game?.mods?.freeShieldUses || 0);
}

function canIgnoreCamera(game) {
  return (game?.stageState?.cameraIgnoreUsesUsed || 0) < (game?.mods?.cameraIgnoreUses || 0);
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

  if (!entity.wallGrab) {
    entity.wallStickSide = 0;
    entity.wallStickTimer = 0;
    entity.wallSlideEffectTime = 0;
  } else {
    updateWallStick(entity, dt);
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
      entity.wallStickSide = 0;
      entity.wallStickTimer = 0;
      entity.wallAttachEffectTime = 0;
      entity.wallSlideEffectTime = 0;
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
    entity.wallStickSide = 0;
    entity.wallStickTimer = 0;
    entity.wallAttachEffectTime = 0;
    entity.wallSlideEffectTime = 0;
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
    entity.wallStickSide = 0;
    entity.wallStickTimer = 0;
    entity.wallAttachEffectTime = 0;
    entity.wallSlideEffectTime = 0;
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
  const movingRight = entity.x > previousX;
  const movingLeft = entity.x < previousX;

  for (const platform of game.platforms || []) {
    const wallBox = getPlatformWallBox(platform);
    if (getVerticalOverlap(entity, wallBox) < WALL_MIN_CONTACT_HEIGHT) continue;

    const hitLeftFace = movingRight &&
      previousBox.x + previousBox.w <= wallBox.x &&
      entity.x + entity.w >= wallBox.x;
    const hitRightFace = movingLeft &&
      previousBox.x >= wallBox.x + wallBox.w &&
      entity.x <= wallBox.x + wallBox.w;
    const alreadyOverlapping = rectsOverlap(entity, wallBox);

    if (hitLeftFace) {
      entity.x = wallBox.x - entity.w;
      entity.vx = Math.min(0, entity.vx);
      if (holdingRight) grabWall(entity, 1);
      break;
    } else if (hitRightFace) {
      entity.x = wallBox.x + wallBox.w;
      entity.vx = Math.max(0, entity.vx);
      if (holdingLeft) grabWall(entity, -1);
      break;
    } else if (alreadyOverlapping) {
      resolvePlatformWallOverlapX(entity, previousBox, wallBox, holdingLeft, holdingRight);
      break;
    }
  }
}

function resolvePlatformWallOverlapX(entity, previousBox, wallBox, holdingLeft, holdingRight) {
  const previousCenter = previousBox.x + previousBox.w / 2;
  const wallCenter = wallBox.x + wallBox.w / 2;

  if (previousCenter <= wallCenter) {
    entity.x = wallBox.x - entity.w;
    entity.vx = Math.min(0, entity.vx);
    if (holdingRight) grabWall(entity, 1);
    return;
  }

  entity.x = wallBox.x + wallBox.w;
  entity.vx = Math.max(0, entity.vx);
  if (holdingLeft) grabWall(entity, -1);
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
  if (entity.wallStickSide !== side) {
    entity.wallStickSide = side;
    entity.wallStickTimer = WALL_STICK_TIME;
    entity.wallAttachEffectTime = 0.24;
  }

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

function updateWallStick(entity, dt) {
  const wasSticking = (entity.wallStickTimer || 0) > 0;
  entity.wallStickTimer = Math.max(0, (entity.wallStickTimer || 0) - dt);

  if (entity.wallStickTimer > 0) {
    entity.vy = 0;
    return;
  }

  entity.vy = WALL_RELEASE_SLIDE_SPEED;
  if (wasSticking) {
    entity.wallSlideEffectTime = 0.28;
  } else if ((entity.wallSlideEffectTime || 0) <= 0) {
    entity.wallSlideEffectTime = 0.12;
  }
}

function applyAttackHazards(h, game, flashLog) {
  for (const hazard of game.baseHazards) {
    if ((hazard.hackedTime || 0) > 0) continue;
    if (hazard.type === "camera" && !isEntityInCameraView(h, hazard, game)) continue;
    if (!rectsOverlap(h, getHazardHitbox(hazard, game))) continue;

    if (canSlidePastFloorHazard(h, hazard)) {
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
      showDamageFlash(h, hazard.type);
      flashLog("닫힌 방화벽이 해커의 이동을 막았습니다.");
      return;
    }

    if (hazard.type === "camera") {
      if (canIgnoreCamera(game)) {
        game.stageState.cameraIgnoreUsesUsed += 1;
        h.invincible = 0.35;
        flashLog("카메라 탐지를 1회 무시했습니다.");
        return;
      }
      game.metrics.detections += 1;
      game.metrics.alertCharge = Math.min(8, game.metrics.alertCharge + getCameraEmpowerCount(game));
      const empoweredHazards = empowerNextHazardsByPlacementOrder(game);
      h.invincible = HIT_INVINCIBLE_TIME;
      showDamageFlash(h, hazard.type);
      flashLog(formatCameraAlertLog(empoweredHazards));
      return;
    }

    if (hazard.type === "shock") {
      const slowTime = getShockSlowTime(hazard, game);
      const wasEmpowered = hazard.empowered;
      h.slowTime = Math.max(h.slowTime || 0, slowTime);
      h.slowMultiplier = SHOCK_SLOW_MULTIPLIER;
      hazard.empowered = false;
      h.invincible = HIT_INVINCIBLE_TIME;
      showDamageFlash(h, hazard.type);
      flashLog(wasEmpowered
        ? `강화 감전패널이 이동속도를 ${formatSeconds(slowTime)} 동안 낮춰 이동을 지연시켰습니다.`
        : `감전패널이 이동속도를 ${formatSeconds(slowTime)} 동안 낮춰 이동을 지연시켰습니다.`);
      return;
    }

    if (hazard.type === "emp") {
      const drain = hazard.empowered ? 30 : 20;
      h.energy = Math.max(0, h.energy - drain);
      game.metrics.energyUsed += drain;
      hazard.empowered = false;
      h.invincible = HIT_INVINCIBLE_TIME;
      showDamageFlash(h, hazard.type);
      flashLog(`EMP패널이 에너지를 ${drain} 흡수했습니다.`);
      return;
    }

    if (hazard.type === "laser" && hazard.empowered) {
      game.metrics.detections += 1;
      hazard.empowered = false;
    }

    if (game.mods.freeHit > 0) {
      game.mods.freeHit -= 1;
      h.invincible = BLOCK_INVINCIBLE_TIME;
      showDamageFlash(h, hazard.type);
      flashLog("보호막으로 피해를 1회 무시했습니다.");
      return;
    }

    h.hp -= 1;
    game.metrics.hpLost += 1;
    h.invincible = HIT_INVINCIBLE_TIME;
    showDamageFlash(h, hazard.type);
    flashLog(`${TRAPS[hazard.type].name}에 걸렸습니다. 체력 -1`);
    return;
  }
}

function canSlidePastFloorHazard(h, hazard) {
  return isFloorHazard(hazard) && (h.isSliding || h.dashHazardGrace > 0);
}

function isFloorHazard(hazard) {
  return hazard?.type === "shock" || hazard?.type === "emp";
}

function showDamageFlash(h, hazardType) {
  h.damageFlashTime = HIT_FLASH_TIME;
  h.damageFlashColor = TRAPS[hazardType]?.color || "#ff3b67";
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
    if (!rectsOverlap(entity, getHazardHitbox(hazard, game))) continue;

    const wall = getHazardHitbox(hazard, game);
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
