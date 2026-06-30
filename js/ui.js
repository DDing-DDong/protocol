// ui.js
// 책임: 화면 표시와 버튼 / 캔버스 이벤트만 담당합니다.

import { TURN, getObjective } from "./data.js";
import { getOrientedTrapBox, normalizeRotation } from "./trap.js";

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
  }

  function getTurnLabel(turn) {
    if (turn === TURN.ATTACK) return "해커 공격";
    if (turn === TURN.DEFENSE_BUILD) return "AI 방어 준비";
    if (turn === TURN.DEFENSE_REPLAY) return "AI 방어 리플레이";
    return "결과";
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
      if (hazard.type === "camera") drawCamera(ctx, hazard.x, hazard.y, hazard.w, hazard.h);
      if (hazard.type === "firewall") drawFirewall(ctx, hazard.x, hazard.y, hazard.w, hazard.h);
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
      if (trap.type === "camera") drawCamera(ctx, box.x, box.y, box.w, box.h, normalizeRotation(trap.rotation));
      if (trap.type === "firewall") drawFirewall(ctx, box.x, box.y, box.w, box.h);
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

  function drawCamera(ctx, x, y, w, h, rotation = 0) {
    ctx.save();
    ctx.fillStyle = "rgba(187, 92, 255, 0.16)";
    ctx.beginPath();
    if (rotation === 0) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x, y + h);
    } else if (rotation === 90) {
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
    } else if (rotation === 180) {
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x + w, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#bb5cff";
    ctx.shadowColor = "#bb5cff";
    ctx.shadowBlur = 10;
    if (rotation === 0) ctx.fillRect(x - 10, y + h / 2 - 9, 28, 18);
    else if (rotation === 90) ctx.fillRect(x + w / 2 - 14, y + h - 10, 28, 18);
    else if (rotation === 180) ctx.fillRect(x + w - 18, y + h / 2 - 9, 28, 18);
    else ctx.fillRect(x + w / 2 - 14, y - 8, 28, 18);
    ctx.restore();
  }

  function drawFirewall(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 112, 64, 0.28)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#ff7040";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#ff7040";
    for (let yy = y + 8; yy < y + h; yy += 16) ctx.fillRect(x + 5, yy, w - 10, 4);
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
    for (const btn of document.querySelectorAll(".trap-btn")) {
      btn.classList.toggle("selected", btn.dataset.trap === type);
    }
    callbacks.onTrapSelected(type);
  }

  function rotateTrapPreview() {
    callbacks.onRotateTrap();
    updateRotationButton();
  }

  function updateRotationButton() {
    const btn = ui.defenseTools?.querySelector(".rotation-btn");
    if (btn) {
      btn.textContent = `회전 ${callbacks.getSelectedRotation()}도`;
    }
  }

  function createRotationControl() {
    if (!ui.defenseTools || ui.defenseTools.querySelector(".rotation-grid")) return;

    const grid = document.createElement("div");
    grid.className = "rotation-grid";
    grid.innerHTML = `
      <button class="rotation-btn" type="button">
        회전 ${callbacks.getSelectedRotation()}도
      </button>
    `;

    const actions = ui.defenseTools.querySelector(".tool-actions");
    ui.defenseTools.insertBefore(grid, actions);

    grid
      .querySelector(".rotation-btn")
      .addEventListener("click", rotateTrapPreview);
  }

  function bindEvents() {
    createRotationControl();

    window.addEventListener("keydown", (event) => {
      if (event.code === "KeyE" && !event.repeat) {
        callbacks.onShield();
      }

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
  };
}