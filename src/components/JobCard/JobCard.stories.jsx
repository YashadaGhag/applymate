import { MemoryRouter } from "react-router-dom";
import JobCard from "./JobCard";

export default {
  title: "Design System/JobCard",
  component: JobCard,
  // JobCard navigates to Job Details on title click, so it needs a router.
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
          "Figma Job card. Save and dismiss are Secondary icon-only buttons; saved fills the bookmark. Desktop shows the sponsorship tag beside Save; mobile gives it its own row. Band label, saved state and \"From the posting\" are code additions not in the Figma frame.",
      },
    },
  },
};

export const NorthwindCard = {
  args: {
    id: 1,
    title: "Senior Product Designer",
    company: "Northwind",
    companyDomain: "northwind.example",
    location: "San Francisco, CA (Hybrid)",
    postedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    postedAtKind: "posted",
    firstSeenAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    ai: {
      score: 94,
      band: "strong",
      reasoning:
        "Matches your 5+ years of experience in Fintech and proficiency in Figma. Strong alignment with your desire for hybrid roles in SF.",
      highlights: [
        "Lead design for core payment processing products.",
        "Collaborate with cross-functional engineering and PM teams.",
        "Establish design patterns for new merchant dashboard.",
      ],
    },
    compensation: { min: 160000, max: 210000, currency: "USD", isEstimate: true },
  },
};

export const BrightwaveCard = {
  args: {
    id: 2,
    title: "Lead UX Designer",
    company: "Brightwave",
    companyDomain: "brightwave.example",
    location: "Remote (US)",
    postedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    postedAtKind: "posted",
    firstSeenAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ai: {
      score: 90,
      reasoning:
        "Great fit for your design systems background. Missing explicit 3D modeling experience, but core UI/UX skills match 100%.",
      highlights: [
        "Define the future of collaborative design tools.",
        "Mentor mid-level designers and lead critiques.",
      ],
    },
    compensation: { min: 180000, max: 230000, currency: "USD", isEstimate: true },
  },
};

export const LowMatch = {
  args: {
    id: 13,
    title: "Product Designer",
    company: "Ledgerly",
    companyDomain: "ledgerly.example",
    location: "New York, NY (On-site)",
    postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    postedAtKind: "posted",
    firstSeenAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ai: {
      score: 62,
      band: "moderate",
      reasoning:
        "Some overlap in product design skills. Role requires blockchain domain expertise not reflected in your profile.",
      highlights: [
        "Design onboarding flows for crypto trading.",
        "Work with compliance team on regulatory UI.",
      ],
    },
    compensation: { min: 140000, max: 180000, currency: "USD", isEstimate: true },
  },
};

export const NotScoredYet = {
  name: "Not yet scored (ai: null)",
  args: {
    id: 13,
    title: "Product Designer",
    company: "Ledgerly",
    companyDomain: "ledgerly.example",
    location: "New York, NY (On-site)",
    postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    postedAtKind: "posted",
    firstSeenAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    ai: null,
    compensation: { min: 140000, max: 180000, currency: "USD", isEstimate: true },
  },
};

export const NoCompensation = {
  name: "No compensation data",
  args: {
    id: 15,
    title: "Product Designer",
    company: "Cloudcrate",
    companyDomain: "cloudcrate.example",
    location: "Remote (US)",
    postedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    postedAtKind: "posted",
    firstSeenAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    ai: {
      score: 72,
      reasoning:
        "Moderate match. File management domain is less aligned with your background, but your design process and systems thinking are valued.",
      highlights: [
        "Redesign the file sharing and permissions experience.",
        "Conduct competitive analysis and user interviews.",
      ],
    },
    compensation: null,
  },
};

export const Saved = {
  args: { ...NorthwindCard.args, id: 16, isSaved: true },
};

export const NoSponsorship = {
  name: "No visa sponsorship tag",
  args: { ...NorthwindCard.args, id: 17, flagNoSponsorship: true },
};

/** Inside a CompanyJobGroup: no company row; location follows the posted time. */
export const InsideGroup = {
  name: "Inside a company group (showCompany=false)",
  args: { ...BrightwaveCard.args, id: 18, showCompany: false, flagNoSponsorship: true },
};
