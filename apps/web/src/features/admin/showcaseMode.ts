const showcaseEnabledKey = "club-analytics-showcase-enabled";
const showcaseSeedKey = "club-analytics-showcase-seed";

type DeviceStorage = Pick<Storage, "getItem" | "setItem">;

function freshSeed() {
  return Math.max(1, Math.floor(Math.random() * 2_147_483_646));
}

export function readShowcaseState(storage: DeviceStorage) {
  const storedSeed = Number(storage.getItem(showcaseSeedKey));
  return {
    enabled: storage.getItem(showcaseEnabledKey) === "1",
    seed: Number.isSafeInteger(storedSeed) && storedSeed > 0 ? storedSeed : freshSeed()
  };
}

export function writeShowcaseState(storage: DeviceStorage, state: { enabled: boolean; seed: number }) {
  storage.setItem(showcaseEnabledKey, state.enabled ? "1" : "0");
  storage.setItem(showcaseSeedKey, String(state.seed));
}

export function regenerateShowcaseSeed(currentSeed: number, random = Math.random) {
  const next = Math.max(1, Math.floor(random() * 2_147_483_646));
  return next === currentSeed ? (next % 2_147_483_646) + 1 : next;
}
