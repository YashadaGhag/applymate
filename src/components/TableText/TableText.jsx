import PropTypes from "prop-types";

// Figma "Table Text": a 36 tall cell, 8 horizontal padding, 14/20 Regular, bottom border
// Borders/Disabled/Light (neutral-50). The colour depends on the column:
//   heading    Text/Heading/Default (neutral-800), the company name
//   body       Text/Body/Default (neutral-700), the job title
//   secondary  Text/Help/Secondary (neutral-500), every other cell
const TONES = {
  heading: "text-neutral-800",
  body: "text-neutral-700",
  secondary: "text-neutral-500",
};

const ALIGN = { left: "text-left", center: "text-center" };

/**
 * One table cell (<td>). `leading` is an optional node before the text (the company logo),
 * `trailing` one after it (a chip).
 * Text truncates with an ellipsis; give long values a `title` through `children` being a string.
 * A cell that holds its own content (a chip, the actions button) passes it as children with
 * `align="center"`.
 */
const TableText = ({ tone = "secondary", align = "left", leading = null, trailing = null, children }) => (
  <td className={`h-9 border-b border-neutral-50 bg-white px-sp8 align-middle ${ALIGN[align]}`}>
    <div className={`flex items-center gap-sp8 ${align === "center" ? "justify-center" : ""}`}>
      {leading}
      <span
        className={`min-w-0 truncate text-body-medium font-regular ${TONES[tone]}`}
        title={typeof children === "string" ? children : undefined}
      >
        {children}
      </span>
      {trailing}
    </div>
  </td>
);

TableText.propTypes = {
  tone: PropTypes.oneOf(["heading", "body", "secondary"]),
  align: PropTypes.oneOf(["left", "center"]),
  /** Node shown before the text, e.g. the company logo */
  leading: PropTypes.node,
  /** Node shown after the text, e.g. the "Closed" chip */
  trailing: PropTypes.node,
  children: PropTypes.node,
};

export default TableText;
