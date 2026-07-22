const BEST_STAGE_STORAGE_KEY = "traceProtocolBest";
const PURCHASED_AI_SKINS_STORAGE_KEY = "traceProtocolPurchasedAiSkins";
const SELECTED_AI_SKIN_STORAGE_KEY = "traceProtocolAiPortraitSkin";

const DEFAULT_BEST_STAGE = 0;
const DEFAULT_PURCHASED_SKINS = [];
const DEFAULT_SELECTED_SKIN = "classic";

function readStorageValue(key) {
  try {
    return window.localStorage?.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key, value) {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
  }
}

function removeStorageValue(key) {
  try {
    window.localStorage?.removeItem(key);
  } catch {
  }
}

function normalizeSkinIds(skinIds) {
  if (!Array.isArray(skinIds)) return [...DEFAULT_PURCHASED_SKINS];
  return [...new Set(skinIds.filter((skinId) => typeof skinId === "string" && skinId.length > 0))];
}

export function getBestStage() {
  const bestStage = Number(readStorageValue(BEST_STAGE_STORAGE_KEY) || DEFAULT_BEST_STAGE);
  if (!Number.isFinite(bestStage) || bestStage < 0) return DEFAULT_BEST_STAGE;
  return bestStage;
}

export function saveBestStage(stage) {
  const bestStage = Number(stage);
  writeStorageValue(
    BEST_STAGE_STORAGE_KEY,
    String(Number.isFinite(bestStage) && bestStage >= 0 ? bestStage : DEFAULT_BEST_STAGE)
  );
}

export function resetBestStage() {
  removeStorageValue(BEST_STAGE_STORAGE_KEY);
}

export function getPurchasedSkins() {
  try {
    return normalizeSkinIds(JSON.parse(readStorageValue(PURCHASED_AI_SKINS_STORAGE_KEY) || "[]"));
  } catch {
    return [...DEFAULT_PURCHASED_SKINS];
  }
}

export function savePurchasedSkins(skinIds) {
  writeStorageValue(PURCHASED_AI_SKINS_STORAGE_KEY, JSON.stringify(normalizeSkinIds(skinIds)));
}

export function getSelectedSkin() {
  const selectedSkin = readStorageValue(SELECTED_AI_SKIN_STORAGE_KEY);
  return selectedSkin || DEFAULT_SELECTED_SKIN;
}

export function saveSelectedSkin(skinId) {
  writeStorageValue(
    SELECTED_AI_SKIN_STORAGE_KEY,
    typeof skinId === "string" && skinId.length > 0 ? skinId : DEFAULT_SELECTED_SKIN
  );
}
