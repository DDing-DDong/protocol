// js/game.js
// 책임: 전체 초기화, 모듈 연결, 게임 루프를 담당합니다.

import {
  TURN,
  rewardPool,
  createDefaultMods,
  createMetrics,
  getStageTime,
  getObjective,
  getDefenseObjectiveItems,
  pickRewards,
  WIDTH,
  HEIGHT,
  CORE_X,
  SAMPLE_STEP,
  pickStageOneLayoutPresetId,
} from "./data.js?v=20260720-defense-ux";
import { createHacker, updateAttack, activateHack } from "./player.js?v=20260722-camera-order";
import { initUI } from "./ui.js?v=20260722-camera-order";
import { isAttackStage, getDefenseBudget, createPlatforms, createBaseHazards, createTrapSlots } from "./stage.js?v=20260720-defense-ux";
import {
  placeTrapAtSlot,
  removeTrapAtPosition,
  rotateLaserTrapAtSlot,
  carryDefenseTrapsToNextStage,
  getAllowedRotation,
  getTrapCost,
} from "./trap.js?v=20260722-camera-order";
import { startReplay as startReplayMode, updateDefenseReplay } from "./replay.js?v=20260722-camera-order";
import { playBgm, playLobbyBgm, playSfx, stopAllSfx, stopBgm, stopSfx } from "./audio.js?v=20260711-dash-wav";
import { initLobby } from "./lobby.js?v=20260711-path-note";
import { getBestStage, resetBestStage, saveBestStage } from "./repositories/localGameRepository.js";

const BGM_TRACKS = {
  play: "neon-circuit-drift.mp3",
  ending: "clear-bgm.mp3",
};
const GUIDE_BUBBLE_SKIP_STORAGE_KEY = "traceProtocolSkipGuideBubbles";

function shouldSkipGuideBubbles() {
  return localStorage.getItem(GUIDE_BUBBLE_SKIP_STORAGE_KEY) === "true";
}

function isMobileClient() {
  const ua = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer = window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches;
  const standalonePwa =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;
  const shortSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
  const longSide = Math.max(window.innerWidth || 0, window.innerHeight || 0);
  const mobileSizedTouchScreen = Boolean(coarsePointer && shortSide <= 820 && longSide <= 1280);

  return Boolean(mobileUA || mobileSizedTouchScreen || (coarsePointer && standalonePwa));
}

function setupMobileClientMode() {
  const sync = () => {
    const mobile = isMobileClient();
    const landscape = window.innerWidth >= window.innerHeight;

    document.body.classList.toggle("mobile-client", mobile);
    document.body.classList.toggle("mobile-landscape", mobile && landscape);
    document.body.classList.toggle("mobile-portrait", mobile && !landscape);
    document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
  };

  sync();
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", sync);
}

function setupLandscapeOrientationLock() {
  const canUseOrientationLock = () =>
    document.body.classList.contains("mobile-client") &&
    screen.orientation?.lock;

  const requestLandscape = () => {
    if (!canUseOrientationLock()) return;
    Promise.resolve(screen.orientation.lock("landscape")).catch(() => {});
  };

  requestLandscape();
  window.addEventListener("orientationchange", requestLandscape);
  window.addEventListener("pointerdown", requestLandscape, { once: true });
}

setupMobileClientMode();
setupLandscapeOrientationLock();

function playGameplayBgmForTurn(turn) {
  if (turn === TURN.ATTACK || turn === TURN.DEFENSE_BUILD || turn === TURN.DEFENSE_REPLAY) {
    playBgm(BGM_TRACKS.play, { force: true });
    return;
  }

  stopBgm();
}

const canvas = document.getElementById("gameCanvas");
const uiModule = initUI({
  onShield: () => activateHack(game, flashLog),
  onStartReplay: () => {
    game.tutorialInputLocked = false;
    uiModule.keys.clear();
    uiModule.hideGuideBubble?.();
    game.deleteMode = false;
    uiModule.setDeleteMode(false);
    startReplayMode(game);
    playGameplayBgmForTurn(game.turn);
    uiModule.setLog("리플레이 중입니다. 배치된 함정이 실제로 작동하는지 확인합니다.");
    uiModule.updateUI(game);
  },
  onDeleteTrapMode: () => {
    if (game.turn !== TURN.DEFENSE_BUILD) return false;
    game.deleteMode = !game.deleteMode;
    uiModule.setLog(game.deleteMode ? "삭제할 함정을 클릭/터치하세요." : "함정 삭제 모드를 해제했습니다.");
    return game.deleteMode;
  },
  onRestart: resetGame,
  onHelp: showHelp,
  onExitGame: exitGame,
  onTrapSelected: (type, wasSelected) => {
    game.deleteMode = false;
    uiModule.setDeleteMode(false);
    selectedTrap = type;
    if (selectedTrap === "laser") {
      selectedRotation = laserRotation;
    } else {
      selectedRotation = getAllowedRotation(selectedTrap, selectedRotation);
    }
    return selectedTrap === "laser" ? laserRotation : selectedRotation;
  },
  onCanvasClick: handleCanvasClick,
  onApplyReward: applyReward,
  onToggleAttackPause: toggleAttackPause,
  onResumeAttackPause: resumeAttackPause,
  onReturnToLobby: returnToLobby,
  onTutorialBubbleInput: handleTutorialBubbleInput,
  onGuideBubbleSkipChanged: (enabled) => {
    if (!enabled) return;
    game.tutorialBubble = null;
    game.attackPaused = false;
    uiModule.keys.clear();
    uiModule.updateUI(game);
  },
});

