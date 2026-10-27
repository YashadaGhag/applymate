import { useState } from "react";
import Tabs from "./Tabs";

export default {
  title: "Design System/Tabs",
  component: Tabs,
};

const TABS = [
  { key: "watchlist", label: "Watchlist (8)", showIndicator: true },
  { key: "others", label: "Others (30)" },
];

const Template = (args) => {
  const [activeKey, setActiveKey] = useState(args.activeKey);
  return <Tabs {...args} activeKey={activeKey} onChange={setActiveKey} />;
};

export const Default = {
  render: Template,
  args: { tabs: TABS, activeKey: "watchlist" },
};

export const OthersActive = {
  render: Template,
  args: { tabs: TABS, activeKey: "others" },
};
