// js/lobby.js
// Handles only Splash/Lobby screen transitions and lobby button wiring.

import { playLobbyBgm, playSfx, unlockAudio } from "./audio.js?v=20260724-stage-effect-cleanup";
import {
  getPurchasedSkins as loadPurchasedSkins,
  getSelectedSkin as loadSelectedSkin,
  savePurchasedSkins,
  saveSelectedSkin,
} from "./repositories/localGameRepository.js";
import {
  getDailyMissionState,
  getDailyUsbHistory,
  getMillisecondsUntilMidnight,
  recordDailyMissionEvent,
} from "./repositories/dailyMissionRepository.js?v=20260724-daily-mission-rewards-v2";

const CLASSIC_CLEAR_STORAGE_KEY = "traceProtocolClassicStage11Returned";
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
} = {}) {
  const root = document.getElementById("lobbyRoot");
  const splashScreen = document.getElementById("splashScreen");
  const splashEnterBtn = document.getElementById("splashEnterBtn");
  const lobbyScreen = document.getElementById("lobbyScreen");
  const startBtn = document.getElementById("lobbyStartBtn");
  const skinBtn = document.getElementById("lobbySkinBtn");
  const helpBtn = document.getElementById("lobbyHelpBtn");
  const pathNoteBtn = document.getElementById("lobbyPathNoteBtn");
  const missionBtn = document.getElementById("lobbyMissionBtn");
  const shopBtn = document.getElementById("lobbyShopBtn");
  const dailyMissionScreen = document.getElementById("dailyMissionScreen");
  const shopScreen = document.getElementById("shopScreen");
  const skinPanel = createSkinPanel();
  const skinPurchaseModal = createSkinPurchaseModal();
  const pathNoteModal = createPathNoteModal();
  const modePanel = createModePanel();
  const stageSelectPanel = createStageSelectPanel();
  const dailyMissionCountdown = document.getElementById("dailyMissionCountdown");
  const dailyUsbCount = document.getElementById("dailyUsbCount");
  const totalUsbCount = document.getElementById("totalUsbCount");
  const dailyUsbHistoryList = document.getElementById("dailyUsbHistoryList");

  let active = true;
  let helpOverlayOpen = false;
  let skinPanelOpen = false;
  let modePanelOpen = false;
  let stageSelectOpen = false;
  let pendingPurchaseSkinId = "";
  let enteringLobby = false;
  let lastMissionDateKey = "";

  document.body.classList.add("lobby-active");
  startBtn?.after(modePanel);
  root?.appendChild(stageSelectPanel);
  skinBtn?.after(skinPanel);
  root?.appendChild(skinPurchaseModal);
  root?.appendChild(pathNoteModal);

  const refreshDailyMission = (state = getDailyMissionState()) => {
    if (dailyUsbCount) dailyUsbCount.textContent = String(state.todayUsb || 0);
    if (totalUsbCount) totalUsbCount.textContent = String(state.totalUsb || 0);
    if (dailyUsbHistoryList) {
      const history = getDailyUsbHistory();
      dailyUsbHistoryList.innerHTML = history.length
        ? history.map(({ dateKey, usb, isToday }) => `
            <li><span>${formatUsbHistoryDate(dateKey, isToday)}</span><strong>${usb}개</strong></li>
          `).join("")
        : "<li><span>기록 없음</span><strong>0개</strong></li>";
    }
    dailyMissionScreen?.querySelectorAll("[data-mission-id]").forEach((card) => {
      const complete = Boolean(state.claimed?.[card.dataset.missionId]);
      card.classList.toggle("is-complete", complete);
      card.setAttribute("aria-disabled", complete ? "true" : "false");
      card.querySelector(".daily-mission-claim")?.toggleAttribute("disabled", complete);
    });
    lastMissionDateKey = state.dateKey;
  };

  const formatUsbHistoryDate = (value, isToday = false) => {
    const [year, month, day] = String(value).split("-").map(Number);
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][
      new Date(year, month - 1, day, 12).getDay()
    ];
    return `${isToday ? "오늘" : `${month}월 ${day}일`} (${weekday})`;
  };

  const updateDailyMissionCountdown = () => {
    const now = new Date();
    const remaining = Math.max(0, Math.floor(getMillisecondsUntilMidnight(now) / 1000));
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    if (dailyMissionCountdown) {
      dailyMissionCountdown.textContent =
        `${String(hours).padStart(2, "0")}시간 ${String(minutes).padStart(2, "0")}분 ${String(seconds).padStart(2, "0")}초`;
    }
    const state = getDailyMissionState(now);
    if (state.dateKey !== lastMissionDateKey) {
      refreshDailyMission(state);
    }
  };

  refreshDailyMission();
  updateDailyMissionCountdown();
  window.setInterval(updateDailyMissionCountdown, 1000);
  window.addEventListener("protocol:daily-mission-update", (event) => refreshDailyMission(event.detail));

  const getPurchasedSkins = () => {
    return new Set(loadPurchasedSkins());
  };

  const isSkinOwned = (skinId) => {
    const skin = SELECTABLE_AI_SKINS.find((item) => item.id === skinId);
    if (skin?.owned) return true;
    return getPurchasedSkins().has(skinId);
  };

  const purchaseSkin = (skinId) => {
    const purchased = getPurchasedSkins();
    purchased.add(skinId);
    savePurchasedSkins([...purchased]);
  };

  const getSelectedSkin = () => {
    const stored = loadSelectedSkin();
    if (SELECTABLE_AI_SKINS.some((skin) => skin.id === stored) && isSkinOwned(stored)) return stored;
    return SELECTABLE_AI_SKINS[0].id;
  };

  const setSkinPanelOpen = (open) => {
    skinPanelOpen = Boolean(open);
    skinBtn?.setAttribute("aria-expanded", skinPanelOpen ? "true" : "false");
    skinPanel.classList.toggle("hidden", !skinPanelOpen);
  };

  const isDarkWebUnlocked = () => {
    try {
      return localStorage.getItem(CLASSIC_CLEAR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  };

  const refreshModeButtons = () => {
    const unlocked = isDarkWebUnlocked();
    const darkWebButton = modePanel.querySelector("[data-mode='darkweb']");
    darkWebButton?.classList.toggle("locked", !unlocked);
    darkWebButton?.querySelector(".lobby-mode-condition")?.classList.toggle("hidden", unlocked);
    if (darkWebButton) {
      darkWebButton.disabled = !unlocked;
      darkWebButton.setAttribute("aria-disabled", unlocked ? "false" : "true");
    }
  };

  const setModePanelOpen = (open) => {
    modePanelOpen = Boolean(open);
    startBtn?.setAttribute("aria-expanded", modePanelOpen ? "true" : "false");
    modePanel.classList.toggle("hidden", !modePanelOpen);
    refreshModeButtons();
  };

  const setStageSelectOpen = (open) => {
    stageSelectOpen = Boolean(open);
    stageSelectPanel.classList.toggle("hidden", !stageSelectOpen);
    lobbyScreen?.classList.toggle("hidden", stageSelectOpen);
    modePanel.classList.add("hidden");
    if (!stageSelectOpen) setModePanelOpen(false);
  };

  const showFeatureScreen = (screen) => {
    setSkinPanelOpen(false);
    setModePanelOpen(false);
    dailyMissionScreen?.classList.toggle("hidden", screen !== dailyMissionScreen);
    shopScreen?.classList.toggle("hidden", screen !== shopScreen);
    lobbyScreen?.classList.toggle("hidden", Boolean(screen));
  };

  const showStageSelect = () => {
    active = true;
    root?.classList.remove("hidden");
    document.body.classList.add("lobby-active", "lobby-ready");
    document.body.classList.remove("lobby-modal-open");
    splashScreen?.classList.add("hidden");
    setSkinPanelOpen(false);
    setModePanelOpen(false);
    setSkinPurchaseModalOpen(false);
    setPathNoteModalOpen(false);
    showFeatureScreen(null);
    setStageSelectOpen(true);
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

  const setPathNoteModalOpen = (open) => {
    pathNoteModal.classList.toggle("hidden", !open);
    document.body.classList.toggle("lobby-modal-open", Boolean(open));
  };

  const closeLobbyPopups = (except = "") => {
    if (except !== "skin") setSkinPanelOpen(false);
    if (except !== "mode") setModePanelOpen(false);
    setSkinPurchaseModalOpen(false);
    setPathNoteModalOpen(false);
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

  const selectSkin = (skinId, { persist = true } = {}) => {
    const nextSkin = SELECTABLE_AI_SKINS.some((skin) => skin.id === skinId) ? skinId : SELECTABLE_AI_SKINS[0].id;
    if (!isSkinOwned(nextSkin)) {
      pendingPurchaseSkinId = nextSkin;
      setSkinPurchaseModalOpen(true, "confirm");
      return;
    }
    if (persist) saveSelectedSkin(nextSkin);
    refreshSkinButtons();
    document.dispatchEvent(new CustomEvent("protocol:ai-skin-change", {
      detail: { skin: nextSkin },
    }));
  };

  const showLobby = () => {
    active = true;
    root?.classList.remove("hidden");
    document.body.classList.add("lobby-active", "lobby-ready");
    document.body.classList.remove("lobby-modal-open");
    setSkinPanelOpen(false);
    setModePanelOpen(false);
    setStageSelectOpen(false);
    setSkinPurchaseModalOpen(false);
    setPathNoteModalOpen(false);
    splashScreen?.classList.add("hidden");
    showFeatureScreen(null);
    playLobbyBgm();
  };

  const hideLobby = () => {
    active = false;
    root?.classList.add("hidden");
    document.body.classList.remove("lobby-active", "lobby-ready", "lobby-modal-open");
    setSkinPanelOpen(false);
    setModePanelOpen(false);
    setSkinPurchaseModalOpen(false);
    setPathNoteModalOpen(false);
    dailyMissionScreen?.classList.add("hidden");
    shopScreen?.classList.add("hidden");
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

  selectSkin(getSelectedSkin(), { persist: false });
  refreshSkinButtons();

  const prepareLobbyAudio = () => {
    if (splashScreen?.classList.contains("hidden")) {
      startLobbyBgm();
      return;
    }
    unlockAudio();
  };

  root?.addEventListener("pointerdown", prepareLobbyAudio);
  document.addEventListener("keydown", prepareLobbyAudio);

  const enterLobby = () => {
    if (!active || enteringLobby || splashScreen?.classList.contains("hidden")) return;
    enteringLobby = true;
    unlockAudio();
    playSfx("click");
    splashEnterBtn?.setAttribute("disabled", "");
    window.setTimeout(() => {
      showLobby();
      enteringLobby = false;
    }, 180);
  };

  splashEnterBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    enterLobby();
  });

  document.addEventListener("keydown", (event) => {
    if (event.code !== "Enter" && event.code !== "Space") return;
    enterLobby();
  });

  startBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startLobbyBgm();
    const shouldOpen = !modePanelOpen;
    closeLobbyPopups("mode");
    setModePanelOpen(shouldOpen);
  });

  modePanel.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-mode]");
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    startLobbyBgm();
    setModePanelOpen(false);
    const mode = button.dataset.mode || "classic";
    if (mode === "classic") {
      showStageSelect();
      return;
    }
    hideLobby();
    onStart?.(mode);
  });

  stageSelectPanel.addEventListener("click", (event) => {
    const stageButton = event.target?.closest?.("[data-stage]");
    if (stageButton) {
      event.preventDefault();
      event.stopPropagation();
      const stage = Number(stageButton.dataset.stage) || 1;
      setStageSelectOpen(false);
      hideLobby();
      onStart?.("classic", stage);
      return;
    }
    if (event.target?.closest?.("[data-action='back-to-lobby']")) {
      event.preventDefault();
      event.stopPropagation();
      setStageSelectOpen(false);
    }
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
    const shouldOpen = !skinPanelOpen;
    closeLobbyPopups("skin");
    refreshSkinButtons();
    setSkinPanelOpen(shouldOpen);
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

  pathNoteBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startLobbyBgm();
    closeLobbyPopups();
    setPathNoteModalOpen(true);
  });

  pathNoteModal.addEventListener("click", (event) => {
    if (event.target === pathNoteModal || event.target?.closest?.("[data-action='close-path-note']")) {
      event.preventDefault();
      event.stopPropagation();
      setPathNoteModalOpen(false);
    }
  });

  missionBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startLobbyBgm();
    closeLobbyPopups();
    refreshDailyMission();
    showFeatureScreen(dailyMissionScreen);
  });

  dailyMissionScreen?.querySelector(".daily-mission-attendance")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const state = getDailyMissionState();
    if (state.claimed?.attendance) {
      refreshDailyMission(state);
      return;
    }
    playSfx("click");
    refreshDailyMission(recordDailyMissionEvent("attendance"));
  });

  shopBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startLobbyBgm();
    closeLobbyPopups();
    showFeatureScreen(shopScreen);
  });

  for (const screen of [dailyMissionScreen, shopScreen]) {
    screen?.addEventListener("click", (event) => {
      if (!event.target?.closest?.("[data-action='back-to-lobby']")) return;
      event.preventDefault();
      event.stopPropagation();
      showFeatureScreen(null);
    });
  }

  document.addEventListener("click", (event) => {
    if (!skinPurchaseModal.classList.contains("hidden")) return;
    if (skinPanelOpen && !event.target?.closest?.("#lobbySkinBtn, .lobby-skin-panel")) {
      setSkinPanelOpen(false);
    }
    if (modePanelOpen && !event.target?.closest?.("#lobbyStartBtn, .lobby-mode-panel")) {
      setModePanelOpen(false);
    }
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
    refreshModeButtons,
    showStageSelect,
  };
}