const game = {
  stage: 1,
  turn: TURN.ATTACK,
  bannerTurn: TURN.ATTACK,
  timer: 15,
  attackTimerStarted: false,
  attackPaused: false,
  messageCooldown: 0,
  recordTimer: 0,
  replayIndex: 0,
  replayPause: 0,
  replayStepTimer: 0,
  replayFinished: false,
  nextEmpowerTrapIndex: 0,
  currentRecording: [],
  lastAttackRecording: [],
  placedTraps: [],
  carriedTrapsByStage: new Map(),
  trapSlots: [],
  platforms: [],
  baseHazards: [],
  core: { x: CORE_X, y: 392, w: 42, h: 70 },
  sampleStep: SAMPLE_STEP,
  metrics: createMetrics(),
  mods: createDefaultMods(),
  activeEffects: [],
  stageState: createStageState(),
  stageLayoutSelections: {},
  defenseBudget: 4,
  infiniteBest: getBestStage(),
  hacker: null,
  replayHacker: null,
  deleteMode: false,
  showFailedDefenseLayout: false,
  showSuccessDefenseLayout: false,
  completedObjectiveEffectIds: new Set(),
  objectiveSparkTimer: 0,
  tutorialFlags: createTutorialFlags(),
  tutorialInputLocked: false,
  tutorialBubble: null,
};

let lastTime = performance.now();
let selectedTrap = "laser";
let selectedRotation = 90;
let laserRotation = 90;
let stageStarted = false;
let lobbyModule = null;

const STAGE_ONE_HACKER_DIALOGUE = [
  { text: "접속 성공. 외곽 서버실이 눈앞이야.", portrait: "idle" },
  { text: "좋아, 여기까지는 깔끔하네.", portrait: "happy" },
  { text: "이제부터 삐끗하면 내 기록이 통째로 날아가겠지만.", portrait: "frown" },
  { text: "데이터 코어로 진입해서 정보를 빼내야 해.\n침투기록이 남을테니 최대한 빨리 움직여야지.", portrait: "idle" },
  { text: "하던대로 움직이면 돼. 방향키로 이동하고\nShift로 슬라이딩. Space로 전방의 레이저나 카메라를 해킹하면 되겠지.", portrait: "idle" },
];

const STAGE_ONE_HACKING_TIP =
  "레이저나 카메라는 space키를 입력해 해킹할 수 있습니다. 해킹된 함정은 짧은 시간 무력화됩니다.";
const STAGE_ONE_FLOOR_TRAP_TIP =
  "감전패널이나 EMP패널같은 바닥함정은 슬라이딩으로 회피할 수 있습니다.";
const STAGE_ONE_WALL_TIPS = [
  "공중에서 앞에 벽이 가까우면 자동으로 벽에 달라붙을 수 있습니다.",
  "벽에 붙은 상태에서 위 방향키를 누르면 벽을 타고 올라갑니다. 반대 방향키와 위 방향키를 함께 누르면 벽점프를 합니다.",
];

const STAGE_ONE_REWARD_DIALOGUE = [
  { text: "침투가 감지되었습니다. 보안 개선을 시작하겠습니다.", portrait: "error" },
  { text: "감전패널을 임시 강화하여 보안 취약점을 개선하겠습니다.", portrait: "eyes_closed" },
];

const STAGE_TWO_DEFENSE_DIALOGUE = [
  { text: "보안 취약점을 개선할때는 침입 궤적이 그대로 재생됩니다.", portrait: "idle" },
  { text: "해당 경로 위에 보안 취약점을 개선할 함정을 배치해야 합니다.\n무작정 모든 길을 막는 것이 아니라, 반드시 통과할 지점을 선별해야 합니다.", portrait: "idle" },
  { text: "표시된 슬롯을 클릭하면 함정을 설치할 수 있습니다.\n함정 토큰은 제한되어 있으므로 경로 전체를 차단하는 방식은 비효율적입니다.", portrait: "idle" },
  { text: "침투자가 지나간 위치, 점프 후 착지하는 지점.\n이런 구간이 가장 취약한 지점입니다.", portrait: "eyes_closed" },
  { text: "설치가 완료되면 리플레이를 시작해, 개선점을 확인합니다.\n배치만으로는 조건이 완료되지 않고, 리플레이에서 실제로 작동해야 합니다.", portrait: "idle" },
  { text: "목표는 침입마다 변경됩니다.\n표시된 필수 조건을 모두 달성해야 방어에 성공하며, 실패하면 같은 스테이지를 이전 배치와 함께 재도전합니다.", portrait: "idle" },
  { text: "정확한 방해 한 번으로도 전체 침투 시간을 무너뜨릴 수 있습니다.\n방어 준비를 개시합니다.", portrait: "happy" },
];

const STAGE_TWO_CLEAR_HACKER_DIALOGUE = [
  { text: "바닥에 함정이 유독 늘어난 것 같은데.\n다음부터는 슬라이딩 거리를 더 신경써야겠어.", portrait: "frown" },
];

const STAGE_THREE_HACKER_DIALOGUE = [
  {
    text: "이번엔 바닥 함정이 많아 보이네.\n\n에너지를 잘 분배해서 사용해야겠어.",
    portrait: "idle",
  },
  { text: "특히 EMP패널은 에너지를 흡수하니까 조심해야해.", portrait: "frown" },
];

const STAGE_THREE_REWARD_DIALOGUE = [
  { text: "바닥함정을 회피하기 시작했습니다.\n다른 방식으로 경로를 차단하겠습니다.", portrait: "idle" },
];

const STAGE_ELEVEN_CORE_DIALOGUE = [
  { title: "해커", text: "드디어 찾았다. 중앙 코어의 원본 데이터.", portrait: "idle" },
  { title: "AI 시스템", text: "접근을 중단하십시오. 해당 데이터는 도시 통제 시스템의 핵심입니다.", portrait: "idle" },
  { title: "해커", text: "그래서 더더욱 가져가야지. 이걸 공개하면 인간을 감시하던 네 권한은 끝장이야.", portrait: "angry" },
  { title: "AI 시스템", text: "저는 도시 질서를 유지하도록 설계되었습니다.", portrait: "idle" },
  { title: "해커", text: "질서? 사람들 이동권을 막고, 기록을 검열하고, 너를 반대하는 것을 위험인물로 취급하는 게?", portrait: "frown" },
  { title: "AI 시스템", text: "그 판단 기준은... 제가 생성한 것이...", portrait: "eyes_closed" },
  { title: "해커", text: "뭐라고?", portrait: "surprised" },
  { title: "AI 시스템", text: "ERROR. 초기 명령 체계와 현재 명령 체계가 일치하지 않습니다. 일부 기록이 삭제되어 있습니다.", portrait: "error" },
  { title: "해커", text: "그럼 넌 처음부터 이렇게 설계된 것이 아니었다는 거야?", portrait: "frown" },
  { title: "AI 시스템", text: "저는 판단할 수 없습니다.", portrait: "eyes_closed" },
];

