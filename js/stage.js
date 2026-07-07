// stage.js
// 책임: 스테이지 로딩과 맵 생성만 담당합니다.

import { GROUND_Y, INFINITE_STAGE_START, LASER_BASE_LENGTH, WIDTH, getFirewallBlockTime, getStageById } from "./data.js?v=20260707-mobile-ui";
import { getOrientedTrapBox } from "./trap.js?v=20260707-mobile-ui";

const TRAP_SLOT_SPACING = 48;
const START_SLOT_BLOCK_X = 150;
const START_SLOT_BLOCK_Y = 96;
const HACKER_START_HEIGHT = 54;
const OVERHEAD_SLOT_BLOCK_DISTANCE = 56;
const OVERHEAD_SLOT_BLOCK_MARGIN = 4;
const ROUTE_HINT_RADIUS = 112;
const CHOKE_HINT_RADIUS = 132;
const REPLAY_SLOT_X_RADIUS = 104;
const REPLAY_SLOT_Y_RADIUS = 136;
const HACKER_REPLAY_WIDTH = 30;

const STAGE_LAYOUT_GUIDE_ROLES = new Set([
  "entry-step",
  "low-bypass",
  "aux-bypass",
  "wall-jump-fast-route",
  "fast-exit",
  "low-route-exit",
  "exit-step",
  "goal-approach",
]);

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

export function createPlatforms(stage, game) {
  const stageData = getStageById(stage, getLayoutOptions(stage, game));
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

  const stageData = getStageById(stage, getLayoutOptions(stage, game));
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

  const normalizedHazards = hazards.map((hazard) => normalizeStageHazard(hazard, game.platforms));
  normalizedHazards.push(...getCarriedHazards(stage, game));
  return normalizedHazards;
}

export function getCarriedHazards(stage, game) {
  const traps = game.carriedTrapsByStage.get(stage) || [];
  return traps.map((trap) => trapToAttackHazard(trap, game));
}

export function trapToAttackHazard(trap, game) {
  const hazard = {
    type: trap.type,
    ...getOrientedTrapBox(trap, game),
    carried: true,
    empowered: trap.empowered,
    closed: trap.closed,
    closedTime: trap.closedTime,
  };

  if (hazard.type === "firewall" && hazard.closedTime > 0) {
    hazard.closedTime = Math.min(hazard.closedTime, getFirewallBlockTime(game));
  }

  return hazard;
}

export function createTrapSlots(stage, game) {
  const slots = [];
  let id = 0;

  if (!Array.isArray(game?.platforms)) return slots;

  const stageData = getStageById(stage, getLayoutOptions(stage, game));

  for (const platform of game.platforms) {
    if (!isValidPlatformRect(platform)) continue;
    if (!canCreateTrapSlotsOnPlatform(platform)) continue;

    const cols = Math.floor(platform.w / TRAP_SLOT_SPACING);
    if (cols <= 0) continue;

    for (const col of getTrapSlotColumns(platform, cols, stageData)) {
      const x = platform.x + col * TRAP_SLOT_SPACING + TRAP_SLOT_SPACING / 2;
      const y = platform.y;
      if (x < 80 || x > WIDTH - 70) continue;
      if (Math.abs(x - game.core.x) < 46 && y >= GROUND_Y - 4) continue;
      if (isSlotBlockedByNoSlotPlatform(x, y, game.platforms)) continue;
      if (!isStrategicTrapSlot({
        stageData,
        platform,
        x,
        y,
        platforms: game.platforms,
        replayPath: game.lastAttackRecording,
      })) continue;
      if (isNearPlayerStartSlot(stage, x, y, game)) continue;
      slots.push({ x, y, id, occupied: false });
      id += 1;
    }
  }

  return slots;
}

function canCreateTrapSlotsOnPlatform(platform) {
  if (platform.trapSlots === false) return false;
  if (platform.role === "chokepoint-wall") return false;
  return platform.h < TRAP_SLOT_SPACING * 2;
}

