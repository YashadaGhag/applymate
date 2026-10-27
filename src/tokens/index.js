export const colors = {
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
};

export const typography = {
  fontFamily: {
    sans: "Inter, sans-serif",
  },
  fontSize: {
    "body-small":              { size: "12px", lineHeight: "16px" },
    "paragraph-headers-small": { size: "12px", lineHeight: "20px" },
    "body-medium":             { size: "14px", lineHeight: "20px" },
    "body-large":              { size: "16px", lineHeight: "24px" },
    h5:                        { size: "20px", lineHeight: "20px" },
    h4:                        { size: "24px", lineHeight: "24px" },
    h3:                        { size: "32px", lineHeight: "32px" },
    h2:                        { size: "48px", lineHeight: "48px" },
    h1:                        { size: "64px", lineHeight: "64px" },
  },
  fontWeight: {
    regular:  "400",
    medium:   "500",
    semibold: "600",
    bold:     "700",
  },
};

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
};

export const maxWidth = {
  content: "1200px",
};

export const borderRadius = {
  none: "0px",
  xs:   "4px",
  s:    "8px",
  m:    "12px",
  l:    "100px",
};

export const borderWidth = {
  none: "0px",
  br1:  "1px",
  br2:  "2px",
  br4:  "4px",
};

export const shadows = {
  card:      "0px 1px 2px 0px rgba(19,0,73,0.03), 0px 1px 5px 0px rgba(19,0,73,0.15)",
  button:    "0px 2px 4px 0px rgba(0,0,0,0.04), 0px 8px 32px -8px rgba(19,0,73,0.12)",
  spotlight: "0px 0px 16px 8px rgba(80,101,211,0.48)",
};

export const tokens = {
  colors,
  typography,
  spacing,
  maxWidth,
  borderRadius,
  borderWidth,
  shadows,
};

export default tokens;
