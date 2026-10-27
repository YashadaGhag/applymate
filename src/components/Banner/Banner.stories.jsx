import { useState } from "react";
import Banner from "./Banner";
import Button from "../Button/Button";
import Icon from "../Icon/Icon";

// ─── Icon component map ───────────────────────────────────────────────────────
// Each value is a React component function — NOT a pre-rendered JSX element.
// Banner calls the selected function with size={20}.
// Color is inherited automatically via currentColor from the wrapper <span>.
//
// This map drives the "icon" dropdown control in the Storybook Controls panel.
const BANNER_ICON_MAP = {
  "(none)":      undefined,
  "info-filled": (props) => <Icon name="info-filled" {...props} />,
  "check":       (props) => <Icon name="check"       {...props} />,
  "error":       (props) => <Icon name="error"       {...props} />,
  "clear":       (props) => <Icon name="clear"       {...props} />,
  "star":        (props) => <Icon name="star"        {...props} />,
  "edit":        (props) => <Icon name="edit"        {...props} />,
};

// ─── Meta ─────────────────────────────────────────────────────────────────────

export default {
  title: "Design System/Banner",
  component: Banner,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Inline status notification strip with a left-border accent and tinted background. Four semantic variants: **success**, **info**, **warning**, **error**. Supports an optional title, dismiss button, and custom icon.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["success", "info", "warning", "error"],
      table: { defaultValue: { summary: "info" } },
    },
    title: { control: "text" },
    message: { control: "text" },
    // ── icon: React component function ──────────────────────────────────────
    // Storybook's `mapping` maps each dropdown label → the real prop value
    // (a component function). Banner calls it as <IconComponent size={20} />.
    icon: {
      control: "select",
      options: Object.keys(BANNER_ICON_MAP),
      mapping: BANNER_ICON_MAP,
      description:
        "React **component function** rendered as the leading icon. " +
        "Receives `size={20}`; color inherits via `currentColor`. " +
        "Takes precedence over `iconName`. " +
        "Pass a component, not a JSX element — e.g. `(props) => <Icon name=\"error\" {...props} />`.",
      table: { defaultValue: { summary: "(none)" } },
    },
    showIcon: {
      control: "boolean",
      table: { defaultValue: { summary: true } },
    },
    iconName: {
      control: "text",
      description:
        "Design-system icon name. Used when `icon` is not provided. Default: `'info-filled'`",
      table: { defaultValue: { summary: "info-filled" } },
    },
    onClose: { action: "dismissed" },
  },
  args: {
    message:
      "Designed data-driven mobile and web interfaces for a fintech platform, focusing on conversion optimization.",
    showIcon: true,
  },
};

// ─── Individual variants ──────────────────────────────────────────────────────

export const Success = {
  args: { variant: "success" },
};

export const Info = {
  args: { variant: "info" },
};

export const Warning = {
  name: "Warning (Modifications)",
  args: { variant: "warning" },
};

export const ErrorVariant = {
  name: "Error",
  args: { variant: "error" },
};

// ─── With title ───────────────────────────────────────────────────────────────

export const WithTitle = {
  args: {
    variant: "info",
    title: "Profile visibility update",
    message:
      "Your profile is now visible to employers. Keep it up to date to attract the best matches.",
  },
};

// ─── Dismissible ─────────────────────────────────────────────────────────────

export const Dismissible = {
  parameters: {
    docs: {
      description: {
        story: "Pass `onClose` to show a dismiss × button. Click it to hide the banner.",
      },
    },
  },
  render: (args) => {
    const [visible, setVisible] = useState(true);
    if (!visible)
      return (
        <button
          className="text-body-small text-primary-500 underline"
          onClick={() => setVisible(true)}
        >
          Show banner again
        </button>
      );
    return (
      <Banner {...args} variant="info" onClose={() => setVisible(false)}>
        Your session will expire in 10 minutes. Save your work to avoid losing
        changes.
      </Banner>
    );
  },
};

// ─── Without icon ─────────────────────────────────────────────────────────────

export const NoIcon = {
  args: { variant: "warning", showIcon: false },
};

