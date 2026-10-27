import UnsupportedCompaniesNotice from "./UnsupportedCompaniesNotice";

export default {
  title: "Components/Unsupported Companies Notice",
  component: UnsupportedCompaniesNotice,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Change Preferences > Company Watchlist: the notice for companies we can't check yet. Figma 'Change Preferences - company watchlist - Unsupported notice'. One, two, and three or more companies.",
      },
    },
  },
};

export const OneCompany = { args: { names: ["Acme Robotics"] } };
export const TwoCompanies = { args: { names: ["Acme Robotics", "Northwind Labs"] } };
export const ThreeOrMore = { args: { names: ["Acme Robotics", "Northwind Labs", "Globex", "Initech"] } };
