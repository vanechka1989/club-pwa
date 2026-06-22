import { BookOpen, CreditCard, Home, LifeBuoy, Shield, type LucideIcon } from "lucide-vue-next";
import type { MessageKey } from "./i18n";

export type AppSection = "profile" | "learning" | "payments" | "support" | "admin";

export type NavItem = {
  id: AppSection;
  labelKey: MessageKey;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export const navItems: NavItem[] = [
  { id: "profile", labelKey: "navProfile", icon: Home },
  { id: "learning", labelKey: "navLearning", icon: BookOpen },
  { id: "payments", labelKey: "navPayments", icon: CreditCard },
  { id: "support", labelKey: "navSupport", icon: LifeBuoy },
  { id: "admin", labelKey: "navAdmin", icon: Shield, adminOnly: true }
];
