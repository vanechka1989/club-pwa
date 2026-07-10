import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "PaymentsSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

describe("payment provider status style", () => {
  it("uses theme status classes instead of hard-coded emerald colors", () => {
    expect(source).toContain("payment-provider-status");
    expect(source).toContain("payment-provider-status-enabled");
    expect(source).toContain("payment-provider-status-disabled");
    expect(source).not.toContain("border-emerald");
    expect(source).not.toContain("bg-emerald");
    expect(source).not.toContain("text-emerald");
    expect(styles).toMatch(/\.payment-provider-status-enabled\s*\{[^}]*var\(--success\)[^}]*var\(--success-text\)[^}]*\}/s);
    expect(styles).toMatch(/\.payment-provider-status-disabled\s*\{[^}]*var\(--danger-strong\)[^}]*var\(--danger-text\)[^}]*\}/s);
  });

  it("shows when archived products will be deleted", () => {
    expect(source).toContain("formatArchiveDeletionLabel(product.archivedUntil)");
    expect(source).not.toContain("В архиве до {{ product.archivedUntil");
  });

  it("uses a provider sheet and routed task screens for long payment forms", () => {
    expect(source).toContain('import BottomSheet from "@/features/app/BottomSheet.vue"');
    expect(source).toContain('import TaskScreen from "@/features/app/TaskScreen.vue"');
    expect(source).toContain('<BottomSheet :open="showProviderPicker"');
    expect(source).toContain('openPaymentTask("/payments/provider")');
    expect(source).toContain('openPaymentTask(`/payments/plans/${product.id}/edit`)');
    expect(source).not.toContain('class="admin-modal-backdrop payment-modal-backdrop"');
  });
});
