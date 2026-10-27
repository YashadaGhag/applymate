import Callout from "./Callout";

export default {
  title: "Design System/Callout",
  component: Callout,
  parameters: {
    layout: "centered",
  },
};

export const Default = {
  args: {
    text: "Customizing resume for each application increases the chances of selection.",
    pointerPosition: "right",
  },
};

export const PointerLeft = {
  args: {
    text: "Customizing resume for each application increases the chances of selection.",
    pointerPosition: "left",
  },
};

export const PointerTop = {
  args: {
    text: "Customizing resume for each application increases the chances of selection.",
    pointerPosition: "top",
  },
};

export const PointerBottom = {
  args: {
    text: "Customizing resume for each application increases the chances of selection.",
    pointerPosition: "bottom",
  },
};

export const CustomAction = {
  args: {
    text: "You can save jobs to review them later and track your application progress.",
    actionText: "Next",
    pointerPosition: "right",
  },
};
