import Accordion from "./Accordion";

export default {
  title: "Design System/Accordion",
  component: Accordion,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    title: { control: "text" },
    subtitle: { control: "text" },
    defaultOpen: { control: "boolean" },
  },
};

export const Collapsed = {
  args: {
    title: "Why are you interested in working at Northwind?",
    defaultOpen: false,
    children: (
      <p className="text-body-medium font-regular text-neutral-500 m-0">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc erat est,
        lacinia at eleifend in, viverra hendrerit tellus. Fusce a lacinia felis.
      </p>
    ),
  },
};

export const Expanded = {
  args: {
    title: "What excites you most about working in AI today?",
    subtitle: "Answer based on your profile",
    defaultOpen: true,
    children: (
      <p className="text-body-medium font-regular text-neutral-500 m-0">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc erat est,
        lacinia at eleifend in, viverra hendrerit tellus. Fusce a lacinia felis.
        Etiam in nibh metus. In vel sem laoreet tellus blandit consequat at at
        dolor. Nunc eget placerat nunc.
      </p>
    ),
  },
};
