// Work authorization choices, shared by the Role page, the Details dialogs and the server's profile checks.

export const WORK_AUTH_OPTIONS = [
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
