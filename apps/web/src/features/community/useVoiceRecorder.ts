import { computed, onScopeDispose, ref } from "vue";
import { appendVoiceLevel } from "./voiceWaveform";
import { getPreferredCommunityVoiceMimeType } from "./voiceUpload";

export function useVoiceRecorder() {
  const status = ref<"idle" | "recording" | "preview" | "uploading" | "error">("idle");
  const durationSeconds = ref(0);
  const blob = ref<Blob | null>(null);
  const previewUrl = ref<string | null>(null);
  const error = ref<string | null>(null);
  const levels = ref<number[]>([]);
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let chunks: Blob[] = [];
  let discarding = false;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let analysisFrame: number | null = null;

  const supported = computed(() => typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));

  function stopLevelAnalysis() {
    if (analysisFrame !== null) cancelAnimationFrame(analysisFrame);
    analysisFrame = null;
    sourceNode?.disconnect();
    analyser?.disconnect();
    sourceNode = null;
    analyser = null;
    if (audioContext) void audioContext.close().catch(() => undefined);
    audioContext = null;
  }

  function startLevelAnalysis(activeStream: MediaStream) {
    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      sourceNode = audioContext.createMediaStreamSource(activeStream);
      sourceNode.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let lastSampleAt = 0;
      const measure = (timestamp = 0) => {
        if (!analyser) return;
        if (timestamp - lastSampleAt >= 75 || lastSampleAt === 0) {
          analyser.getByteTimeDomainData(samples);
          let energy = 0;
          for (const sample of samples) {
            const centered = (sample - 128) / 128;
            energy += centered * centered;
          }
          const rms = Math.sqrt(energy / samples.length);
          levels.value = appendVoiceLevel(levels.value, Math.min(1, rms * 4.2), 36);
          lastSampleAt = timestamp;
        }
        analysisFrame = requestAnimationFrame(measure);
      };
      measure();
    } catch {
      stopLevelAnalysis();
    }
  }

  function releaseStream() {
    stopLevelAnalysis();
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
    levels.value = [];
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startLevelAnalysis(stream);
      const mimeType = getPreferredCommunityVoiceMimeType((type) => MediaRecorder.isTypeSupported(type));
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
      // Request one complete container at stop. Safari may place the MP4 init
      // header in a later timeslice, which makes concatenated chunks invalid.
      recorder.start();
      status.value = "recording";
      timer = setInterval(() => {
        durationSeconds.value += 1;
        if (durationSeconds.value >= 300) stop();
      }, 1000);
    } catch (cause) {
      error.value =
        cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError")
          ? "Доступ к микрофону не разрешён. Разрешите микрофон в настройках приложения."
          : "Не удалось запустить микрофон. Попробуйте ещё раз.";
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
    error.value = null;
    durationSeconds.value = 0;
    levels.value = [];
    status.value = "idle";
  }

  function setUploading(value: boolean) { status.value = value ? "uploading" : blob.value ? "preview" : "idle"; }
  function complete() { cancel(); }
  onScopeDispose(cancel);
  return { status, durationSeconds, blob, previewUrl, error, levels, supported, start, stop, cancel, setUploading, complete };
}
