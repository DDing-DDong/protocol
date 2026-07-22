// ui.js
// 책임: 화면 표시와 버튼 / 캔버스 이벤트만 담당합니다.

import {
  TURN,
  getStageById,
  TRAPS,
  getObjective,
  getDefenseObjectiveItems,
  getFirewallBlockTime,
  getShockDelay,
  getShockSlowTime,
  SHOCK_SLOW_MULTIPLIER,
} from "./data.js?v=20260722-single-camera-boost";
import {
  getCameraHazardBox,
  getCameraEmpowerAssignments,
  getOrientedTrapBox,
} from "./trap.js?v=20260722-shock-tile-alignment";
import { getBgmVolume, getSfxVolume, playSfx, setBgmVolume, setSfxVolume, unlockAudio } from "./audio.js?v=20260711-dash-wav";
import { getSelectedSkin } from "./repositories/localGameRepository.js";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 540;
const VISUAL_TILE_SIZE = 48;
const VISUAL_TILE_DRAW_W = 56;
const VISUAL_SLOT_W = 44;
const VISUAL_SLOT_H = 11;
const SHOCK_TRAP_VISUAL_W = 60;
const EMP_TRAP_VISUAL_W = 48;
const TRAP_IMAGE_BASE_URL = new URL("../assets/images/traps/", import.meta.url);
const STAGE_IMAGE_BASE_URL = new URL("../assets/images/stage/", import.meta.url);
const BACKGROUND_IMAGE_BASE_URL = new URL("../assets/images/Background_image/", import.meta.url);
const ASSET_VERSION = "20260711-mobile-polish";
const TRAP_IMAGE_FILES = {
  laser: "laser.png",
  laserEmpowered: "laser-empowered.png",
  shock: "shock.png",
  shockEmpowered: "shock-empowered.png",
  camera: "camera.png",
  firewall: "firewall.png",
  firewallEmpowered: "firewall-empowered.png",
  emp: "emp.png",
  empEmpowered: "emp-empowered.png",
};
const STAGE_IMAGE_FILES = {
  tile1: "tile1.png",
  tile2: "tile2.png",
  tile3: "tile3.png",
  checkpoint1: "checkpoint-.png",
  checkpoint2: "checkpoint2-.png",
};
const STAGE_BACKGROUNDS = {
  default: "stage",
  final: "stage11",
};
const BACKGROUND_IMAGE_FILES = {
  stage: "stage.png",
  stage11: "11stage.png",
};
const GROUND_TILE_PATTERN = [
  "tile1", "tile1", "tile2", "tile1", "tile1",
  "tile2", "tile1", "tile1", "tile1", "tile2",
];
const CHECKPOINT_FRAME_SECONDS = 0.65;
const trapImages = createTrapImages();
const stageImages = createStageImages();
const backgroundImages = createBackgroundImages();
const HACKER_IMAGE_BASE_URL = new URL("../assets/images/hacker_new_frames/", import.meta.url);
const HACKER_SCRIPT_IMAGE_BASE_URL = new URL("../assets/images/hacker_script/", import.meta.url);
const AI_SCRIPT_IMAGE_BASE_URL = new URL("../assets/images/AI_script/", import.meta.url);
const AI_ANDROID_SCRIPT_IMAGE_BASE_URL = new URL("../assets/images/AI_skin1/", import.meta.url);
const GUIDE_BUBBLE_SKIP_STORAGE_KEY = "traceProtocolSkipGuideBubbles";
const AI_SCRIPT_SKINS = {
  classic: {
    imageBaseUrl: AI_SCRIPT_IMAGE_BASE_URL,
    className: "ai-skin-classic",
    files: {
      idle: "idle.gif",
      error: "error.gif",
      eyes_closed: "eyes_closed.gif",
      happy: "happy.gif",
    },
  },
  android: {
    imageBaseUrl: AI_ANDROID_SCRIPT_IMAGE_BASE_URL,
    className: "ai-skin-android",
    files: {
      idle: "ai_npc1_idle.gif",
      error: "ai_npc1_error.gif",
      eyes_closed: "ai_npc1_eye_close.png",
      happy: "ai_npc1_smile.gif",
    },
  },
};
const HACKER_ANIMATIONS = {
  idle: {
    files: createNumberedFrameFiles("idle", 8),
    frameSeconds: [0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14],
  },
  run: {
    files: createNumberedFrameFiles("run", 8),
    frameSeconds: [0.09, 0.09, 0.09, 0.09, 0.09, 0.09, 0.09, 0.09],
  },
  jumpStart: {
    files: createNumberedFrameFiles("jumpStart", 3),
    frameSeconds: [0.14, 0.11, 0.09],
  },
  jumpAir: {
    files: createNumberedFrameFiles("jumpAir", 3),
    frameSeconds: [0.11, 0.11, 0.11],
  },
  jumpLanding: {
    files: createNumberedFrameFiles("jumpLanding", 2),
    frameSeconds: [0.16, 0.22],
  },
  slide: {
    files: createNumberedFrameFiles("slide", 6),
    frameSeconds: [0.11, 0.12, 0.18, 0.18, 0.14, 0.22],
  },
  climb: {
    files: createNumberedFrameFiles("climb", 6),
    frameSeconds: [0.14, 0.14, 0.14, 0.14, 0.14, 0.14],
  },
};
const HACKING_EFFECT_DURATION = 0.84;
const HACKING_EFFECT_ANIMATION = {
  files: createNumberedFrameFiles("hacking_effect", 12),
  frameSeconds: Array.from({ length: 12 }, () => HACKING_EFFECT_DURATION / 12),
};
const HACKER_SCRIPT_IMAGE_FILES = {
  idle: "idle.png",
  happy: "happy.png",
  frown: "frown.png",
  angry: "angry.png",
  surprised: "surprised.png",
};
const AI_SCRIPT_IMAGE_FILES = {
  idle: "idle.gif",
  error: "error.gif",
  eyes_closed: "eyes_closed.gif",
  happy: "happy.gif",
};
const hackerImages = createHackerImages();
const hackingEffectImages = createFrameAnimation(HACKING_EFFECT_ANIMATION);
const hackerScriptImages = createScriptImages(HACKER_SCRIPT_IMAGE_FILES, HACKER_SCRIPT_IMAGE_BASE_URL);
const aiScriptImages = createScriptImages(AI_SCRIPT_IMAGE_FILES, AI_SCRIPT_IMAGE_BASE_URL);
const aiScriptImagesBySkin = createAiScriptImagesBySkin();
const DEFAULT_BACKGROUND_LAYERS = {
  far: ["future-city"],
  mid: ["server-rack", "cable", "security-panel"],
  front: ["large-square-tile", "platform-floor", "pipe-line", "glow-line"],
  fx: ["scan-line", "soft-glow"],
};
const VISUAL_THEMES = {
  cyan: {
    top: "#061825",
    mid: "#07111b",
    bottom: "#03080d",
    glow: "24, 224, 255",
    accent: "39, 255, 200",
    skyline: "9, 34, 50",
  },
  "blue-purple": {
    top: "#081329",
    mid: "#0c1022",
    bottom: "#05070f",
    glow: "130, 116, 255",
    accent: "24, 224, 255",
    skyline: "18, 26, 58",
  },
  "orange-red": {
    top: "#1b1010",
    mid: "#120d12",
    bottom: "#07070b",
    glow: "255, 112, 64",
    accent: "255, 204, 51",
    skyline: "54, 24, 24",
  },
  core: {
    top: "#10101d",
    mid: "#090b16",
    bottom: "#03050b",
    glow: "255, 59, 103",
    accent: "39, 255, 200",
    skyline: "42, 18, 40",
  },
};

function createTrapImages() {
  const images = {};
  for (const [key, file] of Object.entries(TRAP_IMAGE_FILES)) {
    const image = new Image();
    const url = new URL(file, TRAP_IMAGE_BASE_URL);
    url.searchParams.set("v", ASSET_VERSION);
    image.src = url.href;
    images[key] = image;
  }
  return images;
}

function createStageImages() {
  const images = {};
  for (const [key, file] of Object.entries(STAGE_IMAGE_FILES)) {
    const image = new Image();
    const url = new URL(file, STAGE_IMAGE_BASE_URL);
    url.searchParams.set("v", ASSET_VERSION);
    image.src = url.href;
    images[key] = image;
  }
  return images;
}

function createBackgroundImages() {
  const images = {};
  for (const [key, file] of Object.entries(BACKGROUND_IMAGE_FILES)) {
    const image = new Image();
    const url = new URL(file, BACKGROUND_IMAGE_BASE_URL);
    url.searchParams.set("v", ASSET_VERSION);
    image.src = url.href;
    images[key] = image;
  }
  return images;
}

function createNumberedFrameFiles(state, count) {
  return Array.from({ length: count }, (_, index) => `${state}/frame-${String(index).padStart(2, "0")}.png`);
}

function createHackerImages() {
  const animations = {};
  for (const [state, animation] of Object.entries(HACKER_ANIMATIONS)) {
    animations[state] = createFrameAnimation(animation);
  }
  return animations;
}

function createFrameAnimation(animation) {
  const frames = animation.files.map((file) => {
    const image = new Image();
    const url = new URL(file, HACKER_IMAGE_BASE_URL);
    url.searchParams.set("v", ASSET_VERSION);
    image.src = url.href;
    return image;
  });
  return {
    frames,
    frameSeconds: animation.frameSeconds,
    totalSeconds: animation.frameSeconds.reduce((sum, seconds) => sum + seconds, 0),
  };
}

function createScriptImages(filesByKey, baseUrl) {
  const images = {};
  for (const [key, file] of Object.entries(filesByKey)) {
    const image = new Image();
    const url = new URL(file, baseUrl);
    url.searchParams.set("v", ASSET_VERSION);
    image.src = url.href;
    images[key] = image;
  }
  return images;
}

function createAiScriptImagesBySkin() {
  const skins = {};
  for (const [skinId, skin] of Object.entries(AI_SCRIPT_SKINS)) {
    skins[skinId] = createScriptImages(skin.files, skin.imageBaseUrl);
  }
  return skins;
}

function getSelectedAiSkin() {
  const stored = getSelectedSkin();
  return AI_SCRIPT_SKINS[stored] ? stored : "classic";
}

function shouldSkipGuideBubbles() {
  return localStorage.getItem(GUIDE_BUBBLE_SKIP_STORAGE_KEY) === "true";
}

function setGuideBubbleSkipEnabled(enabled) {
  localStorage.setItem(GUIDE_BUBBLE_SKIP_STORAGE_KEY, enabled ? "true" : "false");
}

