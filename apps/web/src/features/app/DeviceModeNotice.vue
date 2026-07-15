<script setup lang="ts">
import { MonitorSmartphone, Smartphone } from "lucide-vue-next";
import QRCode from "qrcode";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { DeviceModeNoticeKind } from "./deviceMode";
import { useI18n } from "./i18n";

const props = defineProps<{
  kind: DeviceModeNoticeKind;
  qrTarget: string;
}>();

defineEmits<{
  continue: [];
}>();

const { t } = useI18n();
const continueButton = ref<HTMLButtonElement | null>(null);
const qrDataUrl = ref("");

const title = computed(() =>
  props.kind === "desktop" ? t("deviceDesktopTitle") : t("deviceMobileDesktopTitle")
);
const description = computed(() =>
  props.kind === "desktop" ? t("deviceDesktopText") : t("deviceMobileDesktopText")
);

async function renderQrCode() {
  qrDataUrl.value = "";
  if (props.kind !== "desktop" || !props.qrTarget) {
    return;
  }

  try {
    qrDataUrl.value = await QRCode.toDataURL(props.qrTarget, {
      margin: 1,
      width: 256,
      color: {
        dark: "#071a17",
        light: "#ffffff"
      },
      errorCorrectionLevel: "M"
    });
  } catch {
    qrDataUrl.value = "";
  }
}

watch(() => [props.kind, props.qrTarget] as const, renderQrCode, { immediate: true });

onMounted(async () => {
  document.body.classList.add("club-device-notice-open");
  await nextTick();
  continueButton.value?.focus();
});

onBeforeUnmount(() => {
  document.body.classList.remove("club-device-notice-open");
});
</script>

<template>
  <Teleport to="body">
    <div class="device-mode-notice-backdrop">
      <section
        class="device-mode-notice-card"
        :class="`device-mode-notice-card-${kind}`"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="device-mode-notice-icon" aria-hidden="true">
          <MonitorSmartphone v-if="kind === 'desktop'" :size="25" />
          <Smartphone v-else :size="25" />
        </div>

        <div class="device-mode-notice-copy">
          <h2>{{ title }}</h2>
          <p>{{ description }}</p>
        </div>

        <div v-if="kind === 'desktop'" class="device-mode-notice-qr-area">
          <div class="device-mode-notice-qr">
            <img v-if="qrDataUrl" :src="qrDataUrl" :alt="t('deviceQrAlt')" />
            <span v-else aria-hidden="true"></span>
          </div>
          <p>{{ t("deviceDesktopQrHint") }}</p>
        </div>

        <button ref="continueButton" class="device-mode-notice-continue" type="button" @click="$emit('continue')">
          {{ t("deviceContinue") }}
        </button>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
:global(body.club-device-notice-open) {
  overflow: hidden;
}

.device-mode-notice-backdrop {
  position: fixed;
  z-index: 1500;
  inset: 0;
  display: grid;
  place-items: center;
  overflow-y: auto;
  background: color-mix(in srgb, var(--bg) 76%, rgb(0 0 0 / 54%));
  padding: max(1rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
  backdrop-filter: blur(12px);
}

.device-mode-notice-card {
  display: grid;
  width: min(100%, 27rem);
  gap: 1rem;
  border: 1px solid color-mix(in srgb, var(--border) 86%, var(--accent));
  border-radius: min(24px, var(--ui-card-radius, 24px));
  background: color-mix(in srgb, var(--panel) 97%, transparent);
  padding: 1.15rem;
  color: var(--text);
  box-shadow: 0 24px 72px rgb(0 0 0 / 34%);
}

.device-mode-notice-icon {
  display: grid;
  width: 3rem;
  height: 3rem;
  place-items: center;
  border-radius: 15px;
  background: color-mix(in srgb, var(--accent) 16%, var(--panel-strong));
  color: var(--accent);
}

.device-mode-notice-copy {
  display: grid;
  gap: 0.4rem;
}

.device-mode-notice-copy h2,
.device-mode-notice-copy p,
.device-mode-notice-qr-area p {
  margin: 0;
}

.device-mode-notice-copy h2 {
  font-size: clamp(1.3rem, 5vw, 1.65rem);
  line-height: 1.15;
}

.device-mode-notice-copy p,
.device-mode-notice-qr-area p {
  color: var(--muted);
  font-size: 0.96rem;
  line-height: 1.48;
}

.device-mode-notice-qr-area {
  display: grid;
  justify-items: center;
  gap: 0.65rem;
  text-align: center;
}

.device-mode-notice-qr {
  display: grid;
  width: min(68vw, 14rem);
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border-radius: 12px;
  background: #fff;
  padding: 0.5rem;
}

.device-mode-notice-qr img,
.device-mode-notice-qr span {
  display: block;
  width: 100%;
  height: 100%;
}

.device-mode-notice-qr img {
  object-fit: contain;
}

.device-mode-notice-continue {
  min-height: 48px;
  border: 0;
  border-radius: var(--ui-button-radius, 16px);
  background: var(--accent);
  padding: 0.75rem 1rem;
  color: var(--accent-contrast, #071a17);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.device-mode-notice-continue:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 46%, white);
  outline-offset: 3px;
}

@media (max-height: 620px) and (orientation: landscape) {
  .device-mode-notice-card-desktop {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    width: min(100%, 44rem);
  }

  .device-mode-notice-card-desktop .device-mode-notice-qr-area {
    grid-row: span 2;
    grid-column: 3;
  }

  .device-mode-notice-card-desktop .device-mode-notice-qr {
    width: min(30vh, 10rem);
  }

  .device-mode-notice-card-desktop .device-mode-notice-continue {
    grid-column: 2;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .device-mode-notice-card {
    animation: device-mode-notice-enter 180ms ease-out both;
  }
}

@keyframes device-mode-notice-enter {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
}
</style>
