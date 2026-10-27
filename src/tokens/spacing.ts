/**
 * Spacing tokens from Figma Design System – Alias collection (Sizes/Spacing).
 */

export const spacing = {
  none:  "0px",
  sp4:   "4px",
  sp8:   "8px",
  sp12:  "12px",
  sp16:  "16px",
  sp24:  "24px",
  sp32:  "32px",
  sp40:  "40px",
  sp64:  "64px",
  sp80:  "80px",
  sp100: "100px",
  sp200: "200px",
} as const;

/** Max width of page content beside the main nav (Tailwind: `max-w-content`). */
export const maxWidth = {
  content: "1200px",
} as const;

export const spacingPx: Record<keyof typeof spacing, number> = {
  none:  0,
  sp4:   4,
  sp8:   8,
  sp12:  12,
  sp16:  16,
  sp24:  24,
  sp32:  32,
  sp40:  40,
  sp64:  64,
  sp80:  80,
  sp100: 100,
  sp200: 200,
};
