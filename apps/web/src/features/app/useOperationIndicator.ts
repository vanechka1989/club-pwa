import { onBeforeUnmount, watch, type WatchSource } from "vue";
import { useOperationsStore, type AppOperationInput } from "@/stores/operations";

export function useOperationIndicator(source: WatchSource<AppOperationInput | null | undefined>) {
  const operations = useOperationsStore();
  let operationId: number | null = null;

  const stop = watch(
    source,
    (operation) => {
      if (!operation) {
        operations.finish(operationId);
        operationId = null;
        return;
      }

      if (operationId === null) {
        operationId = operations.start(operation);
        return;
      }

      operations.update(operationId, operation);
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    stop();
    operations.finish(operationId);
    operationId = null;
  });
}
