import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import PropTypes from "prop-types";
import Button from "../Button/Button";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-body-small",
        "text-paragraph-headers-small",
        "text-body-medium",
        "text-body-large",
        "text-h5",
        "text-h4",
        "text-h3",
        "text-h2",
        "text-h1",
      ],
    },
  },
});

/** Utility: merge Tailwind classes safely */
const cn = (...inputs) => twMerge(clsx(inputs));

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Modal — design system overlay primitive.
 *
 * Variants:
 *   information — single body text block + "Close" button (centred).
 *   decision    — title + body + "Cancel" / "Confirm" buttons (right-aligned).
 *   form        — compact edit dialog (Change Preferences, Figma 2679:7185): 404 wide, 16 padding
 *                 and gaps, 14/20 Medium title, the form as children, Cancel + a primary button
 *                 (confirmLabel, confirmDisabled) in a centred row. Cancel is disabled while
 *                 `busy`, and backdrop click / ESC are ignored while `busy`.
 *
 * Renders via React Portal into document.body to guarantee z-index isolation.
 * ESC key and backdrop click both call onClose.
 *
 * @example
 * // Information
 * <Modal variant="information" isOpen={open} onClose={() => setOpen(false)}>
 *   <p>We'll show 8 jobs daily based on your profile.</p>
 *   <p>The system improves as you apply and make choices.</p>
 * </Modal>
 *
 * @example
 * // Decision — destructive confirm
 * <Modal
 *   variant="decision"
 *   isOpen={open}
 *   title="Delete Job?"
 *   confirmLabel="Delete"
 *   confirmDanger
 *   onConfirm={handleDelete}
 *   onClose={() => setOpen(false)}
 * >
 *   This action cannot be undone.
 * </Modal>
 */
