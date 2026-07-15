# Forced Mobile Device Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force Club PWA into its mobile interface on physical phones and after desktop users continue, while showing accurate non-blocking device guidance and a local QR code on real computers.

**Architecture:** A pure classifier in `deviceMode.ts` combines screen, DPR, pointer, touch, UA Client Hints, User-Agent, viewport and display-mode signals into `mobile`, `mobile-desktop`, `desktop`, or `unknown`. `App.vue` converts that result into an effective mobile shell, while `DeviceModeNotice.vue` owns the accessible warning surface and local QR rendering. Existing `deviceLayout.ts` remains responsible for scaling and CSS variables.

**Tech Stack:** Vue 3, TypeScript, Vitest, Testing Library, existing CSS theme tokens, `qrcode` for client-side QR generation, PWA service worker.

## Global Constraints

- Device recognition is UX-only and must never grant or remove access.
- Do not hard-block users; every warning includes “Всё равно продолжить”.
- Installed PWA on a physical phone always uses the mobile shell and does not show the browser desktop-mode warning.
- Actual desktop continuation renders a centered mobile-width interface.
- `unknown` preserves the existing responsive behavior without a warning.
- QR data contains only the application origin and root path, with no query, hash, tokens, route IDs, or session data.
- Preserve all business logic and existing theme tokens.
- Tap targets remain at least 44 × 44 px; warning copy is available in Russian and English.
- Release as app version `4.58` and service-worker cache `club-pwa-v157`.

---

### Task 1: Device-mode classifier

**Files:**
- Create: `apps/web/src/features/app/deviceMode.ts`
- Create: `apps/web/src/features/app/deviceMode.test.ts`

**Interfaces:**
- Consumes: browser-provided UA, Client Hints mobile flag, platform, touch/pointer, screen/DPR, viewport and standalone mode.
- Produces: `classifyDeviceMode(input): DeviceModeResult`, `getDeviceModeNoticeKind(mode, isStandalone): DeviceModeNoticeKind | null`, and `getSafeQrTarget(href): string`.

- [ ] **Step 1: Write failing classifier tests**

```ts
expect(classifyDeviceMode(androidPhone).mode).toBe("mobile");
expect(classifyDeviceMode(androidDesktopSite).mode).toBe("mobile-desktop");
expect(classifyDeviceMode(windowsDesktop).mode).toBe("desktop");
expect(classifyDeviceMode(ipadDesktopSite).mode).toBe("unknown");
expect(getDeviceModeNoticeKind("mobile-desktop", true)).toBeNull();
expect(getSafeQrTarget("https://club.example/admin?token=secret#x")).toBe("https://club.example/");
```

- [ ] **Step 2: Run test and confirm RED**

Run: `pnpm --filter @club/web test -- src/features/app/deviceMode.test.ts`

Expected: FAIL because `deviceMode.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure classifier**

```ts
export type DeviceMode = "mobile" | "mobile-desktop" | "desktop" | "unknown";
export type DeviceModeNoticeKind = "mobile-desktop" | "desktop";

export function classifyDeviceMode(input: DeviceModeInput): DeviceModeResult {
  const physicalPhone = input.cssScreenWidth > 0 && input.cssScreenWidth <= 600 && input.devicePixelRatio >= 2;
  const handheldUa = /iPhone|iPod|Android.+Mobile/i.test(input.userAgent);
  const desktopViewportOnPhone = physicalPhone && input.hasTouch && (input.layoutWidth >= 700 || !handheldUa);
  if (desktopViewportOnPhone) return { mode: "mobile-desktop", reasons: ["physical-phone", "desktop-browser-signals"] };
  if (physicalPhone || input.userAgentDataMobile === true || handheldUa) return { mode: "mobile", reasons: ["phone-signals"] };
  if (input.isTabletLike) return { mode: "unknown", reasons: ["tablet-protected"] };
  if (input.hasDesktopUa && input.cssScreenWidth >= 720) return { mode: "desktop", reasons: ["desktop-signals"] };
  return { mode: "unknown", reasons: ["insufficient-signals"] };
}
```

- [ ] **Step 4: Run classifier tests and confirm GREEN**

Run: `pnpm --filter @club/web test -- src/features/app/deviceMode.test.ts`

Expected: all classifier tests pass.

- [ ] **Step 5: Commit the classifier**

```bash
git add apps/web/src/features/app/deviceMode.ts apps/web/src/features/app/deviceMode.test.ts
git commit -m "feat: classify mobile and desktop device modes"
```

### Task 2: Accessible warning and local QR code

**Files:**
- Create: `apps/web/src/features/app/DeviceModeNotice.vue`
- Create: `apps/web/src/features/app/DeviceModeNotice.test.ts`
- Modify: `apps/web/src/features/app/i18n.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `kind: DeviceModeNoticeKind`, `qrTarget: string`, localized `t(...)` messages.
- Produces: `continue` event and a fully accessible modal warning.

- [ ] **Step 1: Write failing component tests**

```ts
render(DeviceModeNotice, { props: { kind: "desktop", qrTarget: "https://club.example/" } });
expect(screen.getByRole("dialog")).toBeTruthy();
expect(screen.getByAltText("QR-код для открытия приложения на телефоне")).toBeTruthy();
await fireEvent.click(screen.getByRole("button", { name: "Всё равно продолжить" }));
expect(emitted().continue).toHaveLength(1);
```

