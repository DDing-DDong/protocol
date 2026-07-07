// trap.js
// 책임: 함정 생성, 배치, 트랩 판정과 관련된 로직을 담당합니다.

import { TURN, TRAPS, LASER_BASE_LENGTH, cryptoSafeId, getCameraEmpowerCount, getDefenseObjective } from "./data.js?v=20260707-mobile-ui";

export const CAMERA_W = 90;
export const CAMERA_H = 94;

export function placeTrapAtSlot(game, slot, selectedTrap, selectedRotation, flashLog) {
  if (game.turn !== TURN.DEFENSE_BUILD || slot.occupied) return false;
  if (slot.blocked) {
    flashLog("이 슬롯은 현재 설치할 수 없습니다.");
    return false;
  }

  const objective = getDefenseObjective(game.stage);
  const extraUse = canUseExtraTrap(game, selectedTrap);
  if (objective?.maxTraps && countObjectiveTraps(game) >= objective.maxTraps) {
    if (!extraUse) {
      flashLog(`이번 방어 목표는 함정 ${objective.maxTraps}개 이하입니다.`);
      return false;
    }
  }

  const usedFreePlacement = canUseFreeTrapPlacement(game);
  const cost = getTrapCost(selectedTrap, game, slot);
  if (game.defenseBudget < cost) {
    flashLog("함정 토큰이 부족합니다.");
    return false;
  }

  const trap = {
    id: cryptoSafeId(),
    type: selectedTrap,
    rotation: getAllowedRotation(selectedTrap, selectedRotation),
    x: slot.x,
    y: slot.y,
    slotId: slot.id,
    empowered: false,
    closed: false,
    closedTime: 0,
    costPaid: cost,
    usedFreePlacement,
    extraUse,
  };

  slot.occupied = true;
  game.placedTraps.push(trap);
  if (usedFreePlacement) game.stageState.freeTrapPlacementsUsed += 1;
  if (extraUse) game.stageState.extraTrapUsesByType[selectedTrap] -= 1;
  game.defenseBudget -= cost;
  flashLog(`${TRAPS[selectedTrap].name}${extraUse ? " 제한 외" : ""} 배치 완료. 남은 함정 토큰 ${game.defenseBudget}`);
}

export function undoTrap(game) {
  if (game.turn !== TURN.DEFENSE_BUILD) return;

  const trap = game.placedTraps.pop();
  if (!trap) return;

  const slot = game.trapSlots.find((s) => s.id === trap.slotId);
  if (slot) slot.occupied = false;

  restorePlacementUses(game, trap);
  game.defenseBudget += getTrapRefund(trap);
}

export function removeTrapAtPosition(game, pos, flashLog) {
  if (game.turn !== TURN.DEFENSE_BUILD) return false;

  const trapIndex = findTrapIndexAtPosition(game, pos);
  if (trapIndex < 0) return false;

  const [trap] = game.placedTraps.splice(trapIndex, 1);
  const slot = game.trapSlots.find((s) => s.id === trap.slotId);
  if (slot) slot.occupied = false;

  restorePlacementUses(game, trap);
  game.defenseBudget += getTrapRefund(trap);
  flashLog(`${TRAPS[trap.type].name} 삭제 완료. 남은 함정 토큰 ${game.defenseBudget}`);
  return true;
}

export function getTrapCost(type, game, slot) {
  if (canUseFreeTrapPlacement(game)) return 0;
  return Math.max(0, TRAPS[type].cost - (slot?.costDiscount || 0));
}

function getTrapRefund(trap) {
  return Number.isFinite(trap.costPaid) ? trap.costPaid : TRAPS[trap.type].cost;
}

function canUseFreeTrapPlacement(game) {
  const available = game?.mods?.freeTrapPlacements || 0;
  const used = game?.stageState?.freeTrapPlacementsUsed || 0;
  return used < available;
}

function canUseExtraTrap(game, type) {
  return (game?.stageState?.extraTrapUsesByType?.[type] || 0) > 0;
}

function countObjectiveTraps(game) {
  return (game.placedTraps || []).filter((trap) => !trap.extraUse).length;
}

function restorePlacementUses(game, trap) {
  if (trap.usedFreePlacement) {
    game.stageState.freeTrapPlacementsUsed = Math.max(0, game.stageState.freeTrapPlacementsUsed - 1);
  }

  if (trap.extraUse) {
    game.stageState.extraTrapUsesByType[trap.type] = (game.stageState.extraTrapUsesByType[trap.type] || 0) + 1;
  }
}

export function normalizeRotation(value) {
  const rotation = Number(value) || 0;
  return ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
}

export function getAllowedRotation(type, selectedRotation) {
  if (type === "shock") return 0;
  if (type === "emp") return 0;
  if (type === "camera") return 0;
  if (type === "firewall") return 90;
  return normalizeRotation(selectedRotation);
}

