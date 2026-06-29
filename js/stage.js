// stage.js
// 책임: 스테이지 로딩과 맵 생성만 담당합니다.

import { TILE_SIZE } from "./data.js";
import { getOrientedTrapBox } from "./trap.js";

export function isAttackStage(stage) {
  return stage % 2 === 1;
}

export function getDefenseBudget(stage, game) {
  const base = 4 + Math.floor(stage / 4) + game.mods.defenseBudgetBonus;
  if (stage >= 12) return base + Math.floor((stage - 12) / 3);
  return base;
}

export function createPlatforms(stage) {
  const platforms = [
    { x: 0, y: 462, w: 1200, h: 78 },
    { x: 250, y: 360, w: 150, h: 18 },
    { x: 520, y: 300, w: 150, h: 18 },
    { x: 810, y: 365, w: 150, h: 18 },
  ];

  if (stage >= 5) platforms.push({ x: 650, y: 405, w: 96, h: 18 });
  if (stage >= 9) platforms.push({ x: 970, y: 280, w: 96, h: 18 });
  return platforms;
}

export function createBaseHazards(stage, game) {
  if (!isAttackStage(stage)) return [];

  const hazards = [
    { type: "laser", x: 340, y: 352, w: 15, h: 110 },
    { type: "shock", x: 680, y: 448, w: 90, h: 14 },
    { type: "camera", x: 540, y: 252, w: 120, h: 70 },
  ];

  if (stage >= 5) hazards.push({ type: "laser", x: 890, y: 272, w: 15, h: 190 });
  if (stage >= 7) hazards.push({ type: "shock", x: 185, y: 448, w: 90, h: 14 });
  if (stage >= 9) hazards.push({ type: "camera", x: 930, y: 232, w: 140, h: 80 });
  if (stage >= 12) hazards.push({ type: "laser", x: 1040, y: 310, w: 15, h: 152 });
  hazards.push(...getCarriedHazards(stage, game));
  return hazards;
}

export function getCarriedHazards(stage, game) {
  const traps = game.carriedTrapsByStage.get(stage) || [];
  return traps.map((trap) => trapToAttackHazard(trap, game));
}

export function trapToAttackHazard(trap, game) {
  return { type: trap.type, ...getOrientedTrapBox(trap, game), carried: true };
}

export function createTrapSlots(stage, game) {
  const slots = [];
  let id = 0;

  for (const platform of game.platforms) {
    const cols = Math.floor(platform.w / TILE_SIZE);
    if (cols <= 0) continue;

    for (let col = 0; col < cols; col += 1) {
      const x = platform.x + col * TILE_SIZE + TILE_SIZE / 2;
      const y = platform.y;
      if (x < 80 || x > 1200 - 70) continue;
      if (Math.abs(x - game.core.x) < 46 && y >= 462 - 4) continue;
      slots.push({ x, y, id, occupied: false });
      id += 1;
    }
  }

  return slots;
}
