import { defineStore } from "pinia";
import { ref } from "vue";

export type AppDialogTone = "default" | "danger";

type DialogBase = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: AppDialogTone;
};

export type ConfirmDialogRequest = DialogBase & { kind: "confirm" };
export type PromptDialogRequest = DialogBase & {
  kind: "prompt";
  label: string;
  placeholder: string;
  initialValue: string;
  validate?: ((value: string) => string | null) | undefined;
};
export type AppDialogRequest = ConfirmDialogRequest | PromptDialogRequest;

export type ConfirmDialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AppDialogTone;
};

export type PromptDialogOptions = ConfirmDialogOptions & {
  label: string;
  placeholder?: string;
  initialValue?: string;
  validate?: ((value: string) => string | null) | undefined;
};

export const useAppDialogsStore = defineStore("appDialogs", () => {
  const active = ref<AppDialogRequest | null>(null);
  let resolveConfirm: ((value: boolean) => void) | null = null;
  let resolvePrompt: ((value: string | null) => void) | null = null;

  function settle(value: boolean | string | null) {
    const current = active.value;
    active.value = null;
    if (current?.kind === "confirm") {
      const resolve = resolveConfirm;
      resolveConfirm = null;
      resolve?.(value === true);
    } else if (current?.kind === "prompt") {
      const resolve = resolvePrompt;
      resolvePrompt = null;
      resolve?.(typeof value === "string" ? value : null);
    }
  }

  function cancelCurrentBeforeOpeningNext() {
    if (!active.value) return;
    settle(active.value.kind === "prompt" ? null : false);
  }

  function confirm(options: ConfirmDialogOptions) {
    cancelCurrentBeforeOpeningNext();
    active.value = {
      kind: "confirm",
      title: options.title,
      description: options.description ?? "",
      confirmLabel: options.confirmLabel ?? "Подтвердить",
      cancelLabel: options.cancelLabel ?? "Отмена",
      tone: options.tone ?? "default"
    };
    return new Promise<boolean>((resolve) => {
      resolveConfirm = resolve;
    });
  }

  function prompt(options: PromptDialogOptions) {
    cancelCurrentBeforeOpeningNext();
    active.value = {
      kind: "prompt",
      title: options.title,
      description: options.description ?? "",
      confirmLabel: options.confirmLabel ?? "Добавить",
      cancelLabel: options.cancelLabel ?? "Отмена",
      tone: options.tone ?? "default",
      label: options.label,
      placeholder: options.placeholder ?? "",
      initialValue: options.initialValue ?? "",
      validate: options.validate
    };
    return new Promise<string | null>((resolve) => {
      resolvePrompt = resolve;
    });
  }

  function accept() {
    if (active.value?.kind === "confirm") settle(true);
  }

  function cancel() {
    if (!active.value) return;
    settle(active.value.kind === "prompt" ? null : false);
  }

  function submitPrompt(rawValue: string) {
    if (active.value?.kind !== "prompt") return null;
    const value = rawValue.trim();
    const validationError = active.value.validate?.(value) ?? null;
    if (validationError) return validationError;
    settle(value);
    return null;
  }

  return { active, confirm, prompt, accept, cancel, submitPrompt };
});
