import { isIP } from "node:net";

export function normalizeIpAddress(rawValue: string | null | undefined) {
  let value = rawValue?.trim();
  if (!value) return null;

  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");
    if (closingBracket < 0) return null;
    value = value.slice(1, closingBracket);
  } else {
    const ipv4WithPort = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
    if (ipv4WithPort?.[1] && isIP(ipv4WithPort[1]) === 4) value = ipv4WithPort[1];
  }

  const mappedIpv4 = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  if (mappedIpv4 && isIP(mappedIpv4) === 4) return mappedIpv4;

  return isIP(value) ? value.toLowerCase() : null;
}

export function getTrustedClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",", 1)[0];
  return normalizeIpAddress(forwarded) ?? normalizeIpAddress(headers.get("x-real-ip"));
}
