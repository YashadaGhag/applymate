import Icon from "./Icon";
import { iconNames } from "./paths";

// ─── Meta ─────────────────────────────────────────────────────────────────────

export default {
  title: "Design System/Icon",
  component: Icon,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "24 × 24 SVG icons from the design system icon set. Pass `name` to select an icon, `size` to scale it, and a Tailwind colour class via `className` to tint it. Omit `aria-label` for decorative icons (sets `aria-hidden` automatically).",
      },
    },
  },
  argTypes: {
    name: {
      control: "select",
      options: iconNames,
      description: "Icon name (kebab-case)",
    },
    size: {
      control: { type: "number", min: 12, max: 64, step: 4 },
      description: "Width and height in pixels",
      table: { defaultValue: { summary: 24 } },
    },
    className: {
      control: "text",
      description: "Tailwind classes for colour, etc.",
    },
    "aria-label": {
      control: "text",
      description: "Accessible label (omit for decorative icons)",
    },
  },
  args: {
    name: "star",
    size: 24,
  },
};

// ─── Playground ───────────────────────────────────────────────────────────────

export const Playground = {};

// ─── Sizes ────────────────────────────────────────────────────────────────────

export const Sizes = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex items-end gap-sp24 p-sp24 bg-white rounded-m">
      {[12, 16, 18, 20, 24, 32, 40, 48].map((s) => (
        <div key={s} className="flex flex-col items-center gap-sp8">
          <Icon name="star" size={s} className="text-primary-500" />
          <span className="text-body-small text-neutral-500">{s}px</span>
        </div>
      ))}
    </div>
  ),
};

// ─── Colours ──────────────────────────────────────────────────────────────────

export const Colours = {
  parameters: { layout: "padded" },
  render: () => (
    <div className="flex items-center gap-sp24 p-sp24 bg-white rounded-m">
      {[
        { cls: "text-primary-500", label: "primary-500" },
        { cls: "text-neutral-700", label: "neutral-700" },
        { cls: "text-success-500", label: "success-500" },
        { cls: "text-error-500",   label: "error-500"   },
        { cls: "text-warning-500", label: "warning-500" },
      ].map(({ cls, label }) => (
        <div key={label} className="flex flex-col items-center gap-sp8">
          <Icon name="star" size={24} className={cls} />
          <span className="text-body-small text-neutral-500">{label}</span>
        </div>
      ))}
    </div>
  ),
};

// ─── All Icons grid ───────────────────────────────────────────────────────────

export const AllIcons = {
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "Every icon in the set. Hover to see the name you pass to `name`.",
      },
    },
  },
  render: () => (
    <div className="p-sp24 bg-white rounded-m">
      <div className="grid gap-sp8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
        {iconNames.map((name) => (
          <div
            key={name}
            title={name}
            className="flex flex-col items-center gap-sp8 p-sp8 rounded-s hover:bg-primary-50 transition-colors duration-150 cursor-default"
          >
            <Icon name={name} size={24} className="text-neutral-700" />
            <span
              className="text-neutral-500 text-center leading-tight"
              style={{ fontSize: "10px", wordBreak: "break-all" }}
            >
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  ),
};
