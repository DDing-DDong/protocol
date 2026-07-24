const SFX_BASE_URL = new URL("../assets/audio/sfx/", import.meta.url);
const BGM_BASE_URL = new URL("../assets/audio/bgm/", import.meta.url);

const SFX_FILES = {
  click: "click.mp3",
  jump: "jump.wav",
  dash: "dash.wav",
  deploy: "deploy.wav",
  electric: "electric.wav",
  fail: "fail.wav",
  hit: "hit.mp3",
  scanner: "scanner.wav",
  stop: "stop.wav",
  success: "success.wav",
};

const DEFAULT_SFX_VOLUME = 0.6;
const DEFAULT_BGM_VOLUME = 0.45;
const BGM_VOLUME_STORAGE_KEY = "protocol_bgm_volume";
const SFX_VOLUME_STORAGE_KEY = "protocol_sfx_volume";
const BACKGROUND_BGM_STORAGE_KEY = "protocol_background_bgm_enabled";
const BGM_CACHE_VERSION = "";
const DISABLED_BGM_FILES = new Set();
const LOBBY_BGM_SRC = "neon-circuit-drift.mp3";

const sfxPlayers = new Map();
const sfxPlayTokens = new Map();
const bgmPlayers = new Map();
const bgmPlayPromises = new Map();
const audioBuffers = new Map();
const activeBufferSources = new Map();
let sfxVolume = loadStoredVolume(SFX_VOLUME_STORAGE_KEY, DEFAULT_SFX_VOLUME);
let bgmVolume = loadStoredVolume(BGM_VOLUME_STORAGE_KEY, DEFAULT_BGM_VOLUME);
let backgroundBgmEnabled = loadStoredBoolean(BACKGROUND_BGM_STORAGE_KEY, false);
let currentBgmSrc = "";
let pendingBgmSrc = "";
let bgmPreloaded = false;
let audioUnlocked = false;
let audioContext = null;
let backgroundBgmMonitorId = 0;

export function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  getAudioContext()?.resume?.();
  preloadAudioBuffers();
  preloadBgm();
  retryCurrentBgm();
  preloadSfx();
}

export function setSfxVolume(value) {
  sfxVolume = clampVolume(value);
  saveStoredVolume(SFX_VOLUME_STORAGE_KEY, sfxVolume);
  for (const audio of sfxPlayers.values()) {
    audio.volume = getEffectiveSfxVolume(audio.dataset.sfxBaseVolume);
  }
  for (const active of activeBufferSources.values()) {
    active.gain.gain.value = getEffectiveSfxVolume(active.baseVolume);
  }
  if (sfxVolume <= 0) stopAllSfx();
}

export function setBgmVolume(value) {
  bgmVolume = clampVolume(value);
  saveStoredVolume(BGM_VOLUME_STORAGE_KEY, bgmVolume);
  for (const audio of bgmPlayers.values()) {
    audio.volume = bgmVolume;
  }
}

export function getSfxVolume() {
  return sfxVolume;
}

export function getBgmVolume() {
  return bgmVolume;
}

export function getBackgroundBgmEnabled() {
  return backgroundBgmEnabled;
}

export function setBackgroundBgmEnabled(enabled) {
  backgroundBgmEnabled = Boolean(enabled);
  saveStoredBoolean(BACKGROUND_BGM_STORAGE_KEY, backgroundBgmEnabled);
  updateBackgroundBgmMonitor();
  syncBgmWithPageActivity();
}

export function playSfx(name, options = {}) {
  const file = SFX_FILES[name];
  if (!file) return;
  if (sfxVolume <= 0) {
    stopSfx(name);
    return;
  }

  if (playBufferedSfx(name, file, options)) return;

  const audio = getSfxPlayer(name, file);
  if (!audio) return;

  if (options.loop && !audio.paused) {
    audio.dataset.sfxBaseVolume = String(getSfxBaseVolume(options));
    audio.volume = getEffectiveSfxVolume(options.volume);
    return;
  }

  stopAudio(audio);
  const playToken = (sfxPlayTokens.get(name) || 0) + 1;
  sfxPlayTokens.set(name, playToken);
  audio.muted = false;
  audio.loop = Boolean(options.loop);
  audio.dataset.sfxBaseVolume = String(getSfxBaseVolume(options));
  audio.volume = getEffectiveSfxVolume(options.volume);

  const maxDuration = Number(options.maxDuration) || 0;
  if (maxDuration > 0) {
    window.setTimeout(() => {
      if (sfxPlayTokens.get(name) === playToken && !audio.paused) stopAudio(audio);
    }, maxDuration * 1000);
  }

  audio.play().catch(() => {
    // Missing, blocked, or unsupported audio should never interrupt gameplay.
  });
}

export function stopSfx(name) {
  stopBufferedSfx(name);
  const audio = sfxPlayers.get(name);
  if (!audio) return;
  sfxPlayTokens.set(name, (sfxPlayTokens.get(name) || 0) + 1);
  stopAudio(audio);
}

