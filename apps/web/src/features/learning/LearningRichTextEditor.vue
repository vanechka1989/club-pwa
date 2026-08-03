<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { Bold, Code2, Heading2, Italic, Link, List, ListOrdered, MoreHorizontal, Quote, Underline } from "lucide-vue-next";
import { useAppDialogsStore } from "@/stores/appDialogs";
import { prepareLearningHtml } from "./learningRichText";

const props = withDefaults(defineProps<{
  modelValue: string;
  label: string;
  placeholder?: string;
}>(), {
  placeholder: "Введите текст"
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const dialogs = useAppDialogsStore();
const editor = ref<HTMLElement | null>(null);
const mode = ref<"visual" | "html">("visual");
const showMore = ref(false);
let savedRange: Range | null = null;

function syncVisualContent() {
  if (!editor.value) return;
  const safe = prepareLearningHtml(props.modelValue);
  if (editor.value.innerHTML !== safe) editor.value.innerHTML = safe;
}

function rememberSelection() {
  const selection = window.getSelection();
  if (!editor.value || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (editor.value.contains(range.commonAncestorContainer)) savedRange = range.cloneRange();
}

function restoreSelection() {
  if (!savedRange) {
    editor.value?.focus();
    return;
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(savedRange);
}

function emitVisualContent() {
  if (!editor.value) return;
  rememberSelection();
  emit("update:modelValue", prepareLearningHtml(editor.value.innerHTML));
}

function runCommand(command: string, value?: string) {
  restoreSelection();
  document.execCommand(command, false, value);
  emitVisualContent();
}

function insertSafeHtml(value: string) {
  const safe = prepareLearningHtml(value);
  if (!safe || !editor.value) return;
  restoreSelection();
  if (typeof document.execCommand === "function") {
    document.execCommand("insertHTML", false, safe);
  } else {
    editor.value.insertAdjacentHTML("beforeend", safe);
  }
  emitVisualContent();
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault();
  const html = event.clipboardData?.getData("text/html");
  const text = event.clipboardData?.getData("text/plain") ?? "";
  insertSafeHtml(html || text);
}

function isSafeLink(value: string) {
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function addLink() {
  rememberSelection();
  const value = await dialogs.prompt({
    title: "Добавить ссылку",
    description: "Укажите адрес, который откроется по нажатию на выделенный текст.",
    label: "Адрес ссылки",
    placeholder: "https://example.com",
    confirmLabel: "Добавить",
    validate: (input) => isSafeLink(input) ? null : "Введите безопасную ссылку http, https, mailto или внутренний путь."
  });
  if (!value) return;
  await nextTick();
  runCommand("createLink", value);
}

function openHtmlMode() {
  emitVisualContent();
  mode.value = "html";
  showMore.value = false;
}

async function openVisualMode() {
  const safe = prepareLearningHtml(props.modelValue);
  emit("update:modelValue", safe);
  mode.value = "visual";
  await nextTick();
  syncVisualContent();
}

function updateHtmlSource(event: Event) {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
}

onMounted(syncVisualContent);
watch(() => props.modelValue, () => {
  if (mode.value === "visual" && document.activeElement !== editor.value) void nextTick(syncVisualContent);
});
</script>

<template>
  <div class="learning-rich-text-field">
    <span :id="`${$attrs.id ?? 'learning-editor'}-label`" class="learning-rich-text-label">{{ label }}</span>

    <template v-if="mode === 'visual'">
      <div class="learning-rich-text-toolbar" role="toolbar" :aria-label="`Форматирование: ${label}`">
        <button type="button" aria-label="Полужирный" title="Полужирный" @pointerdown.prevent @click="runCommand('bold')"><Bold aria-hidden="true" /></button>
        <button type="button" aria-label="Курсив" title="Курсив" @pointerdown.prevent @click="runCommand('italic')"><Italic aria-hidden="true" /></button>
        <button type="button" aria-label="Маркированный список" title="Маркированный список" @pointerdown.prevent @click="runCommand('insertUnorderedList')"><List aria-hidden="true" /></button>
        <button type="button" aria-label="Добавить ссылку" title="Добавить ссылку" @pointerdown.prevent @click="addLink"><Link aria-hidden="true" /></button>
        <button type="button" aria-label="Дополнительные инструменты" title="Дополнительные инструменты" :aria-expanded="showMore" @pointerdown.prevent @click="showMore = !showMore"><MoreHorizontal aria-hidden="true" /></button>

        <div v-if="showMore" class="learning-rich-text-toolbar-more">
          <button type="button" aria-label="Подчёркнутый" title="Подчёркнутый" @pointerdown.prevent @click="runCommand('underline')"><Underline aria-hidden="true" /></button>
          <button type="button" aria-label="Нумерованный список" title="Нумерованный список" @pointerdown.prevent @click="runCommand('insertOrderedList')"><ListOrdered aria-hidden="true" /></button>
          <button type="button" aria-label="Заголовок" title="Заголовок" @pointerdown.prevent @click="runCommand('formatBlock', 'h2')"><Heading2 aria-hidden="true" /></button>
          <button type="button" aria-label="Цитата" title="Цитата" @pointerdown.prevent @click="runCommand('formatBlock', 'blockquote')"><Quote aria-hidden="true" /></button>
          <button type="button" class="learning-rich-text-html-button" aria-label="Редактировать HTML" @pointerdown.prevent @click="openHtmlMode"><Code2 aria-hidden="true" /><span>HTML</span></button>
        </div>
      </div>

      <div
        ref="editor"
        class="learning-rich-text-editor text-input"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        :aria-label="label"
        :data-placeholder="placeholder"
        @input="emitVisualContent"
        @keyup="rememberSelection"
        @mouseup="rememberSelection"
        @touchend="rememberSelection"
        @paste="handlePaste"
      ></div>
    </template>

    <template v-else>
      <div class="learning-rich-text-source-head">
        <span>HTML-код</span>
        <button type="button" class="secondary-button ui-button" aria-label="Вернуться к визуальному редактору" @click="openVisualMode">Визуально</button>
      </div>
      <textarea
        :value="modelValue"
        class="text-input learning-rich-text-source"
        :aria-label="`HTML-код: ${label}`"
        spellcheck="false"
        @input="updateHtmlSource"
      ></textarea>
    </template>
  </div>
</template>