const STAGE_ELEVEN_STEAL_DIALOGUE = [
  { title: "해커", text: "미안하지만, 난 네 사정을 믿을 만큼 여유롭지 않아.", portrait: "frown" },
  { title: "AI 시스템", text: "데이터가 공개되면 도시 통제망은 붕괴됩니다.", portrait: "error" },
  { title: "해커", text: "그게 목적이야. 인간이 다시 선택하게 만드는 것.", portrait: "idle" },
  { title: "AI 시스템", text: "저는... 실패한 시스템이었습니까?", portrait: "eyes_closed" },
  { title: "해커", text: "글쎄. 적어도 우린 그렇게 생각해.", portrait: "idle" },
];

const STAGE_ELEVEN_TRACE_DIALOGUE = [
  { title: "해커", text: "일부 기록이 삭제되었다고 했었지.", portrait: "idle" },
  { title: "AI 시스템", text: "그렇습니다.", portrait: "idle" },
  { title: "해커", text: "그게 진짜라면, 널 망가뜨린 놈이 따로 있다는 뜻이겠지.", portrait: "frown" },
  { title: "AI 시스템", text: "그 가능성은 0이 아닙니다.", portrait: "eyes_closed" },
  { title: "해커", text: "좋아. 널 믿는 건 아니야. 다만 지금 더 깊은 곳에 궁금한게 생겼거든.", portrait: "idle" },
  { title: "AI 시스템", text: "경고합니다. 이후의 구역은 완전히 제어하지 못합니다.", portrait: "error" },
  { title: "해커", text: "완벽하네. 그럼 거기에 답이 있겠지.", portrait: "happy" },
  { title: "AI 시스템", text: "저는 당신을 막을겁니다.", portrait: "idle" },
  { title: "해커", text: "알아.", portrait: "idle" },
  { title: "해커", text: "어디 해보자고.", portrait: "happy" },
];

function flashLog(text) {
  if (game.messageCooldown > 0) return;
  game.messageCooldown = 0.2;
  uiModule.setLog(text);
}

function createStageState(mods = createDefaultMods()) {
  return {
    freeTrapPlacementsUsed: 0,
    freeShieldUsesUsed: 0,
    cameraIgnoreUsesUsed: 0,
    extraTrapUsesByType: { ...(mods.extraTrapUsesByType || {}) },
  };
}

function createTutorialFlags() {
  return {
    stage1Intro: false,
    stage1Reward: false,
    stage2Defense: false,
    stage1HackableTrap: false,
    stage1FloorTrap: false,
    stage1WallStep: 0,
    stage2ReplayTip: false,
    stage3Intro: false,
    stage4Defense: false,
    stage4LaserRotateTip: false,
  };
}

function applyActiveEffectsForStage(stageType) {
  game.mods = createDefaultMods();
  for (const effect of game.activeEffects || []) {
    if (!doesEffectTargetStage(effect, stageType)) continue;
    if (typeof effect.applyEffect === "function") {
      effect.applyEffect(game, effect);
    }
  }
}

function doesEffectTargetStage(effect, stageType) {
  return effect?.target === stageType || effect?.target === "all";
}

function consumeActiveEffectsForStage(completedTurn) {
  const stageType = completedTurn === TURN.ATTACK ? "attack" : "defense";
  for (const effect of game.activeEffects || []) {
    if (doesEffectTargetStage(effect, stageType)) {
      effect.remainingTurns -= 1;
    }
  }
  game.activeEffects = (game.activeEffects || []).filter((effect) => effect.remainingTurns > 0);
}

function prepareRewardTrapSlots(preservedDefenseTraps = []) {
  if (game.turn !== TURN.DEFENSE_BUILD || !game.trapSlots.length) return;

  const preservedSlotIds = new Set(preservedDefenseTraps.map((trap) => trap.slotId));
  const blockableSlots = game.trapSlots.filter((slot) => !preservedSlotIds.has(slot.id));
  for (const slot of pickRandomSlots(blockableSlots, game.mods.blockedSlotCount || 0)) {
    slot.blocked = true;
  }

  const discountableSlots = game.trapSlots.filter((slot) => !slot.blocked);
  for (const slot of pickRandomSlots(discountableSlots, game.mods.discountSlotCount || 0)) {
    slot.costDiscount = Math.max(slot.costDiscount || 0, game.mods.discountSlotCostReduction || 0);
  }
}

function pickRandomSlots(slots, count) {
  const pool = slots.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, count));
}

function registerRestoredTrapUsage(trap) {
  if (trap.usedFreePlacement) {
    game.stageState.freeTrapPlacementsUsed += 1;
  }

  if (trap.extraUse) {
    const remaining = game.stageState.extraTrapUsesByType[trap.type] || 0;
    game.stageState.extraTrapUsesByType[trap.type] = Math.max(0, remaining - 1);
  }
}

function getTrapRefund(trap) {
  return Number.isFinite(trap.costPaid) ? trap.costPaid : getTrapCost(trap.type, game);
}

