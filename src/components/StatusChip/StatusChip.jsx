import PropTypes from "prop-types";
import { STATUS_LABELS } from "../../utils/trackerTable";

// Figma Tracker status chips: radius 16, padding 8 horizontal, 12/16 Regular.
const STATUS = {
  pending: { className: "bg-primary-50 text-primary-500" },
  applied: { className: "bg-neutral-50 text-neutral-500" },
  interviewing: { className: "bg-purple-50 text-purple-500" },
  offer: { className: "bg-success-50 text-success-500" },
  not_moving_forward: { className: "bg-error-50 text-error-500" },
};

/** The application status as a chip. An unknown status renders nothing. */
const StatusChip = ({ status }) => {
  const config = STATUS[status];
  if (!config) return null;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-xl px-sp8 text-body-small font-regular ${config.className}`}>
      {STATUS_LABELS[status]}
    </span>
  );
};

StatusChip.propTypes = {
  status: PropTypes.oneOf(Object.keys(STATUS)),
};

export default StatusChip;
