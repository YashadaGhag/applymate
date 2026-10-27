import PropTypes from "prop-types";
import MainNav from "../MainNav/MainNav";

// Shell for every page with the main nav. Content is capped at
// max-w-content and centered in the space right of the nav; when that space is
// narrower, the side gutters (sp40, sp16 below md where the nav is a top bar) remain.
// Vertical 28px padding is carried over from the previous per-page wrappers.
// titleOffset puts 40 above the content instead of the default top padding (Job Recommendations, Application
// Tracker, Saved Jobs: the space above the page title). centerContent centers the children both ways in the content area (used for full-page loaders).
const MainLayout = ({ activeItem, centerContent = false, titleOffset = false, children }) => (
  <div className="flex flex-col md:flex-row min-h-screen bg-white">
    <MainNav activeItem={activeItem} />

    <div className="flex-1 flex flex-col md:min-h-screen min-w-0 px-sp16 md:px-sp40">
      <div className="flex-1 flex flex-col w-full max-w-content mx-auto">
        <main
          className={`flex-1 ${titleOffset ? "pt-sp40 pb-sp16 md:pb-[28px]" : "py-sp16 md:py-[28px]"} ${centerContent ? "flex flex-col items-center justify-center" : ""}`}
        >
          {children}
        </main>
      </div>
    </div>
  </div>
);

MainLayout.propTypes = {
  activeItem: PropTypes.oneOf(["recommendations", "tracker", "saved", "preferences"]),
  centerContent: PropTypes.bool,
  /** 40 above the content (the page title) instead of the default top padding */
  titleOffset: PropTypes.bool,
  children: PropTypes.node,
};

export default MainLayout;