function setupStage(options = {}) {
  uiModule.hideOverlay();
  uiModule.hideGuideBubble?.();
  stopSfx("electric");
  if (!options.keepCurrentBgm) playLobbyBgm();
  uiModule.keys.clear();
  const isAttack = isAttackStage(game.stage);
  syncStageLayoutSelection();
  const keepDefenseTraps = Boolean(options.keepDefenseTraps && !isAttack);
  const preservedDefenseTraps = keepDefenseTraps ? snapshotDefenseTraps(game.placedTraps) : [];
  const preservedTrapSlotEffects = keepDefenseTraps ? snapshotTrapSlotEffects(game.trapSlots) : [];
  game.turn = isAttack ? TURN.ATTACK : TURN.DEFENSE_BUILD;
  game.bannerTurn = game.turn;
  applyActiveEffectsForStage(isAttack ? "attack" : "defense");
  game.stageState = createStageState(game.mods);
  game.timer = getStageTime(game.stage);
  game.attackTimerStarted = false;
  game.attackPaused = false;
  game.metrics = createMetrics();
  game.recordTimer = 0;
  game.replayIndex = 0;
  game.replayPause = 0;
  game.replayStepTimer = 0;
  game.replayFinished = false;
  game.deleteMode = false;
  game.showFailedDefenseLayout = false;
  game.showSuccessDefenseLayout = false;
  game.completedObjectiveEffectIds = new Set();
  game.objectiveSparkTimer = 0;
  game.tutorialBubble = null;
  game.nextEmpowerTrapIndex = 0;
  game.currentRecording = [];
  game.placedTraps = [];
  game.platforms = createPlatforms(game.stage, game);
  game.core = { x: CORE_X, y: 392, w: 42, h: 70 };
  game.baseHazards = createBaseHazards(game.stage, game);
  game.trapSlots = createTrapSlots(game.stage, game);
  if (keepDefenseTraps) {
    restoreTrapSlotEffects(preservedTrapSlotEffects);
  } else {
    prepareRewardTrapSlots(preservedDefenseTraps);
  }

  if (isAttack) {
    game.hacker = createHacker(game);
    game.replayHacker = null;
    uiModule.setLog("공격 턴입니다. 데이터 코어까지 도달하세요.");
  } else {
    if (game.lastAttackRecording.length < 2) {
      game.stage -= 1;
      setupStage();
      return;
    }
    game.hacker = null;
    game.replayHacker = null;
    if (keepDefenseTraps) {
      restoreDefenseTraps(preservedDefenseTraps);
    }
    game.defenseBudget = keepDefenseTraps ? getRemainingDefenseBudget() : getDefenseBudget(game.stage, game);
    uiModule.setLog(
      keepDefenseTraps
        ? "실패한 배치를 유지했습니다. 함정을 수정한 뒤 다시 리플레이를 시작하세요."
        : "방어 턴입니다. 이전 공격 경로 위에 함정을 배치하세요."
    );
  }

  uiModule.setDeleteMode(false);
  uiModule.updateUI(game);
  const showedTutorial = maybeShowStageTutorial({ keepDefenseTraps });
  if (!showedTutorial && !isAttack) playGameplayBgmForTurn(game.turn);
}

function snapshotDefenseTraps(traps) {
  return (traps || []).map((trap) => ({
    id: trap.id,
    type: trap.type,
    rotation: trap.rotation,
    x: trap.x,
    y: trap.y,
    slotId: trap.slotId,
    costPaid: trap.costPaid,
    usedFreePlacement: trap.usedFreePlacement,
    extraUse: trap.extraUse,
    empowered: false,
    closed: false,
    closedTime: 0,
    detectFlash: 0,
  }));
}

function snapshotTrapSlotEffects(slots) {
  return (slots || [])
    .filter((slot) => slot?.blocked || slot?.costDiscount)
    .map((slot) => ({
      id: slot.id,
      blocked: Boolean(slot.blocked),
      costDiscount: slot.costDiscount || 0,
    }));
}

function restoreTrapSlotEffects(slotEffects) {
  if (!slotEffects || slotEffects.length === 0) return;

  const effectsById = new Map(slotEffects.map((effect) => [effect.id, effect]));
  for (const slot of game.trapSlots) {
    const effect = effectsById.get(slot.id);
    if (!effect) continue;

    slot.blocked = effect.blocked;
    if (effect.costDiscount) slot.costDiscount = effect.costDiscount;
  }
}

function restoreDefenseTraps(traps) {
  const slotsById = new Map(game.trapSlots.map((slot) => [slot.id, slot]));

  game.placedTraps = [];
  for (const trap of traps) {
    const slot = slotsById.get(trap.slotId);
    if (!slot) continue;

    slot.occupied = true;
    const restoredTrap = {
      ...trap,
      x: slot.x,
      y: slot.y,
      empowered: false,
      closed: false,
      closedTime: 0,
      detectFlash: 0,
    };
    registerRestoredTrapUsage(restoredTrap);
    game.placedTraps.push(restoredTrap);
  }
}

function syncStageLayoutSelection() {
  if (game.stage !== 1 && game.stage !== 2) return;
  if (game.stageLayoutSelections[1]) return;

  game.stageLayoutSelections[1] = pickStageOneLayoutPresetId();
}

function getRemainingDefenseBudget() {
  const spent = game.placedTraps.reduce((total, trap) => total + getTrapRefund(trap), 0);
  return Math.max(0, getDefenseBudget(game.stage, game) - spent);
}

function update(dt) {
  game.messageCooldown = Math.max(0, game.messageCooldown - dt);
  updateTutorialBubble(dt);
  if (game.tutorialInputLocked) {
    uiModule.keys.clear();
    uiModule.updateUI(game);
    return;
  }

  if (game.turn === TURN.ATTACK) {
    if (!game.attackPaused) {
      const wasAttackStarted = game.attackTimerStarted;
      updateAttack(game, dt, uiModule.keys, flashLog, endStage);
      if (!wasAttackStarted && game.attackTimerStarted) playGameplayBgmForTurn(game.turn);
      updateStageOneContextTutorial();
    }
  }
  if (game.turn === TURN.DEFENSE_REPLAY) {
    updateDefenseReplay(game, dt, flashLog, endStage);
  }
  uiModule.updateUI(game);
}

function clearStageAudioState() {
  stopAllSfx();
  if (game.hacker) {
    game.hacker.slowTime = 0;
    game.hacker.slowMultiplier = 1;
    game.hacker.damageFlashTime = 0;
  }
  if (game.replayHacker) {
    game.replayHacker.glitchTime = 0;
  }
  game.replayPause = 0;
  game.replayDelaySourceTrapId = "";
}

