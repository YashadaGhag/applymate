import { useState } from "react";
import MultiselectChips from "./MultiselectChips";

const ROLE_RECOMMENDATIONS = [
  "Product Designer",
  "UX Designer",
  "UI Designer",
];

const StatefulChips = (args) => {
  const [values, setValues] = useState(args.values || []);
  return <MultiselectChips {...args} values={values} onChange={setValues} />;
};

export default {
  title: "Design System/MultiselectChips",
  component: MultiselectChips,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Figma Multiselect chips: chips are Pill buttons in the Selected state (16px radius, clear icon); recommendations are Pill buttons. The type-ahead list uses the Select Options / menu item styling. Focus matches InputField: 1px neutral-700 outline sp4 outside the field. Typed text is always addable (Enter, comma, blur, or “Add …”).",
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

export const Empty = {
  render: () => (
    <StatefulChips values={[]} recommendations={ROLE_RECOMMENDATIONS} />
  ),
};

export const WithSelection = {
  render: () => (
    <StatefulChips
      values={["Senior Product Designer"]}
      recommendations={ROLE_RECOMMENDATIONS}
    />
  ),
};

export const MultipleSelections = {
  render: () => (
    <StatefulChips
      values={["Senior Product Designer", "UX Designer"]}
      recommendations={ROLE_RECOMMENDATIONS}
    />
  ),
};

export const MaxReached = {
  render: () => (
    <StatefulChips
      values={[
        "Senior Product Designer",
        "UX Designer",
        "UI Designer",
        "Visual Designer",
        "Interaction Designer",
      ]}
      maxSelections={5}
      recommendations={ROLE_RECOMMENDATIONS}
    />
  ),
};

export const LocationVariant = {
  render: () => (
    <StatefulChips
      values={["Seattle, Washington"]}
      recommendations={["San Francisco, CA", "New York, NY", "Austin, TX"]}
      placeholder="Type to add more"
    />
  ),
};

export const WithDropdown = {
  render: () => (
    <StatefulChips
      values={["Senior Product Designer"]}
      recommendations={ROLE_RECOMMENDATIONS}
      suggestions={[
        "Senior Product Designer",
        "Senior UX Designer",
        "Senior UI Designer",
        "Product Designer",
        "UX Designer",
        "UI Designer",
        "Visual Designer",
        "Interaction Designer",
        "Design Lead",
        "UX Researcher",
      ]}
      placeholder="Type to search roles"
    />
  ),
};

// The designation field: suggestions open on focus, before anything is typed (roles from the resume
// first, then the server's top titles), and are already matched to the text (filterSuggestions off).
export const DesignationSuggestions = {
  render: () => (
    <StatefulChips
      values={[]}
      showWhenEmpty
      filterSuggestions={false}
      suggestions={["Product Designer", "UX Designer", "Software Engineer", "Product Manager", "Account Executive"]}
      placeholder="Type to add more"
    />
  ),
};
