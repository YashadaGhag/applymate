/**
 * Builds a Logo.dev image URL for a company domain at render time.
 * Never store or persist the resulting image — Logo.dev's free tier only
 * licenses short-term browser caching, not self-hosting.
 */
export function getLogoUrl(domain) {
  if (!domain) return null;
  const token = import.meta.env.VITE_LOGO_DEV_PUBLISHABLE_KEY;
  if (!token) return null;
  return `https://img.logo.dev/${domain}?token=${token}&size=80&retina=true`;
}