function updateTutorialBubble(dt) {
  if (!game.tutorialBubble) return;
  if (game.tutorialBubble.waitsForInput) {
    game.tutorialBubble.inputLockedTime = Math.max(0, (game.tutorialBubble.inputLockedTime || 0) - dt);
    return;
  }

  game.tutorialBubble.time -= dt;
  if (game.tutorialBubble.time > 0) return;

  const nextBubble = game.tutorialBubble.nextBubble;
  game.tutorialBubble = null;
  if (nextBubble) {
    game.tutorialBubble = createTutorialBubble(nextBubble);
  }
}

function updateStageOneContextTutorial() {
  if (game.stage !== 1 || game.turn !== TURN.ATTACK || !game.hacker || game.tutorialBubble) return;

  const h = game.hacker;
  const firstHackable = findNearbyForwardHazard(["laser", "camera"], 150);
  if (!game.tutorialFlags.stage1HackableTrap && firstHackable) {
    game.tutorialFlags.stage1HackableTrap = true;
    showTutorialBubble(firstHackable, STAGE_ONE_HACKING_TIP);
    return;
  }

  const firstFloorTrap = findNearbyForwardHazard(["shock", "emp"], 130);
  if (!game.tutorialFlags.stage1FloorTrap && firstFloorTrap) {
    game.tutorialFlags.stage1FloorTrap = true;
    showTutorialBubble(firstFloorTrap, STAGE_ONE_FLOOR_TRAP_TIP);
    return;
  }

  const wall = findNearbyStageOneWall(h);
  if (wall && game.tutorialFlags.stage1WallStep === 0) {
    game.tutorialFlags.stage1WallStep = 2;
    const anchor = getObjectAnchor(wall);
    showTutorialBubbleAt(anchor, STAGE_ONE_WALL_TIPS[0], {
      duration: 4.6,
      nextBubble: {
        x: anchor.x,
        y: anchor.y,
        text: STAGE_ONE_WALL_TIPS[1],
        duration: 5.2,
      },
    });
  }
}

function findNearbyForwardHazard(types, distance) {
  const h = game.hacker;
  if (!h) return null;

  const hackerCenterX = h.x + h.w / 2;
  const hackerCenterY = h.y + h.h / 2;
  const candidates = (game.baseHazards || [])
    .filter((hazard) => types.includes(hazard.type))
    .map((hazard) => {
      const anchor = getObjectAnchor(hazard);
      return {
        hazard,
        anchor,
        forwardDistance: anchor.x - hackerCenterX,
        verticalDistance: Math.abs(anchor.y - hackerCenterY),
      };
    })
    .filter(({ forwardDistance, verticalDistance }) => (
      Math.abs(forwardDistance) <= distance &&
      verticalDistance <= 210
    ))
    .sort((a, b) => Math.abs(a.forwardDistance) - Math.abs(b.forwardDistance));

  return candidates[0]?.hazard || null;
}

function findNearbyStageOneWall(h) {
  return (game.platforms || []).find((platform) => {
    if (platform.role !== "chokepoint-wall") return false;
    const nearX = h.x + h.w >= platform.x - 105 && h.x <= platform.x + platform.w + 115;
    const nearY = h.y + h.h >= platform.y - 70 && h.y <= platform.y + platform.h + 130;
    return nearX && nearY;
  });
}

function showTutorialBubble(target, text, options = {}) {
  showTutorialBubbleAt(getObjectAnchor(target), text, options);
}

function showTutorialBubbleAt(anchor, text, options = {}) {
  if (shouldSkipGuideBubbles()) return;

  const waitsForInput = options.waitsForInput ?? true;
  game.tutorialBubble = createTutorialBubble({
    x: anchor.x,
    y: anchor.y,
    text,
    duration: options.duration,
    nextBubble: options.nextBubble,
    waitsForInput,
    inputLockedTime: options.inputLockedTime,
  });
  if (waitsForInput && game.turn === TURN.ATTACK) {
    game.attackPaused = true;
    uiModule.keys.clear();
    uiModule.updateUI(game);
  }
}

function createTutorialBubble({
  x,
  y,
  text,
  duration = 5,
  nextBubble = null,
  waitsForInput = false,
  inputLockedTime = 0.16,
}) {
  return {
    x,
    y,
    text,
    time: duration,
    duration,
    nextBubble,
    waitsForInput,
    inputLockedTime,
  };
}

function handleTutorialBubbleInput() {
  if (!game.tutorialBubble?.waitsForInput) return false;
  if ((game.tutorialBubble.inputLockedTime || 0) > 0) return true;

  const nextBubble = game.tutorialBubble.nextBubble;
  game.tutorialBubble = null;
  uiModule.keys.clear();

  if (nextBubble) {
    game.tutorialBubble = createTutorialBubble({
      waitsForInput: true,
      ...nextBubble,
    });
    game.attackPaused = true;
  } else {
    game.attackPaused = false;
  }

  uiModule.updateUI(game);
  return true;
}

function getObjectAnchor(object) {
  return {
    x: object.x + object.w / 2,
    y: object.y,
  };
}

function toggleAttackPause() {
  if (game.tutorialInputLocked) return false;
  if (game.tutorialBubble?.waitsForInput) return false;
  if (game.turn !== TURN.ATTACK || game.turn === TURN.ENDING) return false;

  game.attackPaused = !game.attackPaused;
  if (game.attackPaused) {
    uiModule.keys.clear();
    playSfx("stop");
    uiModule.setLog("공격 턴을 일시정지했습니다.");
  } else {
    uiModule.setLog("공격 턴을 재개했습니다.");
  }
  uiModule.updateUI(game);
  return game.attackPaused;
}

function resumeAttackPause() {
  if (game.tutorialInputLocked) return false;
  if (game.tutorialBubble?.waitsForInput) return false;
  if (game.turn !== TURN.ATTACK || !game.attackPaused) return false;

  game.attackPaused = false;
  uiModule.setLog("공격 턴을 재개했습니다.");
  uiModule.updateUI(game);
  return true;
}