const Modal = ({
  variant = "information",
  isOpen = false,
  onClose,
  onConfirm,
  // Content
  title,
  children,
  body,
  // Button labels
  closeLabel   = "Close",
  confirmLabel = "Confirm",
  cancelLabel  = "Cancel",
  // Danger (red) confirm button — for destructive decisions
  confirmDanger = false,
  // form variant: the primary button is disabled (nothing changed / invalid / saving)
  confirmDisabled = false,
  // form variant: a save is running; the dialog can't be dismissed meanwhile
  busy = false,
  // form variant: "default" is 404 wide; "wide" is 576 (the Add company dialog)
  size = "default",
  // form variant: an icon before the title (the "Scoring your jobs" loader, Figma 2766:1621)
  titleIcon,
  // form variant: only the primary button, centred (the dialog still closes on ESC and backdrop)
  hideCancel = false,
  className,
}) => {
  const panelRef  = useRef(null);
  const isDecision = variant === "decision";
  const isForm     = variant === "form";
  const hasTitle   = (isDecision || isForm) && title;
  const handleClose = () => { if (!busy) onClose?.(); };
  const bodyContent = children ?? body;

  // ── ESC closes ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, busy]);

  // ── Prevent body scroll while open ───────────────────────────────
  useEffect(() => {
    if (!isOpen) return undefined;
    // Hiding the page scrollbar widens the page, which would shift it left/right behind the
    // dialog; padding the body by the scrollbar's width keeps everything where it was.
    // (Not needed where `scrollbar-gutter: stable` in index.css already keeps the space.)
    const scrollbarWidth = CSS.supports("scrollbar-gutter", "stable")
      ? 0
      : window.innerWidth - document.documentElement.clientWidth;
    const { overflow, paddingRight } = document.body.style;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Confirm button — switches to error palette when confirmDanger ─
  const confirmClassName = confirmDanger
    ? "bg-error-500 hover:bg-error-600 active:bg-error-700 focus-visible:ring-error-100"
    : "";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-sp24"
      role="dialog"
      aria-modal="true"
      aria-labelledby={hasTitle ? "modal-title" : undefined}
    >
      {/* ── Semi-transparent backdrop ──────────────────────────── */}
      <div
        className="absolute inset-0 bg-neutral-900/60 transition-opacity duration-150"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* ── Panel ─────────────────────────────────────────────────
          Figma: white bg, border primary-100, shadow-card, rounded-sm,
          min-h 200 px, w 404 px, padding sp24, gap sp24.
      ──────────────────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        className={cn(
          "relative z-10 flex flex-col",
          "bg-white border border-neutral-100 rounded-sm shadow-card",
          isForm
            ? `${size === "wide" ? "w-144" : "w-[404px]"} max-w-full gap-sp16 p-sp16`
            : "min-h-[200px] w-[404px] max-w-full gap-sp24 p-sp24",
          className
        )}
      >
        {/* ── Body content ──────────────────────────────────────── */}
        <div className="flex flex-col gap-sp16 w-full text-neutral-700">
          {/* Decision: title (body-large, medium). Form: 14/20 medium. */}
          {hasTitle && (
            <div className="flex items-center gap-sp8 w-full">
              {isForm && titleIcon && (
                <span className="shrink-0 flex items-center justify-center size-[18px] text-primary-500" aria-hidden="true">
                  {titleIcon}
                </span>
              )}
              <p
                id="modal-title"
                className={cn("font-medium flex-1 min-w-0", isForm ? "text-body-medium" : "text-body-large")}
              >
                {title}
              </p>
            </div>
          )}

          {/* Body paragraphs (body-medium, regular) */}
          <div
            className={cn(
              "text-body-medium font-regular w-full",
              !isDecision && "flex flex-col gap-sp16"
            )}
          >
            {bodyContent}
          </div>
        </div>

        {/* ── Action buttons ────────────────────────────────────── */}
        {isForm ? (
          /* Form: Cancel (secondary) + the primary action, centred, 16 apart */
          <div className="flex items-center justify-center gap-sp16">
            {!hideCancel && (
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                {cancelLabel}
              </Button>
            )}
            <Button variant="primary" onClick={onConfirm} disabled={confirmDisabled || busy}>
              {confirmLabel}
            </Button>
          </div>
        ) : isDecision ? (
          /* Decision: Cancel (secondary) + Confirm (primary / danger) */
          <div className="flex items-center gap-sp16 justify-center">
            <Button variant="secondary" onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button
              variant="primary"
              onClick={onConfirm}
              className={confirmClassName}
            >
              {confirmLabel}
            </Button>
          </div>
        ) : (
          /* Information: single centred Close button */
          <div className="flex justify-center">
            <Button variant="primary" onClick={onClose}>
              {closeLabel}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

Modal.propTypes = {
  /** Visual variant */
  variant: PropTypes.oneOf(["information", "decision", "form"]),
  /** Controls visibility */
  isOpen: PropTypes.bool,
  /** Called on backdrop click, ESC, or Cancel / Close */
  onClose: PropTypes.func,
  /** Called on Confirm button click (decision variant only) */
  onConfirm: PropTypes.func,
  /** Heading text (decision and form variants) */
  title: PropTypes.string,
  /** Body content — ReactNode or plain string */
  children: PropTypes.node,
  /** Alternative to children for simple string bodies */
  body: PropTypes.node,
  /** Label for the Information close button */
  closeLabel: PropTypes.string,
  /** Label for the Decision confirm button */
  confirmLabel: PropTypes.string,
  /** Label for the Decision cancel button */
  cancelLabel: PropTypes.string,
  /** Renders the confirm button in red (destructive action) */
  confirmDanger: PropTypes.bool,
  /** Form variant: disables the primary button */
  confirmDisabled: PropTypes.bool,
  /** Form variant: a save is running (Cancel disabled; backdrop and ESC don't close) */
  busy: PropTypes.bool,
  /** Form variant width: 404 (default) or 576 (wide) */
  size: PropTypes.oneOf(["default", "wide"]),
  /** Form variant: an icon (18px slot) before the title, e.g. a loader */
  titleIcon: PropTypes.node,
  /** Form variant: show only the primary button */
  hideCancel: PropTypes.bool,
  /** Extra Tailwind classes on the panel */
  className: PropTypes.string,
};

export default Modal;
