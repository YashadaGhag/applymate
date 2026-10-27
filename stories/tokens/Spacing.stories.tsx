import React from "react";
import { Ruler } from "lucide-react";
import { spacing, spacingPx } from "../../src/tokens/spacing";

export default {
  title: "Design Tokens/Spacing",
  parameters: { layout: "padded" },
};

function SpacingBlock({ name, value }: { name: string; value: string }) {
  const px = parseInt(value, 10);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "8px 0",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <code
        style={{
          width: 80,
          fontSize: 13,
          fontWeight: 600,
          color: "#2A2C34",
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {name}
      </code>

      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: px,
            height: 32,
            backgroundColor: "#576DDB",
            borderRadius: 4,
            minWidth: px === 0 ? 2 : undefined,
            opacity: px === 0 ? 0.3 : 1,
            transition: "width 0.2s",
          }}
        />
        <span style={{ fontSize: 13, color: "#686D82", whiteSpace: "nowrap" }}>{value}</span>
      </div>
    </div>
  );
}

export const SpacingScale = () => (
  <div style={{ fontFamily: "Inter, sans-serif", maxWidth: 700 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <Ruler size={28} color="#576DDB" />
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Spacing Tokens</h1>
    </div>
    <p style={{ color: "#686D82", margin: "0 0 24px", fontSize: 14 }}>
      Spacing scale from Figma Alias collection (Sizes/Spacing). Used for padding, margin, and gap values.
    </p>

    <div
      style={{
        background: "#F0F1F3",
        borderRadius: 12,
        padding: "16px 24px",
      }}
    >
      {Object.entries(spacing).map(([name, value]) => (
        <SpacingBlock key={name} name={name} value={value} />
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
      Reference Table
    </h2>

    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 14,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <thead>
        <tr style={{ borderBottom: "2px solid #E1E2E6", textAlign: "left" }}>
          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Token</th>
          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Value</th>
          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Pixels</th>
          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Tailwind Class</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(spacingPx).map(([name, px]) => (
          <tr key={name} style={{ borderBottom: "1px solid #E1E2E6" }}>
            <td style={{ padding: "8px 12px" }}>
              <code style={{ fontWeight: 600 }}>{name}</code>
            </td>
            <td style={{ padding: "8px 12px", color: "#686D82" }}>{spacing[name as keyof typeof spacing]}</td>
            <td style={{ padding: "8px 12px", color: "#686D82" }}>{px}px</td>
            <td style={{ padding: "8px 12px" }}>
              <code style={{ background: "#EFF1FC", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                p-{name}
              </code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
SpacingScale.storyName = "Spacing Scale";
