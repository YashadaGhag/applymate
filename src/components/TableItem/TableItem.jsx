import PropTypes from "prop-types";

/** One table row (<tr>): its cells are TableText children (or any <td>). */
const TableItem = ({ children }) => <tr>{children}</tr>;

TableItem.propTypes = {
  children: PropTypes.node,
};

export default TableItem;
