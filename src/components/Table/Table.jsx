import PropTypes from "prop-types";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react";

// Figma "Table" (Design System): header and rows 36 tall, cell padding 8 horizontal, sort arrows
// on sortable headers, and a pagination row ("Results: 1 - 12 of N", previous, page numbers, next).

const ARIA_SORT = { asc: "ascending", desc: "descending" };

function SortIcon({ direction }) {
  if (direction === "asc") return <ChevronUp size={20} className="shrink-0 text-neutral-700" aria-hidden="true" />;
  if (direction === "desc") return <ChevronDown size={20} className="shrink-0 text-neutral-700" aria-hidden="true" />;
  return <ChevronsUpDown size={20} className="shrink-0 text-neutral-500" aria-hidden="true" />;
}

function HeaderCell({ column, sort, onSort }) {
  const active = sort?.key === column.key;
  const direction = active ? sort.direction : null;
  const align = column.align === "center" ? "justify-center text-center" : "text-left";
  return (
    <th
      scope="col"
      aria-sort={column.sortable ? ARIA_SORT[direction] ?? "none" : undefined}
      className={`h-9 border-b border-neutral-50 bg-white p-0 font-regular ${column.className ?? ""}`}
    >
      {column.sortable ? (
        <button
          type="button"
          onClick={() => onSort?.(column.key)}
          className={`flex h-9 w-full cursor-pointer items-center gap-sp4 border-none bg-transparent px-sp8 text-body-medium font-regular text-neutral-500 focus-visible:outline-solid focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-neutral-700 ${align}`}
        >
          {column.label}
          <SortIcon direction={direction} />
        </button>
      ) : (
        <div className={`flex h-9 items-center gap-sp4 px-sp8 text-body-medium text-neutral-500 ${align}`}>
          {column.label}
        </div>
      )}
    </th>
  );
}

// First and last page, the current one and its neighbours; "…" for the gaps. Short lists show every page.
function pageItems(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1] > 1 ? ["gap", p] : [p]));
}

function Pagination({ total, page, pageSize, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const arrow = "flex size-5 cursor-pointer items-center justify-center rounded-xs border-none bg-transparent p-0 text-neutral-700 disabled:cursor-default disabled:text-neutral-300";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-sp16 border-b border-neutral-50 bg-white px-sp12 py-sp16">
      <span className="text-body-small font-regular text-neutral-500">
        Results: {from} - {to} of {total}
      </span>
      <div className="flex items-center gap-sp16">
        <button type="button" className={arrow} aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="flex items-center gap-sp8">
          {pageItems(page, pageCount).map((item, i) =>
            item === "gap" ? (
              <span key={`gap-${i}`} aria-hidden="true" className="text-body-small text-neutral-500">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
                className={`flex size-5 cursor-pointer items-center justify-center rounded-xs border p-0 text-body-small font-regular text-neutral-700 ${
                  item === page ? "border-neutral-100 bg-neutral-50" : "border-transparent bg-transparent"
                }`}
              >
                {item}
              </button>
            )
          )}
        </div>
        <button type="button" className={arrow} aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

/**
 * The shared table of the Application Tracker and Saved Jobs. Semantic markup: a caption for screen
 * readers, <th scope="col"> headers with aria-sort on the sortable ones, rows (TableItem) as
 * children. Sorting and paging are the page's job: it passes the current page's rows, the sort
 * state and the handlers. Narrow windows scroll the table sideways inside its container. With a
 * `cards` list (TableCard items) the table shows from 744px and the cards below it (Figma mobile).
 */
const Table = ({ caption, columns, sort, onSort, total, page, pageSize, onPageChange, children, cards }) => (
  <div className="flex flex-col rounded-sm">
    {cards && <ul className="m-0 flex flex-col gap-sp12 p-0 min-[744px]:hidden">{cards}</ul>}
    <div className={`overflow-x-auto ${cards ? "hidden min-[744px]:block" : ""}`}>
      <table className="w-full min-w-192 table-fixed border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <HeaderCell key={column.key} column={column} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
    <Pagination total={total} page={page} pageSize={pageSize} onPageChange={onPageChange} />
  </div>
);

Table.propTypes = {
  /** Accessible name, read by screen readers (not shown) */
  caption: PropTypes.string.isRequired,
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      sortable: PropTypes.bool,
      align: PropTypes.oneOf(["left", "center"]),
      /** Column width, as a Tailwind fraction class (w-1/6) */
      className: PropTypes.string,
    })
  ).isRequired,
  sort: PropTypes.shape({ key: PropTypes.string, direction: PropTypes.oneOf(["asc", "desc"]) }),
  /** Called with the column key when a sortable header is clicked */
  onSort: PropTypes.func,
  /** Rows across all pages, for the "Results" line and the page count */
  total: PropTypes.number.isRequired,
  page: PropTypes.number.isRequired,
  pageSize: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
  /** The current page's TableItem rows */
  children: PropTypes.node,
  /** The current page as TableCard items, shown below 744px instead of the table */
  cards: PropTypes.node,
};

export default Table;
