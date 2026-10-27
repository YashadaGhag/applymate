import { useState } from "react";
import SearchBar from "./SearchBar";

export default {
  title: "Design System/SearchBar",
  component: SearchBar,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Figma Search (Design System 639:2418): body-small text, 16px icons, 8px radius. Hover fills the box with the neutral card surface; focus is a 1px neutral-700 outline sp4 outside the box. Optional 18px left search icon (`showLeftIcon`). The clear (×) icon replaces the search icon when there's a value and `onClear` is passed. Forwards its ref to the input and accepts `onKeyDown`.",
      },
    },
  },
  argTypes: {
    placeholder: { control: "text" },
    value: { control: "text" },
    disabled: { control: "boolean" },
    showLeftIcon: { control: "boolean" },
    onChange: { action: "changed" },
  },
};

export const Default = {
  args: {
    placeholder: "Search applications...",
  },
  render: (args) => {
    const [value, setValue] = useState("");
    return (
      <div className="w-[400px]">
        <SearchBar
          {...args}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    );
  },
};

export const WithValue = {
  args: {
    placeholder: "Search applications...",
  },
  render: () => {
    const [value, setValue] = useState("Product Designer");
    return (
      <div className="w-[400px]">
        <SearchBar
          placeholder="Search applications..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClear={() => setValue("")}
        />
      </div>
    );
  },
};

export const WithLeftIcon = {
  render: () => (
    <div className="w-[400px]">
      <SearchBar placeholder="Search Company or Job Title..." showLeftIcon />
    </div>
  ),
};

export const Disabled = {
  render: () => (
    <div className="w-[400px]">
      <SearchBar placeholder="Search Company or Job Title..." disabled />
    </div>
  ),
};
