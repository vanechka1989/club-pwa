import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type AppOperationInput = {
  title: string;
  detail?: string;
};

export type AppOperation = AppOperationInput & {
  id: number;
};

let nextOperationId = 1;

export const useOperationsStore = defineStore("operations", () => {
  const items = ref<AppOperation[]>([]);
  const activeOperation = computed(() => items.value[items.value.length - 1] ?? null);

  function buildOperation(id: number, input: AppOperationInput): AppOperation {
    const operation: AppOperation = {
      id,
      title: input.title.trim()
    };
    const detail = input.detail?.trim();
    if (detail) {
      operation.detail = detail;
    }
    return operation;
  }

  function start(input: AppOperationInput) {
    const title = input.title.trim();
    if (!title) {
      return null;
    }

    const id = nextOperationId++;
    items.value = [...items.value, buildOperation(id, input)];
    return id;
  }

  function update(id: number, input: AppOperationInput) {
    const title = input.title.trim();
    if (!title) {
      finish(id);
      return;
    }

    items.value = items.value.map((item) =>
      item.id === id ? buildOperation(id, input) : item
    );
  }

  function finish(id: number | null) {
    if (id === null) {
      return;
    }

    items.value = items.value.filter((item) => item.id !== id);
  }

  function clear() {
    items.value = [];
  }

  return {
    items,
    activeOperation,
    start,
    update,
    finish,
    clear
  };
});
