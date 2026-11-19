// Browser-safe request and event identifiers, including trusted-LAN HTTP contexts.
export function requestId() {
  if (crypto.randomUUID) return crypto.randomUUID().replaceAll('-', '');
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
}
