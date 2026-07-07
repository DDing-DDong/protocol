// js/game.js
// 책임: 전체 초기화, 모듈 연결, 게임 루프를 담당합니다.

import {
  TURN,
  rewardPool,
  createDefaultMods,
  createMetrics,
  getStageTime,
  getObjective,
  pickRewards,
  WIDTH,
  HEIGHT,
  CORE_X,
  SAMPLE_STEP,
  pickStageOneLayoutPresetId,
} from "./data.js?v=20260707-mobile-panels-fit2";
import { createHacker, updateAttack, activateHack } from "./player.js?v=20260707-mobile-panels-fit2";
import { initUI } from "./ui.js?v=20260707-mobile-panels-fit2";
import { isAttackStage, getDefenseBudget, createPlatforms, createBaseHazards, createTrapSlots } from "./stage.js?v=20260707-mobile-panels-fit2";
import {
  placeTrapAtSlot,
  removeTrapAtPosition,
  carryDefenseTrapsToNextStage,
  getAllowedRotation,
  getTrapCost,
} from "./trap.js?v=20260707-mobile-panels-fit2";
import { startReplay as startReplayMode, updateDefenseReplay } from "./replay.js?v=20260707-mobile-panels-fit2";
import { playBgm, playSfx, stopBgm, stopSfx } from "./audio.js?v=20260707-mobile-panels-fit2";

const BGM_TRACKS = {
  lobby: "neon-protocol.mp3",
  play: "neon-circuit-drift.mp3",
  ending: "clear-bgm.mp3",
};

function setupLandscapeOrientationLock() {
  const canUseOrientationLock = () =>
    window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches &&
    screen.orientation?.lock;

  const requestLandscape = () => {
    if (!canUseOrientationLock()) return;
    Promise.resolve(screen.orientation.lock("landscape")).catch(() => {});
  };

  requestLandscape();
  window.addEventListener("orientationchange", requestLandscape);
  window.addEventListener("pointerdown", requestLandscape, { once: true });
}

setupLandscapeOrientationLock();

function playLobbyBgm() {
  playBgm(BGM_TRACKS.lobby, { force: true });
}

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
    game.deleteMode = false;
    uiModule.setDeleteMode(false);
    startReplayMode(game);
    playGameplayBgmForTurn(game.turn);
    uiModule.setLog("리플레이 중입니다. 해커가 이전 공격 경로를 따라갑니다.");
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
    if (type === "laser" && wasSelected) {
      selectedRotation = getAllowedRotation(type, selectedRotation + 90);
      laserRotation = selectedRotation;
      flashLog(`레이저 회전 ${selectedRotation}도`);
      return selectedRotation;
    }
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
  canPlayAttackSfx: () => game.turn === TURN.ATTACK && !game.tutorialInputLocked && !game.attackPaused,
});

const game = {
  stage: 1,
  turn: TURN.ATTACK,
  bannerTurn: TURN.ATTACK,
  timer: 30,
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
  infiniteBest: Number(localStorage.getItem("traceProtocolBest") || 0),
  hacker: null,
  replayHacker: null,
  deleteMode: false,
  showFailedDefenseLayout: false,
  showSuccessDefenseLayout: false,
  completedObjectiveEffectIds: new Set(),
  objectiveSparkTimer: 0,
  tutorialFlags: createTutorialFlags(),
  tutorialInputLocked: false,
};

let lastTime = performance.now();
let selectedTrap = "laser";
let selectedRotation = 90;
let laserRotation = 90;

const STAGE_ONE_HACKER_DIALOGUE = [
  "접속 성공. 외곽 서버실이 눈앞이야.",
  "좋아, 여기까지는 깔끔하네.",
  "이제부터 삐끗하면 내 기록이 통째로 날아가겠지만.",
  "데이터 코어로 진입해서 정보를 빼내야 해.\n\n침투기록이 남을테니 최대한 빨리 움직여야지.",
  "하던대로 움직이면 돼. 방향키로 이동하고\n\nShift로 슬라이딩. Space로 전방의 레이저나 카메라를 해킹하면 되겠지.",
];

const STAGE_ONE_REWARD_DIALOGUE = [
  "침투가 감지되었습니다. 보안 개선을 시작하겠습니다.",
  "감전패널을 임시 강화하여 보안 취약점을 개선하겠습니다.",
];

const STAGE_TWO_DEFENSE_DIALOGUE = [
  "보안 취약점을 개선할때는 침입 궤적이 그대로 재생됩니다.",
  "해당 경로 위에 보안 취약점을 개선할 함정을 배치해야 합니다.\n\n무작정 모든 길을 막는 것이 아니라, 반드시 통과할 지점을 선별해야 합니다.",
  "표시된 슬롯을 클릭하면 함정을 설치할 수 있습니다.\n\n사용할 수 있는 함정 토큰은 제한되어 있으므로 경로 전체를 차단하는 방식은 비효율적입니다.",
  "침투자가 지나간 위치, 점프 후 착지하는 지점.\n\n이런 구간이 가장 취약한 지점입니다.",
  "설치가 완료되면 리플레이를 시작해, 개선점을 확인합니다.",
  "목표는 침입마다 변경됩니다.\n\n지정된 조건을 달성해 방어를 성공시켜야 합니다.",
  "정확한 방해 한 번으로도 전체 침투 시간을 무너뜨릴 수 있습니다.\n\n방어 준비를 개시합니다.",
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
    }
  }
  if (game.turn === TURN.DEFENSE_REPLAY) {
    updateDefenseReplay(game, dt, flashLog, endStage);
  }
  uiModule.updateUI(game);
}

