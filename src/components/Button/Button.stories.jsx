import Button from "./Button";
import { iconNames } from "../Icon/paths";

// ─── Shared demo icon (star SVG, matches Figma) ───────────────────────────────
const StarIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M7 0l1.763 5.382H14L9.618 8.736l1.763 5.382L7 10.764l-4.381 3.354 1.763-5.382L0 5.382h5.237L7 0z" />
  </svg>
);

const ClearIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 14 14"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1.293 1.293a1 1 0 011.414 0L7 5.586l4.293-4.293a1 1 0 111.414 1.414L8.414 7l4.293 4.293a1 1 0 01-1.414 1.414L7 8.414l-4.293 4.293a1 1 0 01-1.414-1.414L5.586 7 1.293 2.707a1 1 0 010-1.414z"
    />
  </svg>
);

// ─── Meta ─────────────────────────────────────────────────────────────────────

export default {
  title: "Design System/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Buttons communicate actions that users can take. Supports four variants (primary, secondary, link, pill), four icon positions, and a disabled state.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "link", "pill"],
      description: "Visual style of the button",
      table: { defaultValue: { summary: "primary" } },
    },
    iconPosition: {
      control: "select",
      options: ["none", "left", "right", "alone"],
      description: "Icon placement relative to label",
      table: { defaultValue: { summary: "none" } },
    },
    icon: {
      control: false,
      description: "Icon element (any React node). Shown when iconPosition ≠ none. Takes precedence over iconName.",
    },
    iconName: {
      control: "select",
      options: [undefined, ...iconNames],
      description: "Design-system icon name (kebab-case). Convenience alternative to passing a full icon node.",
      table: { defaultValue: { summary: "—" } },
    },
    children: {
      control: "text",
      description: "Button label",
    },
    disabled: {
      control: "boolean",
      description: "Disables interaction and applies disabled styling",
      table: { defaultValue: { summary: false } },
    },
    type: {
      control: "select",
      options: ["button", "submit", "reset"],
      table: { defaultValue: { summary: "button" } },
    },
    onClick: { action: "clicked" },
  },
  args: {
    children: "Label",
    disabled: false,
    type: "button",
  },
};

// ─── Playground (interactive) ─────────────────────────────────────────────────

export const Playground = {
  args: {
    variant: "primary",
    iconPosition: "none",
  },
};

// ─── Variants ────────────────────────────────────────────────────────────────

export const Primary = {
  args: { variant: "primary" },
};

export const Secondary = {
  args: { variant: "secondary" },
};

export const Link = {
  args: { variant: "link" },
};

export const Pill = {
  args: { variant: "pill" },
};

// ─── Disabled ─────────────────────────────────────────────────────────────────

export const Disabled = {
  args: { variant: "primary", disabled: true },
};

// ─── Icon positions ───────────────────────────────────────────────────────────

export const WithIconLeft = {
  args: {
    variant: "primary",
    iconPosition: "left",
    icon: <StarIcon />,
  },
};

export const WithIconRight = {
  args: {
    variant: "primary",
    iconPosition: "right",
    icon: <StarIcon />,
  },
};

export const IconOnly = {
  args: {
    variant: "primary",
    iconPosition: "alone",
    icon: <StarIcon />,
  },
};

// ─── iconName shorthand ───────────────────────────────────────────────────────

/** Use `iconName` instead of passing a full `<Icon />` node */
export const WithIconName = {
  name: "Icon via iconName",
  args: {
    variant: "primary",
    iconPosition: "left",
    iconName: "star",
    children: "Label",
  },
};

// ─── All variants grid ────────────────────────────────────────────────────────

const Row = ({ label, children }) => (
  <div className="flex flex-col gap-sp4">
    <span className="text-body-small font-medium text-neutral-500 uppercase tracking-wide">
      {label}
    </span>
    <div className="flex flex-wrap items-center gap-sp8">{children}</div>
  </div>
);

export const AllVariants = {
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "All four variants across default, disabled, and icon positions. Links with an icon are Neutral/700, text-only links Primary/500. Press Tab to see focus states: Neutral/700 stroke (primary, secondary, pill, icon links), Primary/500 outline (text link), 2px Primary/200 stroke (icon-only pill).",
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-sp24 p-sp24 bg-white rounded-m">
      {/* Default */}
      <Row label="Default">
        <Button variant="primary">Label</Button>
        <Button variant="secondary">Label</Button>
        <Button variant="link">Label</Button>
        <Button variant="pill">Label</Button>
      </Row>

      {/* Icon left */}
      <Row label="Icon Left">
        <Button variant="primary" iconPosition="left" icon={<StarIcon />}>
          Label
        </Button>
        <Button variant="secondary" iconPosition="left" icon={<StarIcon />}>
          Label
        </Button>
        <Button variant="link" iconPosition="left" icon={<StarIcon />}>
          Label
        </Button>
        <Button variant="pill" iconPosition="left" icon={<StarIcon />}>
          Label
        </Button>
      </Row>

      {/* Icon right */}
      <Row label="Icon Right">
        <Button variant="primary" iconPosition="right" icon={<StarIcon />}>
          Label
        </Button>
        <Button variant="secondary" iconPosition="right" icon={<StarIcon />}>
          Label
        </Button>
        <Button variant="link" iconPosition="right" icon={<StarIcon />}>
          Label
        </Button>
        <Button variant="pill" iconPosition="right" icon={<ClearIcon />}>
          Label
        </Button>
      </Row>

      {/* Icon alone */}
      <Row label="Icon Only">
        <Button variant="primary" iconPosition="alone" icon={<StarIcon />} />
        <Button variant="secondary" iconPosition="alone" icon={<StarIcon />} />
        <Button variant="link" iconPosition="alone" icon={<StarIcon size={16} />} />
        <Button variant="pill" iconPosition="alone" icon={<StarIcon />} />
      </Row>

      {/* Disabled */}
      <Row label="Disabled">
        <Button variant="primary" disabled>Label</Button>
        <Button variant="secondary" disabled>Label</Button>
        <Button variant="link" disabled>Label</Button>
        <Button variant="pill" disabled>Label</Button>
      </Row>

      {/* Disabled + icon */}
      <Row label="Disabled + Icon">
        <Button variant="primary" iconPosition="left" icon={<StarIcon />} disabled>
          Label
        </Button>
        <Button variant="secondary" iconPosition="right" icon={<StarIcon />} disabled>
          Label
        </Button>
        <Button variant="pill" iconPosition="right" icon={<ClearIcon />} disabled>
          Label
        </Button>
        <Button variant="primary" iconPosition="alone" icon={<StarIcon />} disabled />
      </Row>
    </div>
  ),
};
