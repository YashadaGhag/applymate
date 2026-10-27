import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import Modal from "./Modal";
import Button from "../Button/Button";

// ─── Meta ─────────────────────────────────────────────────────────────────────

export default {
  title: "Design System/Modal",
  component: Modal,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Modal overlay with two variants: **Information** (single body block + Close button) and **Decision** (title + body + Cancel / Confirm). Renders via React Portal. Closes on ESC or backdrop click.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["information", "decision"],
      table: { defaultValue: { summary: "information" } },
    },
    isOpen: { control: false, description: "Controlled by stories via useState" },
    title: { control: "text" },
    confirmLabel: { control: "text" },
    cancelLabel: { control: "text" },
    closeLabel: { control: "text" },
    confirmDanger: { control: "boolean", table: { defaultValue: { summary: false } } },
    onClose: { action: "closed" },
    onConfirm: { action: "confirmed" },
    icon: {
      control: false,
      description:
        "Modal itself has no `icon` prop. Pass icons via `children` or through " +
        "Button's `icon` prop in action buttons (see AllVariants story).",
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const Trigger = ({ label = "Open Modal", ...rest }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} {...rest} />
    </>
  );
};

// ─── Information ─────────────────────────────────────────────────────────────

export const Information = {
  parameters: {
    docs: {
      description: {
        story:
          "Informational modal with no heading and a single centred Close button. Use for non-critical announcements or onboarding tips.",
      },
    },
  },
  render: (args) => (
    <Trigger
      label="Open Information Modal"
      variant="information"
      closeLabel={args.closeLabel || "Close"}
    >
      <p>
        We'll daily show 8 jobs based on your profile. You can update the daily
        job count from settings.
      </p>
      <p>
        The system will start getting more accurate based on your choices and
        applications.
      </p>
    </Trigger>
  ),
};

// ─── Decision ────────────────────────────────────────────────────────────────

/* export const Decision = {
  name: "Decision",
  parameters: {
    docs: {
      description: {
        story:
          "Decision modal with a title and two action buttons. Use when a user must explicitly confirm or cancel an action.",
      },
    },
  },
  render: (args) => (
    <Trigger
      label="Open Decision Modal"
      variant="decision"
      title="Confirm action?"
      confirmLabel={args.confirmLabel || "Confirm"}
      cancelLabel={args.cancelLabel || "Cancel"}
    >
      Are you sure you want to proceed? This will apply your changes immediately.
    </Trigger>
  ),
}; */

// ─── Decision ───────────────────────────────────────────────────

export const DecisionDanger = {
  name: "Decision",
  parameters: {
    docs: {
      description: {
        story:
          "Destructive decision: the Confirm button uses the error palette (red). Use for permanent, irreversible actions like deletion.",
      },
    },
  },
  render: () => (
    <Trigger
      label="Delete Job"
      variant="decision"
      title="Delete Job?"
      confirmLabel="Delete"
      cancelLabel="Cancel"
      confirmDanger
    >
      Are you sure you want to delete this job? You won't be able to recover it
      later.
    </Trigger>
  ),
};

// ─── Form: title icon, single button ─────────────────────────────────────────

export const FormSingleAction = {
  name: "Form: title icon, one button",
  parameters: {
    docs: {
      description: {
        story:
          "Form variant with `titleIcon` (an 18 px slot before the title, here a loader) and `hideCancel` (only the primary button). Figma 2766:1621.",
      },
    },
  },
  render: () => (
    <Trigger
      label="Open Scoring dialog"
      variant="form"
      title="Scoring your jobs"
      titleIcon={<LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" />}
      hideCancel
      confirmLabel="Continue in background"
    >
      <p>Scoring your jobs against your new resume. You can leave this page and it will keep going.</p>
    </Trigger>
  ),
};

// ─── All variants ─────────────────────────────────────────────────────────────

export const AllVariants = {
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story:
          "Buttons that open each modal variant side-by-side. Click to preview.",
      },
    },
  },
  render: () => {
    const [infoOpen, setInfoOpen]         = useState(false);
    // const [decisionOpen, setDecisionOpen] = useState(false);
    const [dangerOpen, setDangerOpen]     = useState(false);

    return (
      <div className="flex flex-wrap gap-sp16 p-sp24 bg-white rounded-m">
        {/* Information */}
        <Button variant="primary" onClick={() => setInfoOpen(true)}>
          Information
        </Button>
        <Modal
          variant="information"
          isOpen={infoOpen}
          onClose={() => setInfoOpen(false)}
        >
          <p>
            We'll daily show 8 jobs based on your profile. You can update the
            daily job count from settings.
          </p>
          <p>
            The system will start getting more accurate based on your choices
            and applications.
          </p>
        </Modal>

      {/* Decision
       <Button variant="secondary" iconPosition="left" icon={SaveIcon} onClick={() => setDecisionOpen(true)}>
          Decision
        </Button>
        <Modal
          variant="decision"
          isOpen={decisionOpen}
          title="Save changes?"
          confirmLabel="Save"
          cancelLabel="Cancel"
          onClose={() => setDecisionOpen(false)}
          onConfirm={() => setDecisionOpen(false)}
        >
          Your unsaved changes will be permanently applied. Continue?
        </Modal> */}

        {/* Destructive */}
        <Button
          variant="primary"
          //iconPosition="left"
          //icon={DeleteIcon}
          className="bg-error-500 hover:bg-error-600 active:bg-error-700"
          onClick={() => setDangerOpen(true)}
        >
          Destructive
        </Button>
        <Modal
          variant="decision"
          isOpen={dangerOpen}
          title="Delete Job?"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          confirmDanger
          onClose={() => setDangerOpen(false)}
          onConfirm={() => setDangerOpen(false)}
        >
          Are you sure you want to delete this job? You won't be able to recover
          it later.
        </Modal>
      </div>
    );
  },
};
