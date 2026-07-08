// js/lobby.js
// Handles only Splash/Lobby screen transitions and lobby button wiring.

import { playLobbyBgm, unlockAudio } from "./audio.js?v=20260708-lobby-bgm";

const SPLASH_DELAY_MS = 1400;

export function initLobby({
  onStart,
  onHelp,
  onSettings,
} = {}) {
  const root = document.getElementById("lobbyRoot");
  const splashScreen = document.getElementById("splashScreen");
  const lobbyScreen = document.getElementById("lobbyScreen");
  const startBtn = document.getElementById("lobbyStartBtn");
  const helpBtn = document.getElementById("lobbyHelpBtn");
  const settingsBtn = document.getElementById("lobbySettingsBtn");

  let active = true;
  let helpOverlayOpen = false;

  document.body.classList.add("lobby-active");

  const showLobby = () => {
    active = true;
    root?.classList.remove("hidden");
    document.body.classList.add("lobby-active");
    document.body.classList.remove("lobby-modal-open", "lobby-settings-open");
    splashScreen?.classList.add("hidden");
    lobbyScreen?.classList.remove("hidden");
  };

  const hideLobby = () => {
    active = false;
    root?.classList.add("hidden");
    document.body.classList.remove("lobby-active", "lobby-modal-open", "lobby-settings-open");
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
