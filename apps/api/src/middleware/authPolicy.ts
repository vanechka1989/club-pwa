export function canAuthenticateWithoutPwaHeader(path: string, pwaQuery?: string) {
  return path.startsWith("/uploads/") || (path === "/community/events" && pwaQuery === "1");
}