export function getOrientedTrapBox(trap, game) {
  const rotation = getAllowedRotation(trap.type, trap.rotation);
  const horizontal = rotation === 0 || rotation === 180;
  const positive = rotation === 0 || rotation === 90;

  if (trap.type === "laser") {
    const length = LASER_BASE_LENGTH + game.mods.laserBoost;

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
    return { x: trap.x - 36, y: trap.y - 8, w: 72, h: 14 };
  }

  if (trap.type === "emp") {
    return { x: trap.x - 32, y: trap.y - 8, w: 64, h: 14 };
  }

  if (trap.type === "camera") {
    return getCameraBoxFromAnchor(trap.x, trap.y, getCameraRangeScale(game, trap));
  }

  if (trap.type === "firewall") {
    return { x: trap.x - 17, y: trap.y - 92, w: 34, h: 92 };
  }

  return { x: trap.x, y: trap.y, w: 1, h: 1 };
}

export function getHazardHitbox(hazard, game) {
  if (hazard.type === "camera") return getCameraHazardBox(hazard, game);
  return hazard;
}

export function getCameraHazardBox(hazard, game) {
  if (hazard.carried && Number.isFinite(hazard.w) && Number.isFinite(hazard.h)) {
    return { x: hazard.x, y: hazard.y, w: hazard.w, h: hazard.h };
  }

  if (Number.isFinite(hazard.w) && Number.isFinite(hazard.h)) {
    return getCameraBoxFromAnchor(hazard.x, hazard.y, getCameraRangeScale(game, hazard));
  }

  return getCameraBoxFromAnchor(hazard.x, hazard.y, getCameraRangeScale(game, hazard));
}

function getCameraBoxFromAnchor(anchorX, anchorY, scale = 1) {
  const width = CAMERA_W * scale;
  return {
    x: anchorX - 64 - (width - CAMERA_W) / 2,
    y: anchorY - CAMERA_H,
    w: width,
    h: CAMERA_H,
  };
}

function getCameraRangeScale(game, camera) {
  return Math.max(0.5, camera?.cameraRangeScale || game?.mods?.cameraRangeScale || 1);
}

export function getCameraDetectionPolygon(camera, game) {
  const box = getCameraHazardBox(camera, game);
  const bodyW = Math.min(56, box.w * 0.5);
  const bodyH = Math.min(36, box.h * 0.32);
  const bodyX = box.x + box.w - bodyW - 2;
  const bodyY = box.y;

  return [
    { x: bodyX + 4, y: bodyY + bodyH },
    { x: bodyX + bodyW - 10, y: bodyY + bodyH },
    { x: bodyX + bodyW - 10, y: box.y + box.h - 1 },
    { x: box.x + 8, y: box.y + box.h - 1 },
  ];
}

export function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isEntityInCameraView(entity, camera, game) {
  const center = {
    x: entity.x + entity.w / 2,
    y: entity.y + entity.h / 2,
  };
  return isPointInPolygon(center, getCameraDetectionPolygon(camera, game));
}

export function getTrapHitbox(trap, game) {
  return getOrientedTrapBox(trap, game);
}

export function carryDefenseTrapsToNextStage(game, stage) {
  const traps = game.placedTraps.map((trap) => ({
    id: trap.id,
    type: trap.type,
    rotation: trap.rotation,
    x: trap.x,
    y: trap.y,
    slotId: trap.slotId,
    empowered: false,
    closed: false,
    closedTime: 0,
  }));

  game.carriedTrapsByStage.set(stage, traps);
}

export function empowerNextTrapByPlacementOrder(game) {
  return empowerNextTrapsInList(game, game.placedTraps, 1)[0] || null;
}

export function empowerNextTrapsByPlacementOrder(game) {
  return empowerNextTrapsInList(game, game.placedTraps, getCameraEmpowerCount(game));
}

export function previewNextTrapsByPlacementOrder(game) {
  return previewNextItemsByPlacementOrder(game, game.placedTraps);
}

export function previewNextHazardsByPlacementOrder(game) {
  return previewNextItemsByPlacementOrder(game, game.baseHazards);
}

function previewNextItemsByPlacementOrder(game, traps) {
  if (!traps || traps.length === 0) return [];

  const total = traps.length;
  const preview = [];
  let checked = 0;
  let index = game.nextEmpowerTrapIndex % total;
  const count = getCameraEmpowerCount(game);

  while (checked < total && preview.length < count) {
    const trap = traps[index];
    index = (index + 1) % total;
    checked += 1;

    if (!trap || trap.type === "camera" || trap.empowered) continue;
    preview.push(trap);
  }

  return preview;
}

export function empowerNextHazardByPlacementOrder(game) {
  return empowerNextTrapsInList(game, game.baseHazards, 1)[0] || null;
}

