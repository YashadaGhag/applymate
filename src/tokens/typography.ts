/**
 * Typography tokens from Figma Design System.
 *
 * Collections:
 *   Base       – font family, font weight (string variables)
 *   Typography – font size, line height, paragraph spacing (float variables)
 *
 * Responsive sizes from Figma Typography collection (5 modes):
 *   Desktop-XL, Desktop-L, Desktop, Tablet, Mobile
 */

export const fontFamily = {
  body:    "Inter, sans-serif",
  heading: "Inter, sans-serif",
} as const;

export const fontWeight = {
  regular:  "400",
  medium:   "500",
  semibold: "600",
  bold:     "700",
} as const;

export const fontSize = {
  heading: {
    h1: { size: "64px", lineHeight: "64px", weight: fontWeight.bold },
    h2: { size: "48px", lineHeight: "48px", weight: fontWeight.bold },
    h3: { size: "32px", lineHeight: "32px", weight: fontWeight.semibold },
    h4: { size: "24px", lineHeight: "24px", weight: fontWeight.semibold },
    h5: { size: "20px", lineHeight: "20px", weight: fontWeight.semibold },
  },
  body: {
    large:  { size: "16px", lineHeight: "24px", weight: fontWeight.regular },
    medium: { size: "14px", lineHeight: "20px", weight: fontWeight.regular },
    small:  { size: "12px", lineHeight: "16px", weight: fontWeight.regular },
  },
  paragraphHeadersSmall: {
    size: "12px",
    lineHeight: "20px",
    weight: fontWeight.semibold,
  },
} as const;

export const typographyBreakpoints = [
  "Desktop-XL",
  "Desktop-L",
  "Desktop",
  "Tablet",
  "Mobile",
] as const;

export const responsiveTypography = {
  h1: { "Desktop-XL": 64, "Desktop-L": 64, "Desktop": 64, "Tablet": 48, "Mobile": 40 },
  h2: { "Desktop-XL": 48, "Desktop-L": 48, "Desktop": 48, "Tablet": 32, "Mobile": 32 },
  h3: { "Desktop-XL": 32, "Desktop-L": 32, "Desktop": 32, "Tablet": 28, "Mobile": 28 },
  h4: { "Desktop-XL": 24, "Desktop-L": 24, "Desktop": 24, "Tablet": 24, "Mobile": 24 },
  h5: { "Desktop-XL": 20, "Desktop-L": 20, "Desktop": 20, "Tablet": 20, "Mobile": 20 },
  "body-large":  { "Desktop-XL": 16, "Desktop-L": 16, "Desktop": 16, "Tablet": 16, "Mobile": 16 },
  "body-medium": { "Desktop-XL": 14, "Desktop-L": 14, "Desktop": 14, "Tablet": 14, "Mobile": 14 },
  "body-small":  { "Desktop-XL": 12, "Desktop-L": 12, "Desktop": 12, "Tablet": 12, "Mobile": 12 },
} as const;

export const typography = {
  fontFamily,
  fontWeight,
  fontSize,
  responsiveTypography,
  typographyBreakpoints,
} as const;
