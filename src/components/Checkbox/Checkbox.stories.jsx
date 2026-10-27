import { useState } from "react";
import Checkbox from "./Checkbox";

export default {
  title: "Design System/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Figma Checkbox, Type=List. Hover shows a Primary halo; keyboard focus (Tab) turns the glyph Primary/500. Block and Help Text variants exist in Figma but aren't built yet.",
      },
    },
  },
  argTypes: {
    label: { control: "text" },
    checked: { control: "boolean" },
    onChange: { action: "changed" },
  },
};

export const Unchecked = {
  args: { label: "Remote", checked: false },
};

export const Checked = {
  args: { label: "Remote", checked: true },
};

export const CheckboxGroup = {
  render: () => {
    const [state, setState] = useState({
      remote: false,
      onsite: false,
      hybrid: false,
    });
    return (
      <div className="flex gap-sp24">
        <Checkbox
          label="Remote"
          checked={state.remote}
          onChange={() => setState((s) => ({ ...s, remote: !s.remote }))}
        />
        <Checkbox
          label="On-site"
          checked={state.onsite}
          onChange={() => setState((s) => ({ ...s, onsite: !s.onsite }))}
        />
        <Checkbox
          label="Hybrid"
          checked={state.hybrid}
          onChange={() => setState((s) => ({ ...s, hybrid: !s.hybrid }))}
        />
      </div>
    );
  },
};