- [ ] **Step 2: Run test and confirm RED**

Run: `pnpm --filter @club/web test -- src/features/app/DeviceModeNotice.test.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Add the local QR dependency and implement the component**

```vue
<Teleport to="body">
  <div class="device-mode-notice-backdrop">
    <section role="dialog" aria-modal="true" class="device-mode-notice-card">
      <img v-if="kind === 'desktop'" :src="qrDataUrl" :alt="t('deviceQrAlt')" />
      <button type="button" @click="$emit('continue')">{{ t('deviceContinue') }}</button>
    </section>
  </div>
</Teleport>
```

Run: `pnpm --filter @club/web add qrcode && pnpm --filter @club/web add -D @types/qrcode`

- [ ] **Step 4: Add complete Russian and English copy and confirm GREEN**

Run: `pnpm --filter @club/web test -- src/features/app/DeviceModeNotice.test.ts`

Expected: warning, QR/no-QR variants, accessibility and continue action pass.

- [ ] **Step 5: Commit the warning surface**

```bash
git add apps/web/src/features/app/DeviceModeNotice.vue apps/web/src/features/app/DeviceModeNotice.test.ts apps/web/src/features/app/i18n.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat: add mobile mode device guidance"
```

### Task 3: Integrate forced mobile presentation

**Files:**
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/app/deviceLayout.ts`
- Modify: `apps/web/src/features/app/deviceLayout.test.ts`

**Interfaces:**
- Consumes: `classifyDeviceMode`, `getDeviceModeNoticeKind`, `getSafeQrTarget`, `DeviceModeNotice`.
- Produces: effective mobile navigation/shell and `desktop-mobile-preview` centered frame.

- [ ] **Step 1: Write failing integration and layout tests**

```ts
expect(appSource).toContain("classifyDeviceMode");
expect(appSource).toContain("DeviceModeNotice");
expect(appSource).toContain("desktop-mobile-preview");
expect(styles).toMatch(/\.desktop-mobile-preview\s*\{[^}]*max-width:\s*30rem/s);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --filter @club/web test -- src/App.test.ts src/features/app/deviceLayout.test.ts`

Expected: FAIL because the integration and styles are absent.

- [ ] **Step 3: Integrate runtime classification and session dismissal**

```ts
const deviceMode = ref<DeviceMode>("unknown");
const continuedNoticeKind = ref<DeviceModeNoticeKind | null>(readContinuedNotice());
const forceMobilePresentation = computed(() => deviceMode.value !== "unknown");
const deviceModeNoticeKind = computed(() => getDeviceModeNoticeKind(deviceMode.value, isStandaloneDisplay.value));
```

Persist continuation in `sessionStorage` per notice kind so the prompt returns on a new browser/PWA launch and reappears when classification changes.

- [ ] **Step 4: Add centered mobile frame CSS and verify GREEN**

```css
.app-root.desktop-mobile-preview {
  width: 100%;
  max-width: 30rem;
  margin-inline: auto;
}
```

Run: `pnpm --filter @club/web test -- src/App.test.ts src/features/app/deviceLayout.test.ts`

Expected: navigation, warning, mobile-shell and frame tests pass.

- [ ] **Step 5: Commit the application integration**

```bash
git add apps/web/src/App.vue apps/web/src/App.test.ts apps/web/src/styles.css apps/web/src/features/app/deviceLayout.ts apps/web/src/features/app/deviceLayout.test.ts
git commit -m "feat: force mobile presentation by device mode"
```

### Task 4: Release and production verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: completed device-mode feature.
- Produces: release `4.58`, SW cache `v157`, verified production deployment.

- [ ] **Step 1: Write failing release tests**

```ts
expect(appVersion).toBe("4.58");
expect(worker).toContain('const cacheName = "club-pwa-v157"');
```

- [ ] **Step 2: Run release tests and confirm RED**

Run: `pnpm --filter @club/web test -- src/features/app/releaseNotes.test.ts src/features/app/pwa.test.ts`

Expected: FAIL with current version `4.57` and SW `v156`.

- [ ] **Step 3: Publish release metadata**

Set `appVersion = "4.58"`, use the actual `Asia/Novosibirsk` completion time in `DD.MM.YYYY HH:mm`, add the device-mode release note, and set SW cache to `club-pwa-v157`.

- [ ] **Step 4: Run complete verification**

Run: `pnpm check && pnpm test && pnpm build`

Expected: all checks, tests and builds pass with no TypeScript errors.

- [ ] **Step 5: Run visual browser checks**

Verify 320, 390, 768, 1024 and 1440 px: no horizontal overflow; mobile and mobile-desktop use bottom navigation; desktop warning contains QR; continuing produces a centered 30rem mobile frame; unknown retains adaptive layout.

- [ ] **Step 6: Commit, push and deploy**

```bash
git add apps/web/src/features/app/version.ts apps/web/src/features/app/releaseNotes.ts apps/web/src/features/app/releaseNotes.test.ts apps/web/public/sw.js apps/web/src/features/app/pwa.test.ts
git commit -m "release: publish device mode guidance"
git push origin main
```

Monitor the existing deployment on `root@2.27.28.89:/opt/club-pwa`, then verify `/health`, app version `4.58`, and SW cache `club-pwa-v157` on `https://club2.myn8nservertest.ru`.
