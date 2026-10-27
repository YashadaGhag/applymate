import MainNav from "./MainNav";

export default {
  title: "Design System/MainNav",
  component: MainNav,
  parameters: {
    layout: "fullscreen",
  },
};

export const Default = {
  args: { activeItem: "recommendations" },
};

export const ApplicationTracker = {
  args: { activeItem: "tracker" },
};

export const SavedJobs = {
  args: { activeItem: "saved" },
};

export const ChangePreferences = {
  args: { activeItem: "preferences" },
};

export const Mobile = {
  name: "Mobile (collapsed)",
  args: { activeItem: "recommendations" },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
};