// ─── Custom icon (component function) ────────────────────────────────────────

// Define each as a component function — NOT a pre-rendered element.
// Banner calls them with size={20}; currentColor inherits the variant tint.
const StarIcon  = (props) => <Icon name="star"  {...props} />;
const ErrorIcon = (props) => <Icon name="error" {...props} />;

export const CustomIcon = {
  name: "Custom Icon Component",
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "Pass a React **component function** to `icon`. " +
          "The banner renders it with `size={20}` and tints it with the variant colour via `currentColor`. " +
          "Here `StarIcon` replaces the default `info-filled` icon on `success`, " +
          "and `ErrorIcon` replaces it on `error`.",
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-sp12 w-[600px]">
      <Banner variant="success" icon={StarIcon}>
        Congratulations! Your profile has been featured in today's spotlight.
      </Banner>
      <Banner variant="error" icon={ErrorIcon}>
        Something went wrong. Please try again or contact support.
      </Banner>
    </div>
  ),
};

// ─── All variants grid ────────────────────────────────────────────────────────

const variants = ["success", "info", "warning", "error"];

const SAMPLE_MESSAGES = {
  success:
    "Your application was submitted successfully. The employer will review it shortly.",
  info:
    "We'll daily show 8 jobs based on your profile. You can update this in settings.",
  warning:
    "Your profile is 60% complete. Add more details to improve job matches.",
  error:
    "We couldn't save your changes. Please check your connection and try again.",
};

const SAMPLE_TITLES = {
  success: "Application submitted",
  info:    "Job recommendations",
  warning: "Profile incomplete",
  error:   "Save failed",
};

export const AllVariants = {
  parameters: {
    docs: {
      description: {
        story: "All four semantic variants with titles and dismiss buttons.",
      },
    },
  },
  render: () => {
    const [dismissed, setDismissed] = useState({});
    const restore = () => setDismissed({});

    return (
      <div className="flex flex-col gap-sp12 w-[600px]">
        {variants.map((v) =>
          dismissed[v] ? null : (
            <Banner
              key={v}
              variant={v}
              title={SAMPLE_TITLES[v]}
              onClose={() => setDismissed((prev) => ({ ...prev, [v]: true }))}
            >
              {SAMPLE_MESSAGES[v]}
            </Banner>
          )
        )}
        {Object.keys(dismissed).length > 0 && (
          <button
            className="text-body-small text-primary-500 underline self-start mt-sp4"
            onClick={restore}
          >
            Restore dismissed banners
          </button>
        )}
      </div>
    );
  },
};

// ─── Variants without title ───────────────────────────────────────────────────

export const AllVariantsNoTitle = {
  name: "All Variants (no title)",
  parameters: {
    docs: {
      description: {
        story: "Exact Figma layout: icon + single-line body text, no title.",
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-sp12 w-[600px]">
      {variants.map((v) => (
        <Banner key={v} variant={v}>
          {SAMPLE_MESSAGES[v]}
        </Banner>
      ))}
    </div>
  ),
};

// ─── Compact (Figma "Score new resume banner") ────────────────────────────────

export const Compact = {
  name: "Compact, with action",
  parameters: {
    docs: {
      description: {
        story:
          "`size=\"compact\"`: sp8 padding, 18 px icon, 12/16 text, items centred, an optional `action` at the right. Warning uses the darker warning-700 accent; warning, error and success get their own icons (Figma 2770:8428, 2770:8456, 2770:8972, 2770:7892).",
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-sp12 w-[600px]">
      <Banner size="compact" variant="warning" action={<Button variant="primary">Score now</Button>}>
        Rescore your jobs with your new resume. Until then, scores reflect your old resume.
      </Banner>
      <Banner size="compact" variant="info">
        A compact info banner with no action.
      </Banner>
      <Banner size="compact" variant="error" action={<Button variant="primary">Try again</Button>}>
        We couldn’t score your jobs with your new resume. Your old resume is still in use.
      </Banner>
      <Banner size="compact" variant="success">
        Done. Your jobs are now scored against your new resume.
      </Banner>
    </div>
  ),
};
