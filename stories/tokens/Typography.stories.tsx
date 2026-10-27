import React from "react";
import { Type } from "lucide-react";
import {
  fontFamily,
  fontWeight,
  fontSize,
  responsiveTypography,
  typographyBreakpoints,
} from "../../src/tokens/typography";

export default {
  title: "Design Tokens/Typography",
  parameters: { layout: "padded" },
};

function TypeSample({
  label,
  size,
  lineHeight,
  weight,
  sample,
}: {
  label: string;
  size: string;
  lineHeight: string;
  weight: string;
  sample?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        alignItems: "baseline",
        padding: "20px 0",
        borderBottom: "1px solid #E1E2E6",
        fontFamily: fontFamily.body,
      }}
    >
      <div style={{ width: 140, flexShrink: 0 }}>
        <code style={{ fontSize: 14, fontWeight: 600, color: "#2A2C34" }}>{label}</code>
        <div style={{ fontSize: 12, color: "#868A9B", marginTop: 4 }}>
          {size} / {lineHeight}
          <br />
          weight: {weight}
        </div>
      </div>

      <div
        style={{
          fontSize: size,
          lineHeight: lineHeight,
          fontWeight: Number(weight),
          color: "#2A2C34",
          flex: 1,
        }}
      >
        {sample || "The quick brown fox jumps over the lazy dog"}
      </div>
    </div>
  );
}

export const TypeRamp = () => (
  <div style={{ fontFamily: fontFamily.body, maxWidth: 900 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <Type size={28} color="#576DDB" />
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Typography Tokens</h1>
    </div>
    <p style={{ color: "#686D82", margin: "0 0 8px", fontSize: 14 }}>
      Type ramp from Figma Typography collection. Font family:{" "}
      <code style={{ background: "#EFF1FC", padding: "2px 6px", borderRadius: 4 }}>
        {fontFamily.body}
      </code>
    </p>

    <h2
      style={{
        fontSize: 20,
        fontWeight: 600,
        margin: "32px 0 0",
        paddingBottom: 8,
        borderBottom: "2px solid #E1E2E6",
      }}
    >
      Headings
    </h2>

    {Object.entries(fontSize.heading).map(([key, val]) => (
      <TypeSample
        key={key}
        label={key}
        size={val.size}
        lineHeight={val.lineHeight}
        weight={val.weight}
      />
    ))}

    <h2
      style={{
        fontSize: 20,
        fontWeight: 600,
        margin: "40px 0 0",
        paddingBottom: 8,
        borderBottom: "2px solid #E1E2E6",
      }}
    >
      Body
    </h2>

    {Object.entries(fontSize.body).map(([key, val]) => (
      <TypeSample
        key={key}
        label={`body-${key}`}
        size={val.size}
        lineHeight={val.lineHeight}
        weight={val.weight}
        sample="Body text demonstrates the reading experience for longer passages of content in the interface."
      />
    ))}

    <TypeSample
      label="paragraph-headers-small"
      size={fontSize.paragraphHeadersSmall.size}
      lineHeight={fontSize.paragraphHeadersSmall.lineHeight}
      weight={fontSize.paragraphHeadersSmall.weight}
      sample="PARAGRAPH HEADER SMALL"
    />

    <h2
      style={{
        fontSize: 20,
        fontWeight: 600,
        margin: "40px 0 12px",
        paddingBottom: 8,
        borderBottom: "2px solid #E1E2E6",
      }}
    >
      Font Weights
    </h2>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
      {Object.entries(fontWeight).map(([name, value]) => (
        <div
          key={name}
          style={{
            background: "#F0F1F3",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: Number(value), marginBottom: 8, color: "#2A2C34" }}>
            Aa
          </div>
          <code style={{ fontSize: 13, fontWeight: 600, display: "block" }}>{name}</code>
          <span style={{ fontSize: 12, color: "#868A9B" }}>{value}</span>
        </div>
      ))}
    </div>

    <h2
      style={{
        fontSize: 20,
        fontWeight: 600,
        margin: "40px 0 12px",
        paddingBottom: 8,
        borderBottom: "2px solid #E1E2E6",
      }}
    >
      Responsive Reference Table
    </h2>
    <div
      style={{
        background: "#EFF1FC",
        border: "1px solid #BCC5F1",
        borderRadius: 8,
        padding: "12px 16px",
        margin: "0 0 16px",
        fontSize: 13,
        color: "#344183",
        lineHeight: 1.5,
      }}
    >
      <strong>Note:</strong> h1–h3 are responsive tokens — values change automatically at
      breakpoints via CSS custom properties defined in <code style={{ background: "#DDE2F8", padding: "1px 4px", borderRadius: 3 }}>index.css</code>. No Tailwind
      prefix needed; the browser applies the correct size at each viewport width.
    </div>
    <p style={{ color: "#686D82", margin: "0 0 16px", fontSize: 14 }}>
      Font sizes across all 5 breakpoint modes from the Figma Typography collection.
    </p>

    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 14,
          minWidth: 700,
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #E1E2E6", textAlign: "left" }}>
            <th style={{ padding: "8px 12px", fontWeight: 600 }}>Token</th>
            <th style={{ padding: "8px 12px", fontWeight: 600 }}>Weight</th>
            <th style={{ padding: "8px 12px", fontWeight: 600 }}>Tailwind Class</th>
            {typographyBreakpoints.map((bp) => (
              <th key={bp} style={{ padding: "8px 12px", fontWeight: 600, textAlign: "center" }}>
                {bp}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(responsiveTypography).map(([token, sizes]) => {
            const isHeading = token.startsWith("h");
            const weight = isHeading
              ? (token === "h1" || token === "h2" ? fontWeight.bold : fontWeight.semibold)
              : fontWeight.regular;
            const weightLabel = isHeading
              ? (token === "h1" || token === "h2" ? "bold (700)" : "semibold (600)")
              : "regular (400)";
            const tailwindClass = `text-${token}`;

            return (
              <tr key={token} style={{ borderBottom: "1px solid #E1E2E6" }}>
                <td style={{ padding: "8px 12px" }}>
                  <code style={{ fontWeight: 600 }}>{token}</code>
                </td>
                <td style={{ padding: "8px 12px", color: "#686D82" }}>{weightLabel}</td>
                <td style={{ padding: "8px 12px" }}>
                  <code
                    style={{
                      background: "#EFF1FC",
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    {tailwindClass}
                  </code>
                </td>
                {typographyBreakpoints.map((bp) => {
                  const val = sizes[bp];
                  const isChanged =
                    val !== sizes["Desktop-XL"];
                  return (
                    <td
                      key={bp}
                      style={{
                        padding: "8px 12px",
                        textAlign: "center",
                        color: isChanged ? "#576DDB" : "#686D82",
                        fontWeight: isChanged ? 600 : 400,
                      }}
                    >
                      {val}px
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);
TypeRamp.storyName = "Type Ramp";
