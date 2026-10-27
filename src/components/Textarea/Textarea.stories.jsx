import { useState } from "react";
import Textarea from "./Textarea";

export default {
  title: "Design System/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Multi-line text input with label, placeholder and helper text. Figma states: Default, Selected (focus), Filled and Disabled. Resizes vertically.",
      },
    },
  },
  args: {
    label: "Your message",
    placeholder: "Type your message here",
    helpText: "Your message will be copied to the support team.",
  },
  decorators: [(Story) => <div className="w-[281px]"><Story /></div>],
};

export const Default = {};

export const Filled = { args: { defaultValue: "Type your message here" } };

export const Disabled = { args: { disabled: true } };

export const Error = { args: { error: true, helpText: "Something's wrong with this text." } };

// Controlled, with a character count as helper text (Change Preferences > Describe your tone).
export const WithCharacterCount = {
  render: (args) => {
    const [value, setValue] = useState("");
    return (
      <Textarea
        {...args}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={1000}
        helpText={`${value.length}/1,000 characters`}
      />
    );
  },
  args: { label: "Describe your tone", placeholder: "e.g. Direct and concise." },
};
