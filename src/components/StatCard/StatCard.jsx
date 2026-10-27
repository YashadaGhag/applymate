import PropTypes from "prop-types";

/**
 * Figma Tracker stat card: 222 wide in the four-card row (the grid sets the width and the 24 gap),
 * padding 12, gap 8, a 12/16 Regular label with an 18 icon on the right, a 16/24 Medium value.
 * Used by the Tracker's data state and its empty state.
 */
const StatCard = ({ label, value, icon: Icon, iconClassName = "text-primary-500" }) => (
  <div className="flex min-w-0 flex-col gap-sp8 rounded-sm border border-neutral-100 bg-white p-sp12">
    <div className="flex items-center justify-between gap-sp8">
      <span className="text-body-small font-regular text-neutral-500">{label}</span>
      <Icon size={18} className={`shrink-0 ${iconClassName}`} aria-hidden="true" />
    </div>
    <span className="text-body-large font-medium text-neutral-800">{value}</span>
  </div>
);

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  /** A Lucide icon component */
  icon: PropTypes.elementType.isRequired,
  /** Icon colour class */
  iconClassName: PropTypes.string,
};

export default StatCard;