function toggleAttackPause() {
  if (game.tutorialInputLocked) return false;
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
  if (game.turn !== TURN.ATTACK || !game.attackPaused) return false;

  game.attackPaused = false;
  uiModule.setLog("공격 턴을 재개했습니다.");
  uiModule.updateUI(game);
  return true;
}

function endStage(success, text) {
  if (game.turn === TURN.ENDING) return;
  stopSfx("electric");
  const completedStage = game.stage;
  const completedTurn = game.turn;
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
      text: `${text}\n같은 스테이지를 다시 시도합니다.`,
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
    uiModule.showOverlay({
      title: "엔딩",
      text: "중앙 데이터 코어 탈취에 성공했습니다. 이제 12스테이지부터 무한 모드가 열립니다.",
      buttonText: "무한 모드 시작",
      onButton: () => {
        game.stage = 12;
        setupStage();
      },
    });
    return;
  }

  if (completedStage === 1 && completedTurn === TURN.ATTACK && !game.tutorialFlags.stage1Reward) {
    game.tutorialFlags.stage1Reward = true;
    showDialogueSequence("AI 시스템", STAGE_ONE_REWARD_DIALOGUE, {
      finalButtonText: "보상 확인",
      onComplete: () => showStageClearRewardOverlay(completedStage, completedTurn, text),
    });
    return;
  }

  showStageClearRewardOverlay(completedStage, completedTurn, text);
}

function showStageClearRewardOverlay(completedStage, completedTurn, text) {
  playLobbyBgm();
  const rewards = getStageRewardChoices(completedStage, completedTurn);
  const selectedReward = rewards.find((reward) => reward.recommended);

  uiModule.showOverlay({
    title: "스테이지 클리어",
    text: `${text}\n보상 1개를 선택하면 다음 스테이지로 진행합니다.`,
    rewards,
    buttonText: selectedReward ? "선택된 보상 받기" : "보상 없이 진행",
    onButton: () => {
      if (selectedReward) {
        applyReward(selectedReward, { keepCurrentBgm: true });
        return;
      }

      game.stage += 1;
      playGameplayBgmForTurn(TURN.DEFENSE_BUILD);
      setupStage({ keepCurrentBgm: true });
    },
  });
}

function getStageRewardChoices(completedStage, completedTurn) {
  const type = completedTurn === TURN.ATTACK ? "attack" : "defense";
  const shouldGuideShockReward = completedStage === 1 && completedTurn === TURN.ATTACK;

  return pickRewards(type, rewardPool, completedStage, shouldGuideShockReward
    ? { preferredRewardId: "shock_delay_bonus", markPreferred: true }
    : {});
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
    localStorage.setItem("traceProtocolBest", String(stage));
  }
}

function showHelp() {
  if (game.tutorialInputLocked) return;
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
    showDialogueSequence("AI 시스템", STAGE_TWO_DEFENSE_DIALOGUE, {
      finalButtonText: "방어 준비",
      keepCurrentBgm: true,
      onComplete: () => {
        uiModule.hideOverlay();
        playGameplayBgmForTurn(game.turn);
      },
    });
    return true;
  }

  return false;
}

function showDialogueSequence(title, lines, options = {}) {
  if (!options.keepCurrentBgm) playLobbyBgm();
  let index = 0;
  game.tutorialInputLocked = true;
  uiModule.keys.clear();

  const showLine = () => {
    const isLast = index >= lines.length - 1;
    uiModule.showOverlay({
      title,
      text: lines[index],
      speaker: getDialogueSpeaker(title),
      buttonText: isLast ? (options.finalButtonText || "확인") : "다음",
      onButton: () => {
        if (!isLast) {
          index += 1;
          showLine();
          return;
        }

        game.tutorialInputLocked = false;
        uiModule.keys.clear();
        if (typeof options.onComplete === "function") {
          options.onComplete();
        } else {
          uiModule.hideOverlay();
        }
      },
    });
  };

  showLine();
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
    const trapCount = game.placedTraps.length;
    placeTrapAtSlot(game, slot, selectedTrap, selectedRotation, flashLog);
    if (game.placedTraps.length > trapCount) playSfx("deploy", { maxDuration: 2 });
    uiModule.updateUI(game);
  }
}

function resetGame() {
  localStorage.removeItem("traceProtocolBest");
  game.stage = 1;
  game.infiniteBest = 0;
  game.lastAttackRecording = [];
  game.carriedTrapsByStage.clear();
  game.activeEffects = [];
  game.stageState = createStageState();
  game.stageLayoutSelections = {};
  game.mods = createDefaultMods();
  game.tutorialFlags = createTutorialFlags();
  game.tutorialInputLocked = false;
  setupStage();
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  uiModule.draw(game);
  requestAnimationFrame(loop);
}

uiModule.bindEvents();
uiModule.updateLaserDirection(laserRotation);
setupStage();
requestAnimationFrame(loop);
