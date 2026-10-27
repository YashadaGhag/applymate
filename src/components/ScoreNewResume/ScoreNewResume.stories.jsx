import { useState } from "react";
import Button from "../Button/Button";
import { ScoreNewResumeBanner, ScoreNewResumeModal } from "./ScoreNewResume";

export default {
  title: "Components/Score New Resume",
  component: ScoreNewResumeBanner,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Banners and dialogs for scoring jobs with a new resume. Job Recommendations: banners 2766:2299 (ready), 2770:7883 (scoring), 2770:8447 (failed), 2770:8963 (done); dialogs 2765:7168, 2766:1621, 2774:10286. Resume tab: 2766:2869, 2774:10114, 2774:10199.",
      },
    },
  },
  argTypes: {
    onScoreNow: { action: "score now" },
    onTryAgain: { action: "try again" },
    onGoToJobs: { action: "go to job recommendations" },
  },
};

export const JobRecommendationsBanners = {
  name: "Banners: Job Recommendations",
  render: (args) => (
    <div className="flex flex-col gap-sp24">
      {["ready", "running", "failed", "done"].map((state) => (
        <ScoreNewResumeBanner key={state} {...args} place="jobs" state={state} />
      ))}
    </div>
  ),
};

export const ResumeTabBanners = {
  name: "Banners: Resume tab",
  render: (args) => (
    <div className="flex flex-col gap-sp24">
      {["ready", "running", "failed"].map((state) => (
        <ScoreNewResumeBanner key={state} {...args} place="resume" state={state} />
      ))}
    </div>
  ),
};

function ModalTrigger({ kind }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open {kind} dialog
      </Button>
      {open && <ScoreNewResumeModal kind={kind} onClose={() => setOpen(false)} onConfirm={() => setOpen(false)} />}
    </>
  );
}

export const Dialogs = {
  render: () => (
    <div className="flex gap-sp16">
      <ModalTrigger kind="ready" />
      <ModalTrigger kind="running" />
      <ModalTrigger kind="failed" />
    </div>
  ),
};
