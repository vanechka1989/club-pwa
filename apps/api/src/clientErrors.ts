import { z } from "zod";

const clientErrorPayloadSchema = z.object({
  kind: z.string().trim().min(1).max(80).default("client-error"),
  message: z.string().trim().min(1).max(1000),
  url: z.string().trim().max(2048).nullable().optional(),
  userAgent: z.string().trim().max(1000).nullable().optional(),
  platform: z.string().trim().max(120).nullable().optional(),
  viewport: z
    .object({
      width: z.number().nullable().optional(),
      height: z.number().nullable().optional()
    })
    .nullable()
    .optional(),
  detail: z.unknown().optional()
});

export type ClientErrorPayload = z.infer<typeof clientErrorPayloadSchema>;

function stringifyDetail(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  try {
    return JSON.stringify(value).slice(0, 2000);
  } catch {
    return String(value).slice(0, 2000);
  }
}

export function parseClientErrorPayload(input: unknown) {
  return clientErrorPayloadSchema.safeParse(input);
}

export function buildClientErrorRecord(input: ClientErrorPayload) {
  const viewport =
    input.viewport?.width && input.viewport?.height
      ? `${input.viewport.width}x${input.viewport.height}`
      : "viewport unknown";
  const detail = stringifyDetail(input.detail);
  const lines = [
    `kind: ${input.kind}`,
    `message: ${input.message}`,
    `platform: ${input.platform ?? "unknown"}`,
    `viewport: ${viewport}`,
    `userAgent: ${input.userAgent ?? "unknown"}`
  ];

  if (detail) {
    lines.push(`detail: ${detail}`);
  }

  return {
    error: lines.join("\n"),
    title: "Ошибка запуска приложения",
    path: input.url ?? null,
    method: "CLIENT",
    status: null
  };
}
