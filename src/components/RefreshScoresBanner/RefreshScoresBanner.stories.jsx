import RefreshScoresBanner from "./RefreshScoresBanner";

export default {
  title: "Components/Refresh Scores Banner",
  component: RefreshScoresBanner,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Job Recommendations banner after a Details edit left scores out of date. Figma 'Job Recommendations - Refresh after edit - Banner': warning, Refresh button, no dismiss X. Running and failed are not in Figma.",
      },
    },
  },
  args: { onRefresh: () => {} },
};

export const Ready = { args: { state: "ready" } };
export const Running = { args: { state: "running" } };
export const Failed = { args: { state: "failed" } };
