import Footer from "./Footer";

export default {
  title: "Design System/Footer",
  component: Footer,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Site footer. No legal/marketing link columns — just the logo + description and a single \"Open Source\" column (About, GitHub).\n\n" +
          "**Desktop (md:768px+):** Logo + description left, \"Open Source\" column right, copyright below.\n\n" +
          "**Mobile (<768px):** Same sections stacked vertically — logo + description, then \"Open Source\" links, then copyright.",
      },
    },
  },
  argTypes: {
    links: {
      control: "object",
      description:
        "Array of { label, href } link objects for the \"Open Source\" column. Default: About, GitHub.",
    },
  },
};

export const Default = {};

export const Desktop = {
  parameters: {
    docs: {
      description: {
        story:
          "Desktop variant: logo + description left, \"Open Source\" column (About, GitHub) right, copyright below. Responsive padding: `px-sp40 xl:px-sp80`.",
      },
    },
  },
};

export const Mobile = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    docs: {
      description: {
        story: "Mobile variant: logo + description, \"Open Source\" links, and copyright stacked vertically.",
      },
    },
  },
};

export const Onboarding = {
  args: {
    variant: "onboarding",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Onboarding variant: single row (52px height) with copyright left, Privacy Policy + Terms of Service right. Top border, no Open Source column.",
      },
    },
  },
};

export const WithPageContent = {
  render: (args) => (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      <main className="mx-auto max-w-[1280px] flex-1 px-sp16 py-sp64 md:px-sp40 xl:px-sp80">
        <h1 className="text-h2 font-bold text-neutral-900 mb-sp16">Page Content</h1>
        <p className="text-body-large text-neutral-500 max-w-[600px]">
          Sample content above the footer to show context.
        </p>
      </main>
      <Footer {...args} />
    </div>
  ),
};