function createStageSelectPanel() {
  const panel = document.createElement("section");
  panel.className = "lobby-stage-select hidden";
  panel.setAttribute("aria-label", "클래식 모드 스테이지 선택");
  panel.innerHTML = `
    <div class="lobby-stage-select-header">
      <div><p class="lobby-kicker">CLASSIC MODE</p><h2>SELECT STAGE</h2><p>플레이할 스테이지를 선택하세요.</p></div>
      <button class="lobby-button" type="button" data-action="back-to-lobby">BACK TO LOBBY</button>
    </div>
    <div class="lobby-stage-scroller" tabindex="0" aria-label="스테이지 목록">
      <div class="lobby-stage-track">
        ${Array.from({ length: 11 }, (_, index) => `<button class="lobby-stage-card" type="button" data-stage="${index + 1}"><span>STAGE</span><strong>${index + 1}</strong><small>${index % 2 === 0 ? "ATTACK" : "DEFENSE"}</small></button>`).join("")}
      </div>
    </div>
    <p class="lobby-stage-scroll-hint">← → 또는 좌우로 스크롤</p>
  `;
  const scroller = panel.querySelector(".lobby-stage-scroller");
  scroller?.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    scroller.scrollLeft += event.deltaY;
  }, { passive: false });
  return panel;
}

