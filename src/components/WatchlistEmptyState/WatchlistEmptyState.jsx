import PropTypes from "prop-types";
import { Plus } from "lucide-react";
import Button from "../Button/Button";
import zeroCompaniesArt from "../../assets/watchlist-empty.svg";
import noMatchesArt from "../../assets/preferred-companies-no-recommendations.svg";

// Job Recommendations, Watchlist tab (Figma 2380:15136 and 2698:7922). One block, two variants:
// "zeroCompanies": the watchlist has no companies. "noMatches": it has companies, but none has a
// role that passes (no match, no job source, or below 50). Copy is Figma's.
const VARIANTS = {
  zeroCompanies: {
    art: zeroCompaniesArt,
    heading: "Your watchlist is empty!",
    description:
      "You haven't added any companies to your watchlist yet. Start adding your dream companies now to personalize your job search.",
    actionLabel: "Add companies",
  },
  noMatches: {
    art: noMatchesArt,
    heading: "No matching roles right now",
    description: "No roles from your watchlist match your profile right now.",
    actionLabel: "Add more companies",
  },
};

const WatchlistEmptyState = ({ variant = "zeroCompanies", onAction }) => {
  const { art, heading, description, actionLabel } = VARIANTS[variant];

  return (
    <div className="flex flex-col items-center gap-sp24">
      <div className="flex flex-col items-center">
        {/* The svg keeps its own 32px of space below the circle (160 x 169 with a 9px margin
            above it); -mt-sp8 takes up most of that top margin. */}
        <img src={art} alt="" className="-mt-sp8" />
        <h2 className="pb-sp8 text-center text-body-medium font-medium text-neutral-800">
          {heading}
        </h2>
        <p className="max-w-sm px-sp8 text-center text-body-medium font-regular text-neutral-500">
          {description}
        </p>
      </div>
      <Button variant="primary" iconPosition="left" icon={<Plus size={18} />} onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
};

WatchlistEmptyState.propTypes = {
  /** "zeroCompanies": nothing on the watchlist. "noMatches": companies, but no matching roles. */
  variant: PropTypes.oneOf(["zeroCompanies", "noMatches"]),
  /** Called by the button (both variants add companies). */
  onAction: PropTypes.func,
};

export default WatchlistEmptyState;
