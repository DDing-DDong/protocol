// js/lobby.js
// Handles only Splash/Lobby screen transitions and lobby button wiring.

import { playLobbyBgm, unlockAudio } from "./audio.js?v=20260709-stage-clear-sfx";

const SPLASH_DELAY_MS = 1400;
const AI_SKIN_STORAGE_KEY = "traceProtocolAiPortraitSkin";
const AI_SKIN_PURCHASE_STORAGE_KEY = "traceProtocolPurchasedAiSkins";
const SELECTABLE_AI_SKINS = [
  {
    id: "classic",
    name: "AI 시스템",
    desc: "인류를 통제하고 싶어했던 AI",
    owned: true,
  },
  {
    id: "android",
    name: "과거의 그것",
    desc: "불빛은 박동없는 심장으로 움직이고.",
    owned: false,
  },
];

export function initLobby({
  onStart,
  onHelp,
  onSettings,
} = {}) {
  const root = document.getElementById("lobbyRoot");
  const splashScreen = document.getElementById("splashScreen");
  const lobbyScreen = document.getElementById("lobbyScreen");
  const startBtn = document.getElementById("lobbyStartBtn");
  const skinBtn = document.getElementById("lobbySkinBtn");
  const helpBtn = document.getElementById("lobbyHelpBtn");
  const settingsBtn = document.getElementById("lobbySettingsBtn");
  const skinPanel = createSkinPanel();
  const skinPurchaseModal = createSkinPurchaseModal();

  let active = true;
  let helpOverlayOpen = false;
  let skinPanelOpen = false;
  let pendingPurchaseSkinId = "";

  document.body.classList.add("lobby-active");
  skinBtn?.after(skinPanel);
  root?.appendChild(skinPurchaseModal);

  const getPurchasedSkins = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(AI_SKIN_PURCHASE_STORAGE_KEY) || "[]");
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  };

  const isSkinOwned = (skinId) => {
    const skin = SELECTABLE_AI_SKINS.find((item) => item.id === skinId);
    if (skin?.owned) return true;
    return getPurchasedSkins().has(skinId);
  };

  const purchaseSkin = (skinId) => {
    const purchased = getPurchasedSkins();
    purchased.add(skinId);
    localStorage.setItem(AI_SKIN_PURCHASE_STORAGE_KEY, JSON.stringify([...purchased]));
  };

  const getSelectedSkin = () => {
    const stored = localStorage.getItem(AI_SKIN_STORAGE_KEY);
    if (SELECTABLE_AI_SKINS.some((skin) => skin.id === stored) && isSkinOwned(stored)) return stored;
    return SELECTABLE_AI_SKINS[0].id;
  };

  const setSkinPanelOpen = (open) => {
    skinPanelOpen = Boolean(open);
    skinBtn?.setAttribute("aria-expanded", skinPanelOpen ? "true" : "false");
    skinPanel.classList.toggle("hidden", !skinPanelOpen);
  };

  const setSkinPurchaseModalOpen = (open, mode = "confirm") => {
    skinPurchaseModal.classList.toggle("hidden", !open);
    skinPurchaseModal.dataset.mode = mode;
    skinPurchaseModal.querySelector(".lobby-skin-purchase-title").textContent =
      mode === "complete" ? "구매완료" : "구매하시겠습니까?";
    skinPurchaseModal.querySelector(".lobby-skin-purchase-text").textContent =
      mode === "complete"
        ? "과거의 그것 스킨을 사용할 수 있습니다."
        : "과거의 그것 스킨을 구매하시겠습니까?";
    skinPurchaseModal.querySelector(".lobby-skin-purchase-confirm").classList.toggle("hidden", mode === "complete");
    skinPurchaseModal.querySelector(".lobby-skin-purchase-cancel").classList.toggle("hidden", mode === "complete");
    skinPurchaseModal.querySelector(".lobby-skin-purchase-ok").classList.toggle("hidden", mode !== "complete");
  };

  const refreshSkinButtons = () => {
    const selectedSkin = getSelectedSkin();
    skinPanel.querySelectorAll(".lobby-skin-option").forEach((button) => {
      const selected = button.dataset.skin === selectedSkin;
      const locked = !isSkinOwned(button.dataset.skin);
      button.classList.toggle("selected", selected);
      button.classList.toggle("locked", locked);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.setAttribute("aria-disabled", locked ? "true" : "false");
    });
  };

  const selectSkin = (skinId) => {
    const nextSkin = SELECTABLE_AI_SKINS.some((skin) => skin.id === skinId) ? skinId : SELECTABLE_AI_SKINS[0].id;
    if (!isSkinOwned(nextSkin)) {
      pendingPurchaseSkinId = nextSkin;
      setSkinPurchaseModalOpen(true, "confirm");
      return;
    }
    localStorage.setItem(AI_SKIN_STORAGE_KEY, nextSkin);
    refreshSkinButtons();
    document.dispatchEvent(new CustomEvent("protocol:ai-skin-change", {
      detail: { skin: nextSkin },
    }));
  };

  const showLobby = () => {
    active = true;
    root?.classList.remove("hidden");
    document.body.classList.add("lobby-active");
    document.body.classList.remove("lobby-modal-open", "lobby-settings-open");
    setSkinPanelOpen(false);
    setSkinPurchaseModalOpen(false);
    splashScreen?.classList.add("hidden");
    lobbyScreen?.classList.remove("hidden");
  };

  const hideLobby = () => {
    active = false;
    root?.classList.add("hidden");
    document.body.classList.remove("lobby-active", "lobby-modal-open", "lobby-settings-open");
    setSkinPanelOpen(false);
    setSkinPurchaseModalOpen(false);
  };

  const startLobbyBgm = () => {
    if (!active) return;
    unlockAudio();
    playLobbyBgm();
  };

  const restoreLobbyAfterHelp = () => {
    if (!active || !helpOverlayOpen) return;
    helpOverlayOpen = false;
    root?.classList.remove("hidden");
    document.body.classList.remove("lobby-modal-open");
  };

  window.setTimeout(showLobby, SPLASH_DELAY_MS);
  selectSkin(getSelectedSkin());
  refreshSkinButtons();

  root?.addEventListener("pointerdown", startLobbyBgm);
  document.addEventListener("keydown", startLobbyBgm);

  startBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startLobbyBgm();
    hideLobby();
    onStart?.();
  });

  helpBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startLobbyBgm();
    helpOverlayOpen = true;
    root?.classList.add("hidden");
    document.body.classList.add("lobby-modal-open");
    onHelp?.();
  });

  skinBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startLobbyBgm();
    refreshSkinButtons();
    setSkinPanelOpen(!skinPanelOpen);
  });

  skinPanel.addEventListener("click", (event) => {
    const button = event.target?.closest?.(".lobby-skin-option");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    selectSkin(button.dataset.skin);
    if (isSkinOwned(button.dataset.skin)) setSkinPanelOpen(false);
  });

  skinPurchaseModal.addEventListener("click", (event) => {
    if (event.target === skinPurchaseModal) {
      setSkinPurchaseModalOpen(false);
      return;
    }

    const action = event.target?.closest?.("button")?.dataset?.action;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();

    if (action === "cancel" || action === "ok") {
      setSkinPurchaseModalOpen(false);
      return;
    }

    if (action === "confirm" && pendingPurchaseSkinId) {
      purchaseSkin(pendingPurchaseSkinId);
      refreshSkinButtons();
      setSkinPurchaseModalOpen(true, "complete");
    }
  });

  settingsBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startLobbyBgm();
    document.body.classList.add("lobby-settings-open");
    onSettings?.();
  });

  document.addEventListener("protocol:settings-panel-toggle", (event) => {
    if (event.detail?.open) return;
    document.body.classList.remove("lobby-settings-open");
  });

  document.addEventListener("click", (event) => {
    if (!skinPurchaseModal.classList.contains("hidden")) return;
    if (skinPanelOpen && !event.target?.closest?.("#lobbySkinBtn, .lobby-skin-panel")) {
      setSkinPanelOpen(false);
    }
    if (!document.body.classList.contains("lobby-settings-open")) return;
    if (event.target?.closest?.(".settings-menu, #lobbySettingsBtn")) return;
    document.body.classList.remove("lobby-settings-open");
  });

  const overlay = document.getElementById("overlay");
  const observer = overlay
    ? new MutationObserver(() => {
        if (overlay.classList.contains("hidden")) restoreLobbyAfterHelp();
      })
    : null;
  observer?.observe(overlay, { attributes: true, attributeFilter: ["class"] });

  return {
    showLobby,
    hideLobby,
    playLobbyBgm: startLobbyBgm,
  };
}