export function stopAllSfx() {
  for (const name of new Set([...sfxPlayers.keys(), ...activeBufferSources.keys()])) {
    stopSfx(name);
  }
}

export function playBgm(src, options = {}) {
  if (!src) return;
  if (DISABLED_BGM_FILES.has(src)) {
    pendingBgmSrc = "";
    return;
  }

  if (isSameBgmActive(src)) {
    const player = bgmPlayers.get(src);
    if (player) {
      player.loop = true;
      player.volume = bgmVolume;
    }
    return;
  }

  pendingBgmSrc = src;

  playElementBgm(src);
}

export function playLobbyBgm() {
  playBgm(LOBBY_BGM_SRC);
}

export function stopBgm() {
  for (const audio of bgmPlayers.values()) {
    stopAudio(audio);
  }
  currentBgmSrc = "";
  pendingBgmSrc = "";
}

function getSfxPlayer(name, file) {
  if (sfxPlayers.has(name)) return sfxPlayers.get(name);

  const audio = new Audio(getAudioUrl(file, SFX_BASE_URL));
  audio.preload = "auto";
  audio.dataset.sfxBaseVolume = "1";
  audio.volume = getEffectiveSfxVolume(1);
  audio.addEventListener("error", () => {
    sfxPlayers.delete(name);
  });
  sfxPlayers.set(name, audio);
  return audio;
}

function getBgmPlayer(src) {
  if (bgmPlayers.has(src)) return bgmPlayers.get(src);

  const url = getAudioUrl(src, BGM_BASE_URL);
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = bgmVolume;
  audio.addEventListener("error", () => {
    console.warn("BGM file failed to load:", src, url, audio.error);
  });
  bgmPlayers.set(src, audio);
  return audio;
}

function getAudioUrl(src, baseUrl, cacheVersion = "") {
  try {
    const url = new URL(src, baseUrl);
    if (cacheVersion) url.searchParams.set("v", cacheVersion);
    return url.href;
  } catch {
    return src;
  }
}

function playElementBgm(src) {
  const player = getBgmPlayer(src);

  if (currentBgmSrc === src && (!player.paused || isBgmPlayPending(src))) {
    player.volume = bgmVolume;
    player.loop = true;
    return;
  }

  for (const [otherSrc, audio] of bgmPlayers.entries()) {
    if (otherSrc !== src) stopAudio(audio);
  }

  currentBgmSrc = src;
  player.loop = true;
  player.volume = bgmVolume;
  if (shouldPauseBgmInBackground()) {
    pauseBgmForBackground();
    return;
  }
  playAudioElement(player, src);
}

function retryCurrentBgm() {
  if (shouldPauseBgmInBackground()) return;
  const src = currentBgmSrc || pendingBgmSrc;
  if (!src) return;
  if (isBgmPlayPending(src)) return;
  const player = getBgmPlayer(src);
  if (!player.paused) return;
  player.loop = true;
  player.volume = bgmVolume;
  playAudioElement(player, src);
}

function playAudioElement(audio, src) {
  if (isBgmPlayPending(src)) return;

  const playPromise = audio.play()
    .then(() => {
      if (bgmPlayPromises.get(src) === playPromise) {
        bgmPlayPromises.delete(src);
      }
    })
    .catch((error) => {
      if (bgmPlayPromises.get(src) === playPromise) {
        bgmPlayPromises.delete(src);
      }
      if (shouldWarnBgmPlayError(error, src)) console.warn("BGM play blocked or failed:", src, error);
    });

  bgmPlayPromises.set(src, playPromise);
}

function preloadBgm() {
  if (bgmPreloaded) return;
  bgmPreloaded = true;
  for (const src of ["neon-protocol.mp3", "neon-circuit-drift.mp3", "clear-bgm.mp3"]) {
    if (src === currentBgmSrc || src === pendingBgmSrc) continue;
    getBgmPlayer(src).load();
  }
}

function preloadSfx() {
  for (const [name, file] of Object.entries(SFX_FILES)) {
    getSfxPlayer(name, file)?.load();
  }
}

function preloadAudioBuffers() {
  for (const [name, file] of Object.entries(SFX_FILES)) {
    loadAudioBuffer(name, file);
  }
}

function playBufferedSfx(name, file, options) {
  const context = getAudioContext();
  const buffer = audioBuffers.get(name);
  if (!context || !buffer) {
    loadAudioBuffer(name, file);
    return false;
  }

  if (context.state === "suspended") context.resume();
  if (options.loop && activeBufferSources.has(name)) {
    const active = activeBufferSources.get(name);
    active.baseVolume = getSfxBaseVolume(options);
    active.gain.gain.value = getEffectiveSfxVolume(active.baseVolume);
    return true;
  }
  stopBufferedSfx(name);

  const source = context.createBufferSource();
  const gain = context.createGain();
  const baseVolume = getSfxBaseVolume(options);
  source.buffer = buffer;
  source.loop = Boolean(options.loop);
  gain.gain.value = getEffectiveSfxVolume(baseVolume);
  source.connect(gain);
  gain.connect(context.destination);
  source.start(0);
  const active = { source, gain, baseVolume };
  activeBufferSources.set(name, active);

  source.onended = () => {
    if (activeBufferSources.get(name) === active) activeBufferSources.delete(name);
  };

  const maxDuration = Number(options.maxDuration) || 0;
  if (maxDuration > 0) {
    window.setTimeout(() => {
      if (activeBufferSources.get(name) === active) stopBufferedSfx(name);
    }, maxDuration * 1000);
  }

  return true;
}