export function empowerNextHazardsByPlacementOrder(game) {
  return empowerNextTrapsInList(game, game.baseHazards, getCameraEmpowerCount(game));
}

function empowerNextTrapsInList(game, traps, count) {
  if (!game.metrics.alertCharge || game.metrics.alertCharge <= 0) return [];
  if (!traps || traps.length === 0) return [];

  const total = traps.length;
  const empoweredTraps = [];
  let checked = 0;

  while (checked < total && empoweredTraps.length < count && game.metrics.alertCharge > 0) {
    const index = game.nextEmpowerTrapIndex % total;
    const trap = traps[index];
    game.nextEmpowerTrapIndex = (index + 1) % total;
    checked += 1;

    if (!trap || trap.type === "camera" || trap.empowered) continue;

    trap.empowered = true;
    game.metrics.alertCharge = Math.max(0, game.metrics.alertCharge - 1);
    empoweredTraps.push(trap);
  }

  return empoweredTraps;
}

export function tickPlacedTrapTimers(game, dt) {
  tickTrapTimers(game.placedTraps, dt);
}

export function tickBaseHazardTimers(game, dt) {
  tickTrapTimers(game.baseHazards, dt);
}

function tickTrapTimers(traps, dt) {
  for (const trap of traps || []) {
    if (trap.hackPendingTime > 0) {
      trap.hackPendingTime = Math.max(0, trap.hackPendingTime - dt);
      if (trap.hackPendingTime <= 0) {
        delete trap.hackPendingTime;
        delete trap.hackPendingDuration;
      }
    }

    if (trap.hackedTime > 0) {
      trap.hackedTime = Math.max(0, trap.hackedTime - dt);
      trap.hackEffectTime = Math.max(0, (trap.hackEffectTime || 0) - dt);
      if (trap.hackedTime <= 0) {
        delete trap.hackedTime;
        delete trap.hackedDuration;
        delete trap.hackEffectTime;
      }
    }

    if (trap.triggerEffect?.timer > 0) {
      trap.triggerEffect.timer = Math.max(0, trap.triggerEffect.timer - dt);
      if (trap.triggerEffect.timer <= 0) delete trap.triggerEffect;
    }

    if (trap.objectiveSparkTimer > 0) {
      trap.objectiveSparkTimer = Math.max(0, trap.objectiveSparkTimer - dt);
      if (trap.objectiveSparkTimer <= 0) {
        delete trap.objectiveSparkTimer;
        delete trap.objectiveSparkDuration;
        delete trap.objectiveSparkLabel;
      }
    }

    if (!trap.closedTime || trap.closedTime <= 0) continue;
    trap.closedTime = Math.max(0, trap.closedTime - dt);
    if (trap.closedTime <= 0) {
      trap.closed = false;
      trap.empowered = false;
    }
  }
}

function findTrapIndexAtPosition(game, pos) {
  for (let i = game.placedTraps.length - 1; i >= 0; i -= 1) {
    const trap = game.placedTraps[i];
    const box = getOrientedTrapBox(trap, game);
    if (pointInExpandedRect(pos, box, 12)) return i;

    const slot = game.trapSlots.find((s) => s.id === trap.slotId);
    if (slot && pointInExpandedRect(pos, { x: slot.x - 16, y: slot.y - 32, w: 32, h: 32 }, 6)) {
      return i;
    }
  }

  return -1;
}

function pointInExpandedRect(point, rect, padding = 0) {
  return point.x >= rect.x - padding &&
    point.x <= rect.x + rect.w + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.h + padding;
}

export function hasLineOfSight(from, to, blockers) {
  for (const blocker of blockers || []) {
    if (pointInRect(from, blocker, 2)) continue;
    if (lineIntersectsRect(from, to, blocker)) return false;
  }
  return true;
}

function lineIntersectsRect(from, to, rect) {
  if (pointInRect(to, rect, 0)) return true;
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;
  return segmentsIntersect(from, to, { x: left, y: top }, { x: right, y: top }) ||
    segmentsIntersect(from, to, { x: right, y: top }, { x: right, y: bottom }) ||
    segmentsIntersect(from, to, { x: right, y: bottom }, { x: left, y: bottom }) ||
    segmentsIntersect(from, to, { x: left, y: bottom }, { x: left, y: top });
}

function pointInRect(point, rect, padding) {
  return point.x >= rect.x - padding &&
    point.x <= rect.x + rect.w + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.h + padding;
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  if (abC === 0 && onSegment(a, c, b)) return true;
  if (abD === 0 && onSegment(a, d, b)) return true;
  if (cdA === 0 && onSegment(c, a, d)) return true;
  if (cdB === 0 && onSegment(c, b, d)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function cross(a, b, c) {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function onSegment(a, p, b) {
  return p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y);
}