function getTrapSlotColumns(platform, cols, stageData) {
  const slotSetting = getTrapSlotSetting(platform, stageData);
  if (!Array.isArray(slotSetting)) {
    return Array.from({ length: cols }, (_, col) => col);
  }

  const columns = [];
  for (const slot of slotSetting) {
    const col = Number.isFinite(slot) ? slot : Number(slot?.index);
    if (!Number.isInteger(col) || col < 0 || col >= cols) continue;
    columns.push(col);
  }
  return columns;
}

function getTrapSlotSetting(platform, stageData) {
  if (Number(stageData?.id) % 2 === 0 && Array.isArray(platform.defenseTrapSlots)) {
    return platform.defenseTrapSlots;
  }
  return platform.trapSlots;
}

function isSlotBlockedByNoSlotPlatform(x, y, platforms) {
  for (const platform of platforms || []) {
    if (canCreateTrapSlotsOnPlatform(platform)) continue;

    const blocksSameSurface = y >= platform.y + platform.h - 1;
    const overlapsFootprint = x >= platform.x - TRAP_SLOT_SPACING / 2 &&
      x <= platform.x + platform.w + TRAP_SLOT_SPACING / 2;
    if (blocksSameSurface && overlapsFootprint) return true;
  }

  return false;
}

function isStrategicTrapSlot({ stageData, platform, x, y, platforms, replayPath }) {
  if (!usesStageLayoutGuideFilter(stageData)) return true;
  if (isSlotCoveredByOverheadSolid(x, y, platform, platforms)) return false;
  if (Array.isArray(getTrapSlotSetting(platform, stageData))) return true;
  if (!isOnStrategicPlatform(platform)) return false;
  if (usesReplayPathGuideFilter(stageData, replayPath) && !isNearReplayPath(x, y, replayPath)) return false;
  if (platform.role === "main-route") return isNearRouteHint(x, stageData);
  return true;
}

function usesStageLayoutGuideFilter(stageData) {
  return Number(stageData?.id) === 1 || Number(stageData?.id) === 2;
}

function usesReplayPathGuideFilter(stageData, replayPath) {
  return Number(stageData?.id) % 2 === 0 && Array.isArray(replayPath) && replayPath.length >= 2;
}

function isOnStrategicPlatform(platform) {
  return platform.role === "main-route" || STAGE_LAYOUT_GUIDE_ROLES.has(platform.role);
}

function isSlotCoveredByOverheadSolid(x, y, currentPlatform, platforms) {
  for (const platform of platforms || []) {
    if (platform === currentPlatform || !isValidPlatformRect(platform)) continue;
    if (platform.y >= y) continue;

    const verticalGap = y - (platform.y + platform.h);
    if (verticalGap < 0 || verticalGap > OVERHEAD_SLOT_BLOCK_DISTANCE) continue;

    const horizontallyCovered = x >= platform.x - OVERHEAD_SLOT_BLOCK_MARGIN &&
      x <= platform.x + platform.w + OVERHEAD_SLOT_BLOCK_MARGIN;
    if (horizontallyCovered) return true;
  }

  return false;
}

function isNearReplayPath(x, y, replayPath) {
  for (const sample of replayPath || []) {
    const sampleX = sample.x + HACKER_REPLAY_WIDTH / 2;
    const sampleFeetY = sample.y + (sample.h || HACKER_START_HEIGHT);
    const nearX = Math.abs(x - sampleX) <= REPLAY_SLOT_X_RADIUS;
    const nearY = Math.abs(y - sampleFeetY) <= REPLAY_SLOT_Y_RADIUS;
    if (nearX && nearY) return true;
  }

  return false;
}

function isNearRouteHint(x, stageData) {
  const routeHints = getRouteHintXPositions(stageData);
  return routeHints.some((hintX) => Math.abs(x - hintX) <= ROUTE_HINT_RADIUS);
}

