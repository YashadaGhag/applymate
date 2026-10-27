import React from "react";
import { RectangleHorizontal, Circle } from "lucide-react";
import { borderRadius, borderWidth, shadows } from "../../src/tokens/borders";

export default {
  title: "Design Tokens/Borders & Radii",
  parameters: { layout: "padded" },
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 20,
        fontWeight: 600,
        margin: "40px 0 12px",
        paddingBottom: 8,
        borderBottom: "2px solid #E1E2E6",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {children}
    </h2>
  );
}

export const BordersAndRadii = () => (
  <div style={{ fontFamily: "Inter, sans-serif", maxWidth: 800 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <RectangleHorizontal size={28} color="#576DDB" />
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Borders & Radii</h1>
    </div>
    <p style={{ color: "#686D82", margin: "0 0 8px", fontSize: 14 }}>
      Border width, border radius, and shadow tokens from the Figma Alias collection.
    </p>

    {/* ── Border Radius ── */}
    <SectionTitle>Border Radius</SectionTitle>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 16 }}>
      {Object.entries(borderRadius).map(([name, value]) => (
        <div
          key={name}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              background: "#576DDB",
              borderRadius: value,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Circle size={16} color="white" />
          </div>
          <code style={{ fontSize: 14, fontWeight: 600 }}>{name}</code>
          <span style={{ fontSize: 12, color: "#868A9B" }}>{value}</span>
        </div>
      ))}
    </div>

    {/* ── Border Width ── */}
    <SectionTitle>Border Width</SectionTitle>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
      {Object.entries(borderWidth).map(([name, value]) => (
        <div
          key={name}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 120,
              height: 64,
              background: "#FFFFFF",
              border: `${value} solid #576DDB`,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              color: "#868A9B",
            }}
          >
            {value === "0px" ? "no border" : value}
          </div>
          <code style={{ fontSize: 14, fontWeight: 600 }}>{name}</code>
          <span style={{ fontSize: 12, color: "#868A9B" }}>{value}</span>
        </div>
      ))}
    </div>

    {/* ── Shadows ── */}
    <SectionTitle>Box Shadows</SectionTitle>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 24 }}>
      {Object.entries(shadows).map(([name, value]) => (
        <div key={name} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              width: "100%",
              height: 100,
              background: name === "spotlight" ? "#576DDB" : "#FFFFFF",
              borderRadius: 12,
              boxShadow: value,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 500,
              color: name === "spotlight" ? "#FFFFFF" : "#2A2C34",
            }}
          >
            {name}
          </div>
          <code style={{ fontSize: 14, fontWeight: 600 }}>{name}</code>
          <span
            style={{
              fontSize: 11,
              color: "#868A9B",
              wordBreak: "break-all",
              lineHeight: "16px",
            }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>

    {/* ── Reference Table ── */}
    <SectionTitle>Reference Table</SectionTitle>
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 14,
      }}
    >
      <thead>
        <tr style={{ borderBottom: "2px solid #E1E2E6", textAlign: "left" }}>
          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Category</th>
          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Token</th>
          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Value</th>
          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Tailwind Class</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(borderRadius).map(([name, value]) => (
          <tr key={`r-${name}`} style={{ borderBottom: "1px solid #E1E2E6" }}>
            <td style={{ padding: "8px 12px", color: "#868A9B" }}>Radius</td>
            <td style={{ padding: "8px 12px" }}>
              <code style={{ fontWeight: 600 }}>{name}</code>
            </td>
            <td style={{ padding: "8px 12px", color: "#686D82" }}>{value}</td>
            <td style={{ padding: "8px 12px" }}>
              <code style={{ background: "#EFF1FC", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                rounded-{name === "none" ? "none" : name}
              </code>
            </td>
          </tr>
        ))}
        {Object.entries(borderWidth).map(([name, value]) => (
          <tr key={`b-${name}`} style={{ borderBottom: "1px solid #E1E2E6" }}>
            <td style={{ padding: "8px 12px", color: "#868A9B" }}>Width</td>
            <td style={{ padding: "8px 12px" }}>
              <code style={{ fontWeight: 600 }}>{name}</code>
            </td>
            <td style={{ padding: "8px 12px", color: "#686D82" }}>{value}</td>
            <td style={{ padding: "8px 12px" }}>
              <code style={{ background: "#EFF1FC", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                border-{name}
              </code>
            </td>
          </tr>
        ))}
        {Object.entries(shadows).map(([name]) => (
          <tr key={`s-${name}`} style={{ borderBottom: "1px solid #E1E2E6" }}>
            <td style={{ padding: "8px 12px", color: "#868A9B" }}>Shadow</td>
            <td style={{ padding: "8px 12px" }}>
              <code style={{ fontWeight: 600 }}>{name}</code>
            </td>
            <td style={{ padding: "8px 12px", color: "#686D82" }}>—</td>
            <td style={{ padding: "8px 12px" }}>
              <code style={{ background: "#EFF1FC", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                shadow-{name}
              </code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
BordersAndRadii.storyName = "Borders & Radii";
