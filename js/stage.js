// stage.js
// 책임: 스테이지 로딩과 맵 생성만 담당합니다.

import { GROUND_Y, INFINITE_STAGE_START, LASER_BASE_LENGTH, WIDTH, getFirewallBlockTime, getStageById } from "./data.js?v=20260707-mobile-panels-fit2";
import { getOrientedTrapBox } from "./trap.js?v=20260707-mobile-panels-fit2";

const TRAP_SLOT_SPACING = 48;
const START_SLOT_BLOCK_X = 150;
const START_SLOT_BLOCK_Y = 96;
const HACKER_START_WIDTH = 30;
const HACKER_START_HEIGHT = 54;
const OVERHEAD_SLOT_BLOCK_DISTANCE = 56;
const OVERHEAD_SLOT_BLOCK_MARGIN = 4;
const DEFENSE_SOLID_COVER_DISTANCE = 12;
const DEFENSE_SOLID_COVER_MARGIN = 2;
const ROUTE_HINT_RADIUS = 112;
const CHOKE_HINT_RADIUS = 132;
const REPLAY_SLOT_X_RADIUS = 104;
const REPLAY_SLOT_Y_RADIUS = 136;
const HACKER_REPLAY_WIDTH = 30;
const STAGE_HAZARD_SLOT_MAX_DISTANCE = TRAP_SLOT_SPACING * 1.75;
const FALLBACK_PLATFORM_TILE_HEIGHT = 48;
const STAGE_HAZARD_SURFACE_SNAP_DISTANCE = 72;

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

  const platforms = createFallbackPlatforms();

  if (stage >= 5) {
    platforms.push({
      id: "fallback-advanced-route-step",
      x: 864,
      y: 366,
      w: 144,
      h: FALLBACK_PLATFORM_TILE_HEIGHT,
      role: "fast-exit",
      mapObject: "data-bridge",
    });
  }
  if (stage >= 9) {
    platforms.push({
      id: "fallback-high-security-ledge",
      x: 960,
      y: 318,
      w: 96,
      h: FALLBACK_PLATFORM_TILE_HEIGHT,
      role: "goal-approach",
      mapObject: "security-ledge",
    });
  }
  return platforms;
}

function createFallbackPlatforms() {
  return [
    {
      id: "fallback-ground",
      x: 0,
      y: GROUND_Y,
      w: WIDTH,
      h: 78,
      role: "main-route",
      mapObject: "research-lab-floor",
    },
    {
      id: "fallback-entry-step",
      x: 240,
      y: 366,
      w: 144,
      h: FALLBACK_PLATFORM_TILE_HEIGHT,
      role: "entry-step",
      mapObject: "server-rack-step",
    },
    {
      id: "fallback-low-bypass",
      x: 384,
      y: 414,
      w: 144,
      h: FALLBACK_PLATFORM_TILE_HEIGHT,
      role: "low-bypass",
      mapObject: "cooling-unit",
    },
    {
      id: "fallback-chokepoint-wall",
      x: 576,
      y: 174,
      w: 48,
      h: 192,
      role: "chokepoint-wall",
      mapObject: "security-pillar",
    },
    {
      id: "fallback-wall-jump-route",
      x: 624,
      y: 222,
      w: 144,
      h: FALLBACK_PLATFORM_TILE_HEIGHT,
      role: "wall-jump-fast-route",
      mapObject: "data-overpass",
    },
    {
      id: "fallback-exit-step",
      x: 720,
      y: 414,
      w: 144,
      h: FALLBACK_PLATFORM_TILE_HEIGHT,
      role: "exit-step",
      mapObject: "server-rack-step",
    },
    {
      id: "fallback-goal-approach",
      x: 912,
      y: 318,
      w: 144,
      h: FALLBACK_PLATFORM_TILE_HEIGHT,
      role: "goal-approach",
      mapObject: "data-bridge",
    },
  ];
}

export function createBaseHazards(stage, game) {
  if (!isAttackStage(stage)) return [];

  const stageData = getStageById(stage, getLayoutOptions(stage, game));
  const hazards = stageData
    ? cloneTrapNodes(stageData.trapNodes)
    : createFallbackStageHazards(stage);

  const normalizedHazards = hazards.map((hazard) =>
    normalizeStageHazard(normalizeStageHazardSurface(hazard, stage, game), game.platforms)
  );
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
  if (!Array.isArray(game?.platforms)) return [];

  const stageData = getStageById(stage, getLayoutOptions(stage, game));
  if (isDefenseStage(stageData, stage)) return createDefenseTrapSlots(stage, game);
  return createAttackTrapSlots(stage, game, stageData);
}

