/**
 * Border tokens from Figma Design System – Alias collection.
 *
 *   Sizes/Radius – corner radius
 *   Sizes/Border – stroke width
 */

export const borderRadius = {
  none: "0px",
  xs:   "4px",
  s:    "8px",
  m:    "12px",
  l:    "100px",
} as const;

export const borderWidth = {
  none: "0px",
  br1:  "1px",
  br2:  "2px",
  br4:  "4px",
} as const;

export const shadows = {
  card:      "0px 1px 2px 0px rgba(19,0,73,0.03), 0px 1px 5px 0px rgba(19,0,73,0.15)",
  button:    "0px 2px 4px 0px rgba(0,0,0,0.04), 0px 8px 32px -8px rgba(19,0,73,0.12)",
  spotlight: "0px 0px 16px 8px rgba(87,109,219,0.48)",
} as const;
