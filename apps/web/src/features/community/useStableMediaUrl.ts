import { ref } from "vue";

export function useStableMediaUrl(initialUrl: string) {
  const currentUrl = ref(initialUrl);
  const latestUrl = ref(initialUrl);

  function observe(url: string) {
    if (url) latestUrl.value = url;
    if (!currentUrl.value) currentUrl.value = url;
  }

  function refresh() {
    if (!latestUrl.value || latestUrl.value === currentUrl.value) return false;
    currentUrl.value = latestUrl.value;
    return true;
  }

  return { currentUrl, observe, refresh };
}
