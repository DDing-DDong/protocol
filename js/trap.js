// trap.js
// 책임: 함정 생성, 배치, 트랩 판정과 관련된 로직을 담당합니다.

import { TURN, TRAPS, cryptoSafeId, getCameraEmpowerCount } from "./data.js";

export const CAMERA_W = 90;
export const CAMERA_H = 94;

export function placeTrapAtSlot(game, slot, selectedTrap, selectedRotation, flashLog) {
  if (game.turn !== TURN.DEFENSE_BUILD || slot.occupied) return;

  const cost = getTrapCost(selectedTrap, game);
  if (game.defenseBudget < cost) {
    flashLog("예산이 부족합니다.");
    return;
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
  };

  slot.occupied = true;
  game.placedTraps.push(trap);
  game.defenseBudget -= cost;
  flashLog(`${TRAPS[selectedTrap].name} 배치 완료. 남은 예산 ${game.defenseBudget}`);
}

export function undoTrap(game) {
  if (game.turn !== TURN.DEFENSE_BUILD) return;

  const trap = game.placedTraps.pop();
  if (!trap) return;

  const slot = game.trapSlots.find((s) => s.id === trap.slotId);
  if (slot) slot.occupied = false;

  game.defenseBudget += getTrapCost(trap.type, game);
}

export function getTrapCost(type) {
  return TRAPS[type].cost;
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
    return { x: trap.x - 36, y: trap.y - 8, w: 72, h: 14 };
  }

  if (trap.type === "emp") {
    return { x: trap.x - 32, y: trap.y - 8, w: 64, h: 14 };
  }

  if (trap.type === "camera") {
    return {
      x: trap.x - 64,
      y: trap.y - CAMERA_H,
      w: CAMERA_W,
      h: CAMERA_H,
    };
  }

  if (trap.type === "firewall") {
    return { x: trap.x - 17, y: trap.y - 92, w: 34, h: 92 };
  }

  return { x: trap.x, y: trap.y, w: 1, h: 1 };
}

export function getHazardHitbox(hazard) {
  if (hazard.type === "camera") return getCameraHazardBox(hazard);
  return hazard;
}

export function getCameraHazardBox(hazard) {
  if (hazard.carried && Number.isFinite(hazard.w) && Number.isFinite(hazard.h)) {
    return { x: hazard.x, y: hazard.y, w: hazard.w, h: hazard.h };
  }

  if (Number.isFinite(hazard.w) && Number.isFinite(hazard.h)) {
    return getCameraBoxFromAnchor(hazard.x, hazard.y);
  }

  return getCameraBoxFromAnchor(hazard.x, hazard.y);
}

function getCameraBoxFromAnchor(anchorX, anchorY) {
  return {
    x: anchorX - 64,
    y: anchorY - CAMERA_H,
    w: CAMERA_W,
    h: CAMERA_H,
  };
}

export function getCameraDetectionPolygon(camera) {
  const box = getCameraHazardBox(camera);
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

export function isEntityInCameraView(entity, camera) {
  const center = {
    x: entity.x + entity.w / 2,
    y: entity.y + entity.h / 2,
  };
  return isPointInPolygon(center, getCameraDetectionPolygon(camera));
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
    empowered: trap.empowered,
    closed: trap.closed,
    closedTime: trap.closedTime,
  }));

  game.carriedTrapsByStage.set(stage, traps);
}

export function empowerNextTrapByPlacementOrder(game) {
  return empowerNextTrapsInList(game, game.placedTraps, 1)[0] || null;
}

export function empowerNextTrapsByPlacementOrder(game) {
  return empowerNextTrapsInList(game, game.placedTraps, getCameraEmpowerCount(game));
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
    if (!trap.closedTime || trap.closedTime <= 0) continue;
    trap.closedTime = Math.max(0, trap.closedTime - dt);
    if (trap.closedTime <= 0) {
      trap.closed = false;
      trap.empowered = false;
    }
  }
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
