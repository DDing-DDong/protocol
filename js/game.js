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
} from "./data.js";
import { createHacker, updateAttack, activateShield } from "./player.js";
import { initUI } from "./ui.js";
import { isAttackStage, getDefenseBudget, createPlatforms, createBaseHazards, createTrapSlots } from "./stage.js";
import { placeTrapAtSlot, undoTrap, carryDefenseTrapsToNextStage, getAllowedRotation } from "./trap.js";
import { startReplay as startReplayMode, updateDefenseReplay } from "./replay.js";

const canvas = document.getElementById("gameCanvas");
const uiModule = initUI({
  onShield: () => activateShield(game, flashLog),
  onStartReplay: () => {
    startReplayMode(game);
    uiModule.setLog("리플레이 중입니다. 해커가 이전 공격 경로를 따라갑니다.");
    uiModule.updateUI(game);
  },
  onUndoTrap: () => {
    undoTrap(game);
    uiModule.updateUI(game);
  },
  onRestart: resetGame,
  onHelp: showHelp,
  onTrapSelected: (type, wasSelected) => {
    if (type === "laser" && wasSelected) {
      selectedRotation = getAllowedRotation(type, selectedRotation + 90);
      flashLog(`레이저 회전 ${selectedRotation}도`);
      return;
    }
    selectedTrap = type;
    selectedRotation = getAllowedRotation(selectedTrap, selectedRotation);
  },
  onCanvasClick: handleCanvasClick,
  onApplyReward: applyReward,
});

const game = {
  stage: 1,
  turn: TURN.ATTACK,
  timer: 48,
  messageCooldown: 0,
  recordTimer: 0,
  replayIndex: 0,
  replayPause: 0,
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
  defenseBudget: 4,
  infiniteBest: Number(localStorage.getItem("traceProtocolBest") || 0),
  hacker: null,
  replayHacker: null,
};

let lastTime = performance.now();
let selectedTrap = "laser";
let selectedRotation = 0;

function flashLog(text) {
  if (game.messageCooldown > 0) return;
  game.messageCooldown = 0.2;
  uiModule.setLog(text);
}

function setupStage() {
  uiModule.hideOverlay();
  const isAttack = isAttackStage(game.stage);
  game.turn = isAttack ? TURN.ATTACK : TURN.DEFENSE_BUILD;
  game.timer = getStageTime(game.stage);
  game.metrics = createMetrics();
  game.recordTimer = 0;
  game.replayIndex = 0;
  game.replayPause = 0;
  game.replayFinished = false;
  game.nextEmpowerTrapIndex = 0;
  game.currentRecording = [];
  game.placedTraps = [];
  game.platforms = createPlatforms(game.stage);
  game.core = { x: CORE_X, y: 392, w: 42, h: 70 };
  game.baseHazards = createBaseHazards(game.stage, game);
  game.trapSlots = createTrapSlots(game.stage, game);

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
    game.defenseBudget = getDefenseBudget(game.stage, game);
    uiModule.setLog("방어 턴입니다. 이전 공격 경로 위에 함정을 배치하세요.");
  }

  uiModule.updateUI(game);
}

function update(dt) {
  game.messageCooldown = Math.max(0, game.messageCooldown - dt);
  if (game.turn === TURN.ATTACK) {
    updateAttack(game, dt, uiModule.keys, flashLog, endStage);
  }
  if (game.turn === TURN.DEFENSE_REPLAY) {
    updateDefenseReplay(game, dt, flashLog, endStage);
  }
  uiModule.updateUI(game);
}

function endStage(success, text) {
  if (game.turn === TURN.ENDING) return;
  const completedStage = game.stage;
  const completedTurn = game.turn;
  game.turn = TURN.ENDING;
  updateBest(completedStage, success);

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
        setupStage();
      },
    });
    return;
  }

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

  uiModule.showOverlay({
    title: "스테이지 클리어",
    text: `${text}\n보상 1개를 선택하면 다음 스테이지로 진행합니다.`,
    rewards: pickRewards(completedTurn === TURN.ATTACK ? "attack" : "defense", rewardPool),
    buttonText: "보상 없이 진행",
    onButton: () => {
      game.stage += 1;
      setupStage();
    },
    onApplyReward: applyReward,
  });
}

function applyReward(reward) {
  reward.apply(game);
  game.stage += 1;
  setupStage();
}

function updateBest(stage, success) {
  if (success && stage > game.infiniteBest) {
    game.infiniteBest = stage;
    localStorage.setItem("traceProtocolBest", String(stage));
  }
}

function showHelp() {
  if (game.turn === TURN.ENDING) {
    flashLog("결과 화면에서는 보상 카드나 진행 버튼을 선택하세요.");
    return;
  }

  uiModule.showOverlay({
    title: "조작법",
    text: "공격 턴에는 A/D 이동, Space 점프, Shift 대시, E 실드를 사용합니다. 방어 턴에는 표시된 슬롯에 함정을 배치하고 리플레이를 시작하세요.",
    buttonText: "닫기",
    onButton: uiModule.hideOverlay,
  });
}

function handleCanvasClick(pos) {
  if (game.turn !== TURN.DEFENSE_BUILD) return;
  const slot = game.trapSlots.find((s) => (
    pos.x >= s.x - 16 &&
    pos.x <= s.x + 16 &&
    pos.y >= s.y - 32 &&
    pos.y <= s.y
  ));
  if (slot) {
    placeTrapAtSlot(game, slot, selectedTrap, selectedRotation, flashLog);
    uiModule.updateUI(game);
  }
}

function resetGame() {
  localStorage.removeItem("traceProtocolBest");
  game.stage = 1;
  game.infiniteBest = 0;
  game.lastAttackRecording = [];
  game.carriedTrapsByStage.clear();
  game.mods = createDefaultMods();
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
setupStage();
requestAnimationFrame(loop);
