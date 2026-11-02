type RecoveryManifest = {
  entry: string;
  routes: Record<string, { file: string; css: string[] }>;
};

export function recoveryAssetUrl(file: string, base: URL): URL {
  if (!/^assets\/[\w.-]+\.(?:js|css)$/.test(file)) throw new Error("Invalid recovery asset");
  return new URL(file, base);
}

/** Import the intended route's bundled static graph, not an error-message URL. */
export async function recoverRouteModule(key: string, attempt: number) {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  const token = `${Date.now()}-${attempt}`;
  if (import.meta.env.DEV) {
    // Vite's development graph is served as source modules, not build chunks.
    // Always retry the requested page, never a URL parsed from an error.
    const url = new URL(`src/${key}.tsx`, base);
    url.searchParams.set("route-retry", token);
    return import(/* @vite-ignore */ url.href);
  }
  const response = await fetch(new URL("route-recovery.json", base), { cache: "no-store" });
  if (!response.ok) throw new Error("Route recovery manifest unavailable");
  const manifest = await response.json() as RecoveryManifest;
  // A stale tab must never import a different build's React/auth/query singletons.
  if (recoveryAssetUrl(manifest.entry, base).href !== import.meta.url) {
    throw new Error("This route belongs to another application build");
  }
  const route = manifest.routes[key];
  if (!route) throw new Error("Route recovery module unavailable");
  await Promise.all(route.css.map(file => new Promise<void>((resolve, reject) => {
    const url = recoveryAssetUrl(file, base);
    const existing = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
      .find(link => link.href === url.href);
    if (existing?.sheet) { resolve(); return; }
    // Vite may retain a failed CSS preload link; do not reuse its rejected state.
    existing?.remove();
    url.searchParams.set("route-retry", token);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url.href;
    link.onload = () => resolve();
    link.onerror = () => { link.remove(); reject(new Error("Route stylesheet unavailable")); };
    document.head.append(link);
  })));
  const url = recoveryAssetUrl(route.file, base);
  url.searchParams.set("route-retry", token);
  return import(/* @vite-ignore */ url.href);
}
