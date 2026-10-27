import WatchlistEmptyState from "./WatchlistEmptyState";

export default {
  title: "Design System/Watchlist Empty State",
  component: WatchlistEmptyState,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    variant: { control: "select", options: ["zeroCompanies", "noMatches"] },
    onAction: { action: "button clicked" },
  },
};

/** The watchlist has no companies (Figma 2380:15136). */
export const ZeroCompanies = { args: { variant: "zeroCompanies" } };

/** Companies added, but no role passes (Figma 2698:7922). */
export const NoMatches = { args: { variant: "noMatches" } };
