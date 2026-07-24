const STORAGE_KEY = "traceProtocolDailyMissions";
const SCHEMA_VERSION = 6;
const MISSIONS = [
  { id: "attendance", reward: 2, target: 1 },
  { id: "classicPlay", reward: 2, target: 1 },
  { id: "hackerAiClear", reward: 3, target: 6 },
  { id: "sequentialClear", reward: 4, target: 11 },
  { id: "darkWebCore", reward: 4, target: 1 },
];

function dateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function emptyState(today, totalUsb = 0, history = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    dateKey: today,
    totalUsb: Math.max(0, Number(totalUsb) || 0),
    todayUsb: 0,
    history: { ...history },
    progress: Object.fromEntries(MISSIONS.map(({ id }) => [id, 0])),
    claimed: {},
  };
}

function readState() {
  try {
    return JSON.parse(window.localStorage?.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeState(state) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
  }
}

function calculateClaimedReward(claimed = {}) {
  const missionReward = MISSIONS.reduce(
    (total, mission) => total + (claimed[mission.id] ? mission.reward : 0),
    0
  );
  return missionReward + (claimed.allDaily ? 5 : 0);
}

export function getDailyMissionState(now = new Date()) {
  let stored = readState();
  const today = dateKey(now);
  if (stored?.dateKey === today && stored.schemaVersion !== SCHEMA_VERSION) {
    const previousTodayUsb = Math.max(0, Number(stored.todayUsb) || 0);
    const claimed = { ...stored.claimed };
    const progress = { ...stored.progress };
    delete claimed.infiniteClear;
    delete progress.infiniteClear;
    delete progress.infiniteHackerClears;
    delete progress.infiniteAiClears;
    claimed.sequentialClear = false;
    claimed.allDaily = false;
    progress.sequentialClear = 0;
    progress.sequentialNextStage = 1;
    const correctedTodayUsb = calculateClaimedReward(claimed);
    stored = {
      ...stored,
      schemaVersion: SCHEMA_VERSION,
      claimed,
      progress,
      todayUsb: correctedTodayUsb,
      totalUsb: Math.max(0, (Number(stored.totalUsb) || 0) + correctedTodayUsb - previousTodayUsb),
      history: {
        ...stored.history,
        [today]: correctedTodayUsb,
      },
    };
    writeState(stored);
  }
  if (!stored || stored.dateKey !== today) {
    const history = { ...stored?.history };
    if (stored?.dateKey) history[stored.dateKey] = Number(stored.todayUsb) || 0;
    const reset = emptyState(today, stored?.totalUsb, history);
    writeState(reset);
    return reset;
  }
  const defaults = emptyState(today, stored.totalUsb);
  return {
    ...defaults,
    ...stored,
    progress: { ...defaults.progress, ...stored.progress },
    claimed: { ...stored.claimed },
  };
}

export function recordDailyMissionEvent(type, amount = 1, now = new Date()) {
  const state = getDailyMissionState(now);
  const mission = MISSIONS.find(({ id }) => id === type);
  if (!mission) return state;
  if (state.claimed[type]) return state;
  state.progress[type] = Math.min(mission.target, (Number(state.progress[type]) || 0) + Math.max(0, Number(amount) || 0));
  if (state.progress[type] >= mission.target && !state.claimed[type]) {
    state.claimed[type] = true;
    state.todayUsb += mission.reward;
    state.totalUsb += mission.reward;
  }
  if (MISSIONS.every(({ id }) => state.claimed[id]) && !state.claimed.allDaily) {
    state.claimed.allDaily = true;
    state.todayUsb += 5;
    state.totalUsb += 5;
  }
  state.history = { ...state.history, [state.dateKey]: state.todayUsb };
  writeState(state);
  window.dispatchEvent(new CustomEvent("protocol:daily-mission-update", { detail: state }));
  return state;
}

export function getDailyUsbHistory(now = new Date()) {
  const state = getDailyMissionState(now);
  const historyKeys = Object.keys(state.history || {}).sort();
  const earliestRecordedDate = historyKeys[0] || dateKey(now);
  const result = [];
  for (let offset = 7; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const key = dateKey(day);
    if (key < earliestRecordedDate) continue;
    result.push({
      dateKey: key,
      usb: Math.max(0, Number(state.history?.[key]) || 0),
      isToday: offset === 0,
    });
  }
  return result;
}

export function recordStageClearForDailyMissions({ mode, stage }) {
  if (mode === "darkweb") return getDailyMissionState();
  const stageNumber = Number(stage) || 0;
  const state = getDailyMissionState();
  const role = stageNumber % 2 === 1 ? "Hacker" : "Ai";
  const clearKey = `daily${role}Clears`;
  state.progress[clearKey] = (Number(state.progress[clearKey]) || 0) + 1;
  const expectedStage = Math.max(1, Number(state.progress.sequentialNextStage) || 1);
  if (stageNumber === expectedStage && stageNumber <= 11) {
    state.progress.sequentialClear = stageNumber;
    state.progress.sequentialNextStage = stageNumber + 1;
  }
  writeState(state);

  if ((state.progress.dailyHackerClears || 0) >= 3 && (state.progress.dailyAiClears || 0) >= 3) {
    recordDailyMissionEvent("hackerAiClear", 6);
  }
  if ((state.progress.sequentialClear || 0) >= 11) {
    return recordDailyMissionEvent("sequentialClear", 11);
  }
  window.dispatchEvent(new CustomEvent("protocol:daily-mission-update", { detail: state }));
  return state;
}

export function getMillisecondsUntilMidnight(now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, midnight.getTime() - now.getTime());
}
