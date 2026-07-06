// ui.js
// 책임: 화면 표시와 버튼 / 캔버스 이벤트만 담당합니다.

import {
  TURN,
  getStageById,
  TRAPS,
  getObjective,
  getDefenseObjectiveItems,
  getFirewallBlockTime,
  getCameraEmpowerCount,
  FIREWALL_REWARD_BLOCK_BONUS,
  SHOCK_SLOW_TIME,
  SHOCK_SLOW_MULTIPLIER,
  SHOCK_EMPOWERED_DURATION_BONUS,
  CAMERA_NETWORK_EMPOWER_BONUS,
} from "./data.js";
import {
  getCameraHazardBox,
  getOrientedTrapBox,
  previewNextHazardsByPlacementOrder,
  previewNextTrapsByPlacementOrder,
} from "./trap.js";
import { playSfx, unlockAudio } from "./audio.js";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 540;
const VISUAL_TILE_SIZE = 48;
const VISUAL_TILE_DRAW_W = 56;
const VISUAL_SLOT_W = 44;
const VISUAL_SLOT_H = 11;
const TRAP_IMAGE_BASE_URL = new URL("../assets/images/traps/", import.meta.url);
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
const trapImages = createTrapImages();
const HACKER_IMAGE_BASE_URL = new URL("../assets/images/hacker/", import.meta.url);
const HACKER_IMAGE_FILES = {
  idle: ["idle-1.png", "idle-2.png", "idle-3.png", "idle-4.png"],
  run: ["run-1.png", "run-2.png", "run-3.png", "run-4.png", "run-5.png"],
  jump: ["jump-1.png", "jump-2.png", "jump-3.png", "jump-4.png"],
  slide: ["slide-1.png", "slide-2.png", "slide-3.png"],
};
const hackerImages = createHackerImages();
const transparentHackerFrames = new WeakMap();
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
    image.src = new URL(file, TRAP_IMAGE_BASE_URL).href;
    images[key] = image;
  }
  return images;
}

function createHackerImages() {
  const groups = {};
  for (const [state, files] of Object.entries(HACKER_IMAGE_FILES)) {
    groups[state] = files.map((file) => {
      const image = new Image();
      image.src = new URL(file, HACKER_IMAGE_BASE_URL).href;
      return image;
    });
  }
  return groups;
}

