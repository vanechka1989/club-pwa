type RuntimeResourceCacheOptions<T> = {
  load: () => Promise<T>;
  ttlMs: number;
  dispose?: (value: T) => void;
  now?: () => number;
};

export function createRuntimeResourceCache<T>({
  load,
  ttlMs,
  dispose,
  now = Date.now
}: RuntimeResourceCacheOptions<T>) {
  let currentPromise: Promise<T> | null = null;
  let currentValue: T | undefined;
  let hasCurrentValue = false;
  let expiresAt = 0;
  let generation = 0;

  function clearResolvedValue() {
    if (hasCurrentValue) {
      dispose?.(currentValue as T);
    }
    currentValue = undefined;
    hasCurrentValue = false;
    expiresAt = 0;
  }

  function invalidate() {
    generation += 1;
    clearResolvedValue();
    currentPromise = null;
  }

  function get() {
    if (currentPromise && (!hasCurrentValue || now() < expiresAt)) {
      return currentPromise;
    }

    if (hasCurrentValue) {
      clearResolvedValue();
      currentPromise = null;
    }

    const loadGeneration = generation;
    const pending = load()
      .then((value) => {
        if (generation !== loadGeneration) {
          dispose?.(value);
          return value;
        }
        currentValue = value;
        hasCurrentValue = true;
        expiresAt = now() + Math.max(0, ttlMs);
        return value;
      })
      .catch((error) => {
        if (generation === loadGeneration && currentPromise === pending) {
          currentPromise = null;
        }
        throw error;
      });

    currentPromise = pending;
    return pending;
  }

  return { get, invalidate };
}