function createAttackTrapSlots(stage, game, stageData) {
  const slots = [];
  let id = 0;

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

function createDefenseTrapSlots(stage, game) {
  const slots = [];
  let id = 0;
  const stageData = getStageById(stage, getLayoutOptions(stage, game));
  const debug = createDefenseTrapSlotDebug(stageData);

  for (const platform of game.platforms) {
    if (!isValidPlatformRect(platform)) {
      countDefenseTrapSlotRemoval(debug, null, "skippedNotTopSurface");
      continue;
    }
    if (!canCreateDefenseTrapSlotsOnPlatform(platform)) {
      countDefenseTrapSlotRemoval(debug, createDefenseTrapSlotDebugRow(platform, null, null), "skippedByDataFlag");
      continue;
    }

    const cols = Math.floor(platform.w / TRAP_SLOT_SPACING);
    if (cols <= 0) {
      countDefenseTrapSlotRemoval(debug, createDefenseTrapSlotDebugRow(platform, null, null), "skippedNotTopSurface");
      continue;
    }

    for (let col = 0; col < cols; col += 1) {
      const x = platform.x + col * TRAP_SLOT_SPACING + TRAP_SLOT_SPACING / 2;
      const y = platform.y;
      const debugRow = createDefenseTrapSlotDebugRow(platform, x, y);
      countDefenseTrapSlotCandidate(debug);
      if (x < 80 || x > WIDTH - 70) {
        countDefenseTrapSlotRemoval(debug, debugRow, "removedByOutOfBounds");
        continue;
      }
      if (Math.abs(x - game.core.x) < 46 && y >= GROUND_Y - 4) {
        countDefenseTrapSlotRemoval(debug, debugRow, "removedByCore");
        continue;
      }
      const wallFootprintBlock = getWallFootprintBlockInfo(x, y, platform, game.platforms);
      if (wallFootprintBlock) {
        countDefenseTrapSlotRemoval(debug, debugRow, "removedByWallFootprint", wallFootprintBlock);
        continue;
      }
      if (isDefenseSlotCoveredBySolid(x, y, platform, game.platforms)) {
        countDefenseTrapSlotRemoval(debug, debugRow, "removedBySolidCover");
        continue;
      }
      if (isOverlappingDefensePlayerStartSlot(stage, x, y, game)) {
        countDefenseTrapSlotRemoval(debug, debugRow, "removedBySpawn");
        continue;
      }
      countDefenseTrapSlotCreated(debug, debugRow);
      slots.push({
        x,
        y,
        id,
        occupied: false,
      });
      id += 1;
    }
  }

  markStageHazardBlockedSlots(slots, stage, game);
  logDefenseTrapSlotDebug(stageData, debug, slots.length);
  return slots;
}

function markStageHazardBlockedSlots(slots, stage, game) {
  const hazards = getStageHazardsForDefenseSlots(stage, game);

  for (const hazard of hazards) {
    const anchor = getStageHazardSlotAnchor(hazard);
    const slot = findClosestStageHazardSlot(slots, anchor);
    if (!slot || slot.blocked || slot.occupied) continue;
    slot.blocked = true;
    slot.blockedReason = "stageHazard";
    slot.blockedHazardType = hazard.type || "";
    slot.blockedHazardId = hazard.id || "";
  }
}

function getStageHazardsForDefenseSlots(stage, game) {
  const defenseStageData = getStageById(stage, getLayoutOptions(stage, game));
  const nextAttackStage = Number(stage) + 1;
  const stageData = getStageById(nextAttackStage, getLayoutOptions(nextAttackStage, game));
  const defenseStageHazards = Array.isArray(defenseStageData?.trapNodes) ? defenseStageData.trapNodes : [];
  const stageHazards = createStageHazardsForSlotBlocking(nextAttackStage, game, stageData);
  const activeHazards = Array.isArray(game?.baseHazards) ? game.baseHazards : [];
  return [...activeHazards, ...defenseStageHazards, ...stageHazards];
}

function getStageHazardSlotAnchor(hazard) {
  if (!hazard) return { x: 0, y: 0 };

  if (hazard.type === "camera" && Number.isFinite(hazard.x) && Number.isFinite(hazard.y)) {
    return { x: hazard.x, y: hazard.y };
  }

  return {
    x: Number.isFinite(hazard.x) && Number.isFinite(hazard.w) ? hazard.x + hazard.w / 2 : Number(hazard.x) || 0,
    y: Number.isFinite(hazard.y) && Number.isFinite(hazard.h) ? hazard.y + hazard.h : Number(hazard.y) || 0,
  };
}

function findClosestStageHazardSlot(slots, anchor) {
  let bestSlot = null;
  let bestScore = Infinity;

  for (const slot of slots) {
    const dx = slot.x - anchor.x;
    const dy = slot.y - anchor.y;
    const distance = Math.hypot(dx, dy);
    if (distance > STAGE_HAZARD_SLOT_MAX_DISTANCE) continue;

    const score = Math.abs(dx) + Math.abs(dy) * 1.35;
    if (score >= bestScore) continue;
    bestScore = score;
    bestSlot = slot;
  }

  return bestSlot;
}

function createStageHazardsForSlotBlocking(stage, game, stageData) {
  const hazards = Array.isArray(stageData?.trapNodes)
    ? cloneTrapNodes(stageData.trapNodes)
    : createFallbackStageHazards(stage);

  return hazards.map((hazard) =>
    normalizeStageHazard(normalizeStageHazardSurface(hazard, stage, game), game.platforms)
  );
}

function createFallbackStageHazards(stage) {
  const hazards = [
    {
      id: "fallback-laser-pillar-route",
      type: "laser",
      x: 672,
      y: 344,
      w: 15,
      h: 118,
      intent: "중앙 초크 포인트 이후 상단 루트와 하단 우회 루트 사이를 압박한다.",
    },
    {
      id: "fallback-shock-exit-step",
      type: "shock",
      x: 768,
      y: 400,
      w: 96,
      h: 14,
      intent: "출구 발판 위 착지 지점에 바닥 위협을 배치한다.",
    },
    {
      id: "fallback-camera-overpass",
      type: "camera",
      x: 600,
      y: 150,
      w: 144,
      h: 72,
      intent: "상단 발판과 중앙 기둥 접촉면을 감시한다.",
    },
  ];

  if (stage >= 5) {
    hazards.push({
      id: "fallback-laser-advanced-step",
      type: "laser",
      x: 928,
      y: 248,
      w: 15,
      h: 118,
      intent: "후반 보조 발판 위에 수직 압박을 더한다.",
    });
  }
  if (stage >= 7) {
    hazards.push({
      id: "fallback-shock-ground-entry",
      type: "shock",
      x: 168,
      y: 448,
      w: 96,
      h: 14,
      intent: "초반 지상 이동 구간의 바닥 위협을 추가한다.",
    });
  }
  if (stage >= 9) {
    hazards.push({
      id: "fallback-camera-goal-ledge",
      type: "camera",
      x: 912,
      y: 246,
      w: 144,
      h: 72,
      intent: "Goal 접근 발판 위 감시 장치를 배치한다.",
    });
  }
  if (stage >= INFINITE_STAGE_START) {
    hazards.push({
      id: "fallback-laser-infinite-goal",
      type: "laser",
      x: 1040,
      y: 200,
      w: 15,
      h: 118,
      intent: "무한 모드 Goal 접근 발판 근처 압박을 유지한다.",
    });
  }
  return hazards;
}

function canCreateTrapSlotsOnPlatform(platform) {
  if (platform.trapSlots === false) return false;
  if (platform.role === "chokepoint-wall") return false;
  return platform.h < TRAP_SLOT_SPACING * 2;
}

function canCreateDefenseTrapSlotsOnPlatform(platform) {
  return platform.defenseTrapSlots !== false;
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

function isDefenseStage(stageData, stageId = stageData?.id) {
  return Number(stageId) % 2 === 0;
}

function createDefenseTrapSlotDebug(stageData) {
  return {
    stageId: Number(stageData?.id),
    totalCandidates: 0,
    createdSlots: 0,
    removedByOutOfBounds: 0,
    removedBySpawn: 0,
    removedByCore: 0,
    removedByWallFootprint: 0,
    removedBySolidCover: 0,
    removedByDuplicate: 0,
    skippedNotTopSurface: 0,
    skippedByDataFlag: 0,
    removedSlots: [],
    createdSlotRows: [],
  };
}

function createDefenseTrapSlotDebugRow(platform, x, y) {
  const slotX = Number.isFinite(x) ? x : null;
  const slotY = Number.isFinite(y) ? y : null;
  return {
    sourceType: getDefenseTrapSlotSourceType(platform),
    platformId: platform?.id || "(no-id)",
    role: platform?.role || "(no-role)",
    x: slotX,
    y: slotY,
    tileX: Number.isFinite(slotX) ? Math.floor(slotX / TRAP_SLOT_SPACING) : null,
    tileY: Number.isFinite(slotY) ? Math.floor(slotY / TRAP_SLOT_SPACING) : null,
    width: platform?.w ?? null,
    height: platform?.h ?? null,
  };
}

function getDefenseTrapSlotSourceType(platform) {
  if (platform?.role === "chokepoint-wall") return "wall";
  if (isGroundTopSurfacePlatform(platform)) return "ground";
  return "platform";
}

function countDefenseTrapSlotCandidate(debug) {
  if (!debug) return;
  debug.totalCandidates += 1;
}

function countDefenseTrapSlotRemoval(debug, row, reason, details = null) {
  if (!debug) return;
  debug[reason] = (debug[reason] || 0) + 1;
  if (row) debug.removedSlots.push({ ...row, reason, ...(details || {}) });
}

function countDefenseTrapSlotCreated(debug, row) {
  if (!debug) return;
  debug.createdSlots += 1;
  debug.createdSlotRows.push({ ...row, reason: "created" });
}

function logDefenseTrapSlotDebug(stageData, debug, createdSlotCount) {
  if (!debug || typeof console === "undefined") return;

  const summary = [{
    stageId: Number(stageData?.id),
    totalCandidates: debug.totalCandidates,
    createdSlots: createdSlotCount,
    removedByOutOfBounds: debug.removedByOutOfBounds,
    removedBySpawn: debug.removedBySpawn,
    removedByCore: debug.removedByCore,
    removedByWallFootprint: debug.removedByWallFootprint,
    removedBySolidCover: debug.removedBySolidCover,
    removedByDuplicate: debug.removedByDuplicate,
    skippedNotTopSurface: debug.skippedNotTopSurface,
    skippedByDataFlag: debug.skippedByDataFlag,
  }];

  console.group("[DefenseTrapSlots Debug]");
  console.log("stageId:", Number(stageData?.id));
  console.table(summary);
  console.table(debug.removedSlots);
  console.groupEnd();
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

function isDefenseSlotCoveredBySolid(x, y, currentPlatform, platforms) {
  for (const platform of platforms || []) {
    if (platform === currentPlatform || !isValidPlatformRect(platform)) continue;
    if (isGroundTopSurfacePlatform(currentPlatform) && platform.role === "chokepoint-wall") continue;
    if (platform.y >= y) continue;

    const verticalGap = y - (platform.y + platform.h);
    if (verticalGap < 0 || verticalGap > DEFENSE_SOLID_COVER_DISTANCE) continue;

    const horizontallyCovered = x >= platform.x - DEFENSE_SOLID_COVER_MARGIN &&
      x <= platform.x + platform.w + DEFENSE_SOLID_COVER_MARGIN;
    if (horizontallyCovered) return true;
  }

  return false;
}

function isBlockedByWallFootprint(x, y, currentPlatform, platforms) {
  return Boolean(getWallFootprintBlockInfo(x, y, currentPlatform, platforms));
}

function getWallFootprintBlockInfo(x, y, currentPlatform, platforms) {
  if (isGroundTopSurfacePlatform(currentPlatform)) return null;

  for (const platform of platforms || []) {
    if (platform === currentPlatform || platform.role !== "chokepoint-wall" || !isValidPlatformRect(platform)) continue;

    const wallLeft = platform.x - TRAP_SLOT_SPACING / 2;
    const wallRight = platform.x + platform.w + TRAP_SLOT_SPACING / 2;
    const wallTop = platform.y;
    const wallBottom = platform.y + platform.h;
    const wallCenter = platform.x + platform.w / 2;
    const slotCenter = x;
    const overlapsFootprint = x > wallLeft && x < wallRight;
    const belowWallTop = y > platform.y;
    if (overlapsFootprint && belowWallTop) {
      return {
        wallId: platform.id || "(no-id)",
        wallX: platform.x,
        wallY: platform.y,
        wallWidth: platform.w,
        wallHeight: platform.h,
        wallLeft,
        wallRight,
        wallTop,
        wallBottom,
        slotX: x,
        slotY: y,
        slotCenter,
        wallCenter,
        distanceToWallCenter: Math.abs(slotCenter - wallCenter),
        conditionSlotWithinWallFootprint: overlapsFootprint,
        conditionSlotBelowWallTop: belowWallTop,
        matchedCondition: "slot.x > wall.left && slot.x < wall.right && slot.y > wall.top",
      };
    }
  }

  return null;
}

function isGroundTopSurfacePlatform(platform) {
  return platform?.role === "main-route" || platform?.y >= GROUND_Y - 1;
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

function normalizeStageHazardSurface(hazard, stage, game) {
  if (!hazard || hazard.type === "camera") return hazard;
  if (!["laser", "shock", "emp", "firewall"].includes(hazard.type)) return hazard;

  const width = Number(hazard.w);
  const height = Number(hazard.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return hazard;

  const anchor = getStageHazardSurfaceAnchor(hazard, width, height);
  const surface = findClosestHazardTopSurface(hazard, anchor, width, height, stage, game);
  if (!surface) return hazard;

  return {
    ...hazard,
    y: surface.y - height,
  };
}

function getStageHazardSurfaceAnchor(hazard, width, height) {
  return {
    x: Number(hazard.x) + width / 2,
    y: Number(hazard.y) + height,
  };
}

function findClosestHazardTopSurface(hazard, anchor, width, height, stage, game) {
  let bestSurface = null;
  let bestDistance = Infinity;

  for (const platform of game?.platforms || []) {
    if (!isValidPlatformRect(platform)) continue;
    if (!doesHazardOverlapSurfaceX(hazard, width, platform)) continue;

    const insidePlatformBody = isHazardInsidePlatformBody(hazard, anchor, height, platform);
    const distance = insidePlatformBody ? 0 : Math.abs(platform.y - anchor.y);
    if (!insidePlatformBody && distance > STAGE_HAZARD_SURFACE_SNAP_DISTANCE) continue;
    if (distance >= bestDistance) continue;
    if (wouldHazardOverlapProtectedArea(hazard, platform.y - height, width, height, stage, game)) continue;

    bestDistance = distance;
    bestSurface = platform;
  }

  return bestSurface;
}

function isHazardInsidePlatformBody(hazard, anchor, height, platform) {
  const top = Number(hazard.y);
  const bottom = top + height;
  const verticalOverlap = bottom > platform.y && top < platform.y + platform.h;
  return verticalOverlap && anchor.y > platform.y && anchor.y <= platform.y + platform.h;
}

function doesHazardOverlapSurfaceX(hazard, width, platform) {
  const left = Number(hazard.x);
  const right = left + width;
  const center = left + width / 2;
  return right > platform.x && left < platform.x + platform.w &&
    center >= platform.x - TRAP_SLOT_SPACING / 2 &&
    center <= platform.x + platform.w + TRAP_SLOT_SPACING / 2;
}

function wouldHazardOverlapProtectedArea(hazard, y, width, height, stage, game) {
  const rect = {
    x: Number(hazard.x),
    y,
    w: width,
    h: height,
  };

  if (game?.core && rectsOverlapLocal(rect, game.core)) return true;

  const spawn = getStagePlayerStartRect(stage, game);
  return Boolean(spawn && rectsOverlapLocal(rect, spawn));
}

function getStagePlayerStartRect(stage, game) {
  const stageData = getStageById(stage, getLayoutOptions(stage, game));
  const playerStart = stageData?.playerStart || { x: 64, y: 388 };
  return {
    x: playerStart.x,
    y: playerStart.y,
    w: HACKER_START_WIDTH,
    h: HACKER_START_HEIGHT,
  };
}

function rectsOverlapLocal(a, b) {
  return a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y;
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

function isOverlappingDefensePlayerStartSlot(stage, x, y, game) {
  const stageData = getStageById(stage, getLayoutOptions(stage, game));
  const playerStart = stageData?.playerStart || { x: 64, y: 388 };
  const startLeft = playerStart.x;
  const startRight = playerStart.x + HACKER_START_WIDTH;
  const startTop = playerStart.y;
  const startBottom = playerStart.y + HACKER_START_HEIGHT;
  return x >= startLeft &&
    x <= startRight &&
    y >= startTop &&
    y <= startBottom;
}

// 수정 이유:
// - 수비턴에서 설치한 EMP와 방화벽을 다음 공격턴 hazard로 넘길 때 타입별 판정을 유지하기 위함
// - 스테이지 기본 카메라를 유저 설치 카메라와 같은 플랫폼 anchor 방식으로 정규화하기 위함
