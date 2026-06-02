/**
 * Extract lat/lng from a Google Maps URL (short or full).
 * Returns [latitude, longitude] or null if extraction fails.
 */
export async function extractCoordsFromMapsUrl(
  url: string
): Promise<[number, number] | null> {
  if (!url) return null;

  try {
    let resolvedUrl = url;

    /* Short URLs (maps.app.goo.gl or goo.gl) — follow redirects */
    if (/goo\.gl/i.test(url)) {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      resolvedUrl = res.url;
    }

    /* Pattern 1: /@lat,lng,zoom  e.g. /@25.8729193,43.4890979,17z */
    const atMatch = resolvedUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      return [parseFloat(atMatch[1]), parseFloat(atMatch[2])];
    }

    /* Pattern 2: ?q=lat,lng */
    const qMatch = resolvedUrl.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (qMatch) {
      return [parseFloat(qMatch[1]), parseFloat(qMatch[2])];
    }

    /* Pattern 3: !3d lat !4d lng embedded in data */
    const dataMatch = resolvedUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (dataMatch) {
      return [parseFloat(dataMatch[1]), parseFloat(dataMatch[2])];
    }

    return null;
  } catch {
    return null;
  }
}
