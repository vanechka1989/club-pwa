export type LessonUploadFailure = {
  title: string;
  detail: string;
  stage: string;
  code: string;
  attempts: number;
  failedAt: number;
};

export class LearningUploadRequestError extends Error {
  code: string;
  status: number | null;
  attempts: number;

  constructor(message: string, options: { code?: string; status?: number | null; attempts?: number } = {}) {
    super(message);
    this.name = "LearningUploadRequestError";
    this.code = options.code ?? "UPLOAD_FAILED";
    this.status = options.status ?? null;
    this.attempts = options.attempts ?? 1;
  }
}

function isCancelled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isRetryableUploadError(error: unknown) {
  if (isCancelled(error)) {
    return false;
  }
  if (error instanceof LearningUploadRequestError) {
    return error.status === 0 || error.status === 408 || error.status === 429 || (error.status !== null && error.status >= 500);
  }
  return error instanceof TypeError;
}

export async function runUploadWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    maxAttempts?: number;
    wait?: (milliseconds: number) => Promise<void>;
    onRetry?: (event: { error: unknown; nextAttempt: number }) => void;
  } = {}
) {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isRetryableUploadError(error) || attempt >= maxAttempts) {
        if (error instanceof LearningUploadRequestError) {
          error.attempts = attempt;
        }
        throw error;
      }
      const nextAttempt = attempt + 1;
      options.onRetry?.({ error, nextAttempt });
      await wait(500 * attempt);
    }
  }

  throw new LearningUploadRequestError("Не удалось загрузить файл.");
}

export function createManualUploadRetryGate() {
  const waiters = new Set<{
    resolve: () => void;
    reject: (error: unknown) => void;
    cleanup: () => void;
  }>();

  const resume = () => {
    const pending = Array.from(waiters);
    waiters.clear();
    pending.forEach((waiter) => {
      waiter.cleanup();
      waiter.resolve();
    });
  };

  const cancel = (error: unknown = new DOMException("Загрузка отменена.", "AbortError")) => {
    const pending = Array.from(waiters);
    waiters.clear();
    pending.forEach((waiter) => {
      waiter.cleanup();
      waiter.reject(error);
    });
  };

  const wait = (signal?: AbortSignal) => {
    if (signal?.aborted) {
      return Promise.reject(new DOMException("Загрузка отменена.", "AbortError"));
    }

    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        waiters.delete(waiter);
        reject(new DOMException("Загрузка отменена.", "AbortError"));
      };
      const waiter = {
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener("abort", abort)
      };
      waiters.add(waiter);
      signal?.addEventListener("abort", abort, { once: true });
    });
  };

  return {
    wait,
    resume,
    cancel,
    hasWaiters: () => waiters.size > 0
  };
}

export function describeLessonUploadFailure(error: unknown, stage: string): LessonUploadFailure {
  const requestError = error instanceof LearningUploadRequestError ? error : null;
  const code = requestError?.code ?? (error instanceof TypeError ? "NETWORK_ERROR" : "UPLOAD_FAILED");
  const attempts = requestError?.attempts ?? 1;

  if (code === "UPLOAD_CONNECTION_CLOSED" || code === "NETWORK_ERROR") {
    return {
      title: "Соединение прервалось",
      detail: attempts >= 3
        ? "Не удалось передать часть файла: три попытки завершились ошибкой. Проверьте интернет и повторите сохранение урока."
        : "Соединение прервалось во время передачи файла. Проверьте интернет и повторите сохранение урока.",
      stage,
      code,
      attempts,
      failedAt: Date.now()
    };
  }

  if (code === "STORAGE_UNAVAILABLE") {
    return {
      title: "Хранилище временно недоступно",
      detail: "Сервер не смог сохранить часть файла после повторных попыток. Повторите сохранение немного позже.",
      stage,
      code,
      attempts,
      failedAt: Date.now()
    };
  }

  return {
    title: "Не удалось сохранить урок",
    detail: error instanceof Error && error.message ? error.message : "Повторите сохранение. Если ошибка повторится, причина уже записана в журнал сервера.",
    stage,
    code,
    attempts,
    failedAt: Date.now()
  };
}