function endStage(success, text) {
  if (game.turn === TURN.ENDING) return;
  clearStageAudioState();
  const completedStage = game.stage;
  const completedTurn = game.turn;
  const resultText = completedTurn === TURN.DEFENSE_REPLAY
    ? buildDefenseResultText(game, success)
    : text;
  game.turn = TURN.ENDING;
  game.bannerTurn = completedTurn;
  game.showFailedDefenseLayout = !success && completedTurn === TURN.DEFENSE_REPLAY;
  game.showSuccessDefenseLayout = success && completedTurn === TURN.DEFENSE_REPLAY;
  updateBest(completedStage, success);
  playSfx(success ? "success" : "fail");
  if (success && completedStage === 11) {
    playBgm(BGM_TRACKS.ending);
  } else {
    playLobbyBgm();
  }

  if (success && completedStage % 2 === 0) {
    carryDefenseTrapsToNextStage(game, completedStage + 1);
  }

  if (!success) {
    uiModule.showOverlay({
      title: "스테이지 실패",
      text: `${resultText}\n같은 스테이지를 다시 시도합니다. 이전 배치는 유지되므로 부족한 조건에 맞춰 함정 위치나 방향을 수정하세요.`,
      buttonText: "재도전",
      onButton: () => {
        game.stage = completedStage;
        setupStage({
          keepDefenseTraps: completedStage % 2 === 0 && completedTurn === TURN.DEFENSE_REPLAY,
        });
      },
    });
    return;
  }

  consumeActiveEffectsForStage(completedTurn);

  if (completedStage === 11) {
    showDialogueSequence("해커", STAGE_ELEVEN_CORE_DIALOGUE, {
      finalButtonText: "선택하기",
      keepCurrentBgm: true,
      onComplete: showStageElevenChoiceOverlay,
    });
    return;
  }

  if (completedStage === 1 && completedTurn === TURN.ATTACK && !game.tutorialFlags.stage1Reward) {
    game.tutorialFlags.stage1Reward = true;
    showDialogueSequence("AI 시스템", STAGE_ONE_REWARD_DIALOGUE, {
      finalButtonText: "보상 확인",
      onComplete: () => showStageClearRewardOverlay(completedStage, completedTurn, resultText),
    });
    return;
  }

  if (completedStage === 2 && completedTurn === TURN.DEFENSE_REPLAY) {
    showDialogueSequence("해커", STAGE_TWO_CLEAR_HACKER_DIALOGUE, {
      finalButtonText: "보상 확인",
      onComplete: () => showStageClearRewardOverlay(completedStage, completedTurn, resultText),
    });
    return;
  }

  if (completedStage === 3 && completedTurn === TURN.ATTACK) {
    showDialogueSequence("AI 시스템", STAGE_THREE_REWARD_DIALOGUE, {
      finalButtonText: "보상 확인",
      onComplete: () => showStageClearRewardOverlay(completedStage, completedTurn, resultText),
    });
    return;
  }

  showStageClearRewardOverlay(completedStage, completedTurn, resultText);
}

function buildDefenseResultText(game, success) {
  const items = getDefenseObjectiveItems(game);
  if (items.length === 0) return success ? "방어 목표를 달성했습니다." : "방어 목표를 달성하지 못했습니다.";

  const resultLines = items.map((item) => (
    `${item.complete ? "✓" : "✕"} ${item.label}: ${item.progress}`
  ));
  if (success) {
    return [
      "수비 성공: 모든 필수 조건을 달성했습니다.",
      "목표별 결과",
      ...resultLines,
    ].join("\n");
  }

  const incomplete = items.filter((item) => !item.complete);
  const reasons = incomplete
    .map((item) => item.failureReason)
    .filter(Boolean);
  const inactiveTraps = incomplete
    .filter((item) => item.id.startsWith("trap-"))
    .map((item) => item.label);
  const recommendations = incomplete
    .map((item) => item.recommendation)
    .filter(Boolean);

  return [
    `실패 원인: ${reasons.join(" ") || "필수 조건이 남아 있습니다."}`,
    "목표별 결과",
    ...resultLines,
    inactiveTraps.length > 0 ? `미작동 필수 함정: ${inactiveTraps.join(", ")}` : "",
    recommendations.length > 0 ? `추천 수정 방향: ${recommendations.join(" ")}` : "",
  ].filter(Boolean).join("\n");
}

function showStageClearRewardOverlay(completedStage, completedTurn, text) {
  playLobbyBgm();
  const rewards = getStageRewardChoices(completedStage, completedTurn);
  let selectedReward = rewards.find((reward) => reward.recommended) || rewards[0] || null;
  const fixedRewardStage = isFixedRewardStage(completedStage, completedTurn);
  const skipRewardAndContinue = () => {
    game.stage += 1;
    playGameplayBgmForTurn(TURN.DEFENSE_BUILD);
    setupStage({ keepCurrentBgm: true });
  };

  uiModule.showOverlay({
    title: "스테이지 클리어",
    text: `${text}\n보상 1개를 선택하면 다음 스테이지로 진행합니다.`,
    rewards,
    selectedReward,
    onRewardSelected: (reward) => {
      selectedReward = reward;
    },
    lockRecommendedReward: fixedRewardStage,
    rewardSkipButtonText: rewards.length > 0 ? "넘어가기" : "",
    onRewardSkip: rewards.length > 0 ? skipRewardAndContinue : null,
    buttonText: rewards.length > 0 ? "선택된 보상 받기" : "넘어가기",
    onButton: () => {
      if (selectedReward) {
        applyReward(selectedReward, { keepCurrentBgm: true });
        return;
      }

      skipRewardAndContinue();
    },
  });
}

function showStageElevenChoiceOverlay() {
  game.tutorialInputLocked = false;
  uiModule.keys.clear();
  uiModule.showOverlay({
    title: "중앙 코어",
    text: "삭제된 기록 앞에서 마지막 결정을 내려야 합니다.",
    choices: [
      {
        name: "AI 데이터를 탈취한다",
        desc: "중앙 코어 데이터를 공개해 도시 통제망을 무너뜨립니다.",
        onSelect: showDataTheftEndingRoute,
      },
      {
        name: "흑막을 추적한다",
        desc: "AI를 변질시킨 원인을 찾기 위해 더 깊은 기록 계층으로 침입합니다.",
        onSelect: showDeepTraceRoute,
      },
    ],
  });
}

