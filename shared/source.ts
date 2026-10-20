/** Where a visit came from: utm_source, a Facebook click id, or the referring site. */
export function trafficSource(landingUrl: string, referrer: string, ownHost: string) {
  const url = new URL(landingUrl);
  const utm = url.searchParams.get('utm_source');
  if (utm) return utm.toLowerCase().replace(/[^\w.-]/g, '').slice(0, 40) || 'direct';
  if (url.searchParams.has('fbclid')) return 'facebook';
  let host = '';
  try { host = referrer ? new URL(referrer).hostname.replace(/^www\./, '') : ''; } catch { /* not a URL */ }
  if (!host || host === ownHost) return 'direct';
  const known: [RegExp, string][] = [
    [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
    [/(^|\.)instagram\.com$/, 'instagram'],
    [/(^|\.)google\./, 'google'],
    [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
    [/(^|\.)bing\.com$/, 'bing'],
    [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'],
    [/(^|\.)linkedin\.com$/, 'linkedin'],
    [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  ];
  return known.find(([pattern]) => pattern.test(host))?.[1] ?? host.slice(0, 40);
}
