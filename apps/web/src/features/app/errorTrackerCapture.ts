import { redactSensitiveClientPath } from "@/utils/requestPath";

export type RuntimeErrorContext = {
  release: string;
  url: string;
  displayMode: string;
  online: boolean;
  installationId: string | null;
  userAgent: string;
  platform: string;
  viewport: { width: number; height: number };
};

export function buildRuntimeErrorPayload(error: unknown, component: string, context: RuntimeErrorContext) {
  const resolved = error instanceof Error ? error : new Error(String(error));
  let route = "/";
  try {
    route = new URL(context.url, "https://club.invalid").pathname;
  } catch {
    route = context.url.split(/[?#]/, 1)[0] || "/";
  }
  return {
    kind: "vue-error",
    message: resolved.message || "Неизвестная ошибка Vue",
    route: redactSensitiveClientPath(route),
    stack: resolved.stack ?? null,
    release: context.release,
    displayMode: context.displayMode,
    online: context.online,
    installationId: context.installationId,
    userAgent: context.userAgent,
    platform: context.platform,
    viewport: context.viewport,
    detail: { component: component.slice(0, 300) }
  };
}

export function installVueErrorHandler(
  app: { config: { errorHandler?: (...args: any[]) => void } },
  report: (payload: ReturnType<typeof buildRuntimeErrorPayload>) => Promise<unknown>,
  getContext: () => RuntimeErrorContext
) {
  app.config.errorHandler = (error, _instance, info) => {
    console.error("Vue application error", error, info);
    void report(buildRuntimeErrorPayload(error, info, getContext())).catch(() => undefined);
  };
}
