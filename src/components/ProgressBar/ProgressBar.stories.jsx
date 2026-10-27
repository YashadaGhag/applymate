import ProgressBar from "./ProgressBar";

export default {
  title: "Design System/ProgressBar",
  component: ProgressBar,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    currentStep: { control: { type: "number", min: 1 } },
    completedSteps: { control: { type: "number", min: 0 } },
    totalSteps: { control: { type: "number", min: 1 } },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 400 }}>
        <Story />
      </div>
    ),
  ],
};

export const Step1of4 = {
  args: { currentStep: 1, completedSteps: 0, totalSteps: 4 },
};

export const Step2of4 = {
  args: { currentStep: 2, completedSteps: 1, totalSteps: 4 },
};

export const Step3of4 = {
  args: { currentStep: 3, completedSteps: 2, totalSteps: 4 },
};

export const Step4of4 = {
  args: { currentStep: 4, completedSteps: 3, totalSteps: 4 },
};

export const Step2With1Completed = {
  args: { currentStep: 2, completedSteps: 1, totalSteps: 4 },
};

export const AllCompleted = {
  args: { currentStep: 4, completedSteps: 4, totalSteps: 4 },
};

export const CustomSteps = {
  args: { currentStep: 2, completedSteps: 1, totalSteps: 6 },
};
