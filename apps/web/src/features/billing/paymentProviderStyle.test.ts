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

  it("uses an optional product badge instead of labeling the first tariff automatically", () => {
    expect(source).toContain('v-if="product.badgeLabel"');
    expect(source).toContain("productForm.badgeLabel");
    expect(source).toContain("Метка (необязательно)");
    expect(styles).not.toContain('.soft-payment-card:first-child::after');
    expect(styles).not.toContain('content: "Выгодно"');
  });

  it("keeps the full title row free and stacks badges below tariff details", () => {
    expect(source).toMatch(/class="payment-product-details"[\s\S]*payment-product-meta[\s\S]*v-if="product\.badgeLabel"/);
    expect(source).not.toMatch(/class="payment-product-heading">\s*<p[^>]*payment-product-title[^>]*>[^<]*<\/p>\s*<span v-if="product\.badgeLabel"/);
    expect(styles).toMatch(/\.payment-product-details\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s);
    expect(styles).toMatch(/\.payment-product-details\s*\{[^}]*align-items:\s*start;/s);
    expect(styles).toMatch(/\.payment-product-details \.payment-product-meta\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s);
    expect(styles).toMatch(/\.payment-product-badge\s*\{[^}]*max-width:\s*100%;[^}]*text-overflow:\s*ellipsis;/s);
  });

  it("keeps member tariff cards compact", () => {
    expect(source).toContain("payment-product-badge");
    expect(styles).toContain(".payment-product-list .payment-product-row");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr) auto;");
    expect(styles).toMatch(/\.payment-product-title\s*\{[^}]*white-space:\s*nowrap;/s);
    expect(styles).toMatch(/\.payment-product-list \.payment-product-row \.payment-product-pay\s*\{[^}]*width:\s*80px;/s);
  });

  it("does not let owner controls widen the payment action column", () => {
    expect(styles).toMatch(/\.payment-product-row:has\(\.payment-product-admin-actions\) \.payment-product-actions\s*\{[^}]*display:\s*contents;/s);
    expect(styles).toMatch(/\.payment-product-row:has\(\.payment-product-admin-actions\) \.payment-product-admin-actions\s*\{[^}]*grid-column:\s*1 \/ -1;/s);
  });

  it("uses a compact accessible switch for tariff visibility", () => {
    expect(source).toContain("payment-product-publish-toggle");
    expect(source).toContain("payment-product-publish-switch");
    expect(source).toContain('aria-label="Показывать клиентам"');
    expect(styles).toContain(".payment-product-publish-input:checked + .payment-product-publish-switch");
  });
});