function isImageReady(image) {
  return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

function isDrawableReady(source) {
  if (!source) return false;
  if (source instanceof HTMLCanvasElement) return source.width > 0 && source.height > 0;
  return isImageReady(source);
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
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayButton: document.getElementById("overlayButton"),
    rewardList: document.getElementById("rewardList"),
    startReplayBtn: document.getElementById("startReplayBtn"),
    deleteTrapBtn: document.getElementById("deleteTrapBtn"),
    pauseAttackBtn: document.getElementById("pauseAttackBtn"),
    restartBtn: document.getElementById("restartBtn"),
    helpBtn: document.getElementById("helpBtn"),
  };
  prepareStatusBar(ui);
  prepareAttackSkillPanel(ui, canvas);

  let overlayAction = null;
  let objectivePanelOpen = false;
  let trapToolsPanelOpen = false;
  let attackSkillsPanelOpen = false;
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

  function prepareStatusBar(ui) {
    const statusBar = document.querySelector(".in-game-status");
    if (!statusBar) return;

    statusBar.querySelectorAll(".stat-stage, .stat-turn, .stat-objective")
      .forEach((node) => node.remove());

    if (!ui.logText || ui.logText.closest(".in-game-status")) return;

    const oldLogPanel = ui.logText.closest(".panel-block");
    const logBox = document.createElement("div");
    logBox.className = "status-log";

    const label = document.createElement("span");
    label.textContent = "로그";
    logBox.append(label, ui.logText);

    statusBar.append(logBox);
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

  function showOverlay({ title, text, rewards = [], buttonText = "확인", onButton, speaker = "" }) {
    overlayAction = typeof onButton === "function" ? onButton : hideOverlay;
    ui.overlay.classList.remove("hidden");
    ui.overlay.classList.remove("speaker-ai", "speaker-hacker");
    if (speaker) ui.overlay.classList.add(`speaker-${speaker}`);
    ui.overlayTitle.textContent = title;
    ui.overlayText.textContent = text;
    ui.overlayButton.textContent = buttonText;
    ui.rewardList.innerHTML = "";

    for (const reward of rewards) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `reward-card${reward.recommended ? " recommended selected" : ""}`;
      btn.innerHTML = reward.recommended
        ? `<strong>${escapeHTML(reward.name)} <em class="reward-badge">선택됨</em></strong><span>${escapeHTML(reward.desc)}</span>`
        : `<strong>${escapeHTML(reward.name)}</strong><span>${escapeHTML(reward.desc)}</span>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        callbacks.onApplyReward(reward);
      });
      ui.rewardList.appendChild(btn);
    }
  }

  function hideOverlay() {
    ui.overlay.classList.add("hidden");
    ui.overlay.classList.remove("speaker-ai", "speaker-hacker");
    ui.rewardList.innerHTML = "";
    overlayAction = null;
  }

  function updateUI(game) {
    ui.stageLabel.textContent = String(game.stage);
    ui.turnLabel.textContent = getTurnLabel(game.turn);
    ui.objectiveLabel.textContent = getObjectiveDisplayText(game);
    ui.timerLabel.textContent = game.turn === TURN.ATTACK ? game.timer.toFixed(1) : "-";

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
    if (!showDefenseTools) trapToolsPanelOpen = false;
    ui.defenseTools?.classList.toggle("hidden", !showDefenseTools);
    ui.trapToolsToggle?.setAttribute("aria-expanded", showDefenseTools && trapToolsPanelOpen ? "true" : "false");
    ui.trapToolsPanel?.classList.toggle("hidden", !showDefenseTools || !trapToolsPanelOpen);
    const showAttackSkills = game.turn === TURN.ATTACK;
    if (!showAttackSkills) attackSkillsPanelOpen = false;
    ui.attackSkills?.classList.toggle("hidden", !showAttackSkills);
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
      return "수비 목표를 달성해서 보안을 강화";
    }

    return getObjective(game.stage);
  }

  function updateTrapTooltips(game) {
    const shockBtn = ui.defenseTools?.querySelector('[data-trap="shock"]');
    if (shockBtn) {
      shockBtn.dataset.tooltip = [
        "해커를 감전시켜 이동을 지연시키고 이동속도를 낮춥니다.",
        `공격턴: 이동속도 ${formatPercent(1 - SHOCK_SLOW_MULTIPLIER)} 감소 ${formatSeconds(SHOCK_SLOW_TIME)}`,
        `강화: 지연/감속 지속 +${formatSeconds(SHOCK_EMPOWERED_DURATION_BONUS)}`,
      ].join("\n");
    }

    const cameraBtn = ui.defenseTools?.querySelector('[data-trap="camera"]');
    if (cameraBtn) {
      cameraBtn.dataset.tooltip = [
        "피해를 주지않지만 해커를 탐지해 경보를 충전합니다.",
        `경보는 설치 순서대로 다음 함정 ${getCameraEmpowerCount(game)}개를 강화합니다.`,
        `감시 네트워크 보상: 강화 +${CAMERA_NETWORK_EMPOWER_BONUS}개`,
      ].join("\n");
    }

    const firewallBtn = ui.defenseTools?.querySelector('[data-trap="firewall"]');
    if (!firewallBtn) return;

    firewallBtn.dataset.tooltip = [
      "기본 상태에서는 열려 있습니다.",
      `강화: 현재 ${formatSeconds(getFirewallBlockTime(game))} 동안 경로 차단`,
      `방화벽 강화 보상: +${formatSeconds(FIREWALL_REWARD_BLOCK_BONUS)}`,
    ].join("\n");
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

      btn.replaceChildren(label);
      if (cost) btn.appendChild(cost);
    }
  }

  function updateEmpowerPreview(game) {
    if (!ui.empowerPreview) return;

    const isAttack = game.turn === TURN.ATTACK;
    const isDefense = game.turn === TURN.DEFENSE_BUILD || game.turn === TURN.DEFENSE_REPLAY;
    const targets = isAttack ? (game.baseHazards || []) : isDefense ? (game.placedTraps || []) : [];
    const previewTraps = isAttack
      ? previewNextHazardsByPlacementOrder(game)
      : isDefense ? previewNextTrapsByPlacementOrder(game) : [];
    const visible = (isAttack || isDefense) && targets.length > 0;

    ui.empowerPreview.classList.toggle("hidden", !visible);
    ui.empowerPreview.replaceChildren();
    if (!visible) return;

    const label = document.createElement("span");
    label.className = "empower-preview-label";
    label.textContent = "다음 강화";
    ui.empowerPreview.appendChild(label);

    if (previewTraps.length === 0) {
      const empty = document.createElement("span");
      empty.className = "empower-summary";
      empty.textContent = "대상 없음";
      ui.empowerPreview.appendChild(empty);
      return;
    }

    if (previewTraps.length <= 2) {
      const icons = document.createElement("span");
      icons.className = "empower-icons";

      for (const trap of previewTraps) {
        const icon = createTrapIcon(trap.type);
        icon.dataset.tooltip = TRAPS[trap.type].name;
        icon.tabIndex = 0;
        icon.setAttribute("aria-label", TRAPS[trap.type].name);
        icons.appendChild(icon);
      }

      ui.empowerPreview.appendChild(icons);
      return;
    }

    const summary = document.createElement("span");
    summary.className = "empower-summary";
    summary.textContent = summarizeTrapTypes(previewTraps);
    summary.dataset.tooltip = summarizeTrapTypes(previewTraps);
    summary.tabIndex = 0;
    ui.empowerPreview.appendChild(summary);
  }

  function updateDefenseObjectiveHUD(game) {
    if (!ui.objectiveHud || !ui.objectiveToggle || !ui.objectivePanel) return;

    const items = getDefenseObjectiveItems(game);
    const visible = items.length > 0 && (
      game.turn === TURN.DEFENSE_BUILD || game.turn === TURN.DEFENSE_REPLAY
    );

    if (!visible) {
      objectivePanelOpen = false;
      ui.objectiveHud.classList.add("hidden");
      ui.objectivePanel.classList.add("hidden");
      ui.objectiveToggle.setAttribute("aria-expanded", "false");
      return;
    }

    const completed = items.filter((item) => item.complete).length;
    ui.objectiveHud.classList.remove("hidden");
    ui.objectiveToggle.textContent = `목표 ${completed}/${items.length}`;
    ui.objectiveToggle.setAttribute("aria-expanded", objectivePanelOpen ? "true" : "false");
    ui.objectivePanel.classList.toggle("hidden", !objectivePanelOpen);
    ui.objectivePanel.replaceChildren();

    const title = document.createElement("div");
    title.className = "objective-panel-title";
    title.textContent = "수비 목표";
    ui.objectivePanel.appendChild(title);

    const list = document.createElement("div");
    list.className = "objective-checklist";

    for (const item of items) {
      const row = document.createElement("div");
      row.className = "objective-check-row";
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
    }

    if (game?.turn === TURN.ATTACK && game.hacker) {
      drawSafely(ctx, () => drawHacker(ctx, game.hacker, false));
    }
    if (showDefenseLayout && game?.replayHacker) {
      drawSafely(ctx, () => drawHacker(ctx, game.replayHacker, true));
    }

    if (showDefenseLayout) {
      drawSafely(ctx, () => drawTrapEffects(ctx, game?.placedTraps, game));
      drawSafely(ctx, () => drawObjectiveSpark(ctx, game));
    }

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

    drawFarLayer(ctx, visualTheme, colors);
    drawMidLayer(ctx, visualTheme, colors);
    drawFrontLayer(ctx, visualTheme, colors);
    drawFxLayer(ctx, visualTheme, colors);
    ctx.restore();
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
        drawSquareMetalTile(ctx, x, y, row === 0);
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
      } else if (slot.costDiscount) {
        ctx.strokeStyle = "rgba(55, 255, 150, 0.92)";
        ctx.fillStyle = "rgba(55, 255, 150, 0.20)";
      } else {
        ctx.strokeStyle = "rgba(24,224,255,0.42)";
        ctx.fillStyle = "rgba(24,224,255,0.055)";
      }
      if (slot.blocked || slot.costDiscount) {
        drawSlotGlitch(ctx, x, y, VISUAL_SLOT_W, VISUAL_SLOT_H, slot.blocked ? "blocked" : "discount");
      }

      ctx.lineWidth = slot.blocked || slot.costDiscount ? 2 : 1;
      roundRect(ctx, x, y, VISUAL_SLOT_W, VISUAL_SLOT_H, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = slot.blocked
        ? "rgba(233, 248, 255, 0.42)"
        : slot.costDiscount ? "rgba(233, 248, 255, 0.44)" : "rgba(24,224,255,0.16)";
      ctx.fillRect(x + 7, y + 3, VISUAL_SLOT_W - 14, 1);
      ctx.fillStyle = slot.blocked
        ? "rgba(24, 224, 255, 0.58)"
        : slot.costDiscount ? "rgba(255, 245, 105, 0.62)" : "rgba(39,255,200,0.085)";
      ctx.fillRect(x + 12, y + VISUAL_SLOT_H - 3, VISUAL_SLOT_W - 24, 1);
      ctx.restore();
    }
  }

  function drawSlotGlitch(ctx, x, y, w, h, variant) {
    const t = performance.now() / 1000;
    const pulse = 0.45 + Math.sin(t * 18 + x * 0.05) * 0.14;
    const jitter = Math.round(Math.sin(t * 31 + x * 0.11) * 2);
    const isBlocked = variant === "blocked";
    const primary = isBlocked ? "rgba(255, 43, 139," : "rgba(55, 255, 150,";
    const secondary = isBlocked ? "rgba(24, 224, 255," : "rgba(255, 245, 105,";

    ctx.save();
    ctx.shadowColor = isBlocked ? "#ff2b8b" : "#37ff96";
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
    if (isBlocked) {
      ctx.moveTo(x + 9 + jitter, y - 3);
      ctx.lineTo(x + w - 9 - jitter, y + h + 4);
      ctx.moveTo(x + w - 10 - jitter, y - 3);
      ctx.lineTo(x + 10 + jitter, y + h + 4);
    } else {
      ctx.moveTo(x + 10 + jitter, y + h + 4);
      ctx.lineTo(x + 18 + jitter, y - 3);
      ctx.moveTo(x + 22 - jitter, y + h + 4);
      ctx.lineTo(x + 30 - jitter, y - 3);
    }
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
    ctx.fillRect(x + w / 2 - 2, y, 4, h);
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
    const rotate = options.type === "laser" && rotation !== 90;

    ctx.save();
    ctx.globalAlpha = Number.isFinite(options.alpha) ? options.alpha : 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (rotate) {
      const centerX = box.x + box.w / 2;
      const centerY = box.y + box.h / 2;
      const drawW = box.h;
      const drawH = box.w;
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation - 90) * Math.PI / 180);
      ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      ctx.drawImage(image, box.x, box.y, box.w, box.h);
    }

    ctx.restore();
    return true;
  }

  function getTrapVisualBox(type, x, y, w, h) {
    if (type === "laser") {
      const isHorizontal = w > h;
      if (isHorizontal) {
        return centerBox(x + w / 2, y + h / 2, Math.max(w + 4, 88), Math.max(h + 8, 26));
      }
      const visualW = Math.max(w + 34, 44);
      const visualH = Math.max(h + 44, 108);
      return bottomAlignedBox(x + w / 2, y + h + 12, visualW, visualH);
    }

    if (type === "shock" || type === "emp") {
      const visualW = Math.max(w + 44, 104);
      const visualH = Math.max(h + 30, 38);
      const groundOffset = type === "shock" ? 13 : 11;
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

  function drawHacker(ctx, h, isGhost) {
    ctx.save();
    const isHitFlashing = !isGhost && (h.damageFlashTime || 0) > 0;
    const isInvincibleBlink = !isGhost && (h.invincible || 0) > 0;
    ctx.globalAlpha = isGhost ? 0.72 : getHackerAlpha(h, isInvincibleBlink);
    if (isGhost && h.glitchTime > 0) drawGlitchAura(ctx, h);
    if (isHitFlashing) drawDamageFlash(ctx, h);
    if (drawHackerSprite(ctx, h, isGhost, isHitFlashing)) {
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

  function drawHackerSprite(ctx, h, isGhost, isHitFlashing) {
    const state = getHackerSpriteState(h);
    const frames = hackerImages[state] || hackerImages.idle;
    const frame = getAnimationFrame(frames, getHackerFrameRate(state));
    if (!isImageReady(frame)) return false;
    const drawableFrame = getTransparentHackerFrame(frame);
    if (!isDrawableReady(drawableFrame)) return false;

    const box = getHackerSpriteBox(h, state, drawableFrame);
    const facing = state === "idle" ? -1 : (h.facing || 1);

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
    ctx.drawImage(drawableFrame, -box.w / 2, -box.h / 2, box.w, box.h);
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

  function getHackerSpriteState(h) {
    if (h.isSliding) return "slide";
    if (Math.abs(h.vy || 0) > 20 || !h.onGround) return "jump";
    if (Math.abs(h.vx || 0) > 12) return "run";
    return "idle";
  }

  function getHackerFrameRate(state) {
    if (state === "run") return 12;
    if (state === "slide") return 10;
    if (state === "jump") return 9;
    return 6;
  }

  function getAnimationFrame(frames, fps) {
    const safeFrames = frames || [];
    if (safeFrames.length === 0) return null;
    const index = Math.floor(performance.now() / 1000 * fps) % safeFrames.length;
    return safeFrames[index];
  }

  function getTransparentHackerFrame(image) {
    if (transparentHackerFrames.has(image)) return transparentHackerFrames.get(image);

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const frameCtx = canvas.getContext("2d", { willReadFrequently: true });
    frameCtx.drawImage(image, 0, 0);

    const imageData = frameCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const isBrightNeutral = max > 204 && max - min < 34;
      if (isBrightNeutral) data[i + 3] = 0;
    }

    frameCtx.putImageData(imageData, 0, 0);
    transparentHackerFrames.set(image, canvas);
    return canvas;
  }

  function getHackerSpriteBox(h, state, frame) {
    const aspect = frame.width / frame.height || 1;
    const height = state === "slide" ? h.h * 1.52 : h.h * 1.74;
    const width = height * aspect;
    const groundY = h.y + h.h;
    return {
      x: h.x + h.w / 2 - width / 2,
      y: groundY - height,
      w: width,
      h: height,
    };
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
    const sticking = h.wallGrab && (h.wallStickTimer || 0) > 0;
    const sliding = h.wallGrab && !sticking;
    const attachPower = clamp01((h.wallAttachEffectTime || 0) / 0.24);
    const slidePower = sliding ? 1 : clamp01((h.wallSlideEffectTime || 0) / 0.28);

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.lineCap = "round";

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
    if (type === "laser") updateLaserDirection(rotation);
  }

  function bindEvents() {
    initializeTrapButtonIcons();

    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);
    document.addEventListener("click", (event) => {
      if (!event.target?.closest?.("button")) return;
      unlockAudio();
      playSfx("click");
    }, true);

    window.addEventListener("keydown", (event) => {
      if (event.repeat && !keys.has(event.code)) {
        if (attackResumeKeys.has(event.code) || event.code === "KeyS") {
          event.preventDefault();
        }
        return;
      }

      if (event.code === "KeyS" && !event.repeat) {
        event.preventDefault();
        callbacks.onToggleAttackPause();
        return;
      }

      if (!event.repeat && callbacks.canPlayAttackSfx?.()) {
        if (event.code === "ArrowUp") playSfx("jump");
        if (event.code === "ShiftLeft" || event.code === "ShiftRight") playSfx("dash");
      }

      keys.add(event.code);

      if (attackResumeKeys.has(event.code)) {
        event.preventDefault();
        callbacks.onResumeAttackPause();
      }
    });

    window.addEventListener("keyup", (event) => keys.delete(event.code));

    canvas.addEventListener("click", (event) =>
      callbacks.onCanvasClick(getCanvasPos(event))
    );

    ui.overlay.addEventListener("click", (event) =>
      event.stopPropagation()
    );

    ui.overlayButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const action = overlayAction;

      if (typeof action === "function") {
        action();
      } else {
        hideOverlay();
      }
    });

    ui.startReplayBtn.addEventListener(
      "click",
      callbacks.onStartReplay
    );

    ui.deleteTrapBtn.addEventListener(
      "click",
      () => setDeleteMode(callbacks.onDeleteTrapMode())
    );

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
      trapToolsPanelOpen = !trapToolsPanelOpen;
      ui.trapToolsToggle.setAttribute("aria-expanded", trapToolsPanelOpen ? "true" : "false");
      ui.trapToolsPanel?.classList.toggle("hidden", !trapToolsPanelOpen);
    });

    ui.attackSkillsToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      attackSkillsPanelOpen = !attackSkillsPanelOpen;
      ui.attackSkillsToggle.setAttribute("aria-expanded", attackSkillsPanelOpen ? "true" : "false");
      ui.attackSkillsPanel?.classList.toggle("hidden", !attackSkillsPanelOpen);
    });

    ui.restartBtn.addEventListener(
      "click",
      callbacks.onRestart
    );

    ui.helpBtn.addEventListener(
      "click",
      callbacks.onHelp
    );

    for (const btn of document.querySelectorAll(".trap-btn")) {
      btn.addEventListener("click", () =>
        selectTrap(btn.dataset.trap)
      );
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
    setLog,
    updateLaserDirection,
    setDeleteMode,
  };
}

// 수정 이유:
// - EMP패널과 강화 함정 상태를 캔버스에 표시하고 카메라 시야 방향을 더 명확히 표현하기 위함
// - 수비 리플레이 지연 중 해커 글리치 효과를 판정 좌표 변경 없이 렌더링에서만 처리하기 위함
// - 공격턴으로 넘어온 방화벽도 실제 닫힘/강화 상태와 같은 모습으로 표시하기 위함
// - 카메라 회전을 제거하고 상단 본체와 하향 시야 형태로 고정하기 위함
// - 설치형/스테이지 카메라 표시 크기를 20% 줄인 공통 크기로 통일하기 위함
// - 감전패널 이동속도 감소와 감시 네트워크 보상 수치를 툴팁에 반영하기 위함
// - 별도 회전 버튼 없이 레이저 선택 버튼 재클릭으로 회전하도록 선택 UI를 단순화하기 위함
