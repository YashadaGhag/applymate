import React from "react";
import { Copy } from "lucide-react";
import { primitiveColors, semanticColors } from "../../src/tokens/colors";

export default {
  title: "Design Tokens/Colors",
  parameters: { layout: "padded" },
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function contrastColor(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#000000" : "#FFFFFF";
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  const fg = contrastColor(hex);
  return (
    <button
      onClick={() => copyToClipboard(hex)}
      style={{
        background: hex,
        color: fg,
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 8,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        cursor: "pointer",
        minWidth: 140,
        fontFamily: "Inter, sans-serif",
        fontSize: 13,
        transition: "box-shadow 0.15s",
      }}
      title={`Click to copy ${hex}`}
    >
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.8 }}>
        {hex}
        <Copy size={12} />
      </span>
    </button>
  );
}

function ColorRamp({ family, shades }: { family: string; shades: Record<string, string> }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, textTransform: "capitalize" }}>
        {family}
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
        {Object.entries(shades).map(([shade, hex]) => (
          <Swatch key={shade} name={`${shade}`} hex={hex} />
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 24,
        fontWeight: 700,
        margin: "40px 0 8px",
        paddingBottom: 8,
        borderBottom: "2px solid #E1E2E6",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {children}
    </h2>
  );
}

function SemanticGroup({
  title,
  tokens,
}: {
  title: string;
  tokens: Record<string, string | Record<string, string>>;
}) {
  const flat: { name: string; hex: string }[] = [];

  function flatten(obj: Record<string, unknown>, prefix: string) {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}/${key}` : key;
      if (typeof value === "string") {
        flat.push({ name: path, hex: value });
      } else if (typeof value === "object" && value !== null) {
        flatten(value as Record<string, unknown>, path);
      }
    }
  }

  flatten(tokens, "");

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
        {flat.map(({ name, hex }) => (
          <Swatch key={name} name={name} hex={hex} />
        ))}
      </div>
    </div>
  );
}

export const PrimitiveColors = () => (
  <div style={{ fontFamily: "Inter, sans-serif" }}>
    <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 4px" }}>Color Tokens</h1>
    <p style={{ color: "#686D82", margin: "0 0 16px", fontSize: 14 }}>
      Primitive color ramps from Figma Base collection. Click any swatch to copy its hex value.
    </p>

    <SectionTitle>Primitive Colors (Base Collection)</SectionTitle>

    {Object.entries(primitiveColors).map(([family, shades]) => (
      <ColorRamp key={family} family={family} shades={shades as Record<string, string>} />
    ))}
  </div>
);
PrimitiveColors.storyName = "Primitive Colors";

export const SemanticTokens = () => (
  <div style={{ fontFamily: "Inter, sans-serif" }}>
    <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 4px" }}>Semantic Color Tokens</h1>
    <p style={{ color: "#686D82", margin: "0 0 16px", fontSize: 14 }}>
      Alias collection tokens that reference primitive colors. These are the tokens components
      should use for surfaces, text, and borders.
    </p>

    <SectionTitle>Surface / Background</SectionTitle>
    <SemanticGroup title="Background" tokens={semanticColors.surface.background} />

    <SectionTitle>Text</SectionTitle>
    <SemanticGroup title="Body" tokens={semanticColors.text.body} />
    <SemanticGroup title="Heading" tokens={semanticColors.text.heading} />
    <SemanticGroup title="Link" tokens={semanticColors.text.link} />
    <SemanticGroup title="Error" tokens={semanticColors.text.error} />
    <SemanticGroup title="Disabled" tokens={semanticColors.text.disabled} />

    <SectionTitle>Border</SectionTitle>
    <SemanticGroup title="Error" tokens={semanticColors.border.error} />
    <SemanticGroup title="Success" tokens={semanticColors.border.success} />
    <SemanticGroup title="Disabled" tokens={semanticColors.border.disabled} />
  </div>
);
SemanticTokens.storyName = "Semantic Colors";
