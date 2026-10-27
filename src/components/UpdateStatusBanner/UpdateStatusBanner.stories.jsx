import UpdateStatusBanner from "./UpdateStatusBanner";

export default {
  title: "Components/Update Status Banner",
  component: UpdateStatusBanner,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Job Recommendations banners for the daily background update. Figma: running 2845:9862, failed 2846:13152. No button, no progress.",
      },
    },
  },
};

export const Banners = {
  render: () => (
    <div className="flex flex-col gap-sp24">
      <UpdateStatusBanner state="running" />
      <UpdateStatusBanner state="failed" onDismiss={() => {}} />
    </div>
  ),
};
