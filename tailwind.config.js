/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./shared/**/*.{js,ts,jsx,tsx}",
    "./stories/**/*.{js,ts,jsx,tsx}",
    "./.storybook/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ─── Colors ───────────────────────────────────────────────────
      colors: {
        primary: {
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
        neutral: {
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
        error: {
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
        warning: {
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
        success: {
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
        // Figma Color/Purple, only the two steps the "Interviewing" status chip uses (the rest of
        // the ramp isn't pulled yet).
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
        card: {
          blue:    "#F6F7FD",
          neutral: "#F7F7F8",
        },
        // Figma Color/Surface/Background/Spotlight-background (black at 64%): Tooltip "dark".
        "spotlight-background": "rgba(0, 0, 0, 0.64)",
      },

      // ─── Typography ───────────────────────────────────────────────
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        // The resume document's default font (Customize Application). The editor's font choices
        // (src/components/ResumeEditor/fonts.js) are inline styles on top of it.
        document: ["Inter", "sans-serif"],
        // The editor's other font choices, so the font menu can show each in its own typeface.
        merriweather: ["Merriweather", "serif"],
        lato: ["Lato", "sans-serif"],
        roboto: ["Roboto", "sans-serif"],
      },
      fontSize: {
        "body-small":               ["12px", { lineHeight: "16px" }],
        "paragraph-headers-small":  ["12px", { lineHeight: "20px" }],
        "body-medium":              ["14px", { lineHeight: "20px" }],
        "body-large":               ["16px", { lineHeight: "24px" }],
        h5:                         ["20px", { lineHeight: "20px" }],
        h4:                         ["24px", { lineHeight: "24px" }],
        // The resume document, in print units: body 10pt, name 20pt. Fixed, unlike the responsive
        // h1-h3, so the screen, the editor and the printed PDF match.
        "document-body":            ["10pt", { lineHeight: "14pt" }],
        "document-name":            ["20pt", { lineHeight: "26pt" }],
       'h3': ['var(--font-h3)', { lineHeight: 'var(--leading-h3)' }],
        'h2': ['var(--font-h2)', { lineHeight: 'var(--leading-h2)' }],
        'h1': ['var(--font-h1)', { lineHeight: 'var(--leading-h1)' }],
      },
      fontWeight: {
        regular:  "400",
        medium:   "500",
        semibold: "600",
        bold:     "700",
      },

      // ─── Spacing ──────────────────────────────────────────────────
      spacing: {
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
        // US Letter page margin, on screen and in print (@page in src/index.css)
        "page-margin": "0.5in",
      },

      // ─── Max Width ────────────────────────────────────────────────
      // content: page content beside the main nav (see MainLayout)
      maxWidth: {
        content: "1200px",
        // field: a form field's max width (Figma textarea on Change Preferences, 600px)
        field: "600px",
      },

      // ─── Width ────────────────────────────────────────────────────
      // side-panel: Customize Application's right column (Tailored for, What changed, Gap)
      width: {
        "side-panel": "250px",
        // MainNav's icon-only rail between md and lg (Figma "Collapsed navbar")
        "nav-rail": "76px",
        // US Letter: the sheet, and its content width inside the 0.5in margins (= printed width)
        page: "8.5in",
        "page-content": "7.5in",
      },

      // ─── Height ───────────────────────────────────────────────────
      height: {
        page: "11in",
        // Landing "How it works" screenshots (Figma 2466:17726)
        "landing-shot": "280px",
      },

      // ─── Motion ───────────────────────────────────────────────────
      // Resume Assistant (Figma 2005:5743 motion): the glow behind the AI icon pulses 0.45 ↔ 1
      // opacity, ease-in-out, 2s a cycle; the icon itself breathes slightly on the same beat; the
      // in-progress step's bullet pulses too. fade-in eases each state change in. Always pair with
      // motion-reduce:animate-none.
      keyframes: {
        "soft-pulse": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.06)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "soft-pulse": "soft-pulse 2s ease-in-out infinite",
        breathe: "breathe 2s ease-in-out infinite",
        "fade-in": "fade-in 400ms ease-in-out both",
      },

      // ─── Border Radius ────────────────────────────────────────────
      borderRadius: {
        none: "0px",
        xs: "4px",
        sm: "8px",
        md: "12px",
        xl: "16px",
        lg: "100px",
      },

      // ─── Border Width ─────────────────────────────────────────────
      borderWidth: {
        none: "0px",
        br1:  "1px",
        br2:  "2px",
        br4:  "4px",
      },

      // ─── Shadows ──────────────────────────────────────────────────
      boxShadow: {
        card:      "0px 1px 2px 0px rgba(19,0,73,0.03), 0px 1px 5px 0px rgba(19,0,73,0.15)",
        button:    "0px 2px 4px 0px rgba(0,0,0,0.04), 0px 8px 32px -8px rgba(19,0,73,0.12)",
        spotlight: "0px 0px 16px 8px rgba(80,101,211,0.48)",
      },
    },
  },
  plugins: [],
};
