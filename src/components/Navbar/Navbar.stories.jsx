import Navbar from "./Navbar";

export default {
  title: "Design System/Navbar",
  component: Navbar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Top-level navigation bar. No marketing nav links, no sign-in — logo left, single \"Get started\" primary CTA right. Same layout at every breakpoint (no mobile hamburger/overlay, since there's nothing to hide behind one).\n\n" +
          "Responsive padding: `px-sp16 md:px-sp40 xl:px-sp80`. Vertical padding: `py-sp16`.",
      },
    },
  },
  argTypes: {
    onGetStarted: { action: "get-started clicked" },
  },
};

export const Default = {
  name: "Desktop",
  parameters: {
    docs: {
      description: {
        story: "Desktop variant: logo left, \"Get started\" primary CTA right.",
      },
    },
  },
};

export const Mobile = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    docs: {
      description: {
        story: "Mobile variant: same logo + \"Get started\" CTA layout, just narrower padding.",
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
          "Onboarding variant: logo only, no CTA. Same button drop shadow as the default variant (Figma Nav onboarding). Used on the onboarding flow pages.",
      },
    },
  },
};

export const WithPageContent = {
  parameters: {
    docs: {
      description: {
        story: "Navbar shown above sample page content to demonstrate shadow and spacing behavior.",
      },
    },
  },
  render: (args) => (
    <div className="min-h-screen bg-neutral-50">
      <Navbar {...args} />
      <main className="mx-auto max-w-[1280px] px-sp16 py-sp64 md:px-sp40 xl:px-sp80">
        <h1 className="text-h2 font-bold text-neutral-900 mb-sp16">
          Welcome to ApplyMate
        </h1>
        <p className="text-body-large text-neutral-500 max-w-[600px]">
          The smart way to track your job applications, prepare for interviews,
          and land your dream role faster.
        </p>
      </main>
    </div>
  ),
};
