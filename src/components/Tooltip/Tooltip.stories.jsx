import Tooltip from "./Tooltip";

export default {
  title: "Design System/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    variant: { control: "select", options: ["default", "error", "dark"] },
    message: { control: "text" },
    actionLabel: { control: "text" },
    onAction: { action: "action clicked" },
  },
};

export const Default = {
  args: {
    variant: "default",
    message: "Created successfully.",
    actionLabel: "Dismiss",
  },
};

/** Tooltip doubles as the job-dismiss toast (JobActionsContext): error variant + UNDO. */
export const DismissToast = {
  args: {
    variant: "error",
    message: "Job posting dismissed",
    actionLabel: "UNDO",
  },
};

/** Figma "Variant2": a label for something on screen (e.g. the MainNav rail's icons). No action. */
export const Dark = {
  args: {
    variant: "dark",
    message: "More actions",
  },
};
