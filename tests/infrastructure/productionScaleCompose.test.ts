import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const compose = readFileSync(resolve(process.cwd(), "docker-compose.scale.yml"), "utf8");
const caddy = readFileSync(resolve(process.cwd(), "deploy/Caddyfile.scale"), "utf8");

describe("production scale profile", () => {
  it("runs two stateless API replicas and exactly one background worker", () => {
    expect(compose).toContain("api-1:");
    expect(compose).toContain("api-2:");
    expect(compose).toContain("worker:");
    expect(compose.match(/RUN_BACKGROUND_JOBS: false/g)).toHaveLength(3);
    expect(compose.match(/RUN_BACKGROUND_JOBS: true/g)).toHaveLength(1);
  });

  it("routes application traffic through PgBouncer while migrations stay direct", () => {
    expect(compose).toContain("pgbouncer:");
    expect(compose).toContain("@pgbouncer:5432/");
    expect(compose).toContain("@postgres:5432/");
  });

  it("provides Redis and balances both API replicas", () => {
    expect(compose).toContain("redis:");
    expect(caddy).toContain("reverse_proxy api-1:3000 api-2:3000");
  });
});
