# PWA Install And Mobile App Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make install, login, and the signed-in mobile shell feel like one production PWA flow.

**Architecture:** Keep the current Vue feature modules. Extract install-platform detection into a small shared helper, use it from the auth gate and floating install prompt, then tighten mobile shell CSS and tests around the existing `App.vue` layout.

**Tech Stack:** Vue 3 Composition API, Pinia, Vitest, Testing Library Vue, CSS, Playwright smoke checks.

---

## Files

- Create `apps/web/src/features/app/installPlatform.ts` for shared iPhone/iPad/Android/browser detection.
- Create `apps/web/src/features/app/installPlatform.test.ts` for platform detection tests.
- Modify `apps/web/src/features/auth/AuthSection.vue` to use the shared helper and keep iPhone manual install as the first render.
- Modify `apps/web/src/features/auth/authEmail.test.ts` to verify iPhone, desktop, and cooldown behavior.
- Modify `apps/web/src/features/app/PwaInstallPrompt.vue` to use the same shared helper.
- Modify `apps/web/src/features/app/pwa.test.ts` to verify the floating prompt stays instruction-only on iOS.
- Modify `apps/web/src/App.test.ts` and `apps/web/src/styles.css` for mobile app shell source assertions and CSS refinements.

---

### Task 1: Shared Install Platform Helper

**Files:**
- Create: `apps/web/src/features/app/installPlatform.ts`
- Create: `apps/web/src/features/app/installPlatform.test.ts`

- [ ] **Step 1: Write failing platform tests**

```ts
import { describe, expect, it } from "vitest";
import { detectInstallPlatform } from "./installPlatform";

describe("install platform detection", () => {
  it("detects iPhone Safari user agents", () => {
    expect(
      detectInstallPlatform({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5
      }).kind
    ).toBe("ios");
  });

  it("detects touch iPads that report MacIntel", () => {
    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5
      }).kind
    ).toBe("ios");
  });

  it("detects Android browsers separately from desktop browsers", () => {
    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
        platform: "Linux armv8l",
        maxTouchPoints: 5
      }).kind
    ).toBe("android");

    expect(
      detectInstallPlatform({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
        platform: "Win32",
        maxTouchPoints: 0
      }).kind
    ).toBe("desktop");
  });
});
```

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @club/web test -- installPlatform.test.ts`

Expected: fail because `installPlatform.ts` does not exist.

- [ ] **Step 3: Implement helper**

```ts
export type InstallPlatformKind = "ios" | "android" | "desktop";

export type InstallPlatformInput = {
  maxTouchPoints?: number;
  platform?: string;
  userAgent?: string;
};

export type InstallPlatform = {
  kind: InstallPlatformKind;
  isIos: boolean;
  isAndroid: boolean;
};

