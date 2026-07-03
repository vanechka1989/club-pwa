import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("template installer", () => {
  it("is public and installs prebuilt images without cloning the private repo", () => {
    const installer = readFileSync(resolve(process.cwd(), "public/install-club.sh"), "utf8");

    expect(installer).toContain("ghcr.io/vanechka1989/club-crm-api");
    expect(installer).toContain("ghcr.io/vanechka1989/club-crm-web");
    expect(installer).toContain("docker compose pull");
    expect(installer).toContain("db:migrate");
    expect(installer).toContain("без токена GitHub");
    expect(installer).toContain("Адрес клуба");
    expect(installer).toContain("Не удалось скачать готовые образы клуба");
    expect(installer).not.toContain("git clone");
    expect(installer).not.toContain("docker compose -f docker-compose.prod.yml build");
  });

  it("publishes api and web images to GitHub Container Registry", () => {
    const workflow = readFileSync(resolve(process.cwd(), "../../.github/workflows/publish-images.yml"), "utf8");

    expect(workflow).toContain("packages: write");
    expect(workflow).toContain("ghcr.io/vanechka1989/club-crm-api");
    expect(workflow).toContain("ghcr.io/vanechka1989/club-crm-web");
    expect(workflow).toContain("docker/build-push-action");
  });
});
