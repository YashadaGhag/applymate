import { useState } from "react";
import SecondaryTabBar from "./SecondaryTabBar";

export default {
  title: "Design System/SecondaryTabBar",
  component: SecondaryTabBar,
};

const Template = (args) => {
  const [activeKey, setActiveKey] = useState(args.activeKey);
  return <SecondaryTabBar {...args} activeKey={activeKey} onChange={setActiveKey} />;
};

export const Default = {
  render: Template,
  args: {
    tabs: [
      { key: "resume", label: "Resume" },
      { key: "cover-letter", label: "Cover Letter" },
    ],
    activeKey: "resume",
  },
};

export const WithDisabledTab = {
  render: Template,
  args: {
    tabs: [
      { key: "resume", label: "Resume" },
      { key: "cover-letter", label: "Cover Letter", disabled: true },
    ],
    activeKey: "resume",
  },
};
