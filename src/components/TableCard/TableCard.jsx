import PropTypes from "prop-types";

// Figma mobile card (Tracker 2830:15138, Saved Jobs 2830:24310): the table row below 744px.
// 1px Borders/Primary border, radius 8, padding 16, 12 between the blocks. Top: logo, company over
// title, the row actions. Then the chips (status left, match right), then a divider and the
// label / value details in two columns, 12/16.
const TableCard = ({ logo, company, title, actions, chipsLeft, chipsRight, details }) => (
  <li className="flex list-none flex-col gap-sp12 rounded-sm border border-neutral-100 bg-white p-sp16">
    <div className="flex items-center gap-sp8">
      {logo}
      <div className="flex min-w-0 flex-1 flex-col gap-sp4 text-body-medium">
        <span className="truncate font-medium text-neutral-800">{company}</span>
        <span className="min-w-0 text-neutral-700">{title}</span>
      </div>
      <div className="flex size-8 shrink-0 items-center justify-center">{actions}</div>
    </div>

    {(chipsLeft || chipsRight) && (
      <div className="flex items-center justify-between gap-sp8">
        <div className="flex min-w-0 items-center gap-sp8">{chipsLeft}</div>
        <div className="shrink-0">{chipsRight}</div>
      </div>
    )}

    <dl className="m-0 grid grid-cols-2 gap-x-sp12 gap-y-sp12 border-t border-neutral-50 pt-sp12 text-body-small font-regular">
      {details.map((detail) => (
        <div key={detail.label} className={`flex min-w-0 flex-col gap-sp4 ${detail.wide ? "col-span-2" : ""}`}>
          <dt className="text-neutral-500">{detail.label}</dt>
          <dd className="m-0 truncate text-neutral-700">{detail.value}</dd>
        </div>
      ))}
    </dl>
  </li>
);

TableCard.propTypes = {
  /** The company logo (CompanyAvatar) */
  logo: PropTypes.node,
  company: PropTypes.node.isRequired,
  /** The job title, usually a link */
  title: PropTypes.node,
  /** The row actions menu */
  actions: PropTypes.node,
  /** Left of the chip row, e.g. the status chip */
  chipsLeft: PropTypes.node,
  /** Right of the chip row, e.g. the match chip */
  chipsRight: PropTypes.node,
  /** Label / value pairs, two per line; `wide` takes the whole line */
  details: PropTypes.arrayOf(
    PropTypes.shape({ label: PropTypes.string.isRequired, value: PropTypes.node, wide: PropTypes.bool })
  ).isRequired,
};

export default TableCard;
