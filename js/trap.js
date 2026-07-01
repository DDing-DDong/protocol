// trap.js
// 책임: 함정 생성, 배치, 트랩 판정과 관련된 로직을 담당합니다.

import { TURN, TRAPS, cryptoSafeId } from "./data.js";

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
    rotation: selectedRotation,
    x: slot.x,
    y: slot.y,
    slotId: slot.id,
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

export function getTrapCost(type, game) {
  if (type === "camera") return Math.max(1, TRAPS[type].cost - game.mods.cameraDiscount);
  return TRAPS[type].cost;
}

export function normalizeRotation(value) {
  const rotation = Number(value) || 0;
  return ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
}

export function getOrientedTrapBox(trap, game) {
  const rotation = normalizeRotation(trap.rotation);
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
    return horizontal
      ? { x: trap.x - 36, y: trap.y - 8, w: 72, h: 14 }
      : { x: trap.x - 8, y: positive ? trap.y - 72 : trap.y, w: 16, h: 72 };
  }

  if (trap.type === "camera") {
    if (horizontal) {
      return {
        x: positive ? trap.x : trap.x - 100,
        y: trap.y - 35,
        w: 100,
        h: 70,
      };
    }

    return {
      x: trap.x - 35,
      y: positive ? trap.y - 100 : trap.y,
      w: 70,
      h: 100,
    };
  }

  if (trap.type === "firewall") {
    return horizontal
      ? { x: positive ? trap.x : trap.x - 92, y: trap.y - 34, w: 92, h: 34 }
      : { x: trap.x - 17, y: positive ? trap.y - 92 : trap.y, w: 34, h: 92 };
  }

  return { x: trap.x, y: trap.y, w: 1, h: 1 };
}

export function getHazardHitbox(hazard) {
  if (hazard.type === "camera") {
    return getCameraHazardHitbox(hazard);
  }

  return hazard;
}

function getCameraHazardHitbox(hazard) {
  const hitboxScaleX = 0.68;
  const hitboxScaleY = 0.46;

  return {
    x: hazard.x + hazard.w * 0.14,
    y: hazard.y + hazard.h * 0.22,
    w: hazard.w * hitboxScaleX,
    h: hazard.h * hitboxScaleY,
  };
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
  }));

  game.carriedTrapsByStage.set(stage, traps);
}