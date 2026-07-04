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

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 540;
const VISUAL_TILE_SIZE = 48;
const VISUAL_TILE_DRAW_W = 56;
const VISUAL_SLOT_W = 44;
const VISUAL_SLOT_H = 11;
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
    budgetLabel: document.getElementById("budgetLabel"),
    detectLabel: document.getElementById("detectLabel"),
    delayLabel: document.getElementById("delayLabel"),
    defenseTools: document.getElementById("defenseTools"),
    logText: document.getElementById("logText"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    overlayButton: document.getElementById("overlayButton"),
    rewardList: document.getElementById("rewardList"),
    startReplayBtn: document.getElementById("startReplayBtn"),
    deleteTrapBtn: document.getElementById("deleteTrapBtn"),
    restartBtn: document.getElementById("restartBtn"),
    helpBtn: document.getElementById("helpBtn"),
  };

  let overlayAction = null;
  let objectivePanelOpen = false;
  const keys = new Set();

  function setLog(text) {
    ui.logText.textContent = text;
  }

  function showOverlay({ title, text, rewards = [], buttonText = "확인", onButton }) {
    overlayAction = typeof onButton === "function" ? onButton : hideOverlay;
    ui.overlay.classList.remove("hidden");
    ui.overlayTitle.textContent = title;
    ui.overlayText.textContent = text;
    ui.overlayButton.textContent = buttonText;
    ui.rewardList.innerHTML = "";

    for (const reward of rewards) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reward-card";
      btn.innerHTML = `<strong>${escapeHTML(reward.name)}</strong><span>${escapeHTML(reward.desc)}</span>`;
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
    ui.detectLabel.textContent = String(game.metrics.detections);
    ui.delayLabel.textContent = `${game.metrics.delay.toFixed(1)}s`;
    ui.defenseTools.classList.toggle("hidden", game.turn !== TURN.DEFENSE_BUILD);
    ui.startReplayBtn.disabled = game.turn !== TURN.DEFENSE_BUILD;
    ui.deleteTrapBtn.disabled = game.turn !== TURN.DEFENSE_BUILD;
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
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawBackground(ctx, game);
    drawPlatforms(ctx, game.platforms);
    drawCore(ctx, game.core);
    drawBaseHazards(ctx, game);

    const showDefenseLayout = game.turn === TURN.DEFENSE_BUILD ||
      game.turn === TURN.DEFENSE_REPLAY ||
      game.showFailedDefenseLayout;

    if (showDefenseLayout) {
      drawReplayPath(ctx, game.lastAttackRecording);
      drawTrapSlots(ctx, game.trapSlots);
      drawPlacedTraps(ctx, game.placedTraps, game);
    }

    if (game.turn === TURN.ATTACK && game.hacker) drawHacker(ctx, game.hacker, false);
    if (showDefenseLayout && game.replayHacker) {
      drawHacker(ctx, game.replayHacker, true);
    }

    drawStageBanner(ctx, game);
  }

  function drawBackground(ctx, game) {
    const stageData = getStageById(game.stage);
    const visualTheme = getStageVisualTheme(game.stage, stageData);
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
    return {
      theme: {
        ...fallback.theme,
        ...(stageData?.theme || {}),
      },
      backgroundLayers: {
        far: stageData?.backgroundLayers?.far?.length ? stageData.backgroundLayers.far : fallback.backgroundLayers.far,
        mid: stageData?.backgroundLayers?.mid?.length ? stageData.backgroundLayers.mid : fallback.backgroundLayers.mid,
        front: stageData?.backgroundLayers?.front?.length ? stageData.backgroundLayers.front : fallback.backgroundLayers.front,
        fx: stageData?.backgroundLayers?.fx?.length ? stageData.backgroundLayers.fx : fallback.backgroundLayers.fx,
      },
    };
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
    if (!visualTheme.backgroundLayers.far.includes("future-city")) return;

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
    const layers = visualTheme.backgroundLayers.mid || [];
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
    const layers = visualTheme.backgroundLayers.front || [];
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
    const layers = visualTheme.backgroundLayers.fx || [];
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
    for (const platform of platforms) {
      drawTilePlatform(ctx, platform);
    }
  }

  function drawTilePlatform(ctx, platform) {
    const visualH = Math.max(VISUAL_TILE_SIZE, Math.ceil(platform.h / VISUAL_TILE_SIZE) * VISUAL_TILE_SIZE);
    const visualW = getPlatformVisualTileWidth(platform);
    const cols = Math.ceil(visualW / VISUAL_TILE_SIZE);
    const rows = Math.ceil(visualH / VISUAL_TILE_SIZE);
    const visualX = Math.round(platform.x);

    ctx.save();
    ctx.beginPath();
    ctx.rect(platform.x - VISUAL_TILE_SIZE / 2, platform.y, platform.w + VISUAL_TILE_SIZE, visualH);
    ctx.clip();

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = visualX + col * VISUAL_TILE_SIZE;
        const y = platform.y + row * VISUAL_TILE_SIZE;
        drawSquareMetalTile(ctx, x, y, row === 0);
      }
    }

    ctx.strokeStyle = "rgba(24, 224, 255, 0.28)";
    ctx.lineWidth = 1;
    for (let x = visualX; x <= visualX + visualW; x += VISUAL_TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, platform.y);
      ctx.lineTo(x + 0.5, platform.y + visualH);
      ctx.stroke();
    }
    for (let y = platform.y; y <= platform.y + visualH; y += VISUAL_TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(platform.x, y + 0.5);
      ctx.lineTo(platform.x + platform.w, y + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(platform.x, platform.y, platform.w, 2);
    ctx.fillStyle = "rgba(24, 224, 255, 0.12)";
    ctx.fillRect(platform.x, platform.y + 2, platform.w, 1);
    ctx.restore();
  }

  function getPlatformVisualTileWidth(platform) {
    if (platform.w <= VISUAL_TILE_SIZE) return VISUAL_TILE_SIZE;
    const tileCount = Math.max(1, Math.round(platform.w / VISUAL_TILE_SIZE));
    return tileCount * VISUAL_TILE_SIZE;
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
    ctx.save();
    ctx.fillStyle = "#27ffc8";
    ctx.shadowColor = "#27ffc8";
    ctx.shadowBlur = 18;
    ctx.fillRect(core.x, core.y, core.w, core.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#06251f";
    ctx.fillRect(core.x + 10, core.y + 12, core.w - 20, core.h - 24);
    ctx.fillStyle = "#27ffc8";
    ctx.font = "12px monospace";
    ctx.fillText("CORE", core.x + 5, core.y - 8);
    ctx.restore();
  }

  function drawBaseHazards(ctx, game) {
    if (!game.baseHazards || game.baseHazards.length === 0) return;
    for (const hazard of game.baseHazards) {
      let box = hazard;
      if (hazard.type === "laser") drawLaser(ctx, hazard.x, hazard.y, hazard.w, hazard.h);
      if (hazard.type === "shock") drawShock(ctx, hazard.x, hazard.y, hazard.w, hazard.h);
      if (hazard.type === "camera") {
        const cameraBox = getCameraHazardBox(hazard);
        box = cameraBox;
        drawCamera(ctx, cameraBox.x, cameraBox.y, cameraBox.w, cameraBox.h);
      }
      if (hazard.type === "firewall") drawFirewall(ctx, hazard.x, hazard.y, hazard.w, hazard.h, hazard.closed || hazard.empowered);
      if (hazard.type === "emp") drawEmp(ctx, hazard.x, hazard.y, hazard.w, hazard.h);
      if (hazard.empowered) drawEmpoweredMark(ctx, box);
    }
  }

  function drawTrapSlots(ctx, trapSlots) {
    for (const slot of trapSlots) {
      ctx.save();
      const x = Math.round(slot.x - VISUAL_SLOT_W / 2);
      const y = Math.round(slot.y - VISUAL_SLOT_H - 2);
      ctx.strokeStyle = slot.occupied ? "rgba(255,255,255,0.12)" : "rgba(24,224,255,0.42)";
      ctx.fillStyle = slot.occupied ? "rgba(255,255,255,0.045)" : "rgba(24,224,255,0.055)";
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, VISUAL_SLOT_W, VISUAL_SLOT_H, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = slot.occupied ? "rgba(255,255,255,0.09)" : "rgba(24,224,255,0.16)";
      ctx.fillRect(x + 7, y + 3, VISUAL_SLOT_W - 14, 1);
      ctx.fillStyle = slot.occupied ? "rgba(255,255,255,0.060)" : "rgba(39,255,200,0.085)";
      ctx.fillRect(x + 12, y + VISUAL_SLOT_H - 3, VISUAL_SLOT_W - 24, 1);
      ctx.restore();
    }
  }

  function drawPlacedTraps(ctx, placedTraps, game) {
    for (const trap of placedTraps) {
      const box = getOrientedTrapBox(trap, game);
      if (trap.type === "laser") drawLaser(ctx, box.x, box.y, box.w, box.h);
      if (trap.type === "shock") drawShock(ctx, box.x, box.y, box.w, box.h);
      if (trap.type === "camera") drawCamera(ctx, box.x, box.y, box.w, box.h);
      if (trap.type === "firewall") drawFirewall(ctx, box.x, box.y, box.w, box.h, trap.closed || trap.empowered);
      if (trap.type === "emp") drawEmp(ctx, box.x, box.y, box.w, box.h);
      if (trap.empowered) drawEmpoweredMark(ctx, box);
    }
  }

  function drawLaser(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 59, 103, 0.22)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#ff3b67";
    ctx.shadowColor = "#ff3b67";
    ctx.shadowBlur = 12;
    ctx.fillRect(x + w / 2 - 2, y, 4, h);
    ctx.restore();
  }

  function drawShock(ctx, x, y, w, h) {
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

  function drawEmp(ctx, x, y, w, h) {
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

  function drawCamera(ctx, x, y, w, h) {
    const bodyW = Math.min(56, w * 0.5);
    const bodyH = Math.min(36, h * 0.32);
    const bodyX = x + w - bodyW - 2;
    const bodyY = y;
    const coneTopLeft = { x: bodyX + 4, y: bodyY + bodyH };
    const coneTopRight = { x: bodyX + bodyW - 10, y: bodyY + bodyH };
    const coneBottomRight = { x: coneTopRight.x, y: y + h };
    const coneBottomLeft = { x: x + 8, y: y + h };

    ctx.save();
    ctx.fillStyle = "rgba(187, 92, 255, 0.24)";
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
    ctx.strokeStyle = "rgba(187, 92, 255, 0.78)";
    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW / 2, bodyY + bodyH);
    ctx.lineTo((coneBottomLeft.x + coneBottomRight.x) / 2, coneBottomLeft.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#bb5cff";
    ctx.shadowColor = "#bb5cff";
    ctx.shadowBlur = 10;
    roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 8);
    ctx.fill();
    ctx.restore();
  }

  function drawFirewall(ctx, x, y, w, h, closed = false) {
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

  function drawEmpoweredMark(ctx, box) {
    ctx.save();
    ctx.strokeStyle = "#27ffc8";
    ctx.shadowColor = "#27ffc8";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8);
    ctx.fillStyle = "#27ffc8";
    ctx.font = "bold 11px system-ui";
    ctx.fillText("BOOST", box.x, box.y - 8);
    ctx.restore();
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
    ctx.globalAlpha = isGhost ? 0.72 : 1;
    if (isGhost && h.glitchTime > 0) drawGlitchAura(ctx, h);
    ctx.translate(h.x + h.w / 2, h.y + h.h / 2);
    ctx.scale(h.facing || 1, 1);
    ctx.fillStyle = isGhost ? "#8af2ff" : "#18e0ff";
    ctx.shadowColor = isGhost ? "#8af2ff" : "#18e0ff";
    ctx.shadowBlur = 12;
    const bodyW = h.isSliding ? h.w + 18 : h.w;
    const bodyH = h.h;
    ctx.fillRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH);
    ctx.fillStyle = "#071019";
    ctx.fillRect(2, h.isSliding ? -5 : -14, 9, 6);
    ctx.fillStyle = "#e9f8ff";
    ctx.fillRect(9, h.isSliding ? 1 : -8, 16, 4);

    if (h.shield) {
      ctx.strokeStyle = "#27ffc8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 38, 0, Math.PI * 2);
      ctx.stroke();

      drawShieldTimer(ctx, h);
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

  function drawShieldTimer(ctx, h) {
    const shieldTime =
      typeof h.shieldTimer === "number"
        ? h.shieldTimer
        : typeof h.shieldTime === "number"
          ? h.shieldTime
          : typeof h.shieldDuration === "number"
            ? h.shieldDuration
            : null;

    if (shieldTime === null) return;

    const remainSeconds = Math.max(0, Math.ceil(shieldTime));

    ctx.save();
    ctx.scale(h.facing || 1, 1);

    const x = -14;
    const y = -h.h / 2 - 34;

    ctx.strokeStyle = "#27ffc8";
    ctx.fillStyle = "rgba(39, 255, 200, 0.08)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.quadraticCurveTo(x + 10, y - 3, x + 20, y + 2);
    ctx.lineTo(x + 18, y + 15);
    ctx.quadraticCurveTo(x + 10, y + 23, x + 2, y + 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#27ffc8";
    ctx.shadowColor = "#27ffc8";
    ctx.shadowBlur = 8;
    ctx.font = "bold 15px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${remainSeconds}s`, x + 30, y + 11);

    ctx.restore();
  }

  function drawStageBanner(ctx, game) {
    ctx.save();
    ctx.fillStyle = "rgba(3, 8, 13, 0.66)";
    ctx.fillRect(16, 16, 390, 54);
    ctx.fillStyle = "#18e0ff";
    ctx.font = "bold 16px system-ui";
    ctx.fillText(
      `STAGE ${game.stage} / ${
        game.turn === TURN.ATTACK ? "HACKER ATTACK" : "AI DEFENSE"
      }`,
      30,
      40
    );
    ctx.fillStyle = "#c4e9f4";
    ctx.font = "13px system-ui";
    ctx.fillText(getObjectiveDisplayText(game), 30, 60);

    if (game.stage >= 12) {
      ctx.fillStyle = "#ffcc33";
      ctx.fillText(`INFINITE MODE · BEST ${game.infiniteBest}`, 700, 40);
    }

    // ===== 기존 상단 실드 타이머 삭제 =====
    // 아래 코드가 있었다면 전부 삭제
    //
    // if (game.hacker?.shield) {
    //    ctx.fillText(...);
    // }
    //
    // ===================================

    ctx.restore();
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

    window.addEventListener("keydown", (event) => {

      keys.add(event.code);

      if (
        [
          "Space",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(event.code)
      ) {
        event.preventDefault();
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

    ui.objectiveToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      objectivePanelOpen = !objectivePanelOpen;
      ui.objectiveToggle.setAttribute("aria-expanded", objectivePanelOpen ? "true" : "false");
      ui.objectivePanel.classList.toggle("hidden", !objectivePanelOpen);
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
