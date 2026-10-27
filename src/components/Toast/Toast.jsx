import { useEffect } from "react";
import PropTypes from "prop-types";
import { CircleAlert } from "lucide-react";
import Tooltip from "../Tooltip/Tooltip";

// Same as the "Job posting dismissed" toast: hides after 5 seconds.
const TOAST_DURATION_MS = 5000;

/**
 * The bottom-center toast, fixed at the bottom of the window. Render it only while it should
 * show; mounting it again restarts the timer.
 *   dark (default)  a label ("Writing style saved", "Preferences saved", "Watchlist saved"),
 *                   hides itself after 5 seconds through `onHide`.
 *   success         green, check + message + an action (default "OK", which calls `onHide`);
 *                   also hides after 5 seconds.
 *   error           red, alert icon + message + an action (default "RETRY", `onAction`); it
 *                   stays until the action is used or the toast is unmounted.
 */
const Toast = ({ message, onHide, variant = "dark", actionLabel, onAction }) => {
  const autoHides = variant !== "error";
  useEffect(() => {
    if (!autoHides) return undefined;
    const timer = setTimeout(onHide, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [autoHides, onHide]);

  const tooltipProps =
    variant === "success"
      ? { variant, hug: true, actionLabel: actionLabel ?? "OK", onAction: onAction ?? onHide }
      : variant === "error"
        ? {
            variant,
            hug: true,
            icon: <CircleAlert size={18} className="shrink-0 text-error-500" />,
            actionLabel: actionLabel ?? "RETRY",
            onAction,
          }
        : { variant: "dark" };

  return (
    <div role="status" className="fixed inset-x-0 bottom-sp24 z-50 flex justify-center px-sp16">
      <Tooltip message={message} {...tooltipProps} />
    </div>
  );
};

Toast.propTypes = {
  message: PropTypes.string.isRequired,
  /** Called when the toast should go away (after 5 seconds, or OK on a success toast) */
  onHide: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(["dark", "success", "error"]),
  /** Success and error only: the action's label */
  actionLabel: PropTypes.string,
  /** Success and error only: the action's handler (success defaults to onHide) */
  onAction: PropTypes.func,
};

export default Toast;
