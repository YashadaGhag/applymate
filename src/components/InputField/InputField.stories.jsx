import { useState } from "react";
import InputField from "./InputField";
import Icon from "../Icon/Icon";

// ─── Icon component map ───────────────────────────────────────────────────────
// Each value is a React component function — NOT a pre-rendered JSX element.
// InputField calls the selected function with size={18}.
// Color is inherited automatically via currentColor from the wrapper <span>.
//
// This map drives both:
//   • the "icon" dropdown control in the Storybook Controls panel, and
//   • the stories that demonstrate the icon-as-component pattern.
const INPUT_ICON_MAP = {
  "(none)":      undefined,
  "check":       (props) => <Icon name="check"       {...props} />,
  "view-on":     (props) => <Icon name="view-on"     {...props} />,
  "view-off":    (props) => <Icon name="view-off"    {...props} />,
  "clear":       (props) => <Icon name="clear"       {...props} />,
  "info-filled": (props) => <Icon name="info-filled" {...props} />,
  "error":       (props) => <Icon name="error"       {...props} />,
  "link":        (props) => <Icon name="link"        {...props} />,
  "profile":     (props) => <Icon name="profile"     {...props} />,
  "clock":       (props) => <Icon name="clock"       {...props} />,
  "location":    (props) => <Icon name="location"    {...props} />,
};

// ─── Meta ─────────────────────────────────────────────────────────────────────

export default {
  title: "Design System/InputField",
  component: InputField,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Text input with label, placeholder, help text, and five visual states: Default, Filled (auto), Focused (CSS), Disabled, and Error. " +
          "The trailing icon turns green when the field has a value and red on error.",
      },
    },
  },
  argTypes: {
    label:       { control: "text" },
    placeholder: { control: "text" },
    helpText:    { control: "text" },
    error: {
      control: "boolean",
      table: { defaultValue: { summary: false } },
    },
    disabled: {
      control: "boolean",
      table: { defaultValue: { summary: false } },
    },
    showIcon: {
      control: "boolean",
      table: { defaultValue: { summary: true } },
    },
    showLabel: {
      control: "boolean",
      table: { defaultValue: { summary: true } },
    },
    showHelpText: {
      control: "boolean",
      table: { defaultValue: { summary: true } },
    },
    // ── icon: React component function ──────────────────────────────────────
    // Storybook's `mapping` maps each dropdown label → the real prop value
    // (a component function). InputField calls it as <IconComponent size={18} />.
    icon: {
      control: "select",
      options: Object.keys(INPUT_ICON_MAP),
      mapping: INPUT_ICON_MAP,
      description:
        "React **component function** rendered as the trailing icon. " +
        "Receives `size={18}`; color inherits via `currentColor`. " +
        "Takes precedence over `iconName`. " +
        "Pass a component, not a JSX element — e.g. `(props) => <Icon name=\"check\" {...props} />`.",
      table: { defaultValue: { summary: "(none)" } },
    },
    iconName: {
      control: "text",
      description:
        "Design-system icon name used when `icon` is not provided. " +
        "Any key from `paths.js` works, e.g. `\"check\"`, `\"view-off\"`.",
      table: { defaultValue: { summary: "check" } },
    },
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "tel", "search"],
      table: { defaultValue: { summary: "text" } },
    },
    onChange: { action: "changed" },
  },
  args: {
    label:        "Email",
    placeholder:  "Email",
    helpText:     "Enter your email address",
    error:        false,
    disabled:     false,
    showIcon:     true,
    showLabel:    true,
    showHelpText: true,
  },
};

// ─── Playground ───────────────────────────────────────────────────────────────

export const Playground = {};

// ─── Individual states ────────────────────────────────────────────────────────

export const Default = {
  args: {},
};

export const Filled = {
  args: { defaultValue: "user@example.com" },
  parameters: {
    docs: {
      description: {
        story: "Icon turns `success-500` (green ✓) automatically when the field has a value.",
      },
    },
  },
};

