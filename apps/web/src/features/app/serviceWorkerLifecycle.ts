type ServiceWorkerStateLike = {
  state: string;
  addEventListener(type: "statechange", listener: () => void): void;
};

type WaitingServiceWorkerLike = {
  postMessage(message: unknown): void;
};

type ServiceWorkerRegistrationLike = {
  waiting: WaitingServiceWorkerLike | null;
  installing: ServiceWorkerStateLike | null;
  update(): Promise<void>;
  addEventListener(type: "updatefound", listener: () => void): void;
};

type ServiceWorkerContainerLike = {
  register(scriptUrl: string, options: RegistrationOptions): Promise<ServiceWorkerRegistrationLike>;
  addEventListener(type: "controllerchange", listener: () => void): void;
};

type WindowEventTargetLike = {
  addEventListener(type: "online", listener: () => void): void;
};

type DocumentEventTargetLike = {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
};

export type ServiceWorkerLifecycleOptions = {
  serviceWorker: ServiceWorkerContainerLike;
  windowTarget: WindowEventTargetLike;
  documentTarget: DocumentEventTargetLike;
  reload: () => void;
};

function browserOptions(): ServiceWorkerLifecycleOptions {
  return {
    serviceWorker: navigator.serviceWorker as unknown as ServiceWorkerContainerLike,
    windowTarget: window,
    documentTarget: document,
    reload: () => window.location.reload()
  };
}

export function startServiceWorkerLifecycle(options: ServiceWorkerLifecycleOptions = browserOptions()) {
  const { serviceWorker, windowTarget, documentTarget, reload } = options;
  let registration: ServiceWorkerRegistrationLike | null = null;
  let lifecycleAttempt: Promise<void> | null = null;
  let refreshing = false;

  const activateWaitingServiceWorker = (currentRegistration: ServiceWorkerRegistrationLike) => {
    currentRegistration.waiting?.postMessage({ type: "SKIP_WAITING" });
  };

  const watchServiceWorkerUpdate = (currentRegistration: ServiceWorkerRegistrationLike) => {
    activateWaitingServiceWorker(currentRegistration);

    currentRegistration.addEventListener("updatefound", () => {
      const installingWorker = currentRegistration.installing;

      installingWorker?.addEventListener("statechange", () => {
        if (installingWorker.state === "installed") {
          activateWaitingServiceWorker(currentRegistration);
        }
      });
    });
  };

  const updateServiceWorker = () => {
    if (lifecycleAttempt) {
      return lifecycleAttempt;
    }

    lifecycleAttempt = (async () => {
      try {
        if (!registration) {
          registration = await serviceWorker.register("/sw.js", { updateViaCache: "none" });
          watchServiceWorkerUpdate(registration);
        }

        await registration.update();
        activateWaitingServiceWorker(registration);
      } catch {
        // A transient Service Worker failure must not interrupt or relabel an otherwise healthy app startup.
      } finally {
        lifecycleAttempt = null;
      }
    })();

    return lifecycleAttempt;
  };

  serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    reload();
  });

  documentTarget.addEventListener("visibilitychange", () => {
    if (documentTarget.visibilityState === "visible") {
      void updateServiceWorker();
    }
  });

  windowTarget.addEventListener("online", () => {
    void updateServiceWorker();
  });

  void updateServiceWorker();
}