function createSkinPanel() {
  const panel = document.createElement("div");
  panel.className = "lobby-skin-panel hidden";
  panel.setAttribute("aria-label", "AI 초상화 스킨 선택");

  for (const skin of SELECTABLE_AI_SKINS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lobby-skin-option";
    button.dataset.skin = skin.id;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `
      <span class="lobby-skin-swatch lobby-skin-swatch-${skin.id}" aria-hidden="true"></span>
      <span><strong>${skin.name}</strong><small>${skin.desc}</small></span>
    `;
    panel.appendChild(button);
  }

  return panel;
}

function createSkinPurchaseModal() {
  const modal = document.createElement("div");
  modal.className = "lobby-skin-purchase-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "스킨 구매 확인");
  modal.innerHTML = `
    <div class="lobby-skin-purchase-card">
      <h2 class="lobby-skin-purchase-title">구매하시겠습니까?</h2>
      <p class="lobby-skin-purchase-text">과거의 그것 스킨을 구매하시겠습니까?</p>
      <div class="lobby-skin-purchase-actions">
        <button class="lobby-skin-purchase-confirm" type="button" data-action="confirm">예</button>
        <button class="lobby-skin-purchase-cancel" type="button" data-action="cancel">아니오</button>
        <button class="lobby-skin-purchase-ok hidden" type="button" data-action="ok">확인</button>
      </div>
    </div>
  `;
  return modal;
}
