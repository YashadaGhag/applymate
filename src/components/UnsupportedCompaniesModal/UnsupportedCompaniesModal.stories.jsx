import UnsupportedCompaniesModal from "./UnsupportedCompaniesModal";

export default {
  title: "Components/Unsupported Companies Modal",
  component: UnsupportedCompaniesModal,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Change Preferences > Company Watchlist: the list opened from the banner's 'N more' link (Figma 2908:12462)." } },
  },
  args: { isOpen: true, onRemove: () => {}, onClose: () => {} },
};

const company = (id, name, domain) => ({ id, name, domain });

export const Default = {
  args: {
    companies: [
      company("a", "Acme Robotics", "acmerobotics.com"),
      company("b", "Northwind Labs", "northwind.dev"),
      company("c", "Globex", "globex.com"),
      company("d", "Initech", null),
    ],
  },
};