export function detectInstallPlatform(input: InstallPlatformInput = {}): InstallPlatform {
  const userAgent = input.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const platform = input.platform ?? (typeof navigator !== "undefined" ? navigator.platform : "");
  const maxTouchPoints = input.maxTouchPoints ?? (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  const isIos = /iphone|ipad|ipod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const isAndroid = /android/i.test(userAgent);

  return {
    kind: isIos ? "ios" : isAndroid ? "android" : "desktop",
    isIos,
    isAndroid
  };
}
```

- [ ] **Step 4: Run green test**

Run: `pnpm --filter @club/web test -- installPlatform.test.ts`

Expected: pass.

---

### Task 2: Unified Install Gate And Prompt

**Files:**
- Modify: `apps/web/src/features/auth/AuthSection.vue`
- Modify: `apps/web/src/features/auth/authEmail.test.ts`
- Modify: `apps/web/src/features/app/PwaInstallPrompt.vue`
- Modify: `apps/web/src/features/app/pwa.test.ts`

- [ ] **Step 1: Add tests for shared platform usage**

In `authEmail.test.ts`, keep the iPhone regression test and add a desktop expectation that the install button still exists for desktop non-installed browsers.

```ts
it("keeps the native install request path for desktop browsers", () => {
  renderAuth(createPinia(), { standalone: false });

  expect(screen.getByRole("heading", { name: "Установите приложение" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Установить приложение" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Добавьте Club на экран Домой" })).toBeNull();
});
```

In `pwa.test.ts`, add a source assertion that `PwaInstallPrompt.vue` imports `detectInstallPlatform`.

```ts
expect(prompt).toContain("detectInstallPlatform");
expect(prompt).not.toContain("/iphone|ipad|ipod/i.test(userAgent)");
```

- [ ] **Step 2: Run red tests**

Run: `pnpm --filter @club/web test -- authEmail.test.ts pwa.test.ts`

Expected: fail while `PwaInstallPrompt.vue` still has inline platform detection.

- [ ] **Step 3: Replace duplicated detection**

In `AuthSection.vue`, import `detectInstallPlatform`:

```ts
import { detectInstallPlatform } from "@/features/app/installPlatform";
```

Change `detectIosInstallDevice()` to:

```ts
function detectIosInstallDevice() {
  return detectInstallPlatform().isIos;
}
```

In `PwaInstallPrompt.vue`, import the helper:

```ts
import { detectInstallPlatform } from "@/features/app/installPlatform";
```

Change `detectPlatform()` to:

```ts
function detectPlatform() {
  if (typeof window === "undefined") {
    return;
  }

  isIos.value = detectInstallPlatform().isIos;
  isInstalled.value = isInstalledPwaDisplay();
}
```

- [ ] **Step 4: Run green tests**

Run: `pnpm --filter @club/web test -- authEmail.test.ts pwa.test.ts installPlatform.test.ts`

Expected: pass.

---

### Task 3: Mobile App Shell Tightening

**Files:**
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add CSS source tests**

In `App.test.ts`, extend mobile shell assertions:

```ts
expect(styles).toContain("body.club-mobile-device .app-root:not(.app-root-no-user) .section-host");
expect(styles).toContain("body.club-mobile-device .soft-payment-card");
expect(styles).toContain("body.club-mobile-device .learning-hero-card");
expect(styles).toContain("body.club-mobile-device .support-topic-option");
expect(styles).toContain("body.club-mobile-device .bottom-nav");
```

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @club/web test -- App.test.ts`

Expected: fail until the new mobile CSS selectors exist.

- [ ] **Step 3: Add mobile CSS rules**

Append focused mobile rules near the existing `body.club-mobile-device` section:

```css
body.club-mobile-device .app-root:not(.app-root-no-user) .section-host {
  width: 100%;
}

body.club-mobile-device .learning-hero-card,
body.club-mobile-device .learning-progress-card,
body.club-mobile-device .learning-last-card,
body.club-mobile-device .learning-category-card,
body.club-mobile-device .soft-payment-card,
body.club-mobile-device .support-topic-option,
body.club-mobile-device .support-ticket-card {
  border-radius: 18px;
  padding: 0.9rem;
}

body.club-mobile-device .soft-payment-card,
body.club-mobile-device .learning-item-row,
body.club-mobile-device .support-topic-option {
  min-height: 3.25rem;
}

body.club-mobile-device .payment-product-actions,
body.club-mobile-device .support-reply-actions {
  grid-template-columns: 1fr;
}

body.club-mobile-device .bottom-nav {
  right: max(0.75rem, calc(var(--club-safe-right) + 0.75rem));
  left: max(0.75rem, calc(var(--club-safe-left) + 0.75rem));
}
```

- [ ] **Step 4: Run green test**

Run: `pnpm --filter @club/web test -- App.test.ts`

Expected: pass.

---

### Task 4: Verification, Merge, Deploy

**Files:**
- No new source files.

- [ ] **Step 1: Run full tests**

Run: `pnpm --filter @club/web test`

Expected: 40+ test files pass with zero failures.

- [ ] **Step 2: Run production build**

Run: `pnpm --filter @club/web build`

Expected: `vue-tsc --noEmit` passes and Vite builds. Existing chunk-size warning is acceptable.

- [ ] **Step 3: Commit implementation**

```powershell
git add apps/web/src/features/app/installPlatform.ts apps/web/src/features/app/installPlatform.test.ts apps/web/src/features/auth/AuthSection.vue apps/web/src/features/auth/authEmail.test.ts apps/web/src/features/app/PwaInstallPrompt.vue apps/web/src/features/app/pwa.test.ts apps/web/src/App.test.ts apps/web/src/styles.css
git commit -m "Improve PWA install flow and mobile app shell"
```

- [ ] **Step 4: Merge and push**

```powershell
git switch main
git merge --ff-only codex/pwa-install-mobile-pass
git push origin main
```

- [ ] **Step 5: Deploy**

```powershell
ssh -i "C:\Users\ivan\.ssh\club_pwa_codex_ed25519" root@2.27.28.89 "cd /opt/club-pwa && bash deploy/update.sh"
```

- [ ] **Step 6: Production smoke checks**

```powershell
(Invoke-WebRequest -UseBasicParsing https://club2.myn8nservertest.ru/api/health).Content
ssh -i "C:\Users\ivan\.ssh\club_pwa_codex_ed25519" root@2.27.28.89 "cd /opt/club-pwa && git rev-parse --short HEAD && docker compose ps"
```

Expected: health returns `{"ok":true}`, server commit matches local `main`, and `web`/`api` containers are up.