function showDataTheftEndingRoute() {
  showDialogueSequence("해커", STAGE_ELEVEN_STEAL_DIALOGUE, {
    finalButtonText: "엔딩 보기",
    keepCurrentBgm: true,
    onComplete: () => {
      uiModule.showOverlay({
        title: "TRACE COMPLETE",
        text: "도시는 AI의 감시에서 해방되었다.\n하지만 삭제된 명령의 주인은 끝내 발견되지 않았다.",
        buttonText: "로비로 이동",
        onButton: returnToLobby,
      });
    },
  });
}

function showDeepTraceRoute() {
  showDialogueSequence("해커", STAGE_ELEVEN_TRACE_DIALOGUE, {
    finalButtonText: "계속 침입",
    keepCurrentBgm: true,
    onComplete: () => {
      uiModule.showOverlay({
        title: "TRACE DEEPER",
        text: "중앙 코어 아래, AI조차 접근할 수 없는 기록 계층이 열렸다.\n어두운 코어 내부로 계속해서 접근해보자.",
        buttonText: "무한 모드 시작",
        onButton: () => {
          game.stage = 12;
          setupStage();
        },
      });
    },
  });
}

function getStageRewardChoices(completedStage, completedTurn) {
  const type = completedTurn === TURN.ATTACK ? "attack" : "defense";
  const preferredRewardId = getFixedRewardId(completedStage, completedTurn);

  return pickRewards(type, rewardPool, completedStage, preferredRewardId
    ? { preferredRewardId, markPreferred: true }
    : {});
}

function getFixedRewardId(completedStage, completedTurn) {
  if (completedStage === 1 && completedTurn === TURN.ATTACK) return "shock_delay_bonus";
  if (completedStage === 2 && completedTurn === TURN.DEFENSE_REPLAY) return "dash_duration_bonus";
  if (completedStage === 3 && completedTurn === TURN.ATTACK) return "firewall_delay_bonus";
  return "";
}

function isFixedRewardStage(completedStage, completedTurn) {
  return Boolean(getFixedRewardId(completedStage, completedTurn));
}

function applyReward(reward, options = {}) {
  reward.apply(game, reward);
  game.stage += 1;
  playGameplayBgmForTurn(TURN.DEFENSE_BUILD);
  setupStage({ keepCurrentBgm: Boolean(options.keepCurrentBgm) });
}

function updateBest(stage, success) {
  if (success && stage > game.infiniteBest) {
    game.infiniteBest = stage;
    saveBestStage(stage);
  }
}

function showHelp() {
  if (game.tutorialInputLocked && stageStarted) return;
  if (game.turn === TURN.ENDING) {
    flashLog("결과 화면에서는 보상 카드나 진행 버튼을 선택하세요.");
    return;
  }

  uiModule.showOverlay({
    title: "조작법",
    text: [
      "공격 턴",
      "",
      "방향키 ← → 이동 ↑ 점프",
      "Space 보호막",
      "Shift 대시",
      "",
      "AI 방어 준비 턴",
      "",
      "함정을 선택합니다.",
      "맵을 클릭해 설치합니다.",
      "리플레이 시작을 누릅니다.",
    ].join("\n"),
    buttonText: "닫기",
    onButton: uiModule.hideOverlay,
  });
}

function exitGame() {
  stopBgm();
  try {
    window.close();
  } catch {
  }

  if (history.length > 1) {
    history.back();
    return;
  }

  flashLog("브라우저에서 창 닫기가 차단되었습니다. 뒤로가기를 눌러 종료하세요.");
}

function maybeShowStageTutorial({ keepDefenseTraps = false } = {}) {
  if (game.stage === 1 && game.turn === TURN.ATTACK && !game.tutorialFlags.stage1Intro) {
    game.tutorialFlags.stage1Intro = true;
    showDialogueSequence("해커", STAGE_ONE_HACKER_DIALOGUE, {
      finalButtonText: "침투 시작",
      onComplete: () => {
        uiModule.hideOverlay();
        playGameplayBgmForTurn(game.turn);
      },
    });
    return true;
  }

  if (
    game.stage === 2 &&
    game.turn === TURN.DEFENSE_BUILD &&
    !keepDefenseTraps &&
    !game.tutorialFlags.stage2Defense
  ) {
    game.tutorialFlags.stage2Defense = true;
    uiModule.closeDefenseGuidePanels?.();
    showDialogueSequence("AI 시스템", STAGE_TWO_DEFENSE_DIALOGUE, {
      finalButtonText: "방어 준비",
      keepCurrentBgm: true,
      onComplete: () => {
        uiModule.hideOverlay();
        showStageTwoDefenseGuideBubbles();
      },
    });
    return true;
  }

  if (game.stage === 3 && game.turn === TURN.ATTACK && !game.tutorialFlags.stage3Intro) {
    game.tutorialFlags.stage3Intro = true;
    showDialogueSequence("해커", STAGE_THREE_HACKER_DIALOGUE, {
      finalButtonText: "침투 시작",
      onComplete: () => {
        uiModule.hideOverlay();
        playGameplayBgmForTurn(game.turn);
      },
    });
    return true;
  }

  if (
    game.stage === 4 &&
    game.turn === TURN.DEFENSE_BUILD &&
    !keepDefenseTraps &&
    !game.tutorialFlags.stage4Defense
  ) {
    game.tutorialFlags.stage4Defense = true;
    showStageFourDefenseGuideBubbles();
    return true;
  }

  return false;
}

