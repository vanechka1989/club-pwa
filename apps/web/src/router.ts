import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { sectionFromPath, taskRoutePaths } from "@/features/app/taskNavigation";

const RouteState = { name: "RouteState", render: () => null };
const sectionRoutes = ["/profile", "/learning", "/community", "/payments", "/support", "/admin"];

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/profile" },
  ...sectionRoutes.map((path) => ({
    path,
    component: RouteState,
    meta: { section: sectionFromPath(path), task: false }
  })),
  ...taskRoutePaths.map((path) => ({
    path,
    component: RouteState,
    meta: {
      section: sectionFromPath(path),
      task: true,
      adminOnly:
        path.startsWith("/admin/") ||
        path.startsWith("/payments/provider") ||
        path.includes("/plans/") ||
        path === "/support/tickets/:ticketId/clients/:customerId"
    }
  })),
  { path: "/:pathMatch(.*)*", redirect: "/profile" }
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});
