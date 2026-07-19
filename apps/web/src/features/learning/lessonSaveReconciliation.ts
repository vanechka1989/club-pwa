import type { AdminLearningMaterial, LearningSaveOperationResponse } from "@club/shared";

type FetchLikeError = Error & { response?: unknown };

export function isAmbiguousNetworkError(error: unknown): error is FetchLikeError {
  if (!(error instanceof Error)) {
    return false;
  }
  const fetchError = error as FetchLikeError;
  return fetchError.name === "FetchError" && !fetchError.response;
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}

export async function reconcileLearningSave({
  originalError,
  loadOperation,
  delaysMs = [0, 500, 1200],
  wait = sleep
}: {
  originalError: unknown;
  loadOperation: () => Promise<LearningSaveOperationResponse>;
  delaysMs?: number[];
  wait?: (delayMs: number) => Promise<void>;
}): Promise<AdminLearningMaterial> {
  for (const delayMs of delaysMs) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    try {
      const operation = await loadOperation();
      if (operation.status === "succeeded" && operation.material) {
        return operation.material;
      }
      if (operation.status === "failed" || (operation.status === "succeeded" && !operation.material)) {
        throw originalError;
      }
    } catch (error) {
      if (error === originalError) {
        throw error;
      }
    }
  }

  throw originalError;
}
