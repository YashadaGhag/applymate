import React from "react";
import { MoveHorizontal } from "lucide-react";
import {
  responsiveSpacing,
  responsiveSpacingPx,
  breakpoints,
} from "../../src/tokens/responsive-spacing";
import { spacing } from "../../src/tokens/spacing";

export default {
  title: "Design Tokens/Responsive Spacing",
  parameters: { layout: "padded" },
};

const COLORS: Record<string, string> = {
  "Section/Horizontal": "#576DDB",
  "Section/Vertical":   "#339F5A",
  "Content/Gap":        "#FF9D00",
};

export const ResponsiveSpacingTable = () => (
  <div style={{ fontFamily: "Inter, sans-serif", maxWidth: 1000 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <MoveHorizontal size={28} color="#576DDB" />
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Responsive Spacing Tokens</h1>
    </div>
    <p style={{ color: "#686D82", margin: "0 0 24px", fontSize: 14 }}>
      Spacing values that adapt across 5 breakpoint modes from the Figma Alias collection —
      Responsive Spacing group.
    </p>

    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 14,
          minWidth: 600,
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #E1E2E6", textAlign: "left" }}>
            <th style={{ padding: "8px 12px", fontWeight: 600 }}>Token</th>
            {breakpoints.map((bp) => (
              <th key={bp} style={{ padding: "8px 12px", fontWeight: 600, textAlign: "center" }}>
                {bp}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(Object.keys(responsiveSpacing) as Array<keyof typeof responsiveSpacing>).map(
            (token) => (
              <tr key={token} style={{ borderBottom: "1px solid #E1E2E6" }}>
                <td style={{ padding: "8px 12px" }}>
                  <code style={{ fontWeight: 600 }}>{token}</code>
                </td>
                {breakpoints.map((bp) => {
                  const spacingToken = responsiveSpacing[token][bp];
                  const px = responsiveSpacingPx[token][bp];
                  return (
                    <td
                      key={bp}
                      style={{
                        padding: "8px 12px",
                        textAlign: "center",
                      }}
                    >
                      <code
                        style={{
                          background: "#EFF1FC",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        {spacingToken}
                      </code>
                      <div style={{ fontSize: 12, color: "#868A9B", marginTop: 2 }}>
                        {px}px
                      </div>
                    </td>
                  );
                })}
              </tr>
            )
          )}
        </tbody>
      </table>
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
      Visual Scale
    </h2>

    {(Object.keys(responsiveSpacingPx) as Array<keyof typeof responsiveSpacingPx>).map(
      (token) => (
        <div key={token} style={{ marginBottom: 32 }}>
          <code
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#2A2C34",
              display: "block",
              marginBottom: 8,
            }}
          >
            {token}
          </code>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {breakpoints.map((bp) => {
              const px = responsiveSpacingPx[token][bp];
              return (
                <div key={bp} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      width: 90,
                      fontSize: 12,
                      color: "#686D82",
                      textAlign: "right",
                      flexShrink: 0,
                    }}
                  >
                    {bp}
                  </span>
                  <div
                    style={{
                      width: px,
                      height: 24,
                      backgroundColor: COLORS[token] || "#576DDB",
                      borderRadius: 4,
                      transition: "width 0.2s",
                      minWidth: 2,
                    }}
                  />
                  <span style={{ fontSize: 12, color: "#868A9B" }}>{px}px</span>
                </div>
              );
            })}
          </div>
        </div>
      )
    )}
  </div>
);
ResponsiveSpacingTable.storyName = "Responsive Spacing";
