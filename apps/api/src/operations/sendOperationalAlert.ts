import { sendEmail } from "../auth/emailDelivery";
import { env } from "../env";

const severity = process.argv[2] === "recovered" ? "recovered" : "warning";
const detail = (process.argv[3] ?? "Operational monitor changed state").slice(0, 4000);
const recovered = severity === "recovered";

await sendEmail({
  to: env.OWNER_EMAIL,
  subject: recovered ? "Club PWA: сервер восстановился" : "Club PWA: требуется внимание",
  text: detail,
  category: "transactional"
});

console.log(JSON.stringify({ ok: true, severity }));