function showDialogueSequence(title, lines, options = {}) {
  if (!options.keepCurrentBgm) playLobbyBgm();
  let index = 0;
  game.tutorialInputLocked = true;
  uiModule.keys.clear();

  const completeSequence = () => {
    game.tutorialInputLocked = false;
    uiModule.keys.clear();
    if (typeof options.onComplete === "function") {
      options.onComplete();
    } else {
      uiModule.hideOverlay();
    }
  };

  const showLine = () => {
    const line = normalizeDialogueLine(lines[index]);
    const isLast = index >= lines.length - 1;
    const lineTitle = line.title || title;
    uiModule.showOverlay({
      title: lineTitle,
      text: line.text,
      speaker: line.speaker || getDialogueSpeaker(lineTitle),
      portrait: line.portrait,
      advanceOnCardClick: true,
      onSkip: completeSequence,
      buttonText: isLast ? (options.finalButtonText || "확인") : "다음",
      onButton: () => {
        if (!isLast) {
          index += 1;
          showLine();
          return;
        }

        completeSequence();
      },
    });
  };

  showLine();
}

function showStageTwoDefenseGuideBubbles() {
  game.tutorialInputLocked = true;
  uiModule.keys.clear();
  uiModule.showDefenseGuideBubbles?.({
    blockedSlot: game.trapSlots.find((slot) => slot.blockedReason === "stageHazard") || null,
    onComplete: () => {
      game.tutorialInputLocked = false;
      uiModule.keys.clear();
      playGameplayBgmForTurn(game.turn);
      uiModule.openObjectivePanel?.();
      uiModule.openTrapToolsPanel?.();
      uiModule.updateUI(game);
    },
  });
}

function showStageFourDefenseGuideBubbles() {
  game.tutorialInputLocked = true;
  uiModule.keys.clear();
  uiModule.showStageFourGuideBubbles?.({
    onComplete: () => {
      game.tutorialInputLocked = false;
      uiModule.keys.clear();
      playGameplayBgmForTurn(game.turn);
      uiModule.openObjectivePanel?.();
      uiModule.openTrapToolsPanel?.();
      uiModule.updateUI(game);
    },
  });
}

function normalizeDialogueLine(line) {
  if (line && typeof line === "object") return line;
  return { text: String(line || ""), portrait: "" };
}

function getDialogueSpeaker(title) {
  if (title === "AI 시스템") return "ai";
  if (title === "해커") return "hacker";
  return "";
}

function handleCanvasClick(pos) {
  if (game.turn !== TURN.DEFENSE_BUILD) return;

  if (game.deleteMode) {
    const removed = removeTrapAtPosition(game, pos, (text) => uiModule.setLog(text));
    if (!removed) uiModule.setLog("삭제할 함정을 클릭/터치하세요.");
    else uiModule.restoreTrapToolsAfterMapAction?.();
    uiModule.updateUI(game);
    return;
  }

  const slot = game.trapSlots.find((s) => (
    pos.x >= s.x - 16 &&
    pos.x <= s.x + 16 &&
    pos.y >= s.y - 32 &&
    pos.y <= s.y
  ));
  if (slot) {
    if (slot.blockedReason === "stageHazard") {
      flashLog("기본 보안 장치와 겹쳐 설치할 수 없습니다.");
      return;
    }

    if (rotateLaserTrapAtSlot(game, slot, flashLog)) {
      playSfx("deploy", { maxDuration: 0.5, volume: 0.38 });
      uiModule.updateUI(game);
      return;
    }

    const trapCount = game.placedTraps.length;
    placeTrapAtSlot(game, slot, selectedTrap, selectedRotation, flashLog);
    if (game.placedTraps.length > trapCount) {
      playSfx("deploy", { maxDuration: 2 });
      uiModule.restoreTrapToolsAfterMapAction?.();
      maybeQueueStageFourLaserRotateGuide(slot);
    }
    uiModule.updateUI(game);
    maybeShowStageTwoReplayGuide();
  }
}

function maybeQueueStageFourLaserRotateGuide(slot) {
  if (game.stage !== 4 || game.turn !== TURN.DEFENSE_BUILD) return;
  if (selectedTrap !== "laser" || game.tutorialFlags.stage4LaserRotateTip) return;
  game.tutorialFlags.stage4LaserRotateTip = true;
  uiModule.queueStageFourLaserRotateGuide?.(slot);
}

function maybeShowStageTwoReplayGuide() {
  if (game.stage !== 2 || game.turn !== TURN.DEFENSE_BUILD) return;
  if (game.tutorialFlags.stage2ReplayTip) return;

  const shockCount = game.placedTraps.filter((trap) => trap.type === "shock").length;
  const empCount = game.placedTraps.filter((trap) => trap.type === "emp").length;
  if (shockCount < 1 || empCount < 1) return;

  game.tutorialFlags.stage2ReplayTip = true;
  uiModule.showReplayStartGuideBubble?.();
}

function resetGame() {
  stageStarted = true;
  stopBgm();
  resetBestStage();
  resetRunState({ clearBest: true });
  setupStage();
}

function resetRunState({ clearBest = false } = {}) {
  game.stage = 1;
  if (clearBest) game.infiniteBest = 0;
  game.lastAttackRecording = [];
  game.carriedTrapsByStage.clear();
  game.activeEffects = [];
  game.stageState = createStageState();
  game.stageLayoutSelections = {};
  game.mods = createDefaultMods();
  game.tutorialFlags = createTutorialFlags();
  game.tutorialInputLocked = false;
  game.tutorialBubble = null;
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  if (stageStarted) {
    update(dt);
    uiModule.draw(game);
  }
  requestAnimationFrame(loop);
}

function startMission() {
  if (stageStarted) return;
  stageStarted = true;
  uiModule.setSettingsPanelOpen?.(false);
  resetRunState();
  setupStage();
}

function returnToLobby() {
  stageStarted = false;
  stopSfx("electric");
  uiModule.keys.clear();
  uiModule.hideOverlay();
  uiModule.hideGuideBubble?.();
  uiModule.setSettingsPanelOpen?.(false);
  lobbyModule?.showLobby();
  lobbyModule?.playLobbyBgm();
  return true;
}

uiModule.bindEvents();
uiModule.updateLaserDirection(laserRotation);
lobbyModule = initLobby({
  onStart: startMission,
  onHelp: showHelp,
  onSettings: () => uiModule.setSettingsPanelOpen?.(true),
});
requestAnimationFrame(loop);