function createModePanel() {
  const panel = document.createElement("div");
  panel.className = "lobby-mode-panel hidden";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "게임 모드 선택");
  panel.innerHTML = `
    <button class="lobby-mode-option" type="button" data-mode="classic">
      <span class="lobby-mode-number">01</span>
      <span><strong>CLASSIC MODE</strong><small>튜토리얼과 스토리가 있는 기존 캠페인</small></span>
    </button>
    <button class="lobby-mode-option" type="button" data-mode="darkweb">
      <span class="lobby-mode-number">02</span>
      <span><strong>DARK WEB MODE</strong><small>사이드 맵을 돌파하고 메인 코어 룸으로 진입</small><em class="lobby-mode-condition">조건: 클래식 모드 클리어</em></span>
    </button>
  `;
  return panel;
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

function createPathNoteModal() {
  const modal = document.createElement("div");
  modal.className = "lobby-path-note-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Path note");
  modal.innerHTML = `
    <div class="lobby-path-note-card">
      <p class="lobby-path-note-version">0.1v</p>
      <ul class="lobby-path-note-list">
        <li>해커 캐릭터 애셋을 새 GIF 추출 프레임 기반 애니메이션으로 교체했습니다.</li>
        <li>해킹 화면 이펙트를 추가했습니다.</li>
        <li>보상 선택 UI를 새 패널/버튼 이미지 기반으로 교체했습니다.</li>
        <li>레이저 길이/렌더링이 방향별로 다르게 보이던 문제를 수정했습니다.</li>
        <li>레이저는 설치된 칸을 다시 누르면 회전하도록 변경했습니다.</li>
        <li>슬라이딩 사운드와 피격시 사운드가 같아서 슬라이딩 사운드를 추가했습니다.</li>
      </ul>
      <button class="lobby-path-note-close" type="button" data-action="close-path-note">확인</button>
    </div>
  `;
  return modal;
}
