import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (path: string) => {
  const absolute = resolve(__dirname, `../../../../${path}`);
  return existsSync(absolute) ? readFileSync(absolute, "utf-8") : "";
};

describe("external uptime monitoring", () => {
  const script = readRepoFile("scripts/check-public-uptime.sh");
  const workflow = readRepoFile(".github/workflows/external-uptime.yml");

  it("checks public web and API endpoints with bounded retries", () => {
    expect(script).toContain("https://club2.myn8nservertest.ru");
    expect(script).toContain("/api/health");
    expect(script).toContain("/api/ready");
    expect(script).toContain("--max-time 10");
    expect(script).toContain("--retry 2");
    expect(script).toContain('grep -q \'"ok":true\'');
  });

  it("runs outside the VPS and deduplicates incident issues", () => {
    expect(workflow).toContain("cron: \"*/5 * * * *\"");
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("steps.check.outcome == 'failure'");
    expect(workflow).toContain("findOpenIncident");
    expect(workflow).toContain("state: 'closed'");
    expect(workflow).toContain("Mark outage check as failed");
    expect(workflow).toContain("exit 1");
  });
});
