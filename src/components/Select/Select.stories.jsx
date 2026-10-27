import { useState } from "react";
import Select from "./Select";

const WORK_AUTH_OPTIONS = [
  {
    group: "I do not require work sponsorship",
    items: [
      "U.S. citizen",
      "Green card holder",
      "Employment Authorization Document (H4 EAD/L2 EAD)",
    ],
  },
  {
    group: "I require work sponsorship (Now or in the Future)",
    items: [
      "F-1 (OPT/STEM OPT)",
      "H-1B (Transfer/Extension)",
      "TN/E-3/H-1B1",
      "Other Visa Sponsorship Needed",
    ],
  },
];

const StatefulSelect = (args) => {
  const [value, setValue] = useState(args.value || null);
  return <Select {...args} value={value} onChange={setValue} />;
};

export default {
  title: "Design System/Select",
  component: Select,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Figma Select: body-small text, 16px chevrons (red in the error state). The open list follows Figma Select Options (Section Title): body-medium group title on a neutral-25 divider, body-small rows indented sp24, Background/Blue on hover.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 500 }}>
        <Story />
      </div>
    ),
  ],
};

export const Default = {
  render: () => (
    <StatefulSelect placeholder="Select status" options={WORK_AUTH_OPTIONS} />
  ),
};

export const Selected = {
  render: () => (
    <StatefulSelect
      value="U.S. citizen"
      placeholder="Select status"
      options={WORK_AUTH_OPTIONS}
    />
  ),
};

export const Error = {
  render: () => (
    <StatefulSelect
      placeholder="Select status"
      options={WORK_AUTH_OPTIONS}
      error
      errorMessage="Please select your work authorization status"
    />
  ),
};

export const GroupedOptions = {
  render: () => (
    <StatefulSelect placeholder="Select status" options={WORK_AUTH_OPTIONS} />
  ),
};
