const SFX_BASE_URL = new URL("../assets/audio/sfx/", import.meta.url);
const BGM_BASE_URL = new URL("../assets/audio/bgm/", import.meta.url);

const SFX_FILES = {
  click: "click.mp3",
  jump: "jump.wav",
  dash: "dash.mp3",
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
const BGM_CACHE_VERSION = "";
const DISABLED_BGM_FILES = new Set();

const sfxPlayers = new Map();
const sfxPlayTokens = new Map();
const bgmPlayers = new Map();
const audioBuffers = new Map();
const activeBufferSources = new Map();
let sfxVolume = DEFAULT_SFX_VOLUME;
let bgmVolume = DEFAULT_BGM_VOLUME;
let currentBgmSrc = "";
let pendingBgmSrc = "";
let audioPrimed = false;
let audioContext = null;

export function unlockAudio() {
  getAudioContext()?.resume?.();
  preloadAudioBuffers();
  preloadBgm();
  retryCurrentBgm();
  preloadSfx();
}

export function setSfxVolume(value) {
  sfxVolume = clampVolume(value);
  for (const audio of sfxPlayers.values()) {
    audio.volume = sfxVolume;
  }
}

export function setBgmVolume(value) {
  bgmVolume = clampVolume(value);
  for (const audio of bgmPlayers.values()) {
    audio.volume = bgmVolume;
  }
}

export function playSfx(name, options = {}) {
  const file = SFX_FILES[name];
  if (!file) return;

  if (playBufferedSfx(name, file, options)) return;

  const audio = getSfxPlayer(name, file);
  if (!audio) return;

  if (options.loop && !audio.paused) {
    audio.volume = clampVolume(options.volume ?? sfxVolume);
    return;
  }

  stopAudio(audio);
  const playToken = (sfxPlayTokens.get(name) || 0) + 1;
  sfxPlayTokens.set(name, playToken);
  audio.muted = false;
  audio.loop = Boolean(options.loop);
  audio.volume = clampVolume(options.volume ?? sfxVolume);

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

export function playBgm(src, options = {}) {
  if (!src) return;
  if (DISABLED_BGM_FILES.has(src)) {
    pendingBgmSrc = "";
    return;
  }
  pendingBgmSrc = src;
  console.info(`[BGM] request: ${src}`);

  playElementBgm(src);
}

export function stopBgm() {
  for (const audio of bgmPlayers.values()) {
    stopAudio(audio);
  }
  currentBgmSrc = "";
}

function getSfxPlayer(name, file) {
  if (sfxPlayers.has(name)) return sfxPlayers.get(name);

  const audio = new Audio(getAudioUrl(file, SFX_BASE_URL));
  audio.preload = "auto";
  audio.volume = sfxVolume;
  audio.addEventListener("error", () => {
    sfxPlayers.delete(name);
  });
  sfxPlayers.set(name, audio);
  return audio;
}

function getBgmPlayer(src) {
  if (bgmPlayers.has(src)) return bgmPlayers.get(src);

  const url = getAudioUrl(src, BGM_BASE_URL);
  console.info(`[BGM] create: ${src} -> ${url}`);
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = bgmVolume;
  audio.addEventListener("error", () => {
    console.warn("BGM file failed to load:", src, url, audio.error);
  });
  audio.addEventListener("canplaythrough", () => {
    console.info(`[BGM] ready: ${src}`);
  }, { once: true });
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

  for (const [otherSrc, audio] of bgmPlayers.entries()) {
    if (otherSrc !== src) stopAudio(audio);
  }

  currentBgmSrc = src;
  player.loop = true;
  player.volume = bgmVolume;
  playAudioElement(player, src);
}

function retryCurrentBgm() {
  const src = currentBgmSrc || pendingBgmSrc;
  if (!src) return;
  const player = getBgmPlayer(src);
  if (!player.paused) return;
  player.volume = bgmVolume;
  playAudioElement(player, src);
}

function playAudioElement(audio, src) {
  audio.play().then(() => {
    console.info(`[BGM] playing: ${src}`);
  }).catch((error) => {
    console.warn("BGM play blocked or failed:", src, error);
  });
}

function preloadBgm() {
  if (pendingBgmSrc) getBgmPlayer(pendingBgmSrc).load();
  for (const src of ["neon-protocol.mp3", "neon-circuit-drift.mp3", "clear-bgm.mp3"]) {
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
  if (options.loop && activeBufferSources.has(name)) return true;
  stopBufferedSfx(name);

  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = Boolean(options.loop);
  gain.gain.value = clampVolume(options.volume ?? sfxVolume);
  source.connect(gain);
  gain.connect(context.destination);
  source.start(0);
  activeBufferSources.set(name, source);

  source.onended = () => {
    if (activeBufferSources.get(name) === source) activeBufferSources.delete(name);
  };

  const maxDuration = Number(options.maxDuration) || 0;
  if (maxDuration > 0) {
    window.setTimeout(() => {
      if (activeBufferSources.get(name) === source) stopBufferedSfx(name);
    }, maxDuration * 1000);
  }

  return true;
}

function stopBufferedSfx(name) {
  const source = activeBufferSources.get(name);
  if (!source) return;
  activeBufferSources.delete(name);
  try {
    source.stop(0);
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

function primeSfxPlayback() {
  if (audioPrimed) return;
  audioPrimed = true;

  for (const audio of sfxPlayers.values()) {
    const previousMuted = audio.muted;
    audio.muted = true;
    audio.play()
      .then(() => {
        stopAudio(audio);
        audio.muted = previousMuted;
      })
      .catch(() => {
        audio.muted = previousMuted;
      });
  }
}

function stopAudio(audio) {
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // Some missing or not-yet-ready files can reject seeking.
  }
}

function clampVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
