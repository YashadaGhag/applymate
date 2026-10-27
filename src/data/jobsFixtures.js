/**
 * Mock job postings for local development. Shape mirrors what a future
 * /api/jobs endpoint is expected to return — see useJobs() in
 * src/hooks/useJobs.js, which is the only place this file should be
 * imported from the Job Recommendations page.
 *
 * Watchlist membership is NOT stored on the job — it's derived at read
 * time by matching job.company.domain against WatchlistContext.
 * Saved/dismissed state is also kept off the job, in page-level state
 * keyed by job id.
 */

const NOW = Date.now();
const hoursAgo = (h) => new Date(NOW - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

const WORK_MODE = {
  Hybrid: "hybrid",
  Remote: "remote",
  "On-site": "onsite",
};

export const jobsFixtures = [
  {
    id: 1,
    source: "greenhouse",
    company: { name: "Northwind", domain: "northwind.example" },
    title: "Senior Product Designer",
    location: "San Francisco, CA (Hybrid)",
    workMode: WORK_MODE.Hybrid,
    postedAt: hoursAgo(5),
    postedAtKind: "posted",
    firstSeenAt: hoursAgo(5),
    closed: false,
    applyUrl: "https://boards.greenhouse.io/northwind/jobs/senior-product-designer",
    descriptionText:
      "Northwind is hiring a Senior Product Designer to lead design for core payment processing products, partnering closely with engineering and PM.",
    compensation: { min: 160000, max: 210000, currency: "USD", isEstimate: true },
    ai: {
      score: 94,
      reasoning:
        "Matches your 5+ years of experience in Fintech and proficiency in Figma. Strong alignment with your desire for hybrid roles in SF.",
      highlights: [
        "Lead design for core payment processing products.",
        "Collaborate with cross-functional engineering and PM teams.",
        "Establish design patterns for new merchant dashboard.",
      ],
    },
    referralCount: 2,
    referralText: "connections work here",
  },
  {
    id: 2,
    source: "greenhouse",
    company: { name: "Brightwave", domain: "brightwave.example" },
    title: "Lead UX Designer",
    location: "Remote (US)",
    workMode: WORK_MODE.Remote,
    postedAt: daysAgo(1),
    postedAtKind: "posted",
    firstSeenAt: daysAgo(1),
    closed: false,
    applyUrl: "https://boards.greenhouse.io/brightwave/jobs/lead-ux-designer",
    descriptionText:
      "Brightwave is looking for a Lead UX Designer to define the future of collaborative design tools and mentor mid-level designers.",
    compensation: { min: 180000, max: 230000, currency: "USD", isEstimate: true },
    ai: {
      score: 90,
      reasoning:
        "Great fit for your design systems background. Missing explicit 3D modeling experience, but core UI/UX skills match 100%.",
      highlights: [
        "Define the future of collaborative design tools.",
        "Mentor mid-level designers and lead critiques.",
      ],
    },
    referralCount: 1,
    referralText: "connection works here",
  },
  {
    id: 3,
    source: "lever",
    company: { name: "Harborline", domain: "harborline.example" },
    title: "Staff Product Designer",
    location: "San Francisco, CA (Hybrid)",
    workMode: WORK_MODE.Hybrid,
    postedAt: hoursAgo(2),
    postedAtKind: "posted",
    firstSeenAt: hoursAgo(2),
    closed: false,
    applyUrl: "https://jobs.lever.co/harborline/staff-product-designer",
    descriptionText:
      "Harborline is hiring a Staff Product Designer to lead end-to-end design for the guest booking experience.",
    compensation: { min: 190000, max: 250000, currency: "USD", isEstimate: true },
    ai: {
      score: 96,
      reasoning:
        "Exceptional match with your experience in consumer products and design systems. Your portfolio aligns perfectly with their guest experience team.",
      highlights: [
        "Lead end-to-end design for the guest booking experience.",
        "Partner with data science to drive experimentation.",
        "Define design quality standards across the platform.",
      ],
    },
    referralCount: 3,
    referralText: "connections work here",
  },
  {
    id: 4,
    source: "greenhouse",
    company: { name: "Meridian", domain: "meridian.example" },
    title: "Senior Product Designer",
    location: "Seattle, WA (On-site)",
    workMode: WORK_MODE["On-site"],
    postedAt: daysAgo(2),
    postedAtKind: "posted",
    firstSeenAt: daysAgo(2),
    closed: false,
    applyUrl: "https://boards.greenhouse.io/meridian/jobs/senior-product-designer",
    descriptionText:
      "Meridian Cloud is hiring a Senior Product Designer to design console experiences for enterprise customers.",
    compensation: { min: 170000, max: 240000, currency: "USD", isEstimate: true },
    ai: {
      score: 88,
      reasoning:
        "Strong alignment with your UX research skills. Role requires experience with enterprise products which partially matches your background.",
      highlights: [
        "Design for Meridian Cloud Platform console.",
        "Conduct user research with enterprise customers.",
      ],
    },
    referralCount: 2,
    referralText: "connections work here",
  },
  {
    id: 5,
    source: "lever",
    company: { name: "Tunedeck", domain: "tunedeck.example" },
    title: "Design Lead",
    location: "New York, NY (Hybrid)",
    workMode: WORK_MODE.Hybrid,
    postedAt: hoursAgo(12),
    postedAtKind: "posted",
    firstSeenAt: hoursAgo(12),
    closed: false,
    applyUrl: "https://jobs.lever.co/tunedeck/design-lead",
    descriptionText:
      "Tunedeck is hiring a Design Lead to lead a team of designers on the premium subscriber experience.",
    compensation: { min: 175000, max: 220000, currency: "USD", isEstimate: true },
    ai: {
      score: 85,
      reasoning:
        "Your leadership experience and consumer product background are a strong fit. Music/entertainment domain is new but transferable.",
      highlights: [
        "Lead a team of 4 designers on the premium experience.",
        "Drive design strategy for subscriber growth.",
        "Collaborate with audio engineering on playback UX.",
      ],
    },
    referralCount: 1,
    referralText: "connection works here",
  },
  {
    id: 6,
    source: "ashby",
    company: { name: "Paperplane", domain: "paperplane.example" },
    title: "Product Designer",
    location: "Remote (US)",
    workMode: WORK_MODE.Remote,
    postedAt: hoursAgo(3),
    postedAtKind: "posted",
    firstSeenAt: hoursAgo(3),
    closed: false,
    applyUrl: "https://jobs.ashbyhq.com/paperplane/product-designer",
    descriptionText:
      "Paperplane is hiring a Product Designer to design new collaborative features for team workspaces.",
    compensation: { min: 155000, max: 200000, currency: "USD", isEstimate: true },
    ai: {
      score: 92,
      reasoning:
        "Excellent match for your productivity tool experience and design systems expertise. Your collaborative design approach fits their culture.",
      highlights: [
        "Design new collaborative features for team workspaces.",
        "Improve onboarding flows for new users.",
      ],
    },
    referralCount: 0,
    referralText: "",
  },
  {
    id: 7,
    source: "greenhouse",
    company: { name: "Streamlight", domain: "streamlight.example" },
    title: "Senior Product Designer",
    location: "Los Angeles, CA (Hybrid)",
    workMode: WORK_MODE.Hybrid,
    postedAt: daysAgo(1),
    postedAtKind: "posted",
    firstSeenAt: daysAgo(1),
    closed: false,
    applyUrl: "https://boards.greenhouse.io/streamlight/jobs/senior-product-designer",
    descriptionText:
      "Streamlight is hiring a Senior Product Designer to design personalization and discovery experiences.",
    compensation: { min: 185000, max: 260000, currency: "USD", isEstimate: true },
    ai: {
      score: 82,
      reasoning:
        "Good fit for your consumer product skills. Entertainment domain experience would strengthen the match, but core design skills transfer well.",
      highlights: [
        "Design personalization and discovery experiences.",
        "Work with machine learning teams on recommendation UI.",
        "Prototype interactive content experiences.",
      ],
    },
    referralCount: 0,
    referralText: "",
  },
  {
    id: 8,
    source: "lever",
    company: { name: "Square", domain: "squareup.com" },
    title: "Staff Designer",
    location: "San Francisco, CA (On-site)",
    workMode: WORK_MODE["On-site"],
    postedAt: hoursAgo(6),
    postedAtKind: "posted",
    firstSeenAt: hoursAgo(6),
    closed: false,
    applyUrl: "https://jobs.lever.co/square/staff-designer",
    descriptionText:
      "Square is hiring a Staff Designer to design merchant onboarding and the payment dashboard.",
    compensation: { min: 165000, max: 215000, currency: "USD", isEstimate: true },
    ai: {
      score: 91,
      reasoning:
        "Your Fintech experience is directly applicable. Strong match with their merchant tools team and design system needs.",
      highlights: [
        "Design merchant onboarding and payment dashboard.",
        "Build and maintain the design system.",
      ],
    },
    referralCount: 2,
    referralText: "connections work here",
  },
  {
    id: 9,
    source: "ashby",
    company: { name: "Linear", domain: "linear.app" },
    // Fixture case: a very long title, to confirm it wraps instead of breaking layout.
    title: "Senior Staff Product Designer, Platform Design Systems & Developer Experience",
    location: "Remote (Global)",
    workMode: WORK_MODE.Remote,
    postedAt: daysAgo(4),
    postedAtKind: "posted",
    firstSeenAt: daysAgo(4),
    closed: false,
    applyUrl: "https://jobs.ashbyhq.com/linear/product-designer",
    descriptionText:
      "Linear is hiring a designer to own design for project management workflows and shape the product roadmap.",
    compensation: { min: 150000, max: 195000, currency: "USD", isEstimate: true },
    ai: {
      score: 87,
      reasoning:
        "Your productivity tool background and attention to interaction design make you a great candidate. Smaller team means high impact.",
      highlights: [
        "Own design for project management workflows.",
        "Design keyboard-first interaction patterns.",
        "Shape the product roadmap with the founding team.",
      ],
    },
    referralCount: 1,
    referralText: "connection works here",
  },
  {
    id: 10,
    source: "greenhouse",
    company: { name: "Ironbridge", domain: "ironbridge.example" },
    title: "Senior UX Designer",
    location: "Seattle, WA (Hybrid)",
    workMode: WORK_MODE.Hybrid,
    postedAt: daysAgo(5),
    postedAtKind: "posted",
    firstSeenAt: daysAgo(5),
    closed: false,
    applyUrl: "https://boards.greenhouse.io/ironbridge/jobs/senior-ux-designer",
    descriptionText:
      "Ironbridge is hiring a Senior UX Designer to design accessible experiences for Ironbridge Office.",
    compensation: { min: 155000, max: 220000, currency: "USD", isEstimate: true },
    ai: {
      score: 78,
      reasoning:
        "Partial match — enterprise design experience is beneficial but the role requires accessibility specialization you haven't highlighted.",
      highlights: [
        "Design accessible experiences for Ironbridge Office.",
        "Collaborate with the Fluent design system team.",
      ],
    },
    referralCount: 3,
    referralText: "connections work here",
  },
  {
    id: 11,
    source: "lever",
    company: { name: "Vercel", domain: "vercel.com" },
    title: "Design Lead",
    location: "Remote (US)",
    workMode: WORK_MODE.Remote,
    postedAt: hoursAgo(8),
    postedAtKind: "posted",
    firstSeenAt: hoursAgo(8),
    closed: false,
    applyUrl: "https://jobs.lever.co/vercel/design-lead",
    descriptionText:
      "Vercel is hiring a Design Lead to lead design for the Vercel dashboard and deployment flows.",
    compensation: { min: 170000, max: 225000, currency: "USD", isEstimate: true },
    ai: {
      score: 89,
      reasoning:
        "Strong match with your developer tool design experience. Your design systems work aligns well with their component-driven approach.",
      highlights: [
        "Lead design for the Vercel dashboard and deployment flows.",
        "Design developer experience for Next.js tooling.",
        "Build the design team from 3 to 6 designers.",
      ],
    },
    referralCount: 0,
    referralText: "",
  },
  {
    id: 12,
    source: "greenhouse",
    company: { name: "Cartwheel", domain: "cartwheel.example" },
    title: "Senior Product Designer",
    location: "Austin, TX (Hybrid)",
    workMode: WORK_MODE.Hybrid,
    postedAt: daysAgo(2),
    postedAtKind: "posted",
    firstSeenAt: daysAgo(2),
    closed: false,
    applyUrl: "https://boards.greenhouse.io/cartwheel/jobs/senior-product-designer",
    descriptionText:
      "Cartwheel is hiring a Senior Product Designer to design mobile shopping experiences for merchants.",
    compensation: { min: 145000, max: 195000, currency: "USD", isEstimate: true },
    ai: {
      score: 83,
      reasoning:
        "Your e-commerce adjacent experience is relevant. The role emphasizes mobile-first design which matches your recent work.",
      highlights: [
        "Design mobile shopping experiences for merchants.",
        "Improve checkout conversion through A/B testing.",
      ],
    },
    referralCount: 1,
    referralText: "connection works here",
  },
  {
    id: 13,
    source: "remotive",
    company: { name: "Ledgerly", domain: "ledgerly.example" },
    title: "Product Designer",
    location: "New York, NY (On-site)",
    workMode: WORK_MODE["On-site"],
    postedAt: daysAgo(3),
    postedAtKind: "posted",
    firstSeenAt: daysAgo(3),
    closed: false,
    applyUrl: "https://remotive.com/remote-jobs/ledgerly-product-designer",
    descriptionText:
      "Ledgerly is hiring a Product Designer to design onboarding flows for crypto trading.",
    compensation: { min: 140000, max: 180000, currency: "USD", isEstimate: true },
    // Fixture case: not scored yet — no match score, reasoning, or role highlights block.
    ai: null,
    referralCount: 0,
    referralText: "",
  },
  {
    id: 14,
    source: "greenhouse",
    company: { name: "Chatterbox", domain: "chatterbox.example" },
    title: "Senior Product Designer",
    location: "San Francisco, CA (Hybrid)",
    workMode: WORK_MODE.Hybrid,
    postedAt: daysAgo(1),
    postedAtKind: "posted",
    firstSeenAt: daysAgo(1),
    closed: false,
    applyUrl: "https://boards.greenhouse.io/chatterbox/jobs/senior-product-designer",
    descriptionText:
      "Chatterbox is hiring a Senior Product Designer to design features for Chatterbox's enterprise platform.",
    compensation: { min: 160000, max: 210000, currency: "USD", isEstimate: true },
    ai: {
      score: 86,
      reasoning:
        "Your collaboration tool experience transfers directly. Strong cultural fit with their design-led product approach.",
      highlights: [
        "Design features for Chatterbox's enterprise platform.",
        "Improve real-time collaboration and messaging UX.",
        "Partner with the Chatterbox AI team on intelligent features.",
      ],
    },
    referralCount: 2,
    referralText: "connections work here",
  },
  {
    id: 15,
    source: "other",
    company: { name: "Cloudcrate", domain: "cloudcrate.example" },
    title: "Product Designer",
    location: "Remote (US)",
    workMode: WORK_MODE.Remote,
    postedAt: daysAgo(7),
    postedAtKind: "posted",
    firstSeenAt: daysAgo(7),
    closed: false,
    applyUrl: "https://www.cloudcrate.example/jobs/listing/product-designer",
    descriptionText:
      "Cloudcrate is hiring a Product Designer to redesign the file sharing and permissions experience.",
    // Fixture case: no compensation data available for this posting.
    compensation: null,
    ai: {
      score: 72,
      reasoning:
        "Moderate match. File management domain is less aligned with your background, but your design process and systems thinking are valued.",
      highlights: [
        "Redesign the file sharing and permissions experience.",
        "Conduct competitive analysis and user interviews.",
      ],
    },
    referralCount: 0,
    referralText: "",
  },
  {
    id: 16,
    source: "greenhouse",
    company: { name: "Northwind", domain: "northwind.example" },
    title: "Lead Product Designer",
    location: "San Francisco, CA (Hybrid)",
    workMode: WORK_MODE.Hybrid,
    postedAt: daysAgo(2),
    postedAtKind: "posted",
    firstSeenAt: daysAgo(2),
    closed: false,
    applyUrl: "https://boards.greenhouse.io/northwind/jobs/lead-product-designer",
    descriptionText:
      "Northwind is hiring a Lead Product Designer to lead design for the Northwind billing platform.",
    compensation: { min: 180000, max: 235000, currency: "USD", isEstimate: true },
    ai: {
      score: 90,
      reasoning:
        "Strong match with your fintech and design systems background. Your cross-functional leadership experience fits this role's scope well.",
      highlights: [
        "Lead design for the Northwind billing platform.",
        "Partner with engineering on a new invoicing experience.",
      ],
    },
    referralCount: 1,
    referralText: "connection works here",
  },
  {
    id: 17,
    // Fixture case: a company (Northwind) with several open jobs, to exercise the
    // Watchlist tab's company grouping with 3 stacked cards.
    source: "greenhouse",
    company: { name: "Northwind", domain: "northwind.example" },
    title: "Staff Product Designer, Billing",
    location: "San Francisco, CA (Hybrid)",
    workMode: WORK_MODE.Hybrid,
    postedAt: hoursAgo(20),
    postedAtKind: "posted",
    firstSeenAt: hoursAgo(20),
    closed: false,
    applyUrl: "https://boards.greenhouse.io/northwind/jobs/staff-product-designer-billing",
    descriptionText:
      "Northwind is hiring a Staff Product Designer to lead design for the billing and invoicing product line.",
    compensation: { min: 185000, max: 240000, currency: "USD", isEstimate: true },
    ai: {
      score: 93,
      reasoning:
        "Your fintech background and design systems expertise are a strong match for this staff-level billing design role.",
      highlights: [
        "Lead design for the billing and invoicing product line.",
        "Partner with finance and compliance stakeholders.",
      ],
    },
    referralCount: 0,
    referralText: "",
  },
];
