export type IntegrationHealthStatus = "healthy" | "warning" | "disabled" | "error";

export type IntegrationHealthCheck = {
  id: "database" | "smtp" | "s3" | "payments" | "realtime";
  label: string;
  status: IntegrationHealthStatus;
  detail: string;
};

type IntegrationConfig = {
  smtp: { host: string | undefined; port: number | undefined; user: string | undefined; password: string | undefined };
  s3: { endpoint: string | undefined; bucket: string | undefined; accessKeyId: string | undefined; secretAccessKey: string | undefined };
  payment: { enabled: boolean; hasSecret: boolean };
  realtime: { enabled: boolean; subscriberCount: number };
};

export function buildConfiguredIntegrationHealth(config: IntegrationConfig): IntegrationHealthCheck[] {
  const smtpConfigured = Boolean(config.smtp.host && config.smtp.port && config.smtp.user && config.smtp.password);
  const s3Configured = Boolean(config.s3.endpoint && config.s3.bucket && config.s3.accessKeyId && config.s3.secretAccessKey);
  const paymentConfigured = config.payment.enabled && config.payment.hasSecret;

  return [
    { id: "database", label: "База данных", status: "healthy", detail: "Соединение с PostgreSQL доступно." },
    {
      id: "smtp",
      label: "Email",
      status: smtpConfigured ? "healthy" : "warning",
      detail: smtpConfigured ? "SMTP настроен." : "SMTP настроен не полностью."
    },
    {
      id: "s3",
      label: "Хранилище S3",
      status: s3Configured ? "healthy" : "warning",
      detail: s3Configured ? "S3 настроено." : "S3 настроено не полностью."
    },
    {
      id: "payments",
      label: "Prodamus",
      status: paymentConfigured ? "healthy" : "disabled",
      detail: paymentConfigured ? "Платёжная система включена." : "Платёжная система отключена или не имеет ключа."
    },
    {
      id: "realtime",
      label: "Realtime",
      status: config.realtime.enabled ? "healthy" : "warning",
      detail: config.realtime.enabled
        ? `SSE работает. Активных подключений: ${config.realtime.subscriberCount}.`
        : "Realtime не настроен."
    }
  ];
}
