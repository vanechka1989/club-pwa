type ClientContact = { email?: string | null | undefined; username?: string | null | undefined };

export function getAdminClientContact(user: ClientContact) {
  if (user.email) return user.email;
  if (!user.username) return null;
  return user.username.startsWith("@") ? user.username : `@${user.username}`;
}

export function formatAdminClientLastLogin(
  value: string | null | undefined,
  formatter: (value: string) => string
) {
  return value && Number.isFinite(Date.parse(value)) ? formatter(value) : "Ещё не входил";
}
