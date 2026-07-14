<script setup lang="ts">
import { AlertTriangle, CircleHelp, Link2 } from "lucide-vue-next";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useAppDialogsStore } from "@/stores/appDialogs";

const dialogs = useAppDialogsStore();
const dialogRef = ref<HTMLElement | null>(null);
const cancelRef = ref<HTMLButtonElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const promptValue = ref("");
const promptError = ref("");
let returnFocus: HTMLElement | null = null;

function cancel() {
  dialogs.cancel();
}

function confirm() {
  if (dialogs.active?.kind === "prompt") {
    promptError.value = dialogs.submitPrompt(promptValue.value) ?? "";
    if (promptError.value) void nextTick(() => inputRef.value?.focus());
    return;
  }
  dialogs.accept();
}

function handleKeydown(event: KeyboardEvent) {
  if (!dialogs.active) return;
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key !== "Tab" || !dialogRef.value) return;
  const controls = Array.from(dialogRef.value.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

watch(
  () => dialogs.active,
  async (active, previous) => {
    promptError.value = "";
    document.body.classList.toggle("app-dialog-open", Boolean(active));
    if (active) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      promptValue.value = active.kind === "prompt" ? active.initialValue : "";
      cancelRef.value?.focus();
    } else if (previous) {
      await nextTick();
      returnFocus?.focus();
      returnFocus = null;
    }
  },
  { flush: "post" }
);

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeydown);
  document.body.classList.remove("app-dialog-open");
});
</script>

<template>
  <Teleport to="body">
    <div v-if="dialogs.active" class="app-dialog-backdrop" @click.self="cancel">
      <section
        ref="dialogRef"
        class="app-dialog"
        :class="{ 'app-dialog-danger': dialogs.active.tone === 'danger', 'app-dialog-prompt': dialogs.active.kind === 'prompt' }"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        :aria-describedby="dialogs.active.description ? 'app-dialog-description' : undefined"
        :aria-label="dialogs.active.title"
      >
        <div class="app-dialog-icon" aria-hidden="true">
          <Link2 v-if="dialogs.active.kind === 'prompt'" :size="22" />
          <AlertTriangle v-else-if="dialogs.active.tone === 'danger'" :size="22" />
          <CircleHelp v-else :size="22" />
        </div>
        <div class="app-dialog-copy">
          <h2 id="app-dialog-title">{{ dialogs.active.title }}</h2>
          <p v-if="dialogs.active.description" id="app-dialog-description">{{ dialogs.active.description }}</p>
        </div>

        <label v-if="dialogs.active.kind === 'prompt'" class="app-dialog-field">
          <span>{{ dialogs.active.label }}</span>
          <input
            ref="inputRef"
            v-model="promptValue"
            class="text-input"
            :placeholder="dialogs.active.placeholder"
            :aria-invalid="Boolean(promptError)"
            :aria-describedby="promptError ? 'app-dialog-field-error' : undefined"
            @keydown.enter.prevent="confirm"
          />
          <small v-if="promptError" id="app-dialog-field-error" class="app-dialog-field-error">{{ promptError }}</small>
        </label>

        <div class="app-dialog-actions">
          <button ref="cancelRef" class="app-dialog-cancel" type="button" @click="cancel">
            {{ dialogs.active.cancelLabel }}
          </button>
          <button
            class="app-dialog-confirm"
            :class="{ 'app-dialog-confirm-danger': dialogs.active.tone === 'danger' }"
            type="button"
            @click="confirm"
          >
            {{ dialogs.active.confirmLabel }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
