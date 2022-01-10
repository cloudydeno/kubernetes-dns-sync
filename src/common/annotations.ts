export function ttlFromAnnotations(annotations: Record<string,string>) {
  const rawVal = annotations['external-dns.alpha.kubernetes.io/ttl'];
  if (rawVal) return parseInt(rawVal, 10);
  return null;
}
