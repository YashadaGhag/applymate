/**
 * Responsive Spacing tokens from Figma Alias collection — Responsive Spacing group.
 *
 * 5 breakpoint modes: Desktop-XL, Desktop-L, Desktop, Tablet, Mobile
 */

export const breakpoints = [
  "Desktop-XL",
  "Desktop-L",
  "Desktop",
  "Tablet",
  "Mobile",
] as const;

export type Breakpoint = (typeof breakpoints)[number];

export type ResponsiveValue = Record<Breakpoint, string>;

export const responsiveSpacing = {
  "Section/Horizontal": {
    "Desktop-XL": "sp200",
    "Desktop-L":  "sp80",
    "Desktop":    "sp40",
    "Tablet":     "sp40",
    "Mobile":     "sp16",
  },
  "Section/Vertical": {
    "Desktop-XL": "sp100",
    "Desktop-L":  "sp100",
    "Desktop":    "sp100",
    "Tablet":     "sp64",
    "Mobile":     "sp40",
  },
  "Content/Gap": {
    "Desktop-XL": "sp32",
    "Desktop-L":  "sp32",
    "Desktop":    "sp24",
    "Tablet":     "sp16",
    "Mobile":     "sp16",
  },
} as const satisfies Record<string, ResponsiveValue>;

export const responsiveSpacingPx = {
  "Section/Horizontal": {
    "Desktop-XL": 200,
    "Desktop-L":  80,
    "Desktop":    40,
    "Tablet":     40,
    "Mobile":     16,
  },
  "Section/Vertical": {
    "Desktop-XL": 100,
    "Desktop-L":  100,
    "Desktop":    100,
    "Tablet":     64,
    "Mobile":     40,
  },
  "Content/Gap": {
    "Desktop-XL": 32,
    "Desktop-L":  32,
    "Desktop":    24,
    "Tablet":     16,
    "Mobile":     16,
  },
} as const;
