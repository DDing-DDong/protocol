// stage.js
// 책임: 스테이지 로딩과 맵 생성만 담당합니다.

import { GROUND_Y, INFINITE_STAGE_START, TILE_SIZE, WIDTH, getStageById } from "./data.js";
import { getOrientedTrapBox } from "./trap.js";

let currentStageId = null;

export function loadStage(stageId) {
  const stageData = getStageById(stageId);

  if (!stageData) {
    console.error(`Stage data not found: ${stageId}`);
    currentStageId = null;
    return null;
  }

  currentStageId = stageData.id;
  buildStage(stageData);
  return stageData;
}

export function getCurrentStage() {
  return currentStageId ? getStageById(currentStageId) : null;
}

export function isAttackStage(stage) {
  return stage % 2 === 1;
}

export function getDefenseBudget(stage, game) {
  const base = 4 + Math.floor(stage / 4) + game.mods.defenseBudgetBonus;
  if (stage >= INFINITE_STAGE_START) return base + Math.floor((stage - INFINITE_STAGE_START) / 3);
  return base;
}

export function createPlatforms(stage) {
  const stageData = getStageById(stage);
  if (stageData) return cloneRects(stageData.platforms);

  const platforms = [
    { x: 0, y: GROUND_Y, w: WIDTH, h: 78 },
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

  const stageData = getStageById(stage);
  const hazards = stageData
    ? cloneTrapNodes(stageData.trapNodes)
    : [
      { type: "laser", x: 340, y: 352, w: 15, h: 110 },
      { type: "shock", x: 680, y: 448, w: 90, h: 14 },
      { type: "camera", x: 540, y: 252, w: 120, h: 70 },
    ];

  if (!stageData) {
    if (stage >= 5) hazards.push({ type: "laser", x: 890, y: 272, w: 15, h: 190 });
    if (stage >= 7) hazards.push({ type: "shock", x: 185, y: 448, w: 90, h: 14 });
    if (stage >= 9) hazards.push({ type: "camera", x: 930, y: 232, w: 140, h: 80 });
    if (stage >= INFINITE_STAGE_START) hazards.push({ type: "laser", x: 1040, y: 310, w: 15, h: 152 });
  }

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
      if (x < 80 || x > WIDTH - 70) continue;
      if (Math.abs(x - game.core.x) < 46 && y >= GROUND_Y - 4) continue;
      slots.push({ x, y, id, occupied: false });
      id += 1;
    }
  }

  return slots;
}

function buildStage(stageData) {
  if (typeof document === "undefined") return;

  const stageLayer = document.querySelector("#stage-layer");
  if (!stageLayer) return;

  stageLayer.replaceChildren();

  for (const platform of stageData.platforms) {
    stageLayer.appendChild(createPlatformElement(platform));
  }

  stageLayer.appendChild(createGoalElement(stageData.goal));

  for (const trapNode of stageData.trapNodes) {
    stageLayer.appendChild(createTrapNodeElement(trapNode));
  }
}

function createPlatformElement(platform) {
  const element = document.createElement("div");
  element.className = "stage-platform";
  applyRectStyle(element, platform);
  return element;
}

function createGoalElement(goal) {
  const element = document.createElement("div");
  element.className = "stage-goal";
  element.dataset.goalType = goal.type || "goal";
  applyRectStyle(element, goal);
  return element;
}

function createTrapNodeElement(trapNode) {
  const element = document.createElement("div");
  element.className = "stage-trap-node";
  element.dataset.trapNodeId = trapNode.id || "";
  element.dataset.trapType = trapNode.type;
  applyRectStyle(element, trapNode);
  return element;
}

function applyRectStyle(element, rect) {
  element.style.position = "absolute";
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.w}px`;
  element.style.height = `${rect.h}px`;
}

function cloneRects(rects) {
  return rects.map((rect) => ({ ...rect }));
}

function cloneTrapNodes(trapNodes) {
  return trapNodes.map(({ id, ...trapNode }) => ({ ...trapNode }));
}
