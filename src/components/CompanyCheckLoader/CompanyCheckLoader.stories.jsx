import CompanyCheckLoader from "./CompanyCheckLoader";

export default {
  title: "Components/Company Check Loader",
  component: CompanyCheckLoader,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "The onboarding loader after Save. Figma 'Loading after Save': Checking companies 2862:14179, Taking longer 2862:14187, Some companies not checked 2862:14194, Failed 2862:14205.",
      },
    },
  },
  args: { onViewJobs: () => {}, onContinue: () => {}, onRetry: () => {} },
};

export const Checking = {
  args: { loader: { kind: "checking", rolesFound: 9, companiesWithRoles: 4, total: 8, checked: 8, notChecked: [] } },
};

export const CheckingBeforeAnyRole = {
  args: { loader: { kind: "checking", rolesFound: 0, companiesWithRoles: 0, total: 8, checked: 8, notChecked: [] } },
};

export const TakingLonger = {
  args: { loader: { kind: "longer", rolesFound: 9, companiesWithRoles: 4, total: 8, checked: 8, notChecked: [] } },
};

export const SomeCompaniesNotChecked = {
  args: {
    loader: {
      kind: "partial",
      rolesFound: 14,
      companiesWithRoles: 5,
      total: 8,
      checked: 6,
      notChecked: [
        { id: "acme", name: "Acme Robotics" },
        { id: "northwind", name: "Northwind Labs" },
      ],
    },
  },
};

export const Failed = {
  args: { loader: { kind: "failed", rolesFound: 0, companiesWithRoles: 0, total: 3, checked: 0, notChecked: [] } },
};
