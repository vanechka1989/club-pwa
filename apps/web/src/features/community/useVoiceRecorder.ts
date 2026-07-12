import { computed, onScopeDispose, ref } from "vue";

export function useVoiceRecorder() {
  const status = ref<"idle" | "recording" | "preview" | "uploading" | "error">("idle");
  const durationSeconds = ref(0);
  const blob = ref<Blob | null>(null);
  const previewUrl = ref<string | null>(null);
  const error = ref<string | null>(null);
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let chunks: Blob[] = [];
  let discarding = false;

  const supported = computed(() => typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));

  function releaseStream() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function clearPreview() {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
    blob.value = null;
  }

  async function start() {
    discarding = false;
    clearPreview();
    error.value = null;
    durationSeconds.value = 0;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (discarding) {
          chunks = [];
          status.value = "idle";
          releaseStream();
          return;
        }
        const next = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
        blob.value = next;
        previewUrl.value = URL.createObjectURL(next);
        status.value = "preview";
        releaseStream();
      };
      recorder.start(250);
      status.value = "recording";
      timer = setInterval(() => {
        durationSeconds.value += 1;
        if (durationSeconds.value >= 300) stop();
      }, 1000);
    } catch {
      error.value = "Не удалось получить доступ к микрофону.";
      status.value = "error";
      releaseStream();
    }
  }

  function stop() {
    if (recorder?.state === "recording") recorder.stop();
  }

  function cancel() {
    discarding = true;
    recorder?.state === "recording" && recorder.stop();
    recorder = null;
    releaseStream();
    clearPreview();
    durationSeconds.value = 0;
    status.value = "idle";
  }

  function setUploading(value: boolean) { status.value = value ? "uploading" : blob.value ? "preview" : "idle"; }
  function complete() { cancel(); }
  onScopeDispose(cancel);
  return { status, durationSeconds, blob, previewUrl, error, supported, start, stop, cancel, setUploading, complete };
}