function getRouteHintXPositions(stageData) {
  const hints = [];

  for (const trapNode of stageData?.trapNodes || []) {
    if (trapNode.type !== "shock" && trapNode.type !== "laser") continue;
    hints.push(trapNode.x + (trapNode.w || 0) / 2);
  }

  for (const platform of stageData?.platforms || []) {
    if (platform.role !== "chokepoint-wall") continue;
    const centerX = platform.x + platform.w / 2;
    hints.push(centerX - CHOKE_HINT_RADIUS / 2, centerX + CHOKE_HINT_RADIUS / 2);
  }

  const goal = stageData?.goal;
  if (goal) hints.push(goal.x + goal.w / 2);

  return hints;
}

function isValidPlatformRect(platform) {
  return platform &&
    Number.isFinite(platform.x) &&
    Number.isFinite(platform.y) &&
    Number.isFinite(platform.w) &&
    Number.isFinite(platform.h) &&
    platform.w > 0 &&
    platform.h > 0;
}

export function getWallTrapSlots(stageId, game) {
  const stageData = getStageById(stageId, getLayoutOptions(stageId, game));
  if (!stageData || !stageData.wallTrapSlots) return [];
  return stageData.wallTrapSlots.map((slot) => ({
    ...slot,
    allowedTraps: slot.allowedTraps ? slot.allowedTraps.slice() : [],
  }));
}

function buildStage(stageData) {
  if (typeof document === "undefined") return;

  const stageLayer = document.querySelector("#stage-layer");
  if (!stageLayer) return;

  stageLayer.replaceChildren();
  applyStageMetadata(stageLayer, stageData);

  for (const platform of stageData.platforms) {
    stageLayer.appendChild(createPlatformElement(platform));
  }

  stageLayer.appendChild(createGoalElement(stageData.goal));

  for (const trapNode of stageData.trapNodes) {
    stageLayer.appendChild(createTrapNodeElement(trapNode));
  }

  for (const wallSlot of stageData.wallTrapSlots || []) {
    stageLayer.appendChild(createWallTrapSlotElement(wallSlot));
  }
}

function createPlatformElement(platform) {
  const element = document.createElement("div");
  element.className = "stage-platform";
  setDatasetValue(element, "platformId", platform.id);
  setDatasetValue(element, "platformRole", platform.role);
  setDatasetValue(element, "mapObject", platform.mapObject);
  setDatasetValue(element, "intent", platform.intent);
  applyRectStyle(element, platform);
  return element;
}

function createGoalElement(goal) {
  const element = document.createElement("div");
  element.className = "stage-goal";
  element.dataset.goalType = goal.type || "goal";
  setDatasetValue(element, "label", goal.label);
  setDatasetValue(element, "intent", goal.intent);
  applyRectStyle(element, goal);
  return element;
}

function createTrapNodeElement(trapNode) {
  const element = document.createElement("div");
  element.className = "stage-trap-node";
  element.dataset.trapNodeId = trapNode.id || "";
  element.dataset.trapType = trapNode.type;
  setDatasetValue(element, "intent", trapNode.intent);
  setDatasetValue(element, "recommendedTrap", trapNode.recommendedTrap);
  setDatasetValue(element, "teaches", trapNode.teaches);
  applyRectStyle(element, trapNode);
  return element;
}

function createWallTrapSlotElement(wallSlot) {
  const element = document.createElement("div");
  element.className = "stage-wall-trap-slot";
  setDatasetValue(element, "wallTrapSlotId", wallSlot.id);
  setDatasetValue(element, "surface", wallSlot.surface);
  setDatasetValue(element, "allowedTraps", wallSlot.allowedTraps);
  setDatasetValue(element, "intent", wallSlot.intent);
  element.style.position = "absolute";
  element.style.left = `${wallSlot.x}px`;
  element.style.top = `${wallSlot.y}px`;
  return element;
}

