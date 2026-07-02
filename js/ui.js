// ui.js
// 책임: 화면 표시와 버튼 / 캔버스 이벤트만 담당합니다.

import {
  TURN,
  getObjective,
  getFirewallBlockTime,
  getCameraEmpowerCount,
  FIREWALL_REWARD_BLOCK_BONUS,
  SHOCK_SLOW_TIME,
  SHOCK_SLOW_MULTIPLIER,
  SHOCK_EMPOWERED_DURATION_BONUS,
  CAMERA_NETWORK_EMPOWER_BONUS,
} from "./data.js";
import { getCameraHazardBox, getOrientedTrapBox } from "./trap.js";

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
    undoTrapBtn: document.getElementById("undoTrapBtn"),
    restartBtn: document.getElementById("restartBtn"),
    helpBtn: document.getElementById("helpBtn"),
  };

  let overlayAction = null;
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
    ui.objectiveLabel.textContent = getObjective(game.stage);
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
    ui.helpBtn.disabled = game.turn === TURN.ENDING;
    updateTrapTooltips(game);
  }

  function getTurnLabel(turn) {
    if (turn === TURN.ATTACK) return "해커 공격";
    if (turn === TURN.DEFENSE_BUILD) return "AI 방어 준비";
    if (turn === TURN.DEFENSE_REPLAY) return "AI 방어 리플레이";
    return "결과";
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

  function formatSeconds(value) {
    const rounded = Math.round(value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}초`;
  }

  function formatPercent(value) {
    return `${Math.round(value * 100)}%`;
  }

  function draw(game) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 1200, 540);
    drawBackground(ctx);
    drawPlatforms(ctx, game.platforms);
    drawCore(ctx, game.core);
    drawBaseHazards(ctx, game);

    if (game.turn === TURN.DEFENSE_BUILD || game.turn === TURN.DEFENSE_REPLAY) {
      drawReplayPath(ctx, game.lastAttackRecording);
      drawTrapSlots(ctx, game.trapSlots);
      drawPlacedTraps(ctx, game.placedTraps, game);
    }

    if (game.turn === TURN.ATTACK && game.hacker) drawHacker(ctx, game.hacker, false);
    if ((game.turn === TURN.DEFENSE_BUILD || game.turn === TURN.DEFENSE_REPLAY) && game.replayHacker) {
      drawHacker(ctx, game.replayHacker, true);
    }

    drawStageBanner(ctx, game);
  }

  function drawBackground(ctx) {
    ctx.save();
    ctx.fillStyle = "#071019";
    ctx.fillRect(0, 0, 1200, 540);
    ctx.strokeStyle = "rgba(24, 224, 255, 0.07)";
    ctx.lineWidth = 1;
    for (let x = 0; x < 1200; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 540);
      ctx.stroke();
    }
    for (let y = 0; y < 540; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1200, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255, 59, 103, 0.05)";
    ctx.fillRect(0, 0, 1200, 70);
    ctx.restore();
  }

  function drawPlatforms(ctx, platforms) {
    for (const platform of platforms) {
      drawTilePlatform(ctx, platform);
    }
  }

  function drawTilePlatform(ctx, platform) {
    const cols = Math.ceil(platform.w / 32);
    const rows = Math.ceil(platform.h / 32);

    ctx.save();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = platform.x + col * 32;
        const y = platform.y + row * 32;
        const w = Math.min(32, platform.x + platform.w - x);
        const h = Math.min(32, platform.y + platform.h - y);
        if (w <= 0 || h <= 0) continue;

        ctx.fillStyle = row === 0 ? "#12324a" : "#0f2638";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = "rgba(24, 224, 255, 0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));

        if (row === 0) {
          ctx.fillStyle = "rgba(24, 224, 255, 0.62)";
          ctx.fillRect(x, y, w, 3);
        }
      }
    }
    ctx.restore();
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
      if (hazard.type === "laser") drawLaser(ctx, hazard.x, hazard.y, hazard.w, hazard.h);
      if (hazard.type === "shock") drawShock(ctx, hazard.x, hazard.y, hazard.w, hazard.h);
      if (hazard.type === "camera") {
        const cameraBox = getCameraHazardBox(hazard);
        drawCamera(ctx, cameraBox.x, cameraBox.y, cameraBox.w, cameraBox.h);
      }
      if (hazard.type === "firewall") drawFirewall(ctx, hazard.x, hazard.y, hazard.w, hazard.h, hazard.closed || hazard.empowered);
      if (hazard.type === "emp") drawEmp(ctx, hazard.x, hazard.y, hazard.w, hazard.h);
    }
  }

  function drawTrapSlots(ctx, trapSlots) {
    for (const slot of trapSlots) {
      ctx.save();
      ctx.strokeStyle = slot.occupied ? "rgba(255,255,255,0.18)" : "#18e0ff";
      ctx.fillStyle = slot.occupied ? "rgba(255,255,255,0.06)" : "rgba(24,224,255,0.08)";
      ctx.lineWidth = 2;
      roundRect(ctx, slot.x - 16 + 2, slot.y - 32 + 2, 32 - 4, 32 - 4, 6);
      ctx.fill();
      ctx.stroke();
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
    ctx.fillRect(-h.w / 2, -h.h / 2, h.w, h.h);
    ctx.fillStyle = "#071019";
    ctx.fillRect(2, -14, 9, 6);
    ctx.fillStyle = "#e9f8ff";
    ctx.fillRect(9, -8, 16, 4);

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
    ctx.fillText(getObjective(game.stage), 30, 60);

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

    ui.undoTrapBtn.addEventListener(
      "click",
      callbacks.onUndoTrap
    );

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