export const Focused = {
  render: (args) => <InputField {...args} autoFocus />,
  args: {},
  parameters: {
    docs: {
      description: {
        story:
          "Click into the field to see the Figma focused state: " +
          "the inner border stays `neutral-100` and a 1px `neutral-700` outline appears sp4 outside the field. " +
          "Hover (not focused) shows a `primary-200` border with the card shadow.",
      },
    },
  },
};

export const Disabled = {
  args: { disabled: true },
};

export const Error = {
  args: {
    error:        true,
    defaultValue: "not-an-email",
    helpText:     "Please enter a valid email address",
  },
};

// ─── Without optional parts ───────────────────────────────────────────────────

export const NoLabel = {
  args: { showLabel: false },
};

export const NoHelpText = {
  args: { showHelpText: false },
};

export const NoIcon = {
  args: { showIcon: false },
};

// ─── Input types ──────────────────────────────────────────────────────────────

export const Password = {
  args: {
    label:       "Password",
    placeholder: "••••••••",
    helpText:    "Must be at least 8 characters",
    type:        "password",
    iconName:    "view-off",
  },
};

// ─── Custom icon component ────────────────────────────────────────────────────
// Demonstrates passing icon as a component function instead of using iconName.
// The "icon" dropdown in the Controls panel uses the same pattern under the hood.

const ViewOnIcon  = INPUT_ICON_MAP["view-on"];
const ViewOffIcon = INPUT_ICON_MAP["view-off"];

export const CustomIcon = {
  name: "Custom Icon — password toggle",
  parameters: {
    docs: {
      description: {
        story:
          "Pass a React **component function** to `icon` — the same type used by the Controls dropdown. " +
          "InputField renders it as `<IconComponent size={18} />` and the wrapper `<span>` provides the state colour. " +
          "Here, clicking the button swaps `ViewOnIcon` ↔ `ViewOffIcon`.",
      },
    },
  },
  render: () => {
    const [show,  setShow]  = useState(false);
    const [value, setValue] = useState("");
    return (
      <div className="flex flex-col gap-sp16 w-[360px]">
        <InputField
          label="Password"
          placeholder="Enter password"
          type={show ? "text" : "password"}
          helpText="Must be at least 8 characters"
          icon={show ? ViewOnIcon : ViewOffIcon}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="text-body-small text-primary-500 underline self-start"
        >
          {show ? "Hide password" : "Show password"}
        </button>
      </div>
    );
  },
};

// ─── All states grid ──────────────────────────────────────────────────────────

const Row = ({ label, children }) => (
  <div className="flex flex-col gap-sp4">
    <span className="text-body-small font-medium text-neutral-500 uppercase tracking-wide">
      {label}
    </span>
    {children}
  </div>
);

const ControlledInput = (args) => {
  const [value, setValue] = useState("");
  return (
    <InputField
      {...args}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
};

export const AllStates = {
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "All five Figma states in a single view. " +
          "Type in the first field to see Default → Filled (icon turns green).",
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-sp24 p-sp24 bg-white rounded-m w-[440px]">
      <Row label="Default — type to fill">
        <ControlledInput
          label="Email"
          placeholder="Email"
          helpText="Enter your email address"
        />
      </Row>

      <Row label="Filled">
        <InputField
          label="Email"
          placeholder="Email"
          helpText="Enter your email address"
          defaultValue="user@example.com"
        />
      </Row>

      <Row label="Focused — click to activate">
        <InputField
          label="Email"
          placeholder="Email"
          helpText="Enter your email address"
          autoFocus
        />
      </Row>

      <Row label="Disabled">
        <InputField
          label="Email"
          placeholder="Email"
          helpText="Enter your email address"
          disabled
        />
      </Row>

      <Row label="Error">
        <InputField
          label="Email"
          placeholder="Email"
          helpText="Please enter a valid email address"
          defaultValue="not-an-email"
          error
        />
      </Row>
    </div>
  ),
};