function stopBufferedSfx(name) {
  const active = activeBufferSources.get(name);
  if (!active) return;
  activeBufferSources.delete(name);
  try {
    active.source.stop(0);
  } catch {
    // Already stopped.
  }
}

function loadAudioBuffer(name, file) {
  if (audioBuffers.has(name)) return;
  const context = getAudioContext();
  if (!context) return;

  fetch(new URL(file, SFX_BASE_URL).href)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject()))
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      audioBuffers.set(name, buffer);
    })
    .catch(() => {
      // HTMLAudioElement playback remains available as a fallback.
    });
}

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext = new AudioContextCtor();
  return audioContext;
}

function stopAudio(audio) {
  forgetBgmPlayPromise(audio);
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // Some missing or not-yet-ready files can reject seeking.
  }
}

function isSameBgmActive(src) {
  if (currentBgmSrc !== src && pendingBgmSrc !== src) return false;
  const player = bgmPlayers.get(src);
  if (!player) return false;
  return !player.paused || isBgmPlayPending(src) || !audioUnlocked;
}

function isBgmPlayPending(src) {
  return bgmPlayPromises.has(src);
}

function shouldWarnBgmPlayError(error, src) {
  if (!audioUnlocked) return false;
  if (error?.name === "AbortError") return false;
  return currentBgmSrc === src;
}

function forgetBgmPlayPromise(audio) {
  for (const [src, player] of bgmPlayers.entries()) {
    if (player === audio) bgmPlayPromises.delete(src);
  }
}

function shouldPauseBgmInBackground() {
  return !backgroundBgmEnabled && isPageBackgrounded();
}

function isPageBackgrounded() {
  if (typeof document === "undefined") return false;
  return document.hidden || (typeof document.hasFocus === "function" && !document.hasFocus());
}

function pauseBgmForBackground() {
  for (const audio of bgmPlayers.values()) {
    forgetBgmPlayPromise(audio);
    audio.pause();
  }
}

function syncBgmWithPageActivity() {
  if (shouldPauseBgmInBackground()) {
    pauseBgmForBackground();
    return;
  }
  retryCurrentBgm();
}

function updateBackgroundBgmMonitor() {
  if (typeof window === "undefined") return;
  if (backgroundBgmMonitorId) {
    window.clearInterval(backgroundBgmMonitorId);
    backgroundBgmMonitorId = 0;
  }
  if (!backgroundBgmEnabled) return;

  backgroundBgmMonitorId = window.setInterval(() => {
    if (!backgroundBgmEnabled || !isPageBackgrounded()) return;
    retryCurrentBgm();
  }, 1000);
}

function handlePageActivityChange() {
  syncBgmWithPageActivity();
  if (!backgroundBgmEnabled || !isPageBackgrounded() || typeof window === "undefined") return;

  // Some browsers suspend media just after the blur/visibility event.
  // Recheck after that suspension point instead of relying only on the event itself.
  window.setTimeout(retryCurrentBgm, 100);
  window.setTimeout(retryCurrentBgm, 500);
}

function getSfxBaseVolume(options = {}) {
  return clampVolume(options.volume ?? 1);
}

function getEffectiveSfxVolume(baseVolume = 1) {
  return clampVolume(sfxVolume * clampVolume(baseVolume));
}

function clampVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function loadStoredVolume(key, fallback) {
  try {
    if (typeof window === "undefined") return fallback;
    const stored = window.localStorage?.getItem(key);
    if (stored === null || stored === undefined) return fallback;
    return clampVolume(stored);
  } catch {
    return fallback;
  }
}

function saveStoredVolume(key, value) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage?.setItem(key, String(clampVolume(value)));
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

function loadStoredBoolean(key, fallback) {
  try {
    if (typeof window === "undefined") return fallback;
    const stored = window.localStorage?.getItem(key);
    if (stored === null || stored === undefined) return fallback;
    return stored === "true";
  } catch {
    return fallback;
  }
}

function saveStoredBoolean(key, value) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage?.setItem(key, value ? "true" : "false");
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", handlePageActivityChange);
}
if (typeof window !== "undefined") {
  window.addEventListener("blur", handlePageActivityChange);
  window.addEventListener("focus", handlePageActivityChange);
  updateBackgroundBgmMonitor();
}
