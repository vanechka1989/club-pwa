export function shouldRecordLoginIpChange(previousIpAddress: string | null, ipAddress: string | null) {
  return Boolean(ipAddress && previousIpAddress !== ipAddress);
}
