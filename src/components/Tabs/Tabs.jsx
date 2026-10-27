import PropTypes from "prop-types";

const Tabs = ({ tabs, activeKey, onChange }) => (
  <div className="flex items-end border-b border-neutral-200 w-full">
    {tabs.map(({ key, label, showIndicator }) => {
      const isActive = key === activeKey;
      return (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-current={isActive ? "true" : undefined}
          className={`flex items-center gap-sp8 bg-white px-sp16 py-sp8 text-body-medium cursor-pointer transition-colors ${
            isActive
              ? "border-b-2 border-primary-500 font-medium text-primary-500"
              : "border-none font-regular text-neutral-800 hover:text-neutral-900"
          }`}
        >
          {label}
          {showIndicator && <span className="size-2 shrink-0 rounded-full bg-error-500" />}
        </button>
      );
    })}
  </div>
);

Tabs.propTypes = {
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.node.isRequired,
      showIndicator: PropTypes.bool,
    })
  ).isRequired,
  activeKey: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default Tabs;
