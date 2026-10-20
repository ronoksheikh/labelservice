declare global {
  interface Window { __BOOT__?: { path: string; data: unknown } }
}

/** Data the Worker inlined into the page for this exact path, used once for the first render. */
export function takeBoot<T>(path: string): T | undefined {
  const boot = window.__BOOT__;
  if (!boot || boot.path !== path) return undefined;
  window.__BOOT__ = undefined;
  return (boot.data ?? undefined) as T | undefined;
}
