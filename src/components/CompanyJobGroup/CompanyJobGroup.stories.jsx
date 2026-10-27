import { MemoryRouter } from "react-router-dom";
import CompanyJobGroup from "./CompanyJobGroup";
import JobCard from "../JobCard/JobCard";

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

const job = (id, title, extra = {}) => ({
  id,
  title,
  company: "Brightwave",
  companyDomain: "brightwave.example",
  location: "Seattle, WA (Hybrid)",
  postedAt: hoursAgo(6),
  postedAtKind: "posted",
  firstSeenAt: hoursAgo(6),
  ai: {
    score: 90,
    band: "strong",
    reasoning:
      "Great fit for your design systems background. Missing explicit 3D modeling experience, but core UI/UX skills match.",
    highlights: [
      "Define the future of collaborative design tools.",
      "Mentor mid-level designers and lead critiques.",
    ],
  },
  compensation: { min: 180000, max: 230000, currency: "USD" },
  ...extra,
});

export default {
  title: "Design System/CompanyJobGroup",
  component: CompanyJobGroup,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Figma Job card group. Desktop: Card-blue panel with a 4px Primary/500 left rail, always open. Mobile (below 768px): accordion with a 4px top border, Primary/500 open and Primary/200 closed. Shows two jobs, then \"See all N jobs\". Location sits on each card, not in the company header.",
      },
    },
  },
};

export const ThreeJobs = {
  render: () => (
    <CompanyJobGroup company="Brightwave" companyDomain="brightwave.example">
      <JobCard {...job(1, "Lead UX Designer")} showCompany={false} />
      <JobCard {...job(2, "Senior UX Designer", { flagNoSponsorship: true })} showCompany={false} />
      <JobCard {...job(3, "Product Designer")} showCompany={false} />
    </CompanyJobGroup>
  ),
};

export const SingleJob = {
  render: () => (
    <CompanyJobGroup company="Northwind" companyDomain="northwind.example">
      <JobCard {...job(4, "Lead UX Designer", { company: "Northwind", companyDomain: "northwind.example" })} showCompany={false} />
    </CompanyJobGroup>
  ),
};