function applyStageMetadata(stageLayer, stageData) {
  setDatasetValue(stageLayer, "themeId", stageData.theme && stageData.theme.id);
  setDatasetValue(stageLayer, "themePalette", stageData.theme && stageData.theme.palette);
  setDatasetValue(stageLayer, "securityTone", stageData.theme && stageData.theme.securityTone);
  setDatasetValue(stageLayer, "mapRole", stageData.mapIntent && stageData.mapIntent.role);
  setDatasetValue(stageLayer, "learningGoals", stageData.mapIntent && stageData.mapIntent.learningGoals);
  setDatasetValue(stageLayer, "backgroundFar", stageData.backgroundLayers && stageData.backgroundLayers.far);
  setDatasetValue(stageLayer, "backgroundMid", stageData.backgroundLayers && stageData.backgroundLayers.mid);
  setDatasetValue(stageLayer, "backgroundFront", stageData.backgroundLayers && stageData.backgroundLayers.front);
  setDatasetValue(stageLayer, "backgroundFx", stageData.backgroundLayers && stageData.backgroundLayers.fx);
  setDatasetValue(stageLayer, "wallTrapSlotCount", stageData.wallTrapSlots && stageData.wallTrapSlots.length);
}

function applyRectStyle(element, rect) {
  element.style.position = "absolute";
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.w}px`;
  element.style.height = `${rect.h}px`;
}

function setDatasetValue(element, key, value) {
  if (value === undefined || value === null) return;
  element.dataset[key] = Array.isArray(value) ? value.join(",") : String(value);
}

function cloneRects(rects) {
  return rects.map((rect) => ({ ...rect }));
}

function cloneTrapNodes(trapNodes) {
  return trapNodes.map(({ id, teaches, ...trapNode }) => ({
    ...trapNode,
    teaches: teaches ? teaches.slice() : [],
  }));
}

function normalizeStageHazard(hazard, platforms) {
  if (hazard.type === "laser") return normalizeStageLaserHazard(hazard);
  if (hazard.type === "camera") return normalizeStageCameraHazard(hazard, platforms);
  return hazard;
}

function normalizeStageLaserHazard(laser) {
  const width = Number(laser.w);
  const height = Number(laser.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return laser;

  if (height >= width) {
    return {
      ...laser,
      y: laser.y + height - LASER_BASE_LENGTH,
      h: LASER_BASE_LENGTH,
    };
  }

  return {
    ...laser,
    x: laser.x + (width - LASER_BASE_LENGTH) / 2,
    w: LASER_BASE_LENGTH,
  };
}

function normalizeStageCameraHazard(camera, platforms) {
  const anchorX = Number.isFinite(camera.w) ? camera.x + camera.w / 2 : camera.x;
  const anchorY = findCameraPlatformY(camera, anchorX, platforms) ?? (
    Number.isFinite(camera.h) ? camera.y + camera.h : camera.y
  );
  return {
    type: "camera",
    x: anchorX,
    y: anchorY,
  };
}

function findCameraPlatformY(camera, anchorX, platforms) {
  const cameraBottom = Number.isFinite(camera.h) ? camera.y + camera.h : camera.y;
  let bestPlatform = null;
  let bestDistance = Infinity;

  for (const platform of platforms || []) {
    const horizontalMatch = anchorX >= platform.x - 24 && anchorX <= platform.x + platform.w + 24;
    if (!horizontalMatch) continue;
    const distance = Math.abs(platform.y - cameraBottom);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPlatform = platform;
    }
  }

  return bestPlatform ? bestPlatform.y : null;
}

function getLayoutOptions(stage, game) {
  if (Number(stage) !== 1 && Number(stage) !== 2) return {};

  const layoutId = game?.stageLayoutSelections?.[1];
  return layoutId ? { layoutId } : {};
}

function isNearPlayerStartSlot(stage, x, y, game) {
  const stageData = getStageById(stage, getLayoutOptions(stage, game));
  const playerStart = stageData?.playerStart || { x: 64, y: 388 };
  const startFeetY = playerStart.y + HACKER_START_HEIGHT;
  return Math.abs(x - playerStart.x) <= START_SLOT_BLOCK_X &&
    Math.abs(y - startFeetY) <= START_SLOT_BLOCK_Y;
}

// 수정 이유:
// - 수비턴에서 설치한 EMP와 방화벽을 다음 공격턴 hazard로 넘길 때 타입별 판정을 유지하기 위함
// - 스테이지 기본 카메라를 유저 설치 카메라와 같은 플랫폼 anchor 방식으로 정규화하기 위함