function isImageReady(image) {
  return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

function isImageLoading(image) {
  return Boolean(image && !image.complete);
}

function getTrapImageAspect(type) {
  const image = trapImages[type];
  if (!isImageReady(image)) return 1;
  return image.naturalWidth / image.naturalHeight;
}

export function initUI(callbacks) {
  const canvas = document.getElementById("gameCanvas");
  const ui = {
    stageLabel: document.getElementById("stageLabel"),
    turnLabel: document.getElementById("turnLabel"),
    objectiveLabel: document.getElementById("objectiveLabel"),
    statusBar: document.querySelector(".in-game-status"),
    timerLabel: document.getElementById("timerLabel"),
    hpLabel: document.getElementById("hpLabel"),
    energyLabel: document.getElementById("energyLabel"),
    hpBar: document.getElementById("hpBar"),
    energyBar: document.getElementById("energyBar"),
    empowerPreview: document.getElementById("empowerPreview"),
    objectiveHud: document.getElementById("objectiveHud"),
    objectiveToggle: document.getElementById("objectiveToggle"),
    objectivePanel: document.getElementById("objectivePanel"),
    trapToolsToggle: document.getElementById("trapToolsToggle"),
    trapToolsPanel: document.getElementById("trapToolsPanel"),
    budgetLabel: document.getElementById("budgetLabel"),
    defenseTools: document.getElementById("defenseTools"),
    logText: document.getElementById("logText"),
    overlay: document.getElementById("overlay"),
    overlayCard: document.querySelector("#overlay .overlay-card"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayButton: document.getElementById("overlayButton"),
    rewardList: document.getElementById("rewardList"),
    startReplayBtn: document.getElementById("startReplayBtn"),
    deleteTrapBtn: document.getElementById("deleteTrapBtn"),
    pauseAttackBtn: document.getElementById("pauseAttackBtn"),
    restartBtn: document.getElementById("restartBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    settingsPanel: document.getElementById("settingsPanel"),
    bgmVolume: document.getElementById("bgmVolume"),
    sfxVolume: document.getElementById("sfxVolume"),
    guideBubbleSkipToggle: document.getElementById("guideBubbleSkipToggle"),
    helpBtn: document.getElementById("helpBtn"),
    lobbyBtn: document.getElementById("lobbyBtn"),
  };
  prepareStatusBar(ui);
  prepareAttackSkillPanel(ui, canvas);
  prepareMobileControls(ui, canvas);

  let overlayAction = null;
  let overlayTyping = null;
  let guideBubble = null;
  let guideBubbleInputLocked = false;
  let guideBubbleSequenceSkip = null;
  let pendingEmpowerPreviewGuide = false;
  let empowerPreviewGuideShown = false;
  let pendingLaserRotateGuideTarget = null;
  let objectivePanelOpen = true;
  let trapToolsPanelOpen = true;
  let defenseObjectiveWasVisible = false;
  let defenseToolsWereVisible = false;
  let reopenTrapToolsAfterMapAction = false;
  let reopenTrapToolsTimer = null;
  let selectedTrapPreview = null;
  let pointerTrapPreviewPos = null;
  let attackSkillsPanelOpen = false;
  let settingsPanelOpen = false;
  const keys = new Set();
  const attackResumeKeys = new Set([
    "Space",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ShiftLeft",
    "ShiftRight",
  ]);

  function setLog(text) {
    ui.logText.textContent = text;
  }

  function syncVolumeInputs() {
    if (ui.bgmVolume) ui.bgmVolume.value = String(Math.round(getBgmVolume() * 100));
    if (ui.sfxVolume) ui.sfxVolume.value = String(Math.round(getSfxVolume() * 100));
  }

  function syncGuideBubbleSkipToggle() {
    if (ui.guideBubbleSkipToggle) {
      ui.guideBubbleSkipToggle.checked = shouldSkipGuideBubbles();
    }
  }

  function applyGuideBubbleSkipSetting(enabled) {
    setGuideBubbleSkipEnabled(enabled);
    syncGuideBubbleSkipToggle();
    callbacks.onGuideBubbleSkipChanged?.(enabled);
    if (!enabled) return;

    pendingEmpowerPreviewGuide = false;
    if (typeof guideBubbleSequenceSkip === "function") {
      guideBubbleSequenceSkip();
      return;
    }

    hideGuideBubble();
  }

  function setSettingsPanelOpen(open) {
    settingsPanelOpen = Boolean(open);
    ui.settingsBtn?.setAttribute("aria-expanded", settingsPanelOpen ? "true" : "false");
    ui.settingsPanel?.classList.toggle("hidden", !settingsPanelOpen);
    document.dispatchEvent(new CustomEvent("protocol:settings-panel-toggle", {
      detail: { open: settingsPanelOpen },
    }));
  }

  function prepareStatusBar(ui) {
    const statusBar = document.querySelector(".in-game-status");
    const canvasPanel = document.querySelector(".canvas-panel");
    if (!statusBar) return;

    statusBar.querySelectorAll(".stat-stage, .stat-turn, .stat-objective")
      .forEach((node) => node.remove());

    if (!ui.logText || ui.logText.closest(".status-log")) return;

    const oldLogPanel = ui.logText.closest(".panel-block");
    const logBox = document.createElement("div");
    logBox.className = "status-log";
    logBox.append(ui.logText);

    (canvasPanel || statusBar).append(logBox);
    oldLogPanel?.remove();
  }

  function prepareAttackSkillPanel(ui, canvas) {
    const hud = document.createElement("div");
    hud.id = "attackSkills";
    hud.className = "attack-skills-hud hidden";

    const toggle = document.createElement("button");
    toggle.id = "attackSkillsToggle";
    toggle.className = "attack-skills-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "스킬 정보";

    const panel = document.createElement("div");
    panel.id = "attackSkillsPanel";
    panel.className = "attack-skills-panel hidden";
    panel.setAttribute("aria-label", "공격 스킬 정보");

    panel.innerHTML = `
      <h2>스킬 정보</h2>
      <div class="skill-info-grid">
        <div class="skill-info-row">
          <strong>대시</strong>
          <span class="keycap">SHIFT</span>
          <span class="skill-targets">감전패널 · EMP <em>통과</em></span>
          <span class="skill-effect">대시 거리 : 53</span>
        </div>
        <div class="skill-info-row">
          <strong>해킹</strong>
          <span class="keycap">SPACE BAR</span>
          <span class="skill-targets">레이저 · 카메라 <em>무력화</em></span>
          <span class="skill-effect">지속 시간 : 1초</span>
        </div>
      </div>
    `;

    hud.append(toggle, panel);
    canvas.parentElement?.appendChild(hud);
    ui.attackSkills = hud;
    ui.attackSkillsToggle = toggle;
    ui.attackSkillsPanel = panel;
  }

  function prepareMobileControls(ui, canvas) {
    const controls = document.createElement("div");
    controls.id = "mobileControls";
    controls.className = "mobile-controls";
    controls.setAttribute("aria-label", "모바일 조작 버튼");

    controls.innerHTML = `
      <div class="mobile-action-pad" aria-label="스킬 버튼">
        <button class="mobile-control-btn mobile-action-btn" type="button" data-code="ArrowUp" aria-label="점프">점프</button>
        <button class="mobile-control-btn mobile-action-btn" type="button" data-code="ShiftLeft" aria-label="대시">대시</button>
        <button class="mobile-control-btn mobile-action-btn" type="button" data-code="Space" aria-label="해킹">해킹</button>
      </div>
      <div class="mobile-dpad" aria-label="이동 버튼">
        <button class="mobile-control-btn mobile-dpad-btn mobile-dpad-left" type="button" data-code="ArrowLeft" aria-label="왼쪽 이동">&lt;</button>
        <button class="mobile-control-btn mobile-dpad-btn mobile-dpad-right" type="button" data-code="ArrowRight" aria-label="오른쪽 이동">&gt;</button>
      </div>
    `;

    canvas.parentElement?.appendChild(controls);
    ui.mobileControls = controls;
  }

  function showOverlay({
    title,
    text,
    rewards = [],
    choices = [],
    buttonText = "확인",
    onButton,
    speaker = "",
    portrait = "",
    advanceOnCardClick = false,
    lockRecommendedReward = false,
    onSkip,
    rewardSkipButtonText = "",
    onRewardSkip,
    selectedReward = null,
    onRewardSelected,
  }) {
    stopOverlayTyping();
    overlayAction = typeof onButton === "function" ? onButton : hideOverlay;
    ui.overlay.classList.remove("hidden");
    ui.overlay.classList.remove("speaker-ai", "speaker-hacker", "dialogue-overlay", "reward-select-overlay");
    ui.overlayCard?.classList.remove("has-portrait", "click-advances", "typing");
    resetRewardActions();
    setOverlaySkip(null);
    if (speaker) ui.overlay.classList.add(`speaker-${speaker}`);
    if (!speaker && rewards.length > 0) ui.overlay.classList.add("reward-select-overlay");
    if (advanceOnCardClick) {
      ui.overlay.classList.add("dialogue-overlay");
      ui.overlayCard?.classList.add("click-advances");
      setOverlaySkip(onSkip);
    }
    ui.overlayTitle.textContent = title;
    setOverlayText(text, { typewriter: advanceOnCardClick });
    ui.overlayButton.textContent = buttonText;
    ui.overlayButton.classList.toggle("hidden", choices.length > 0);
    ui.rewardList.innerHTML = "";
    setOverlayPortrait(portrait, speaker);

    let selectedRewardIndex = getInitialSelectedRewardIndex(rewards, selectedReward);
    const rewardButtons = [];

    if (rewards.length > 0) {
      const actions = document.createElement("div");

      actions.className = "reward-actions";
      ui.overlayButton.classList.add("reward-primary-button");
      ui.overlayCard?.insertBefore(actions, ui.overlayButton);

      if (rewardSkipButtonText && typeof onRewardSkip === "function") {
        const skipButton = document.createElement("button");
        const skipDisabled = Boolean(lockRecommendedReward);

        skipButton.type = "button";
        skipButton.className = "reward-skip-button";
        skipButton.textContent = rewardSkipButtonText;
        skipButton.disabled = skipDisabled;
        skipButton.setAttribute("aria-disabled", skipDisabled ? "true" : "false");
        if (!skipDisabled) {
          skipButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onRewardSkip();
          });
        }

        actions.appendChild(skipButton);
      }

      actions.appendChild(ui.overlayButton);
    }

    for (const [index, reward] of rewards.entries()) {
      const locked = Boolean(lockRecommendedReward && !reward.recommended);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.disabled = locked;
      btn.setAttribute("aria-disabled", locked ? "true" : "false");
      if (!locked) {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          selectedRewardIndex = index;
          updateRewardSelection();
          if (typeof onRewardSelected === "function") onRewardSelected(reward);
        });
      }
      rewardButtons.push({ btn, reward, locked });
      ui.rewardList.appendChild(btn);
    }
    updateRewardSelection();

    for (const choice of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reward-card choice-card";
      btn.innerHTML = `<strong>${escapeHTML(choice.name)}</strong><span>${escapeHTML(choice.desc || "")}</span>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof choice.onSelect === "function") choice.onSelect();
      });
      ui.rewardList.appendChild(btn);
    }

    function updateRewardSelection() {
      for (const [index, entry] of rewardButtons.entries()) {
        const selected = index === selectedRewardIndex;
        entry.btn.className = `reward-card${entry.reward.recommended ? " recommended" : ""}${selected ? " selected" : ""}${entry.locked ? " disabled" : ""}`;
        entry.btn.setAttribute("aria-pressed", selected ? "true" : "false");
        entry.btn.innerHTML = selected
          ? `<strong>${escapeHTML(entry.reward.name)} <em class="reward-badge">선택됨</em></strong><span>${escapeHTML(entry.reward.desc)}</span>`
          : `<strong>${escapeHTML(entry.reward.name)}</strong><span>${escapeHTML(entry.reward.desc)}</span>`;
      }
    }
  }

  function getInitialSelectedRewardIndex(rewards, selectedReward) {
    if (!rewards.length) return -1;
    const selectedIndex = selectedReward
      ? rewards.findIndex((reward) => reward === selectedReward || (reward.id && reward.id === selectedReward.id))
      : -1;
    if (selectedIndex >= 0) return selectedIndex;

    const recommendedIndex = rewards.findIndex((reward) => reward.recommended);
    return recommendedIndex >= 0 ? recommendedIndex : 0;
  }

  function hideOverlay() {
    stopOverlayTyping();
    ui.overlay.classList.add("hidden");
    ui.overlay.classList.remove("speaker-ai", "speaker-hacker", "dialogue-overlay", "reward-select-overlay");
    ui.overlayCard?.classList.remove("has-portrait", "click-advances");
    resetRewardActions();
    setOverlaySkip(null);
    setOverlayPortrait("");
    ui.rewardList.innerHTML = "";
    ui.overlayButton.classList.remove("hidden");
    overlayAction = null;
  }

  function resetRewardActions() {
    const actions = ui.overlayCard?.querySelector(".reward-actions");
    if (!actions) {
      ui.overlayButton.classList.remove("reward-primary-button");
      return;
    }

    if (actions.contains(ui.overlayButton)) {
      ui.overlayCard?.insertBefore(ui.overlayButton, actions);
    }
    actions.remove();
    ui.overlayButton.classList.remove("reward-primary-button");
  }

  function runOverlayAction() {
    if (finishOverlayTyping()) return;

    const action = overlayAction;

    if (typeof action === "function") {
      action();
    } else {
      hideOverlay();
    }
  }

  function setOverlayText(text, { typewriter = false } = {}) {
    if (!typewriter) {
      ui.overlayText.textContent = text;
      return;
    }

    const fullText = String(text || "");
    ui.overlayText.textContent = "";
    ui.overlayCard?.classList.add("typing");
    overlayTyping = {
      fullText,
      index: 0,
      done: false,
      timer: window.setInterval(() => {
        if (!overlayTyping) return;
        overlayTyping.index = Math.min(overlayTyping.fullText.length, overlayTyping.index + 1);
        ui.overlayText.textContent = overlayTyping.fullText.slice(0, overlayTyping.index);
        if (overlayTyping.index >= overlayTyping.fullText.length) finishOverlayTyping({ keepAction: true });
      }, 18),
    };
  }

  function finishOverlayTyping({ keepAction = false } = {}) {
    if (!overlayTyping || overlayTyping.done) return false;

    window.clearInterval(overlayTyping.timer);
    ui.overlayText.textContent = overlayTyping.fullText;
    ui.overlayCard?.classList.remove("typing");
    overlayTyping.done = true;
    if (!keepAction) overlayTyping = null;
    return true;
  }

  function stopOverlayTyping() {
    if (!overlayTyping) return;
    window.clearInterval(overlayTyping.timer);
    overlayTyping = null;
    ui.overlayCard?.classList.remove("typing");
  }

  function setOverlayPortrait(portrait, speaker = "") {
    ui.overlayCard?.querySelector(".dialogue-portrait")?.remove();
    if (!portrait || !ui.overlayCard) return;

    const isAi = speaker === "ai";
    const aiSkinId = getSelectedAiSkin();
    const aiSkin = AI_SCRIPT_SKINS[aiSkinId] || AI_SCRIPT_SKINS.classic;
    const images = isAi
      ? (aiScriptImagesBySkin[aiSkinId] || aiScriptImagesBySkin.classic || aiScriptImages)
      : hackerScriptImages;
    const baseUrl = isAi ? aiSkin.imageBaseUrl : HACKER_SCRIPT_IMAGE_BASE_URL;
    const image = images[portrait] || images.idle;
    const frame = document.createElement("div");
    frame.className = `dialogue-portrait ${isAi ? `dialogue-portrait-ai ${aiSkin.className}` : "dialogue-portrait-hacker"}`;
    if (isAi) frame.dataset.skin = aiSkinId;
    frame.setAttribute("aria-hidden", "true");

    const img = document.createElement("img");
    img.alt = "";
    img.src = image?.src || new URL(isAi ? aiSkin.files.idle : "idle.png", baseUrl).href;
    frame.appendChild(img);
    ui.overlayCard.prepend(frame);
    ui.overlayCard.classList.add("has-portrait");
  }

  function setOverlaySkip(onSkip) {
    ui.overlay.querySelector(".dialogue-skip-btn")?.remove();
    if (typeof onSkip !== "function") return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dialogue-skip-btn";
    button.textContent = "SKIP>>";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      stopOverlayTyping();
      onSkip();
    });
    (ui.overlayCard || ui.overlay).appendChild(button);
  }

  function updateUI(game) {
    ui.stageLabel.textContent = String(game.stage);
    ui.turnLabel.textContent = getTurnLabel(game.turn);
    ui.objectiveLabel.textContent = getObjectiveDisplayText(game);
    ui.timerLabel.textContent = game.turn === TURN.ATTACK ? game.timer.toFixed(1) : "-";
    ui.timerLabel.closest(".play-timer")?.classList.toggle("hidden", game.turn !== TURN.ATTACK);
    const isDefenseTurn = game.turn === TURN.DEFENSE_BUILD || game.turn === TURN.DEFENSE_REPLAY;
    ui.statusBar?.classList.toggle("hidden", isDefenseTurn);

    if (game.hacker) {
      ui.hpLabel.textContent = `${game.hacker.hp} / ${game.hacker.maxHp}`;
      ui.energyLabel.textContent = `${Math.floor(game.hacker.energy)} / ${game.hacker.maxEnergy}`;
      ui.hpBar.style.width = `${(game.hacker.hp / game.hacker.maxHp) * 100}%`;
      ui.energyBar.style.width = `${(game.hacker.energy / game.hacker.maxEnergy) * 100}%`;
    } else {
      ui.hpLabel.textContent = game.replayHacker ? `${Math.max(0, game.replayHacker.hp)} / 3` : "-";
      ui.energyLabel.textContent = "-";
      ui.hpBar.style.width = game.replayHacker ? `${Math.max(0, Math.min(game.replayHacker.hp / 3, 1)) * 100}%` : "0%";
      ui.energyBar.style.width = "0%";
    }

    ui.budgetLabel.textContent = game.turn === TURN.DEFENSE_BUILD
      ? String(game.defenseBudget)
      : game.turn === TURN.DEFENSE_REPLAY ? "리플레이 중" : "-";
    const showDefenseTools = game.turn === TURN.DEFENSE_BUILD;
    if (showDefenseTools && !defenseToolsWereVisible) trapToolsPanelOpen = true;
    defenseToolsWereVisible = showDefenseTools;
    if (!showDefenseTools) {
      trapToolsPanelOpen = false;
      reopenTrapToolsAfterMapAction = false;
      clearTrapToolsReopenTimer();
      selectedTrapPreview = null;
      pointerTrapPreviewPos = null;
    }
    ui.defenseTools?.classList.toggle("hidden", !showDefenseTools);
    ui.trapToolsToggle?.setAttribute("aria-expanded", showDefenseTools && trapToolsPanelOpen ? "true" : "false");
    ui.trapToolsPanel?.classList.toggle("hidden", !showDefenseTools || !trapToolsPanelOpen);
    const showAttackSkills = game.turn === TURN.ATTACK;
    if (!showAttackSkills) attackSkillsPanelOpen = false;
    ui.attackSkills?.classList.toggle("hidden", !showAttackSkills);
    ui.mobileControls?.classList.toggle("hidden", !showAttackSkills);
    if (!showAttackSkills) clearMobileControlKeys();
    ui.attackSkillsToggle?.setAttribute("aria-expanded", showAttackSkills && attackSkillsPanelOpen ? "true" : "false");
    ui.attackSkillsPanel?.classList.toggle("hidden", !showAttackSkills || !attackSkillsPanelOpen);
    ui.startReplayBtn.disabled = game.turn !== TURN.DEFENSE_BUILD;
    ui.deleteTrapBtn.disabled = game.turn !== TURN.DEFENSE_BUILD;
    ui.pauseAttackBtn.disabled = game.turn !== TURN.ATTACK;
    ui.pauseAttackBtn.textContent = game.attackPaused ? "재개" : "일시정지";
    ui.pauseAttackBtn.setAttribute("aria-pressed", game.attackPaused ? "true" : "false");
    ui.pauseAttackBtn.classList.toggle("active", Boolean(game.attackPaused));
    setDeleteMode(Boolean(game.deleteMode && game.turn === TURN.DEFENSE_BUILD));
    ui.helpBtn.disabled = game.turn === TURN.ENDING;
    if (ui.lobbyBtn) ui.lobbyBtn.disabled = false;
    updateEmpowerPreview(game);
    updateDefenseObjectiveHUD(game);
    updateTrapTooltips(game);
  }

  function setDeleteMode(active) {
    if (!ui.deleteTrapBtn) return;
    ui.deleteTrapBtn.classList.toggle("selected", Boolean(active));
    ui.deleteTrapBtn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function getTurnLabel(turn) {
    if (turn === TURN.ATTACK) return "해커 공격";
    if (turn === TURN.DEFENSE_BUILD) return "AI 방어 준비";
    if (turn === TURN.DEFENSE_REPLAY) return "AI 방어 리플레이";
    return "결과";
  }

  function getObjectiveDisplayText(game) {
    const hasDefenseObjectives = getDefenseObjectiveItems(game).length > 0;
    const isDefenseView = game.turn === TURN.DEFENSE_BUILD ||
      game.turn === TURN.DEFENSE_REPLAY ||
      game.showFailedDefenseLayout;

    if (hasDefenseObjectives && isDefenseView) {
      return "아래 필수 조건을 모두 달성해 보안을 강화";
    }

    return getObjective(game.stage);
  }

  function updateTrapTooltips(game) {
    const laserBtn = ui.defenseTools?.querySelector('[data-trap="laser"]');
    if (laserBtn) {
      laserBtn.dataset.tooltip = [
        "[공격턴]",
        "해킹해 무력화합니다.",
        "",
        "[수비턴]",
        "레이저로 해커를 탐지합니다.",
        "작동 시: 탐지 +1",
        "",
        "설치한 칸을 다시 누르면 회전합니다.",
      ].join("\n");
    }

    const shockBtn = ui.defenseTools?.querySelector('[data-trap="shock"]');
    if (shockBtn) {
      shockBtn.dataset.tooltip = [
        "[공격턴]",
        `감전되어 ${formatSeconds(getShockSlowTime(null, game))}간 이동속도가 감소합니다.`,
        "",
        "[수비턴]",
        `감전패널 1회 작동: 해커 ${formatSeconds(getShockDelay(null, game))} 지연`,
        `이동속도 -${formatPercent(1 - SHOCK_SLOW_MULTIPLIER)}`,
      ].join("\n");
    }

    const cameraBtn = ui.defenseTools?.querySelector('[data-trap="camera"]');
    if (cameraBtn) {
      cameraBtn.dataset.tooltip = [
        "[공격턴]",
        "해킹해 무력화합니다.",
        "",
        "[수비턴]",
        "카메라로 해커를 탐지합니다.",
        "설치된 순서대로 레이저 또는 방화벽 1개를 강화합니다.",
        "",
        "레이저: 탐지+1, 방화벽: 경로 차단",
      ].join("\n");
    }

    const firewallBtn = ui.defenseTools?.querySelector('[data-trap="firewall"]');
    if (firewallBtn) {
      firewallBtn.dataset.tooltip = [
        "[공격턴]",
        "강화된 방화벽이 경로를 차단합니다.",
        "",
        "[수비턴]",
        "카메라 탐지 후 방화벽이 닫혀 경로를 차단합니다.",
        `작동 시: ${formatSeconds(getFirewallBlockTime(game))} 차단`,
      ].join("\n");
    }

    const empBtn = ui.defenseTools?.querySelector('[data-trap="emp"]');
    if (empBtn) {
      empBtn.dataset.tooltip = [
        "[공격턴]",
        "슬라이딩으로 회피할 수 있습니다.",
        "",
        "[수비턴]",
        "EMP패널로 해커의 에너지를 흡수합니다.",
        "작동 시: 에너지 20 흡수",
      ].join("\n");
    }
  }

  function updateLaserDirection(rotation) {
    const laserBtn = ui.defenseTools?.querySelector('[data-trap="laser"]');
    const direction = laserBtn?.querySelector(".laser-direction");
    if (!direction) return;

    const normalized = ((Math.round((Number(rotation) || 0) / 90) * 90) % 360 + 360) % 360;
    const arrowByRotation = {
      0: "→",
      90: "↑",
      180: "←",
      270: "↓",
    };
    direction.textContent = arrowByRotation[normalized] || "↑";
    laserBtn.setAttribute("aria-label", `레이저 ${direction.textContent} 방향`);
  }

  function createTrapIcon(type, extraClass = "") {
    const icon = document.createElement("span");
    icon.className = `empower-icon empower-icon-${type}${extraClass ? ` ${extraClass}` : ""}`;
    icon.style.setProperty("--trap-color", TRAPS[type].color);

    const glyph = document.createElement("span");
    glyph.className = "empower-glyph";
    glyph.setAttribute("aria-hidden", "true");
    icon.appendChild(glyph);
    return icon;
  }

  function initializeTrapButtonIcons() {
    for (const btn of document.querySelectorAll(".trap-btn")) {
      const type = btn.dataset.trap;
      if (!TRAPS[type]) continue;

      const cost = btn.querySelector("small")?.cloneNode(true);
      const label = document.createElement("span");
      label.className = "trap-label";

      const icon = createTrapIcon(type, "trap-button-icon");
      icon.setAttribute("aria-hidden", "true");
      label.appendChild(icon);

      if (type === "laser") {
        const direction = document.createElement("span");
        direction.className = "laser-direction";
        direction.setAttribute("aria-hidden", "true");
        direction.textContent = "↑";
        label.appendChild(direction);
      }

      const name = document.createElement("span");
      name.className = "trap-name";
      name.textContent = TRAPS[type].name;
      label.appendChild(name);

      const roleTag = document.createElement("span");
      roleTag.className = "trap-role-tag";
      roleTag.textContent = TRAPS[type].role || "방어";
      roleTag.title = `핵심 역할: ${TRAPS[type].role || "방어"}`;
      label.appendChild(roleTag);

      const meta = document.createElement("span");
      meta.className = "trap-meta";
      if (TRAPS[type].placementNote) {
        const condition = document.createElement("span");
        condition.className = "trap-condition";
        condition.textContent = TRAPS[type].placementNote;
        meta.appendChild(condition);
        btn.classList.add("has-trap-condition");
      }

      btn.replaceChildren(label);
      if (cost) meta.appendChild(cost);
      btn.appendChild(meta);
    }
  }

  function updateEmpowerPreview(game) {
    if (!ui.empowerPreview) return;

    ui.empowerPreview.replaceChildren();
    const assignments = game.turn === TURN.DEFENSE_BUILD
      ? getCameraEmpowerAssignments(game, game.placedTraps)
      : [];
    if (assignments.length === 0) {
      ui.empowerPreview.classList.add("hidden");
      return;
    }

    const label = document.createElement("span");
    label.className = "empower-preview-label";
    label.textContent = "다음 강화";

    const icons = document.createElement("span");
    icons.className = "empower-icons";
    const targets = assignments.flatMap((assignment) => assignment.targets);
    if (targets.length > 0) {
      for (const target of targets) {
        const icon = createTrapIcon(target.type);
        icon.tabIndex = 0;
        icon.dataset.tooltip = `${TRAPS[target.type].name} · 설치 순서에 따라 카메라 강화 예정`;
        icons.appendChild(icon);
      }
    }

    const summary = document.createElement("span");
    summary.className = "empower-summary";
    summary.textContent = targets.length > 0
      ? targets.map((target) => TRAPS[target.type].name).join(" → ")
      : "레이저 또는 방화벽 대기 중";

    ui.empowerPreview.append(label, icons, summary);
    ui.empowerPreview.classList.remove("hidden");
    maybeShowPendingEmpowerPreviewGuide();
  }

  function updateDefenseObjectiveHUD(game) {
    if (!ui.objectiveHud || !ui.objectiveToggle || !ui.objectivePanel) return;

    const items = getDefenseObjectiveItems(game);
    const visible = items.length > 0 && (
      game.turn === TURN.DEFENSE_BUILD || game.turn === TURN.DEFENSE_REPLAY
    );

    if (!visible) {
      objectivePanelOpen = false;
      defenseObjectiveWasVisible = false;
      ui.objectiveHud.classList.add("hidden");
      ui.objectivePanel.classList.add("hidden");
      ui.objectiveToggle.setAttribute("aria-expanded", "false");
      return;
    }

    if (!defenseObjectiveWasVisible) objectivePanelOpen = true;
    defenseObjectiveWasVisible = true;
    const completed = items.filter((item) => item.complete).length;
    ui.objectiveHud.classList.remove("hidden");
    ui.objectiveToggle.textContent = `필수 목표 ${completed}/${items.length} 완료`;
    ui.objectiveToggle.setAttribute("aria-expanded", objectivePanelOpen ? "true" : "false");
    ui.objectivePanel.classList.toggle("hidden", !objectivePanelOpen);
    ui.objectivePanel.replaceChildren();

    const title = document.createElement("div");
    title.className = "objective-panel-title";
    title.textContent = "수비 목표 · 모든 조건 필수";
    ui.objectivePanel.appendChild(title);

    const requiredNote = document.createElement("p");
    requiredNote.className = "objective-required-note";
    requiredNote.textContent = "아래 필수 조건을 모두 달성하세요.";
    ui.objectivePanel.appendChild(requiredNote);

    const retryNote = document.createElement("p");
    retryNote.className = "objective-retry-note";
    retryNote.textContent = "실패하면 같은 스테이지를 재도전하며 이전 배치는 유지됩니다.";
    ui.objectivePanel.appendChild(retryNote);

    const list = document.createElement("div");
    list.className = "objective-checklist";

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "objective-check-row";
      row.dataset.objectiveId = item.id;
      row.classList.toggle("complete", item.complete);

      const box = document.createElement("span");
      box.className = "objective-check-box";
      box.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "objective-check-label";
      label.textContent = item.label;

      const progress = document.createElement("span");
      progress.className = "objective-check-progress";
      progress.textContent = item.progress;

      row.append(box, label, progress);
      list.appendChild(row);
    }

    ui.objectivePanel.appendChild(list);
  }

  function showDefenseGuideBubbles({ blockedSlot = null, onComplete } = {}) {
    openObjectivePanel();
    openTrapToolsPanel();
    const steps = [
      {
        target: () => blockedSlot ? createCanvasPointGuideTarget(blockedSlot.x, blockedSlot.y - 8) : null,
        text: "기존 함정이 있는 위치에는 중복해서 설치할 수 없습니다.",
      },
      {
        target: () => ui.objectiveToggle,
        text: "해당 스테이지의 수비 목표를 확인하십시오.",
      },
      {
        target: () => ui.trapToolsToggle,
        text: "함정배치 버튼을 눌러 현재 가진 함정 토큰과 설치할 수 있는 함정을 확인하십시오.",
      },
      {
        before: openTrapToolsPanel,
        target: () => ui.defenseTools?.querySelector('[data-trap="shock"] .trap-button-icon') ||
          ui.defenseTools?.querySelector('[data-trap="shock"]'),
        text: "[공격턴] 감전패널은 해커의 이동속도를 감소시킵니다.",
      },
      {
        target: () => ui.defenseTools?.querySelector('[data-trap="shock"] .trap-button-icon') ||
          ui.defenseTools?.querySelector('[data-trap="shock"]'),
        text: "[수비턴] 감전패널은 해커에게 실제로 닿아야 지연 조건이 완료됩니다.",
      },
      {
        target: () => ui.defenseTools?.querySelector('[data-trap="emp"] .trap-button-icon') ||
          ui.defenseTools?.querySelector('[data-trap="emp"]'),
        text: "EMP패널은 해커에게 실제로 작동해야 에너지를 흡수합니다.",
      },
    ];

    showGuideBubbleSequence(steps, onComplete);
  }

  function showReplayStartGuideBubble() {
    if (shouldSkipGuideBubbles()) return;
    if (!ui.startReplayBtn) return;
    showGuideBubble(
      ui.startReplayBtn,
      "함정을 배치한 뒤 리플레이를 시작하세요. 배치 후 실제로 작동시켜야 하며, 표시된 필수 조건을 모두 달성해야 수비에 성공합니다.",
      null,
      { blockTargetActivation: true }
    );
  }

  function showStageFourGuideBubbles({ onComplete } = {}) {
    closeDefenseGuidePanels();
    const steps = [
      {
        target: () => ui.objectiveToggle,
        text: "수비 목표를 확인합시다.",
      },
      {
        before: openObjectivePanel,
        target: () => ui.objectivePanel?.querySelector('[data-objective-id="delay"]') || ui.objectiveToggle,
        text: "다량의 지연시간이 필요합니다.",
      },
      {
        target: () => ui.trapToolsToggle,
        text: "방화벽을 사용해봅시다.",
      },
      {
        before: openTrapToolsPanel,
        target: () => ui.defenseTools?.querySelector('[data-trap="firewall"] .trap-button-icon') ||
          ui.defenseTools?.querySelector('[data-trap="firewall"]'),
        text: "방화벽은 카메라 탐지 전에는 열려 있고, 탐지 후에만 닫혀 경로를 차단합니다.",
      },
      {
        target: () => ui.defenseTools?.querySelector('[data-trap="camera"] .trap-button-icon') ||
          ui.defenseTools?.querySelector('[data-trap="camera"]'),
        text: "카메라로 먼저 해커를 탐지한 뒤 방화벽이 실제로 작동하도록 배치하세요.",
      },
      {
        target: () => ui.defenseTools?.querySelector('[data-trap="laser"] .trap-button-icon') ||
          ui.defenseTools?.querySelector('[data-trap="laser"]'),
        text: "레이저는 방향을 맞춰 해커를 실제로 탐지해야 조건이 완료됩니다.",
      },
      {
        target: () => ui.defenseTools?.querySelector('[data-trap="laser"] .trap-button-icon') ||
          ui.defenseTools?.querySelector('[data-trap="laser"]'),
        text: "레이저를 설치한 칸을 다시 누르면 레이저를 회전할 수 있습니다.",
      },
      {
        target: () => ui.defenseTools?.querySelector('[data-trap="laser"] .trap-button-icon') ||
          ui.defenseTools?.querySelector('[data-trap="laser"]'),
        text: "이제 지속적으로 보안을 강화하며, 해커를 차단해봅시다.",
      },
    ];

    showGuideBubbleSequence(steps, () => {
      queueEmpowerPreviewGuideBubbles();
      if (typeof onComplete === "function") onComplete();
    });
  }

  function queueEmpowerPreviewGuideBubbles() {
    if (shouldSkipGuideBubbles()) return;
    pendingEmpowerPreviewGuide = true;
    empowerPreviewGuideShown = false;
    maybeShowPendingEmpowerPreviewGuide();
  }

  function maybeShowPendingEmpowerPreviewGuide() {
    if (shouldSkipGuideBubbles()) {
      pendingEmpowerPreviewGuide = false;
      return;
    }

    if (!pendingEmpowerPreviewGuide || empowerPreviewGuideShown) return;
    if (!ui.empowerPreview || ui.empowerPreview.classList.contains("hidden")) return;

    pendingEmpowerPreviewGuide = false;
    empowerPreviewGuideShown = true;
    showGuideBubbleSequence([
      {
        target: () => ui.empowerPreview,
        text: "카메라는 함정을 설치한 순서대로 강화시킵니다.",
      },
      {
        target: () => ui.empowerPreview,
        text: "해당 함정은 현재 스테이지에 처음으로 추가된 함정으로,\n\n카메라가 해커를 탐지할 시 강화될 함정입니다.",
      },
    ]);
  }

  function showGuideBubbleSequence(steps, onComplete, index = 0) {
    if (shouldSkipGuideBubbles()) {
      hideGuideBubble();
      guideBubbleSequenceSkip = null;
      if (typeof onComplete === "function") onComplete();
      return;
    }

    if (!Array.isArray(steps) || index >= steps.length) {
      hideGuideBubble();
      guideBubbleSequenceSkip = null;
      if (typeof onComplete === "function") onComplete();
      maybeShowPendingLaserRotateGuide();
      return;
    }

    guideBubbleSequenceSkip = () => {
      hideGuideBubble();
      guideBubbleSequenceSkip = null;
      if (typeof onComplete === "function") onComplete();
      maybeShowPendingLaserRotateGuide();
    };

    const step = steps[index];
    step.before?.();
    window.requestAnimationFrame(() => {
      const target = step.target?.();
      if (!target) {
        showGuideBubbleSequence(steps, onComplete, index + 1);
        return;
      }

      showGuideBubble(target, step.text, () => {
        showGuideBubbleSequence(steps, onComplete, index + 1);
      });
    });
  }

  function openTrapToolsPanel() {
    setTrapToolsPanelOpen(true);
  }

  function setTrapToolsPanelOpen(open) {
    if (open) clearTrapToolsReopenTimer();
    trapToolsPanelOpen = Boolean(open);
    ui.trapToolsToggle?.setAttribute("aria-expanded", trapToolsPanelOpen ? "true" : "false");
    ui.trapToolsPanel?.classList.toggle("hidden", !trapToolsPanelOpen);
  }

  function closeTrapToolsForMapAction() {
    if (!trapToolsPanelOpen) return;
    clearTrapToolsReopenTimer();
    reopenTrapToolsAfterMapAction = true;
    setTrapToolsPanelOpen(false);
  }

  function restoreTrapToolsAfterMapAction() {
    if (!reopenTrapToolsAfterMapAction) return;
    reopenTrapToolsAfterMapAction = false;
    clearTrapToolsReopenTimer();
    reopenTrapToolsTimer = window.setTimeout(() => {
      reopenTrapToolsTimer = null;
      setTrapToolsPanelOpen(true);
    }, 650);
  }

  function clearTrapToolsReopenTimer() {
    if (!reopenTrapToolsTimer) return;
    window.clearTimeout(reopenTrapToolsTimer);
    reopenTrapToolsTimer = null;
  }

  function openObjectivePanel() {
    objectivePanelOpen = true;
    ui.objectiveToggle?.setAttribute("aria-expanded", "true");
    ui.objectivePanel?.classList.remove("hidden");
  }

  function closeDefenseGuidePanels() {
    objectivePanelOpen = false;
    reopenTrapToolsAfterMapAction = false;
    clearTrapToolsReopenTimer();
    setTrapToolsPanelOpen(false);
    ui.objectiveToggle?.setAttribute("aria-expanded", "false");
    ui.objectivePanel?.classList.add("hidden");
  }

  function createCanvasPointGuideTarget(x, y) {
    return {
      getGuideAnchorRect: () => {
        const width = canvas.clientWidth || canvas.width;
        const height = canvas.clientHeight || canvas.height;
        const left = (x / canvas.width) * width - 9;
        const top = (y / canvas.height) * height - 9;
        return {
          x: left,
          y: top,
          left,
          top,
          right: left + 18,
          bottom: top + 18,
          width: 18,
          height: 18,
        };
      },
      getBoundingClientRect: () => {
        const rect = canvas.getBoundingClientRect();
        const left = rect.left + (x / canvas.width) * rect.width;
        const top = rect.top + (y / canvas.height) * rect.height;
        return {
          x: left - 9,
          y: top - 9,
          left: left - 9,
          top: top - 9,
          right: left + 9,
          bottom: top + 9,
          width: 18,
          height: 18,
        };
      },
      closest: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }

  function showGuideBubble(target, text, onAdvance, options = {}) {
    if (shouldSkipGuideBubbles()) {
      if (typeof onAdvance === "function") onAdvance();
      return;
    }

    hideGuideBubble();

    const bubble = document.createElement("div");
    bubble.className = "hud-tutorial-bubble";
    bubble.innerHTML = `<p>${escapeHTML(text)}</p>`;
    canvas.parentElement?.appendChild(bubble);
    guideBubble = {
      element: bubble,
      target,
      onAdvance,
      cleanup: null,
    };
    positionGuideBubble();
    guideBubbleInputLocked = true;
    window.setTimeout(() => {
      guideBubbleInputLocked = false;
    }, 160);

    const advance = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (guideBubbleInputLocked) return;
      const next = guideBubble?.onAdvance;
      hideGuideBubble();
      if (typeof next === "function") next();
    };
    const advanceAfterTargetClick = () => {
      window.setTimeout(() => {
        if (guideBubbleInputLocked) return;
        const next = guideBubble?.onAdvance;
        hideGuideBubble();
        if (typeof next === "function") next();
      }, 0);
    };
    const onResize = () => positionGuideBubble();
    const clickTarget = target.closest?.("button") || target;
    window.addEventListener("keydown", advance, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    bubble.addEventListener("pointerdown", advance);
    if (options.blockTargetActivation) {
      clickTarget.addEventListener("click", advance, true);
    } else {
      clickTarget.addEventListener("click", advanceAfterTargetClick);
    }
    guideBubble.cleanup = () => {
      window.removeEventListener("keydown", advance, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      clickTarget.removeEventListener("click", advance, true);
      clickTarget.removeEventListener("click", advanceAfterTargetClick);
    };
  }

  function positionGuideBubble() {
    if (!guideBubble?.element || !guideBubble.target) return;

    const host = canvas.parentElement;
    const hostRect = host?.getBoundingClientRect();
    if (!hostRect) return;

    const bubble = guideBubble.element;
    const bubbleRect = bubble.getBoundingClientRect();
    const compact = isCompactGuideLayout();
    const mobileClient = document.body.classList.contains("mobile-client");
    const targetRect = getGuideTargetRect(guideBubble.target, host, hostRect, mobileClient);
    if (!targetRect) return;

    const margin = compact ? 8 : 12;
    const halfWidth = Math.max(compact ? 48 : 60, bubbleRect.width / 2);
    const hostWidth = mobileClient ? host?.clientWidth || hostRect.width : hostRect.width;
    const hostHeight = mobileClient ? host?.clientHeight || hostRect.height : hostRect.height;
    const targetCenter = targetRect.left + targetRect.width / 2;

    if (mobileClient) {
      const minLeft = halfWidth + margin;
      const maxLeft = Math.max(minLeft, hostWidth - halfWidth - margin);
      const left = clampNumber(targetCenter, minLeft, maxLeft);
      const belowTop = targetRect.bottom + 10;
      const aboveTop = targetRect.top - bubbleRect.height - 10;
      const canFitBelow = belowTop + bubbleRect.height <= hostHeight - margin;
      const canFitAbove = aboveTop >= margin;
      const placeAbove = !canFitBelow && canFitAbove;
      const preferredTop = placeAbove ? aboveTop : belowTop;
      const maxTop = Math.max(margin, hostHeight - bubbleRect.height - margin);
      const top = clampNumber(preferredTop, margin, maxTop);
      const arrowMin = Math.min(16, bubbleRect.width / 2);
      const arrowMax = Math.max(arrowMin, bubbleRect.width - arrowMin);
      const arrowX = clampNumber(targetCenter - (left - bubbleRect.width / 2), arrowMin, arrowMax);

      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.style.setProperty("--bubble-arrow-x", `${arrowX}px`);
      bubble.classList.toggle("above-target", placeAbove);
      return;
    }

    const minLeft = halfWidth + margin;
    const maxLeft = Math.max(minLeft, hostWidth - halfWidth - margin);
    const left = clampNumber(targetCenter, minLeft, maxLeft);
    const belowTop = targetRect.bottom + 10;
    const aboveTop = targetRect.top - bubbleRect.height - 10;
    const canFitBelow = belowTop + bubbleRect.height <= hostHeight - margin;
    const canFitAbove = aboveTop >= margin;
    const placeAbove = !canFitBelow && (canFitAbove || aboveTop > belowTop);
    const preferredTop = placeAbove ? aboveTop : belowTop;
    const maxTop = Math.max(margin, hostHeight - bubbleRect.height - margin);
    const top = clampNumber(preferredTop, margin, maxTop);
    const arrowMin = Math.min(16, bubbleRect.width / 2);
    const arrowMax = Math.max(arrowMin, bubbleRect.width - arrowMin);
    const arrowX = clampNumber(targetCenter - (left - halfWidth), arrowMin, arrowMax);

    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    bubble.style.setProperty("--bubble-arrow-x", `${arrowX}px`);
    bubble.classList.toggle("above-target", placeAbove);
  }

  function getGuideTargetRect(target, host, hostRect, useLocalCoordinates) {
    if (useLocalCoordinates) {
      const anchorRect = target.getGuideAnchorRect?.();
      if (anchorRect) return anchorRect;

      const localRect = getLocalElementRect(target, host);
      if (localRect) return localRect;
    }

    const targetRect = target.getBoundingClientRect?.();
    if (!targetRect) return null;

    return {
      x: targetRect.left - hostRect.left,
      y: targetRect.top - hostRect.top,
      left: targetRect.left - hostRect.left,
      top: targetRect.top - hostRect.top,
      right: targetRect.right - hostRect.left,
      bottom: targetRect.bottom - hostRect.top,
      width: targetRect.width,
      height: targetRect.height,
    };
  }

  function getLocalElementRect(target, host) {
    if (!(target instanceof Element) || !(host instanceof Element) || !host.contains(target)) return null;

    let left = target.offsetLeft;
    let top = target.offsetTop;
    let node = target.offsetParent;
    while (node && node !== host) {
      left += node.offsetLeft;
      top += node.offsetTop;
      node = node.offsetParent;
    }
    if (node !== host) return null;

    for (let parent = target.parentElement; parent && parent !== host; parent = parent.parentElement) {
      left -= parent.scrollLeft || 0;
      top -= parent.scrollTop || 0;
    }

    return {
      x: left,
      y: top,
      left,
      top,
      right: left + target.offsetWidth,
      bottom: top + target.offsetHeight,
      width: target.offsetWidth,
      height: target.offsetHeight,
    };
  }

  function isCompactGuideLayout() {
    return (
      document.body.classList.contains("mobile-client") ||
      window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches
    );
  }

  function hideGuideBubble() {
    guideBubble?.cleanup?.();
    guideBubble?.element?.remove();
    guideBubble = null;
    guideBubbleInputLocked = false;
  }

  function summarizeTrapTypes(traps) {
    const counts = new Map();
    for (const trap of traps) {
      counts.set(trap.type, (counts.get(trap.type) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([type, count]) => `${TRAPS[type].name} ${count}개`)
      .join(", ");
  }

  function formatSeconds(value) {
    const rounded = Math.round(value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}초`;
  }

  function formatPercent(value) {
    return `${Math.round(value * 100)}%`;
  }

  function draw(game) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawSafely(ctx, () => drawBackground(ctx, game));
    drawSafely(ctx, () => drawPlatforms(ctx, game?.platforms));
    drawSafely(ctx, () => drawCore(ctx, game?.core));
    drawSafely(ctx, () => drawBaseHazards(ctx, game));

    const showDefenseLayout = game?.turn === TURN.DEFENSE_BUILD ||
      game?.turn === TURN.DEFENSE_REPLAY ||
      game?.showFailedDefenseLayout ||
      game?.showSuccessDefenseLayout;

    if (showDefenseLayout) {
      drawSafely(ctx, () => drawReplayPath(ctx, game?.lastAttackRecording));
      drawSafely(ctx, () => drawTrapSlots(ctx, game?.trapSlots));
      drawSafely(ctx, () => drawPlacedTraps(ctx, game?.placedTraps, game));
      drawSafely(ctx, () => drawSelectedTrapPreview(ctx, game));
    }

    const freezeHackerAnimation = Boolean(game?.tutorialInputLocked || game?.tutorialBubble?.waitsForInput);
    if (game?.turn === TURN.ATTACK && game.hacker) {
      drawSafely(ctx, () => drawHacker(ctx, game.hacker, false, freezeHackerAnimation));
      drawSafely(ctx, () => drawHackingScreenEffect(ctx, game.hacker));
    }
    if (showDefenseLayout && game?.replayHacker) {
      drawSafely(ctx, () => drawHacker(ctx, game.replayHacker, true));
    }

    if (showDefenseLayout) {
      drawSafely(ctx, () => drawTrapEffects(ctx, game?.placedTraps, game));
      drawSafely(ctx, () => drawObjectiveSpark(ctx, game));
    }

    drawSafely(ctx, () => drawTutorialBubble(ctx, game?.tutorialBubble));
    drawSafely(ctx, () => drawStageBanner(ctx, game));
  }

  function drawSafely(ctx, drawStep) {
    ctx.save();
    try {
      drawStep();
    } catch {
      // Keep the rest of the frame rendering if one visual layer receives unexpected data.
    } finally {
      ctx.restore();
    }
  }

  function drawBackground(ctx, game) {
    const stage = Number.isFinite(Number(game?.stage)) ? Number(game.stage) : 1;
    const stageData = getStageById(stage);
    const visualTheme = getStageVisualTheme(stage, stageData);
    const colors = getVisualThemeColors(visualTheme.theme.palette);

    ctx.save();
    const bgGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, colors.top);
    bgGradient.addColorStop(0.58, colors.mid);
    bgGradient.addColorStop(1, colors.bottom);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (drawMappedStageBackground(ctx, stage)) {
      ctx.restore();
      return;
    }

    drawFarLayer(ctx, visualTheme, colors);
    drawMidLayer(ctx, visualTheme, colors);
    drawFrontLayer(ctx, visualTheme, colors);
    drawFxLayer(ctx, visualTheme, colors);
    ctx.restore();
  }

  function drawMappedStageBackground(ctx, stage) {
    const backgroundKey = getStageBackgroundKey(stage);
    const image = backgroundImages[backgroundKey];
    if (!isImageReady(image)) return false;

    const scale = Math.min(
      CANVAS_WIDTH / image.naturalWidth,
      CANVAS_HEIGHT / image.naturalHeight
    );
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    const x = (CANVAS_WIDTH - drawW) / 2;
    const y = (CANVAS_HEIGHT - drawH) / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, x, y, drawW, drawH);
    ctx.restore();
    return true;
  }

  function getStageBackgroundKey(stage) {
    return Number(stage) >= 11 ? STAGE_BACKGROUNDS.final : STAGE_BACKGROUNDS.default;
  }

  function getStageVisualTheme(stage, stageData) {
    const fallback = getFallbackVisualTheme(stage);
    const backgroundLayers = stageData?.backgroundLayers || {};
    return {
      theme: {
        ...fallback.theme,
        ...(stageData?.theme || {}),
      },
      backgroundLayers: {
        far: normalizeLayerList(backgroundLayers.far, fallback.backgroundLayers.far),
        mid: normalizeLayerList(backgroundLayers.mid, fallback.backgroundLayers.mid),
        front: normalizeLayerList(backgroundLayers.front, fallback.backgroundLayers.front),
        fx: normalizeLayerList(backgroundLayers.fx, fallback.backgroundLayers.fx),
      },
    };
  }

  function normalizeLayerList(layerList, fallback) {
    return Array.isArray(layerList) && layerList.length > 0 ? layerList : fallback;
  }

  function getFallbackVisualTheme(stage) {
    const palette = stage >= 11
      ? "core"
      : stage >= 8
        ? "orange-red"
        : stage >= 4
          ? "blue-purple"
          : "cyan";
    const securityTone = stage >= 11
      ? "final"
      : stage >= 8
        ? "high"
        : stage >= 4
          ? "medium"
          : "low";

    return {
      theme: {
        id: `fallback-stage-${stage}`,
        palette,
        securityTone,
        background: "server-room",
      },
      backgroundLayers: DEFAULT_BACKGROUND_LAYERS,
    };
  }

  function getVisualThemeColors(palette) {
    return VISUAL_THEMES[palette] || VISUAL_THEMES.cyan;
  }

  function drawFarLayer(ctx, visualTheme, colors) {
    const layers = visualTheme?.backgroundLayers?.far || [];
    if (!layers.includes("future-city")) return;

    ctx.save();
    ctx.fillStyle = `rgba(${colors.skyline}, 0.88)`;
    const skyline = [
      [42, 170, 58, 190],
      [120, 128, 84, 232],
      [238, 158, 68, 202],
      [360, 108, 92, 252],
      [522, 150, 74, 210],
      [648, 118, 86, 242],
      [790, 160, 70, 200],
      [930, 102, 96, 258],
      [1082, 145, 76, 215],
    ];

    for (const [x, y, w, h] of skyline) {
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = `rgba(${colors.glow}, 0.08)`;
      for (let yy = y + 18; yy < y + h - 12; yy += 24) {
        ctx.fillRect(x + 10, yy, w - 20, 2);
      }
      ctx.fillStyle = `rgba(${colors.skyline}, 0.88)`;
    }

    ctx.strokeStyle = `rgba(${colors.glow}, 0.10)`;
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, 92);
      ctx.lineTo(x + 72, 250);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMidLayer(ctx, visualTheme, colors) {
    const layers = visualTheme?.backgroundLayers?.mid || [];
    if (layers.length === 0) return;

    ctx.save();
    for (let x = 76; x < CANVAS_WIDTH; x += 168) {
      drawServerRack(ctx, x, 188, 92, 226, colors);
    }

    if (layers.includes("cable")) {
      ctx.strokeStyle = `rgba(${colors.accent}, 0.18)`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i += 1) {
        const y = 128 + i * 34;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(260, y + 34, 560, y - 42, CANVAS_WIDTH, y + 20);
        ctx.stroke();
      }
    }

    if (layers.includes("security-panel")) {
      drawSecurityPanel(ctx, 1034, 182, 92, 118, colors);
      drawSecurityPanel(ctx, 42, 258, 84, 104, colors);
    }
    ctx.restore();
  }

  function drawServerRack(ctx, x, y, w, h, colors) {
    ctx.fillStyle = "rgba(11, 28, 42, 0.82)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(96, 180, 196, 0.20)";
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    for (let yy = y + 14; yy < y + h - 10; yy += 28) {
      ctx.fillStyle = "rgba(14, 46, 63, 0.95)";
      ctx.fillRect(x + 10, yy, w - 20, 16);
      ctx.fillStyle = `rgba(${colors.glow}, 0.42)`;
      ctx.fillRect(x + 16, yy + 5, 18, 3);
      ctx.fillStyle = `rgba(${colors.accent}, 0.26)`;
      ctx.fillRect(x + w - 28, yy + 4, 6, 6);
    }
  }

  function drawSecurityPanel(ctx, x, y, w, h, colors) {
    ctx.fillStyle = "rgba(13, 45, 58, 0.70)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = `rgba(${colors.glow}, 0.22)`;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = `rgba(${colors.glow}, 0.24)`;
    ctx.fillRect(x + 14, y + 18, w - 28, 8);
    ctx.fillRect(x + 14, y + 42, w - 42, 5);
    ctx.fillStyle = "rgba(255, 204, 51, 0.34)";
    ctx.fillRect(x + w - 28, y + h - 30, 10, 10);
  }

  function drawFrontLayer(ctx, visualTheme, colors) {
    const layers = visualTheme?.backgroundLayers?.front || [];
    if (layers.length === 0) return;

    ctx.save();
    ctx.fillStyle = "rgba(5, 15, 23, 0.50)";
    ctx.fillRect(0, 442, CANVAS_WIDTH, 98);

    if (layers.includes("pipe-line")) {
      ctx.strokeStyle = "rgba(77, 122, 140, 0.34)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 430);
      ctx.lineTo(310, 430);
      ctx.lineTo(360, 404);
      ctx.lineTo(710, 404);
      ctx.lineTo(760, 430);
      ctx.lineTo(CANVAS_WIDTH, 430);
      ctx.stroke();
    }

    if (layers.includes("glow-line")) {
      ctx.strokeStyle = `rgba(${colors.glow}, 0.24)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 458);
      ctx.lineTo(CANVAS_WIDTH, 458);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFxLayer(ctx, visualTheme, colors) {
    const layers = visualTheme?.backgroundLayers?.fx || [];
    if (layers.length === 0) return;

    ctx.save();
    if (layers.includes("soft-glow")) {
      const glow = ctx.createRadialGradient(780, 280, 20, 780, 280, 520);
      glow.addColorStop(0, `rgba(${colors.glow}, 0.11)`);
      glow.addColorStop(1, `rgba(${colors.glow}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    if (layers.includes("scan-line")) {
      ctx.strokeStyle = `rgba(${colors.glow}, 0.055)`;
      ctx.lineWidth = 1;
      for (let y = 12; y < CANVAS_HEIGHT; y += 12) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(CANVAS_WIDTH, y + 0.5);
        ctx.stroke();
      }
    }

    ctx.fillStyle = `rgba(${colors.glow}, 0.035)`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, 70);
    ctx.restore();
  }

  function drawPlatforms(ctx, platforms) {
    if (!Array.isArray(platforms)) return;
    for (const platform of platforms) {
      drawTilePlatform(ctx, platform);
    }
  }

  function drawTilePlatform(ctx, platform) {
    const rect = getRenderableRect(platform);
    if (!rect) return;

    const visualH = rect.h;
    const visualW = getPlatformVisualTileWidth(rect);
    if (visualW <= 0) return;

    const cols = Math.ceil(visualW / VISUAL_TILE_SIZE);
    const rows = Math.ceil(visualH / VISUAL_TILE_SIZE);
    const visualX = Math.round(rect.x);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, visualH);
    ctx.clip();

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = visualX + col * VISUAL_TILE_SIZE;
        const y = rect.y + row * VISUAL_TILE_SIZE;
        drawStageTile(ctx, x, y, platform, row === 0);
      }
    }

    ctx.strokeStyle = "rgba(24, 224, 255, 0.28)";
    ctx.lineWidth = 1;
    for (let x = visualX; x <= visualX + visualW; x += VISUAL_TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, rect.y);
      ctx.lineTo(x + 0.5, rect.y + visualH);
      ctx.stroke();
    }
    for (let y = rect.y; y <= rect.y + visualH; y += VISUAL_TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(rect.x, y + 0.5);
      ctx.lineTo(rect.x + rect.w, y + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(rect.x, rect.y, rect.w, 2);
    ctx.fillStyle = "rgba(24, 224, 255, 0.12)";
    ctx.fillRect(rect.x, rect.y + 2, rect.w, 1);
    ctx.restore();
  }

  function getPlatformVisualTileWidth(platform) {
    return platform.w;
  }

  function getRenderableRect(rect) {
    if (!rect) return null;
    const x = Math.round(Number(rect.x));
    const y = Math.round(Number(rect.y));
    const w = Math.round(Number(rect.w));
    const h = Math.round(Number(rect.h));
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  }

  function drawStageTile(ctx, x, y, platform, isTopRow) {
    const tileKey = getStageTileKey(x, y, platform, isTopRow);
    const image = stageImages[tileKey];
    if (drawStageTileImage(ctx, image, x, y)) return;
    drawSquareMetalTile(ctx, x, y, tileKey === "tile3");
  }

  function getStageTileKey(x, y, platform, isTopRow) {
    if (isTopRow && !isGroundPlatform(platform)) return "tile3";

    const tileX = Math.floor(x / VISUAL_TILE_SIZE);
    const tileY = Math.floor(y / VISUAL_TILE_SIZE);
    return GROUND_TILE_PATTERN[(tileX + tileY * 3) % GROUND_TILE_PATTERN.length];
  }

  function isGroundPlatform(platform) {
    const role = String(platform?.role || "");
    return role.includes("main") || Number(platform?.y) >= 462;
  }

  function drawStageTileImage(ctx, image, x, y) {
    if (!isImageReady(image)) return false;

    const size = VISUAL_TILE_SIZE;
    const tileW = VISUAL_TILE_DRAW_W;
    const tileX = x + (size - tileW) / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, tileX, y, tileW, size);
    ctx.restore();
    return true;
  }

  function drawSquareMetalTile(ctx, x, y, isTopRow) {
    const size = VISUAL_TILE_SIZE;
    const tileW = VISUAL_TILE_DRAW_W;
    const tileX = x + (size - tileW) / 2;
    const gapX = 7;
    const gapY = 9;
    const innerX = tileX + gapX / 2;
    const innerY = y + gapY / 2;
    const innerW = tileW - gapX;
    const innerH = size - gapY;
    const tileGradient = ctx.createLinearGradient(x, y, x, y + size);
    tileGradient.addColorStop(0, isTopRow ? "#16445a" : "#123044");
    tileGradient.addColorStop(0.52, isTopRow ? "#102f43" : "#0d2536");
    tileGradient.addColorStop(1, "#091b28");

    ctx.fillStyle = "rgba(2, 8, 13, 0.62)";
    ctx.fillRect(tileX, y, tileW, size);
    ctx.fillStyle = tileGradient;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    ctx.strokeStyle = "rgba(3, 8, 13, 0.78)";
    ctx.lineWidth = 2;
    ctx.strokeRect(innerX + 0.5, innerY + 0.5, innerW - 1, innerH - 1);

    ctx.strokeStyle = "rgba(233, 248, 255, 0.10)";
    ctx.lineWidth = 1;
    ctx.strokeRect(tileX + 9.5, y + 10.5, tileW - 19, size - 21);

    ctx.fillStyle = "rgba(24, 224, 255, 0.09)";
    ctx.fillRect(tileX + 12, y + 11, tileW - 24, 2);
    ctx.fillStyle = "rgba(39, 255, 200, 0.08)";
    ctx.fillRect(tileX + 12, y + size - 15, tileW - 24, 2);

    if (isTopRow) {
      ctx.fillStyle = "rgba(24, 224, 255, 0.42)";
      ctx.fillRect(tileX + 9, y + 6, tileW - 18, 2);
    }
  }

  function drawCore(ctx, core) {
    const rect = getRenderableRect(core);
    if (!rect) return;

    if (drawCheckpointCore(ctx, rect)) return;

    ctx.save();
    ctx.fillStyle = "#27ffc8";
    ctx.shadowColor = "#27ffc8";
    ctx.shadowBlur = 18;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#06251f";
    ctx.fillRect(rect.x + 10, rect.y + 12, rect.w - 20, rect.h - 24);
    ctx.fillStyle = "#27ffc8";
    ctx.font = "12px monospace";
    ctx.fillText("CORE", rect.x + 5, rect.y - 8);
    ctx.restore();
  }

  function drawCheckpointCore(ctx, rect) {
    const image = getCheckpointFrame();
    if (!isImageReady(image)) return false;

    const aspect = image.naturalWidth / image.naturalHeight || 1;
    const visualH = Math.max(rect.h, 78);
    const visualW = Math.max(rect.w, visualH * aspect);
    const x = rect.x + rect.w / 2 - visualW / 2;
    const y = rect.y + rect.h - visualH;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.shadowColor = "rgba(39, 255, 200, 0.72)";
    ctx.shadowBlur = 18;
    ctx.drawImage(image, x, y, visualW, visualH);
    ctx.restore();
    return true;
  }

  function getCheckpointFrame() {
    const frames = [stageImages.checkpoint1, stageImages.checkpoint2];
    const index = Math.floor(performance.now() / 1000 / CHECKPOINT_FRAME_SECONDS) % frames.length;
    return frames[index];
  }

  function drawBaseHazards(ctx, game) {
    if (!Array.isArray(game?.baseHazards) || game.baseHazards.length === 0) return;
    for (const hazard of game.baseHazards) {
      let box = hazard;
      if (hazard.type === "laser") drawLaser(ctx, hazard.x, hazard.y, hazard.w, hazard.h, hazard);
      if (hazard.type === "shock") drawShock(ctx, hazard.x, hazard.y, hazard.w, hazard.h, hazard);
      if (hazard.type === "camera") {
        const cameraBox = getCameraHazardBox(hazard, game);
        box = cameraBox;
        drawCamera(ctx, cameraBox.x, cameraBox.y, cameraBox.w, cameraBox.h, hazard);
      }
      if (hazard.type === "firewall") drawFirewall(ctx, hazard.x, hazard.y, hazard.w, hazard.h, hazard.closed || hazard.empowered);
      if (hazard.type === "emp") drawEmp(ctx, hazard.x, hazard.y, hazard.w, hazard.h, hazard);
      if (hazard.empowered) drawEmpoweredMark(ctx, box);
      drawHackStatus(ctx, hazard, box);
    }
  }

  function drawTutorialBubble(ctx, bubble) {
    if (!bubble?.text) return;

    const alpha = Math.min(1, Math.max(0, (bubble.time || 0) / 0.25));
    const compact = isCompactGuideLayout();
    const paddingX = compact ? 10 : 12;
    const paddingY = compact ? 8 : 10;
    const maxWidth = compact ? 250 : 330;
    const lineHeight = compact ? 16 : 18;
    const marginX = compact ? 12 : 16;
    const minY = compact ? 54 : 72;
    const bottomReserve = compact ? 72 : 86;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${compact ? 12 : 14}px PfStardust30, system-ui, sans-serif`;
    const lines = wrapCanvasText(ctx, bubble.text, maxWidth - paddingX * 2);
    const prompt = bubble.waitsForInput ? "아무 키나 입력하세요." : "";
    const promptHeight = prompt ? lineHeight + 7 : 0;
    const measuredLineWidths = lines.map((line) => ctx.measureText(line).width);
    if (prompt) measuredLineWidths.push(ctx.measureText(prompt).width);
    const textWidth = Math.min(maxWidth - paddingX * 2, Math.max(...measuredLineWidths));
    const width = Math.ceil(textWidth + paddingX * 2);
    const height = Math.ceil(lines.length * lineHeight + promptHeight + paddingY * 2);
    const x = clampNumber(bubble.x - width / 2, marginX, CANVAS_WIDTH - width - marginX);
    const y = clampNumber(bubble.y - height - 18, minY, CANVAS_HEIGHT - height - bottomReserve);
    const tailX = clampNumber(bubble.x, x + 18, x + width - 18);
    const tailY = y + height;

    ctx.shadowColor = "rgba(24, 224, 255, 0.34)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "rgba(6, 18, 28, 0.94)";
    ctx.strokeStyle = "rgba(138, 242, 255, 0.82)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, width, height, 8);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(tailX - 9, tailY - 1);
    ctx.lineTo(tailX, tailY + 10);
    ctx.lineTo(tailX + 9, tailY - 1);
    ctx.closePath();
    ctx.fillStyle = "rgba(6, 18, 28, 0.94)";
    ctx.fill();
    ctx.strokeStyle = "rgba(138, 242, 255, 0.82)";
    ctx.stroke();

    ctx.fillStyle = "#e9f8ff";
    ctx.textBaseline = "top";
    lines.forEach((line, index) => {
      ctx.fillText(line, x + paddingX, y + paddingY + index * lineHeight);
    });
    if (prompt) {
      ctx.fillStyle = "#8af2ff";
      ctx.font = `bold ${compact ? 11 : 13}px PfStardust30, system-ui, sans-serif`;
      ctx.fillText(prompt, x + paddingX, y + paddingY + lines.length * lineHeight + 7);
    }
    ctx.restore();
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const lines = [];
    for (const paragraph of String(text).split("\n")) {
      let line = "";
      for (const char of paragraph) {
        const nextLine = `${line}${char}`;
        if (line && ctx.measureText(nextLine).width > maxWidth) {
          lines.push(line);
          line = char;
        } else {
          line = nextLine;
        }
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [""];
  }

  function clampNumber(value, min, max) {
    if (max < min) return min;
    return Math.min(max, Math.max(min, value));
  }

  function drawTrapSlots(ctx, trapSlots) {
    if (!Array.isArray(trapSlots)) return;
    for (const slot of trapSlots) {
      const xCenter = Number(slot?.x);
      const yTop = Number(slot?.y);
      if (!Number.isFinite(xCenter) || !Number.isFinite(yTop)) continue;
      if (slot.occupied) continue;

      ctx.save();
      const x = Math.round(xCenter - VISUAL_SLOT_W / 2);
      const y = Math.round(yTop - VISUAL_SLOT_H - 2);
      if (slot.blocked) {
        ctx.strokeStyle = "rgba(255, 43, 139, 0.92)";
        ctx.fillStyle = "rgba(255, 43, 139, 0.24)";
      } else {
        ctx.strokeStyle = "rgba(24,224,255,0.42)";
        ctx.fillStyle = "rgba(24,224,255,0.055)";
      }
      if (slot.blocked) {
        drawSlotGlitch(ctx, x, y, VISUAL_SLOT_W, VISUAL_SLOT_H);
      }

      ctx.lineWidth = slot.blocked ? 2 : 1;
      roundRect(ctx, x, y, VISUAL_SLOT_W, VISUAL_SLOT_H, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = slot.blocked
        ? "rgba(233, 248, 255, 0.42)"
        : "rgba(24,224,255,0.16)";
      ctx.fillRect(x + 7, y + 3, VISUAL_SLOT_W - 14, 1);
      ctx.fillStyle = slot.blocked
        ? "rgba(24, 224, 255, 0.58)"
        : "rgba(39,255,200,0.085)";
      ctx.fillRect(x + 12, y + VISUAL_SLOT_H - 3, VISUAL_SLOT_W - 24, 1);
      ctx.restore();
    }
  }

  function drawSlotGlitch(ctx, x, y, w, h) {
    const t = performance.now() / 1000;
    const pulse = 0.45 + Math.sin(t * 18 + x * 0.05) * 0.14;
    const jitter = Math.round(Math.sin(t * 31 + x * 0.11) * 2);
    const primary = "rgba(255, 43, 139,";
    const secondary = "rgba(24, 224, 255,";

    ctx.save();
    ctx.shadowColor = "#ff2b8b";
    ctx.shadowBlur = 13;
    ctx.strokeStyle = `${primary} ${Math.min(0.95, pulse + 0.28)})`;
    ctx.lineWidth = 2;
    roundRect(ctx, x - 3 + jitter, y - 5, w + 6, h + 10, 3);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = `${secondary} 0.64)`;
    ctx.fillRect(x - 5 - jitter, y - 2, 12, 2);
    ctx.fillRect(x + w - 8 + jitter, y + h + 1, 13, 2);
    ctx.fillStyle = `${primary} 0.44)`;
    ctx.fillRect(x + 5 + jitter, y - 6, w - 10, 1);
    ctx.fillRect(x + 11 - jitter, y + h + 5, w - 22, 1);

    ctx.strokeStyle = `${secondary} 0.70)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 9 + jitter, y - 3);
    ctx.lineTo(x + w - 9 - jitter, y + h + 4);
    ctx.moveTo(x + w - 10 - jitter, y - 3);
    ctx.lineTo(x + 10 + jitter, y + h + 4);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlacedTraps(ctx, placedTraps, game) {
    if (!Array.isArray(placedTraps)) return;
    for (const trap of placedTraps) {
      const box = getOrientedTrapBox(trap, game);
      if (trap.type === "laser") drawLaser(ctx, box.x, box.y, box.w, box.h, trap);
      if (trap.type === "shock") drawShock(ctx, box.x, box.y, box.w, box.h, trap);
      if (trap.type === "camera") drawCamera(ctx, box.x, box.y, box.w, box.h, trap);
      if (trap.type === "firewall") drawFirewall(ctx, box.x, box.y, box.w, box.h, trap.closed || trap.empowered);
      if (trap.type === "emp") drawEmp(ctx, box.x, box.y, box.w, box.h, trap);
      if (trap.empowered) drawEmpoweredMark(ctx, box);
    }
  }

  function drawSelectedTrapPreview(ctx, game) {
    if (!pointerTrapPreviewPos || trapToolsPanelOpen) return;
    if (game?.turn !== TURN.DEFENSE_BUILD || game?.deleteMode) return;

    const type = selectedTrapPreview?.type;
    if (!TRAPS[type]) return;

    const trap = {
      type,
      rotation: selectedTrapPreview.rotation,
      x: pointerTrapPreviewPos.x,
      y: pointerTrapPreviewPos.y,
      empowered: false,
      closed: false,
    };
    const box = getOrientedTrapBox(trap, game);

    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.shadowColor = TRAPS[type].color || "#27ffc8";
    ctx.shadowBlur = 14;
    if (type === "laser") drawLaser(ctx, box.x, box.y, box.w, box.h, trap);
    if (type === "shock") drawShock(ctx, box.x, box.y, box.w, box.h, trap);
    if (type === "camera") drawCamera(ctx, box.x, box.y, box.w, box.h, trap);
    if (type === "firewall") drawFirewall(ctx, box.x, box.y, box.w, box.h, false);
    if (type === "emp") drawEmp(ctx, box.x, box.y, box.w, box.h, trap);

    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 0;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = TRAPS[type].color || "#27ffc8";
    roundRect(ctx, box.x - 5, box.y - 5, box.w + 10, box.h + 10, 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrapEffects(ctx, placedTraps, game) {
    if (!Array.isArray(placedTraps)) return;
    for (const trap of placedTraps) {
      const box = getOrientedTrapBox(trap, game);
      drawTrapTriggerTimer(ctx, trap, box);
      drawTrapObjectiveSpark(ctx, trap, box);
    }
  }

  function drawLaser(ctx, x, y, w, h, state = null) {
    const hacked = (state?.hackedTime || 0) > 0;
    const pending = (state?.hackPendingTime || 0) > 0;
    const flicker = getHackFlicker(state);
    const image = trapImages[state?.empowered ? "laserEmpowered" : "laser"];
    if (drawTrapImage(ctx, image, x, y, w, h, {
      type: "laser",
      rotation: state?.rotation || (h >= w ? 90 : 0),
      alpha: hacked || pending ? flicker.alpha : 1,
    })) {
      if (pending || hacked) drawHackGlitchLines(ctx, x, y, w, h, flicker.jitter);
      return;
    }

    ctx.save();
    ctx.globalAlpha = hacked || pending ? flicker.alpha : 1;
    ctx.fillStyle = hacked ? "rgba(39, 255, 200, 0.12)" : "rgba(255, 59, 103, 0.22)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = hacked ? "#27ffc8" : "#ff3b67";
    ctx.shadowColor = pending ? "#e9fff8" : hacked ? "#27ffc8" : "#ff3b67";
    ctx.shadowBlur = pending || hacked ? 18 : 12;
    if (w > h) {
      ctx.fillRect(x, y + h / 2 - 2, w, 4);
    } else {
      ctx.fillRect(x + w / 2 - 2, y, 4, h);
    }
    if (pending || hacked) drawHackGlitchLines(ctx, x, y, w, h, flicker.jitter);
    ctx.restore();
  }

  function drawShock(ctx, x, y, w, h, state = null) {
    const image = trapImages[state?.empowered ? "shockEmpowered" : "shock"];
    if (drawTrapImage(ctx, image, x, y, w, h, { type: "shock" })) return;

    ctx.save();
    ctx.fillStyle = "rgba(255, 204, 51, 0.26)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#ffcc33";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= w; i += 16) {
      ctx.lineTo(x + i, y + (i % 32 === 0 ? 0 : h));
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawEmp(ctx, x, y, w, h, state = null) {
    const image = trapImages[state?.empowered ? "empEmpowered" : "emp"];
    if (drawTrapImage(ctx, image, x, y, w, h, { type: "emp" })) return;

    ctx.save();
    ctx.fillStyle = "rgba(51, 230, 255, 0.26)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#33e6ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#33e6ff";
    for (let i = x + 8; i < x + w - 6; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, y + h - 3);
      ctx.lineTo(i + 5, y + 3);
      ctx.lineTo(i + 10, y + h - 3);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCamera(ctx, x, y, w, h, state = null) {
    if (drawTrapImage(ctx, trapImages.camera, x, y, w, h, { type: "camera" })) return;

    const bodyW = Math.min(56, w * 0.5);
    const bodyH = Math.min(36, h * 0.32);
    const bodyX = x + w - bodyW - 2;
    const bodyY = y;
    const coneTopLeft = { x: bodyX + 4, y: bodyY + bodyH };
    const coneTopRight = { x: bodyX + bodyW - 10, y: bodyY + bodyH };
    const coneBottomRight = { x: coneTopRight.x, y: y + h };
    const coneBottomLeft = { x: x + 8, y: y + h };

    const hacked = (state?.hackedTime || 0) > 0;
    const pending = (state?.hackPendingTime || 0) > 0;
    const flicker = getHackFlicker(state);

    ctx.save();
    ctx.globalAlpha = hacked || pending ? flicker.alpha : 1;
    ctx.fillStyle = hacked ? "rgba(39, 255, 200, 0.10)" : "rgba(187, 92, 255, 0.24)";
    ctx.beginPath();
    ctx.moveTo(coneTopLeft.x, coneTopLeft.y);
    ctx.lineTo(coneTopRight.x, coneTopRight.y);
    ctx.lineTo(coneBottomRight.x, coneBottomRight.y);
    ctx.lineTo(coneBottomLeft.x, coneBottomLeft.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(233, 248, 255, 0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = hacked ? "rgba(39, 255, 200, 0.70)" : "rgba(187, 92, 255, 0.78)";
    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW / 2, bodyY + bodyH);
    ctx.lineTo((coneBottomLeft.x + coneBottomRight.x) / 2, coneBottomLeft.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hacked ? "#27ffc8" : "#bb5cff";
    ctx.shadowColor = pending ? "#e9fff8" : hacked ? "#27ffc8" : "#bb5cff";
    ctx.shadowBlur = pending || hacked ? 18 : 10;
    roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 8);
    ctx.fill();
    if (pending || hacked) drawHackGlitchLines(ctx, x, y, w, h, flicker.jitter);
    ctx.restore();
  }

  function getHackFlicker(state) {
    if (!state || ((state.hackedTime || 0) <= 0 && (state.hackPendingTime || 0) <= 0)) {
      return { alpha: 1, jitter: 0 };
    }

    const t = performance.now() / 1000;
    const blink = Math.floor(t * 16) % 2 === 0;
    return {
      alpha: blink ? 0.28 : 0.86,
      jitter: Math.round(Math.sin(t * 45) * 3),
    };
  }

  function drawHackGlitchLines(ctx, x, y, w, h, jitter = 0) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(39, 255, 200, 0.82)";
    ctx.fillRect(x - 5 + jitter, y + h * 0.22, Math.min(34, w + 10), 2);
    ctx.fillRect(x + w - Math.min(32, w) - jitter, y + h * 0.62, Math.min(38, w + 8), 2);
    ctx.strokeStyle = "rgba(233, 255, 248, 0.78)";
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 4 - jitter, y - 4, w + 8, h + 8);
    ctx.restore();
  }

  function drawHackStatus(ctx, hazard, box) {
    const pending = hazard?.hackPendingTime || 0;
    const hacked = hazard?.hackedTime || 0;
    if (pending <= 0 && hacked <= 0) return;

    const label = pending > 0 ? "HACK" : "OFF";
    const t = performance.now() / 1000;
    const x = box.x + box.w / 2;
    const y = Math.max(28, box.y - 12);

    ctx.save();
    ctx.globalAlpha = pending > 0 ? 0.9 : 0.72;
    ctx.fillStyle = "#27ffc8";
    ctx.shadowColor = "#27ffc8";
    ctx.shadowBlur = 12;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x + Math.sin(t * 26) * 2, y);
    ctx.restore();
  }

  function drawFirewall(ctx, x, y, w, h, closed = false) {
    const image = trapImages[closed ? "firewallEmpowered" : "firewall"];
    if (drawTrapImage(ctx, image, x, y, w, h, { type: "firewall" })) return;

    ctx.save();
    ctx.fillStyle = closed ? "rgba(255, 112, 64, 0.36)" : "rgba(255, 112, 64, 0.10)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = closed ? "#ff7040" : "rgba(255, 112, 64, 0.58)";
    ctx.lineWidth = closed ? 3 : 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = closed ? "#ff7040" : "rgba(255, 112, 64, 0.42)";
    for (let yy = y + 8; yy < y + h; yy += 16) {
      if (closed || yy % 32 === 0) ctx.fillRect(x + 5, yy, w - 10, 4);
    }
    ctx.restore();
  }

  function drawTrapImage(ctx, image, x, y, w, h, options = {}) {
    if (!isImageReady(image)) return false;

    const box = getTrapVisualBox(options.type, x, y, w, h);
    const rotation = normalizeVisualRotation(options.rotation || 0);
    const laserRotation = options.type === "laser" ? getLaserDrawRotation(rotation, box) : null;

    ctx.save();
    ctx.globalAlpha = Number.isFinite(options.alpha) ? options.alpha : 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (laserRotation) {
      const centerX = box.x + box.w / 2;
      const centerY = box.y + box.h / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate(laserRotation.angle);
      ctx.drawImage(
        image,
        -laserRotation.drawW / 2,
        -laserRotation.drawH / 2,
        laserRotation.drawW,
        laserRotation.drawH
      );
    } else {
      ctx.drawImage(image, box.x, box.y, box.w, box.h);
    }

    ctx.restore();
    return true;
  }

  function getTrapVisualBox(type, x, y, w, h) {
    if (type === "laser") {
      const axisPadding = 44;
      const crossPadding = 28;
      const isHorizontal = w > h;
      if (isHorizontal) {
        return centerBox(x + w / 2, y + h / 2, Math.max(w + axisPadding, 108), Math.max(h + crossPadding, 44));
      }
      const visualW = Math.max(w + crossPadding, 44);
      const visualH = Math.max(h + axisPadding, 108);
      return bottomAlignedBox(x + w / 2, y + h + 12, visualW, visualH);
    }

    if (type === "shock" || type === "emp") {
      // Floor-trap artwork is slightly wider for readability, but remains
      // centered on the independent 48px collision box.
      const visualW = type === "shock" ? SHOCK_TRAP_VISUAL_W : EMP_TRAP_VISUAL_W;
      const visualH = Math.max(12, visualW / getTrapImageAspect(type));
      const groundOffset = 2;
      return bottomAlignedBox(x + w / 2, y + h + groundOffset, visualW, visualH);
    }

    if (type === "firewall") {
      const visualH = Math.max(h + 42, 136);
      const visualW = Math.max(w + 34, visualH * getTrapImageAspect("firewall") * 0.82);
      return bottomAlignedBox(x + w / 2, y + h + 18, visualW, visualH);
    }

    if (type === "camera") {
      const visualW = Math.max(w + 58, 176);
      const visualH = visualW / getTrapImageAspect("camera");
      return bottomAlignedBox(x + w / 2, y + h + 19, visualW, visualH);
    }

    return { x, y, w, h };
  }

  function centerBox(centerX, centerY, w, h) {
    return {
      x: centerX - w / 2,
      y: centerY - h / 2,
      w,
      h,
    };
  }

  function bottomAlignedBox(centerX, bottomY, w, h) {
    return {
      x: centerX - w / 2,
      y: bottomY - h,
      w,
      h,
    };
  }

  function queueStageFourLaserRotateGuide(slot) {
    if (shouldSkipGuideBubbles() || !slot) return;
    pendingLaserRotateGuideTarget = createCanvasPointGuideTarget(slot.x, slot.y + 28);
    maybeShowPendingLaserRotateGuide();
  }

  function maybeShowPendingLaserRotateGuide() {
    if (shouldSkipGuideBubbles()) {
      pendingLaserRotateGuideTarget = null;
      return;
    }
    if (!pendingLaserRotateGuideTarget || guideBubble || guideBubbleSequenceSkip) return;

    const target = pendingLaserRotateGuideTarget;
    pendingLaserRotateGuideTarget = null;
    showGuideBubble(
      target,
      "레이저를 설치한 칸을 누르면 바로 회전할 수 있습니다.",
      null,
      { blockTargetActivation: true }
    );
  }

  function getLaserDrawRotation(rotation, box) {
    const horizontal = rotation === 0 || rotation === 180;
    if (horizontal) {
      return {
        angle: (rotation - 90) * Math.PI / 180,
        drawW: box.h,
        drawH: box.w,
      };
    }

    if (rotation === 270) {
      return {
        angle: Math.PI,
        drawW: box.w,
        drawH: box.h,
      };
    }

    return null;
  }

  function normalizeVisualRotation(rotation) {
    return ((Math.round((Number(rotation) || 0) / 90) * 90) % 360 + 360) % 360;
  }

  function drawEmpoweredMark(ctx, box) {
    ctx.save();
    ctx.strokeStyle = "#27ffc8";
    ctx.shadowColor = "#27ffc8";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8);
    ctx.fillStyle = "#27ffc8";
    ctx.font = "bold 11px PfStardust30, system-ui";
    ctx.fillText("BOOST", box.x, box.y - 8);
    ctx.restore();
  }

  function drawTrapTriggerTimer(ctx, trap, box) {
    const effect = trap?.triggerEffect;
    if (!effect || effect.timer <= 0) return;

    const duration = Math.max(0.1, effect.duration || effect.timer);
    const remaining = Math.max(0, effect.timer);
    const progress = clamp01(remaining / duration);
    const age = duration - remaining;
    const alpha = Math.min(1, age * 5) * Math.max(0.18, progress);
    const { x, y } = getTrapEffectAnchor(box);
    const colors = getTriggerEffectColors(effect.kind);
    const label = effect.label || "발동";
    const timerText = formatEffectTimer(remaining);
    ctx.save();
    ctx.font = "bold 12px PfStardust30, system-ui";
    const labelW = Math.max(82, ctx.measureText(label).width + 70);
    const h = 28;
    const left = Math.max(8, Math.min(CANVAS_WIDTH - labelW - 8, x - labelW / 2));
    const top = y - 36 - (1 - progress) * 5;

    ctx.globalAlpha = alpha;
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = "rgba(3, 8, 13, 0.84)";
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 1.5;
    roundRect(ctx, left, top, labelW, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = colors.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, left + 10, top + h / 2);

    const cx = left + labelW - 18;
    const cy = top + h / 2;
    ctx.strokeStyle = "rgba(233, 248, 255, 0.20)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = colors.stroke;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    ctx.fillStyle = "#e9f8ff";
    ctx.font = "bold 9px PfStardust30, system-ui";
    ctx.textAlign = "center";
    ctx.fillText(timerText, cx, cy + 0.5);
    ctx.restore();
  }

  function drawTrapObjectiveSpark(ctx, trap, box) {
    if (!trap?.objectiveSparkTimer || trap.objectiveSparkTimer <= 0) return;

    const duration = Math.max(0.1, trap.objectiveSparkDuration || trap.objectiveSparkTimer);
    const progress = 1 - clamp01(trap.objectiveSparkTimer / duration);
    const { x, y } = getTrapEffectAnchor(box);
    drawSparkBurst(ctx, x, y - 10, progress, trap.objectiveSparkLabel || "조건 완료", "#27ffc8");
  }

  function drawObjectiveSpark(ctx, game) {
    if (!game?.objectiveSparkTimer || game.objectiveSparkTimer <= 0) return;

    const duration = Math.max(0.1, game.objectiveSparkDuration || game.objectiveSparkTimer);
    const progress = 1 - clamp01(game.objectiveSparkTimer / duration);
    drawSparkBurst(ctx, CANVAS_WIDTH / 2, 92, progress, game.objectiveSparkLabel || "목표 완료", "#e9fff8");
  }

  function drawSparkBurst(ctx, x, y, progress, label, color) {
    const pulse = Math.sin(progress * Math.PI);
    const radius = 18 + progress * 34;
    const alpha = Math.max(0, 1 - progress * 0.72);
    const t = performance.now() / 1000;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;

    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10 + t * 0.8;
      const inner = radius * 0.28;
      const outer = radius * (0.68 + pulse * 0.24);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
      ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      ctx.stroke();
    }

    ctx.globalAlpha = Math.min(1, alpha + 0.2);
    ctx.beginPath();
    ctx.arc(x, y, 10 + pulse * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "bold 13px PfStardust30, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y - 26 - pulse * 4);
    ctx.restore();
  }

  function getTrapEffectAnchor(box) {
    return {
      x: Math.max(34, Math.min(CANVAS_WIDTH - 34, box.x + box.w / 2)),
      y: Math.max(64, Math.min(CANVAS_HEIGHT - 24, box.y)),
    };
  }

  function getTriggerEffectColors(kind) {
    if (kind === "delay") {
      return { stroke: "#ffcc33", glow: "#ffcc33", text: "#fff4b8" };
    }
    if (kind === "mixed") {
      return { stroke: "#27ffc8", glow: "#bb5cff", text: "#e9fff8" };
    }
    return { stroke: "#8af2ff", glow: "#18e0ff", text: "#dff9ff" };
  }

  function formatEffectTimer(value) {
    const rounded = Math.max(0, Math.ceil(value * 10) / 10);
    return rounded >= 10 ? String(Math.ceil(rounded)) : rounded.toFixed(1);
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function drawReplayPath(ctx, path) {
    if (!path || path.length < 2) return;

    ctx.save();
    ctx.strokeStyle = "rgba(24, 224, 255, 0.65)";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(path[0].x + 15, path[0].y + 27);
    for (let i = 1; i < path.length; i += 3) ctx.lineTo(path[i].x + 15, path[i].y + 27);
    ctx.stroke();
    ctx.restore();
  }

  function drawHacker(ctx, h, isGhost, freezeAnimation = false) {
    ctx.save();
    const isHitFlashing = !isGhost && (h.damageFlashTime || 0) > 0;
    const isInvincibleBlink = !isGhost && (h.invincible || 0) > 0;
    ctx.globalAlpha = isGhost ? 0.72 : getHackerAlpha(h, isInvincibleBlink);
    if (isGhost && h.glitchTime > 0) drawGlitchAura(ctx, h);
    if (isHitFlashing) drawDamageFlash(ctx, h);
    if (drawHackerSprite(ctx, h, isGhost, isHitFlashing, freezeAnimation)) {
      if (!isGhost && ((h.hackChargeTime || 0) > 0 || (h.hackEffectTime || 0) > 0)) {
        ctx.save();
        ctx.translate(h.x + h.w / 2, h.y + h.h / 2);
        ctx.scale(h.facing || 1, 1);
        drawHackCastEffect(ctx, h);
        ctx.restore();
      }
      ctx.restore();
      return;
    }
    if (!isGhost && isHackerSpriteLoading(h)) {
      ctx.restore();
      return;
    }

    ctx.translate(h.x + h.w / 2, h.y + h.h / 2);
    ctx.scale(h.facing || 1, 1);
    const damageColor = h.damageFlashColor || "#ff3b67";
    ctx.fillStyle = isHitFlashing ? damageColor : isGhost ? "#8af2ff" : "#18e0ff";
    ctx.shadowColor = isHitFlashing ? damageColor : isGhost ? "#8af2ff" : "#18e0ff";
    ctx.shadowBlur = 12;
    const bodyW = h.isSliding ? h.w + 18 : h.w;
    const bodyH = h.h;
    if (!isGhost && h.isSliding) drawSlideTrail(ctx, bodyW, bodyH);
    if (!isGhost && (h.wallGrab || (h.wallAttachEffectTime || 0) > 0 || (h.wallSlideEffectTime || 0) > 0)) {
      drawWallMoveEffect(ctx, h, bodyW, bodyH);
    }
    ctx.fillRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);
    ctx.fillStyle = "#071019";
    ctx.fillRect(2, h.isSliding ? -5 : -14, 9, 6);
    ctx.fillStyle = "#e9f8ff";
    ctx.fillRect(9, h.isSliding ? 1 : -8, 16, 4);

    if (!isGhost && ((h.hackChargeTime || 0) > 0 || (h.hackEffectTime || 0) > 0)) {
      drawHackCastEffect(ctx, h);
    }

    ctx.restore();
  }

  function drawHackerSprite(ctx, h, isGhost, isHitFlashing, freezeAnimation = false) {
    const state = getHackerSpriteState(h);
    const animation = hackerImages[state] || hackerImages.idle;
    const image = getHackerAnimationFrame(animation, freezeAnimation);
    if (!isImageReady(image)) return false;

    const box = getHackerSpriteBox(h, state, image);
    const facing = h.facing || 1;

    ctx.save();
    ctx.translate(h.x + h.w / 2, box.y + box.h / 2);
    ctx.scale(facing, 1);
    if (isHitFlashing) {
      ctx.shadowColor = h.damageFlashColor || "#ff3b67";
      ctx.shadowBlur = 18;
    } else if (isGhost) {
      ctx.shadowColor = "#8af2ff";
      ctx.shadowBlur = 10;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, -box.w / 2, -box.h / 2, box.w, box.h);
    ctx.restore();

    if (!isGhost && h.isSliding) {
      ctx.save();
      ctx.translate(h.x + h.w / 2, h.y + h.h / 2);
      ctx.scale(facing, 1);
      drawSlideTrail(ctx, h.w + 18, h.h);
      ctx.restore();
    }

    if (!isGhost && (h.wallGrab || (h.wallAttachEffectTime || 0) > 0 || (h.wallSlideEffectTime || 0) > 0)) {
      ctx.save();
      ctx.translate(h.x + h.w / 2, h.y + h.h / 2);
      ctx.scale(facing, 1);
      drawWallMoveEffect(ctx, h, h.w, h.h);
      ctx.restore();
    }

    return true;
  }

  function isHackerSpriteLoading(h) {
    const state = getHackerSpriteState(h);
    const animation = hackerImages[state] || hackerImages.idle;
    return Boolean(animation?.frames?.some(isImageLoading));
  }

  function getHackerAnimationFrame(animation, freezeAnimation = false) {
    const frames = animation?.frames || [];
    if (frames.length === 0) return null;
    if (freezeAnimation) return frames[0];

    const totalSeconds = animation.totalSeconds || frames.length * 0.1;
    const elapsed = (performance.now() / 1000) % totalSeconds;
    let cursor = 0;
    for (let index = 0; index < frames.length; index += 1) {
      cursor += animation.frameSeconds?.[index] || 0.1;
      if (elapsed <= cursor) return frames[index];
    }

    return frames[frames.length - 1];
  }

  function getHackerSpriteState(h) {
    if (h.wallGrab || (h.wallAttachEffectTime || 0) > 0) return "climb";
    if (h.isSliding) return "slide";
    if ((h.landingPoseTime || 0) > 0) return "jumpLanding";
    if (!h.onGround || Math.abs(h.vy || 0) > 20) return getHackerJumpSpriteState(h);
    if (Math.abs(h.vx || 0) > 12) return "run";
    return "idle";
  }

  function getHackerJumpSpriteState(h) {
    const vy = h.vy || 0;
    if (vy < -180) return "jumpStart";
    return "jumpAir";
  }

  function getHackerSpriteBox(h, state, frame) {
    const aspect = frame.width / frame.height || 1;
    const height = getHackerSpriteHeight(h, state);
    const width = height * aspect;
    const groundY = h.y + h.h;
    return {
      x: h.x + h.w / 2 - width / 2,
      y: groundY - height,
      w: width,
      h: height,
    };
  }

  function getHackerSpriteHeight(h, state) {
    if (state === "slide") return h.h * 1.92;
    if (state === "climb") return h.h * 1.72;
    return h.h * 1.74;
  }

  function drawHackingScreenEffect(ctx, h) {
    if (!h || (h.hackChargeTime || 0) <= 0) return;

    const chargeDuration = h.hackChargeDuration || 1;
    const elapsed = chargeDuration - (h.hackChargeTime || 0);
    if (elapsed < 0 || elapsed > HACKING_EFFECT_DURATION) return;

    const frame = getHackingEffectFrame(elapsed);
    if (!isImageReady(frame)) return;

    const progress = clamp01(elapsed / HACKING_EFFECT_DURATION);
    const appear = clamp01(progress / 0.14);
    const disappear = clamp01((1 - progress) / 0.12);
    const alpha = Math.min(appear, disappear);
    const compactEffect = isCompactGuideLayout();
    const panelW = CANVAS_WIDTH * (compactEffect ? 0.64 : 0.72);
    const panelH = CANVAS_HEIGHT * (compactEffect ? 0.7 : 0.86);
    const imageSize = Math.min(
      CANVAS_WIDTH * (compactEffect ? 0.62 : 0.72),
      CANVAS_HEIGHT * (compactEffect ? 1.08 : 1.34)
    );
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2 + CANVAS_HEIGHT * (compactEffect ? 0.05 : 0.1);

    ctx.save();
    ctx.globalAlpha = 0.2 * alpha;
    ctx.strokeStyle = "#18e0ff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#18e0ff";
    ctx.shadowBlur = 24;
    ctx.strokeRect(cx - panelW / 2 + 10, cy - panelH / 2 + 10, panelW - 20, panelH - 20);

    ctx.globalAlpha = 0.95 * alpha;
    ctx.shadowColor = "#bb5cff";
    ctx.shadowBlur = 0;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, cx - imageSize / 2, cy - imageSize / 2, imageSize, imageSize);
    ctx.restore();
  }

  function getHackingEffectFrame(elapsed) {
    const frames = hackingEffectImages.frames || [];
    if (frames.length === 0) return null;
    const frameIndex = Math.min(
      frames.length - 1,
      Math.floor((elapsed / HACKING_EFFECT_DURATION) * frames.length)
    );
    return frames[Math.max(0, frameIndex)];
  }

  function getHackerAlpha(h, isInvincibleBlink) {
    if (!isInvincibleBlink) return 1;
    return Math.floor((h.invincible || 0) * 18) % 2 === 0 ? 0.45 : 1;
  }

  function drawSlideTrail(ctx, bodyW, bodyH) {
    const t = performance.now() / 1000;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.lineCap = "round";

    for (let i = 0; i < 4; i += 1) {
      const phase = (t * 18 + i * 0.7) % 1;
      const length = 18 + i * 7;
      const x = -bodyW / 2 - 8 - phase * 18 - i * 4;
      const y = bodyH / 2 - 7 - i * 4;
      ctx.globalAlpha = 0.32 * (1 - phase);
      ctx.strokeStyle = i % 2 === 0 ? "#e9f8ff" : "#27ffc8";
      ctx.lineWidth = Math.max(1, 3 - i * 0.45);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - length, y + 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawDamageFlash(ctx, h) {
    const progress = Math.max(0, Math.min(1, (h.damageFlashTime || 0) / 0.32));
    ctx.save();
    ctx.globalAlpha = 0.34 * progress;
    ctx.fillStyle = h.damageFlashColor || "#ff3b67";
    ctx.fillRect(h.x - 8, h.y - 8, h.w + 16, h.h + 16);
    ctx.restore();
  }

  function drawHackCastEffect(ctx, h) {
    const t = performance.now() / 1000;
    const remaining = h.hackChargeTime || h.hackEffectTime || 0;
    const duration = h.hackChargeDuration || 0.5;
    const progress = 1 - clamp01(remaining / duration);
    const originX = h.w / 2 + 8;
    const originY = h.isSliding ? -2 : -8;

    ctx.save();
    ctx.strokeStyle = "#27ffc8";
    ctx.fillStyle = "#e9fff8";
    ctx.shadowColor = "#27ffc8";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2;

    for (let i = 0; i < 3; i += 1) {
      const radius = 10 + i * 9 + progress * 16;
      ctx.globalAlpha = Math.max(0.12, 0.72 - i * 0.16 - progress * 0.28);
      ctx.beginPath();
      ctx.arc(originX + radius * 0.5, originY + Math.sin(t * 18 + i) * 3, radius, -0.65, 0.65);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.95;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("EXEC", originX + 16, originY - 18);
    ctx.restore();
  }

  function drawWallMoveEffect(ctx, h, bodyW, bodyH) {
    const t = performance.now() / 1000;
    const facing = h.facing || 1;
    const wallSide = h.wallSide || h.wallStickSide || facing;
    const localSide = wallSide * facing;
    const handX = localSide > 0 ? bodyW / 2 + 4 : -bodyW / 2 - 4;
    const handY = h.isSliding ? 0 : -bodyH * 0.22;
    const wallOutward = localSide > 0 ? 1 : -1;
    const slideOutward = -1;
    const climbing = Boolean(h.wallClimbing);
    const sticking = h.wallGrab && (h.wallStickTimer || 0) > 0;
    const sliding = h.wallGrab && !sticking && !climbing;
    const attachPower = clamp01((h.wallAttachEffectTime || 0) / 0.24);
    const slidePower = sliding ? 1 : clamp01((h.wallSlideEffectTime || 0) / 0.28);

    if (climbing && attachPower <= 0) return;

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.lineCap = "round";

    if (!climbing) {
      for (let i = 0; i < 5; i += 1) {
        const phase = (t * (sliding ? 20 : 13) + i * 0.31) % 1;
        const y = sticking
          ? handY + (i - 2) * 4 + Math.sin(t * 18 + i) * 1.5
          : -bodyH / 2 + 8 + i * (bodyH - 16) / 4 + Math.sin(t * 12 + i) * 2;
        const length = sticking ? 6 + attachPower * 10 : 18 + i * 4;
        const drop = sliding ? 12 + phase * 24 : 2 + attachPower * 5;
        const outward = sticking ? wallOutward : slideOutward;
        const alpha = (sticking ? 0.24 : 0.34) * (1 - phase * 0.5) + attachPower * 0.12;

        ctx.globalAlpha = Math.min(0.82, alpha * Math.max(0.45, slidePower));
        ctx.strokeStyle = i % 2 === 0 ? "#e9f8ff" : "#27ffc8";
        ctx.lineWidth = Math.max(1.2, 3 - i * 0.28);
        ctx.beginPath();
        ctx.moveTo(handX, y);
        ctx.lineTo(handX + outward * length, y + drop);
        ctx.stroke();
      }
    }

    if (attachPower > 0) {
      ctx.globalAlpha = 0.78 * attachPower;
      ctx.strokeStyle = "#27ffc8";
      ctx.fillStyle = "#e9fff8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(handX + wallOutward * 3, handY, 4 + attachPower * 7, -0.9, 0.9);
      ctx.stroke();

      for (let i = 0; i < 4; i += 1) {
        const spread = (i - 1.5) * 0.42;
        const startX = handX + wallOutward * 2;
        const startY = handY + spread * 10;
        ctx.globalAlpha = 0.68 * attachPower;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + wallOutward * (7 + attachPower * 8), startY + spread * 6);
        ctx.stroke();
      }

      ctx.globalAlpha = 0.95 * attachPower;
      ctx.beginPath();
      ctx.arc(handX + wallOutward * 2, handY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawGlitchAura(ctx, h) {
    const t = performance.now() / 1000;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#ff3b67";
    ctx.fillRect(h.x - 3 + Math.sin(t * 32) * 2, h.y + 5, 4, h.h - 10);
    ctx.fillStyle = "#33e6ff";
    ctx.fillRect(h.x + h.w - 1 + Math.cos(t * 28) * 2, h.y + 10, 4, h.h - 16);
    ctx.strokeStyle = "rgba(233, 248, 255, 0.62)";
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(h.x - 5, h.y - 4, h.w + 10, h.h + 8);
    ctx.restore();
  }


  function drawStageBanner(ctx, game) {
    const bannerTurn = getStageBannerTurn(game);
    ctx.save();
    ctx.fillStyle = bannerTurn === TURN.ATTACK ? "#ff446a" : "#18e0ff";
    ctx.font = "bold 16px PfStardust30, system-ui";
    ctx.fillText(
      `STAGE ${game.stage} / ${
        bannerTurn === TURN.ATTACK ? "HACKER ATTACK" : "AI DEFENSE"
      }`,
      30,
      40
    );
    ctx.fillStyle = "#c4e9f4";
    ctx.font = "13px PfStardust30, system-ui";
    ctx.fillText(getObjectiveDisplayText(game), 30, 60);

    if (game.stage >= 12) {
      ctx.fillStyle = "#ffcc33";
      ctx.fillText(`INFINITE MODE · BEST ${game.infiniteBest}`, 700, 40);
    }

    ctx.restore();
  }

  function getStageBannerTurn(game) {
    if (game?.turn === TURN.ENDING && game?.bannerTurn) return game.bannerTurn;
    return game?.turn;
  }

  function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + w - r, y);
    context.quadraticCurveTo(x + w, y, x + w, y + r);
    context.lineTo(x + w, y + h - r);
    context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    context.lineTo(x + r, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function getCanvasPos(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.height > rect.width) {
      return {
        x: ((rect.bottom - event.clientY) / rect.height) * canvas.width,
        y: ((event.clientX - rect.left) / rect.width) * canvas.height,
      };
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function selectTrap(type) {
    const wasSelected = Boolean(ui.defenseTools?.querySelector(`.trap-btn.selected[data-trap="${type}"]`));
    for (const btn of document.querySelectorAll(".trap-btn")) {
      btn.classList.toggle("selected", btn.dataset.trap === type);
    }
    const rotation = callbacks.onTrapSelected(type, wasSelected);
    selectedTrapPreview = { type, rotation: Number(rotation) || 0 };
    if (type === "laser") updateLaserDirection(rotation);
  }

  function bindEvents() {
    initializeTrapButtonIcons();
    syncVolumeInputs();
    syncGuideBubbleSkipToggle();
    bindMobileControls();

    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);
    document.addEventListener("click", (event) => {
      if (!event.target?.closest?.("button")) return;
      unlockAudio();
      playSfx("click");
    }, true);

    window.addEventListener("keydown", (event) => {
      if (event.repeat && !keys.has(event.code)) {
        if (attackResumeKeys.has(event.code) || event.code === "Escape") {
          event.preventDefault();
        }
        return;
      }

      if (!event.repeat && callbacks.onTutorialBubbleInput?.()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.code === "Escape" && !event.repeat) {
        event.preventDefault();
        callbacks.onToggleAttackPause();
        return;
      }

      keys.add(event.code);

      if (attackResumeKeys.has(event.code)) {
        event.preventDefault();
        callbacks.onResumeAttackPause();
      }
    });

    window.addEventListener("keyup", (event) => keys.delete(event.code));

    canvas.addEventListener("pointermove", (event) => {
      pointerTrapPreviewPos = getCanvasPos(event);
    });

    canvas.addEventListener("pointerdown", (event) => {
      pointerTrapPreviewPos = getCanvasPos(event);
    });

    canvas.addEventListener("pointerleave", () => {
      pointerTrapPreviewPos = null;
    });

    canvas.addEventListener("click", (event) =>
      callbacks.onCanvasClick(getCanvasPos(event))
    );

    ui.overlay.addEventListener("click", (event) =>
      event.stopPropagation()
    );

    ui.overlayCard?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!ui.overlayCard.classList.contains("click-advances")) return;
      runOverlayAction();
    });

    ui.overlayButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runOverlayAction();
    });

    ui.startReplayBtn.addEventListener(
      "click",
      callbacks.onStartReplay
    );

    ui.deleteTrapBtn.addEventListener("click", () => {
      const active = callbacks.onDeleteTrapMode();
      setDeleteMode(active);
      if (active) closeTrapToolsForMapAction();
    });

    ui.pauseAttackBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      callbacks.onToggleAttackPause();
    });

    ui.objectiveToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      objectivePanelOpen = !objectivePanelOpen;
      ui.objectiveToggle.setAttribute("aria-expanded", objectivePanelOpen ? "true" : "false");
      ui.objectivePanel.classList.toggle("hidden", !objectivePanelOpen);
    });

    ui.trapToolsToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      reopenTrapToolsAfterMapAction = false;
      clearTrapToolsReopenTimer();
      setTrapToolsPanelOpen(!trapToolsPanelOpen);
    });

    ui.trapToolsPanel?.addEventListener("click", (event) => {
      if (event.target?.closest?.("button, input, select, textarea, a")) return;
      event.preventDefault();
      event.stopPropagation();
      callbacks.onCanvasClick(getCanvasPos(event));
    });

    ui.attackSkillsToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      attackSkillsPanelOpen = !attackSkillsPanelOpen;
      ui.attackSkillsToggle.setAttribute("aria-expanded", attackSkillsPanelOpen ? "true" : "false");
      ui.attackSkillsPanel?.classList.toggle("hidden", !attackSkillsPanelOpen);
    });

    ui.settingsBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      console.log("[Settings] toggle");
      setSettingsPanelOpen(!settingsPanelOpen);
    });

    ui.settingsPanel?.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    document.addEventListener("click", (event) => {
      if (!settingsPanelOpen) return;
      if (event.target?.closest?.(".settings-menu")) return;
      setSettingsPanelOpen(false);
    });

    ui.bgmVolume?.addEventListener("input", (event) => {
      setBgmVolume(Number(event.target.value) / 100);
    });

    ui.sfxVolume?.addEventListener("input", (event) => {
      setSfxVolume(Number(event.target.value) / 100);
    });

    ui.guideBubbleSkipToggle?.addEventListener("change", (event) => {
      applyGuideBubbleSkipSetting(Boolean(event.target.checked));
    });

    ui.restartBtn.addEventListener(
      "click",
      callbacks.onRestart
    );

    ui.helpBtn.addEventListener(
      "click",
      callbacks.onHelp
    );

    ui.lobbyBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (callbacks.onReturnToLobby?.()) return;
      setLog("로비 기능은 추후 추가 예정입니다.");
    });

    for (const btn of document.querySelectorAll(".trap-btn")) {
      btn.addEventListener("click", () => {
        selectTrap(btn.dataset.trap);
        if (!guideBubble) closeTrapToolsForMapAction();
      });
    }
  }

  function bindMobileControls() {
    const controls = ui.mobileControls;
    if (!controls) return;

    const releaseKey = (button) => {
      const code = button?.dataset?.code;
      if (!code) return;
      keys.delete(code);
      button.classList.remove("pressed");
    };

    const pressKey = (button, event) => {
      const code = button?.dataset?.code;
      if (!code) return;
      event.preventDefault();
      event.stopPropagation();
      unlockAudio();
      if (callbacks.onTutorialBubbleInput?.()) {
        releaseKey(button);
        return;
      }
      keys.add(code);
      button.classList.add("pressed");
      callbacks.onResumeAttackPause?.();
      button.setPointerCapture?.(event.pointerId);
    };

    for (const button of controls.querySelectorAll(".mobile-control-btn")) {
      button.addEventListener("pointerdown", (event) => pressKey(button, event));
      button.addEventListener("pointerup", (event) => {
        event.preventDefault();
        event.stopPropagation();
        releaseKey(button);
      });
      button.addEventListener("pointercancel", () => releaseKey(button));
      button.addEventListener("lostpointercapture", () => releaseKey(button));
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    }
  }

  function clearMobileControlKeys() {
    if (!ui.mobileControls) return;
    for (const button of ui.mobileControls.querySelectorAll(".mobile-control-btn")) {
      const code = button.dataset.code;
      if (code) keys.delete(code);
      button.classList.remove("pressed");
    }
  }

  function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[ch]));
  }

  return {
    ui,
    keys,
    updateUI,
    draw,
    bindEvents,
    showOverlay,
    hideOverlay,
    showDefenseGuideBubbles,
    showStageFourGuideBubbles,
    queueStageFourLaserRotateGuide,
    showReplayStartGuideBubble,
    hideGuideBubble,
    openObjectivePanel,
    openTrapToolsPanel,
    closeDefenseGuidePanels,
    setLog,
    updateLaserDirection,
    setDeleteMode,
    setSettingsPanelOpen,
    restoreTrapToolsAfterMapAction,
  };
}

// 수정 이유:
// - EMP패널과 강화 함정 상태를 캔버스에 표시하고 카메라 시야 방향을 더 명확히 표현하기 위함
// - 수비 리플레이 지연 중 해커 글리치 효과를 판정 좌표 변경 없이 렌더링에서만 처리하기 위함
// - 공격턴으로 넘어온 방화벽도 실제 닫힘/강화 상태와 같은 모습으로 표시하기 위함
// - 카메라 회전을 제거하고 상단 본체와 하향 시야 형태로 고정하기 위함
// - 설치형/스테이지 카메라 표시 크기를 20% 줄인 공통 크기로 통일하기 위함
// - 감전패널 이동속도 감소와 카메라의 단일 강화 대상 규칙을 툴팁에 반영하기 위함
// - 별도 회전 버튼 없이 설치한 레이저 칸 재클릭으로 회전하도록 선택 UI를 단순화하기 위함
