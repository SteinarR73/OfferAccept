// The oa_locale cookie is set by middleware.ts; client components read it here.
export type Locale = 'en' | 'no';

export function readClientLocale(): Locale {
  if (typeof document === 'undefined') return 'en';
  try {
    const m = document.cookie.match(/oa_locale=([^;]+)/);
    return m?.[1] === 'no' ? 'no' : 'en';
  } catch {
    // document.cookie throws in sandboxed / opaque-origin iframes.
    return 'en';
  }
}
