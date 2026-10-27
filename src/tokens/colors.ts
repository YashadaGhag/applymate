/**
 * Design tokens pulled from Figma Design System file.
 *
 * Collections:
 *   Base   – primitive color ramps (Red, Blue, Green, Yellow, Orange, Neutral)
 *   Alias  – semantic surface / text / border tokens
 */

// ─── Base Collection: Primitive Color Ramps ─────────────────────────

export const primitiveColors = {
  red: {
    50:  "#F8E6E6",
    100: "#F1CCCC",
    200: "#E39999",
    300: "#D56666",
    400: "#C73333",
    500: "#B90000",
    600: "#940000",
    700: "#6F0000",
    800: "#4A0000",
    900: "#370000",
  },
  blue: {
    50:  "#EFF1FC",
    100: "#DDE2F8",
    200: "#BCC5F1",
    300: "#9AA7E9",
    400: "#798AE2",
    500: "#5065D3",
    600: "#4657AF",
    700: "#344183",
    800: "#232C58",
    900: "#1A2142",
  },
  green: {
    50:  "#E6F3EB",
    100: "#CCE7D6",
    200: "#99CFAD",
    300: "#66B783",
    400: "#339F5A",
    500: "#047C30",
    600: "#006C27",
    700: "#00511D",
    800: "#003614",
    900: "#00280F",
  },
  // Only the steps the "Interviewing" status chip uses (Figma Color/Purple 50 and 500).
  purple: {
    50:  "#F5E6F8",
    500: "#9B00B6",
  },
  yellow: {
    50:  "#FFF9E6",
    100: "#FFF3CC",
    200: "#FFE799",
    300: "#FFDB66",
    400: "#FFCF33",
    500: "#FFC300",
    600: "#CC9C00",
    700: "#997500",
    800: "#664E00",
    900: "#4C3A00",
  },
  orange: {
    50:  "#FFF6E6",
    100: "#FFEBCC",
    200: "#FFD899",
    300: "#FFC466",
    400: "#FFB133",
    500: "#FF9D00",
    600: "#CC7E00",
    700: "#995E00",
    800: "#663F00",
    900: "#4C2F00",
  },
  neutral: {
    white: "#FFFFFF",
    black: "#000000",
    25:  "#F7F7F8",
    50:  "#F0F1F3",
    100: "#E1E2E6",
    200: "#C3C5CD",
    300: "#A4A7B4",
    400: "#868A9B",
    500: "#686D82",
    600: "#535768",
    700: "#3E414E",
    800: "#2A2C34",
    900: "#1F2127",
  },
} as const;

// ─── Semantic names (backwards-compat with existing Tailwind config) ─

export const colors = {
  primary: primitiveColors.blue,
  neutral: primitiveColors.neutral,
  error:   primitiveColors.red,
  warning: primitiveColors.orange,
  success: primitiveColors.green,
} as const;

// ─── Alias Collection: Semantic Color Tokens ────────────────────────

export const semanticColors = {
  surface: {
    background: {
      default:   primitiveColors.neutral.white,
      subtle:    primitiveColors.neutral[50],
      blue:      primitiveColors.blue[50],
      error:     primitiveColors.red[50],
      success:   primitiveColors.green[50],
      warning:   primitiveColors.orange[50],
      disabled:  primitiveColors.neutral[100],
      secondaryText: primitiveColors.neutral[500],
      spotlight: primitiveColors.blue[500],
      // Figma Color/Surface/Background/Spotlight-background: black at 64%, e.g. Tooltip "dark"
      // (Variant2). Tailwind: bg-spotlight-background.
      spotlightBackground: "rgba(0, 0, 0, 0.64)",
      popUp:     primitiveColors.neutral.white,
    },
    card: {
      // Blue/25 and Neutral/25 — subtle card tints, distinct from the stronger
      // Background/Blue (primitiveColors.blue[50]) used for badges/pills.
      blue:    "#F6F7FD",
      neutral: primitiveColors.neutral[25],
    },
  },
  text: {
    body: {
      default: primitiveColors.neutral[800],
      white:   primitiveColors.neutral.white,
    },
    heading: {
      800:   primitiveColors.neutral[800],
      white: primitiveColors.neutral.white,
    },
    link: {
      default: primitiveColors.blue[500],
      hover:   primitiveColors.blue[600],
    },
    error: {
      dark:  primitiveColors.red[700],
      light: primitiveColors.red[300],
    },
    disabled: {
      100: primitiveColors.neutral[100],
      200: primitiveColors.neutral[200],
      300: primitiveColors.neutral[300],
    },
  },
  border: {
    error: {
      dark:  primitiveColors.red[500],
      light: primitiveColors.red[200],
    },
    success: {
      dark: primitiveColors.green[500],
    },
    disabled: {
      100: primitiveColors.neutral[100],
      300: primitiveColors.neutral[300],
      // Figma Color/Borders/Disabled/Light → Neutral/50 (#F0F1F3, updated from Neutral/25
      // 2026-10-15). Tailwind: border-neutral-50.
      light: primitiveColors.neutral[50],
    },
  },
} as const;
