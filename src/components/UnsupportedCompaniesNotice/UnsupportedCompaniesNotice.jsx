import PropTypes from "prop-types";
import Banner from "../Banner/Banner";
import { unsupportedNoticeParts } from "../../utils/unsupportedNotice";

// Change Preferences > Company Watchlist: the info banner for companies we can't check yet (Figma
// 2862:12544): the compact info Banner, no close X (it shows while any listed company is
// unsupported). With three or more, "N more" is an underlined link that opens the full list
// (`onShowAll`). Renders nothing for an empty list.
const UnsupportedCompaniesNotice = ({ names, onShowAll, className }) => {
  if (names.length === 0) return null;
  const { before, link, after } = unsupportedNoticeParts(names);
  return (
    <Banner size="compact" variant="info" className={className}>
      {before}
      {link && (
        <button type="button" onClick={onShowAll} className="border-none bg-transparent p-0 text-inherit underline">
          {link}
        </button>
      )}
      {after}
    </Banner>
  );
};

UnsupportedCompaniesNotice.propTypes = {
  /** Names of every unsupported company, in list order; the banner names the first two */
  names: PropTypes.arrayOf(PropTypes.string).isRequired,
  /** Opens the list of all of them (the "N more" link) */
  onShowAll: PropTypes.func,
  className: PropTypes.string,
};

export default UnsupportedCompaniesNotice;
