import { onBeforeUnmount, ref, watch, type WatchSource } from "vue";

const MAX_TIMEOUT_MS = 2_147_000_000;

export function useReactiveRetention(deadlines: WatchSource<Array<string | null | undefined>>) {
  const now = ref(Date.now());
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  function schedule(values: Array<string | null | undefined>) {
    if (timer) globalThis.clearTimeout(timer);
    timer = null;
    now.value = Date.now();
    const nextDeadline = values
      .map((value) => value ? Date.parse(value) : Number.NaN)
      .filter((value) => Number.isFinite(value) && value > now.value)
      .sort((left, right) => left - right)[0];
    if (nextDeadline === undefined) return;
    timer = globalThis.setTimeout(() => schedule(values), Math.min(nextDeadline - now.value + 1, MAX_TIMEOUT_MS));
  }

  watch(deadlines, schedule, { immediate: true });
  onBeforeUnmount(() => {
    if (timer) globalThis.clearTimeout(timer);
  });

  return {
    isExpired(value: string | null | undefined) {
      if (!value) return false;
      const deadline = Date.parse(value);
      return Number.isFinite(deadline) && deadline <= now.value;
    }
  };
}
