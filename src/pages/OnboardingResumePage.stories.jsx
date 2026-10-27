import { MemoryRouter } from "react-router-dom";
import OnboardingResumePage from "./OnboardingResumePage";
import { OnboardingProvider } from "../context/OnboardingContext";

export default {
  title: "Pages/OnboardingResumePage",
  component: OnboardingResumePage,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Resume upload screen for onboarding. Four states: Default, Error, Uploading, Uploaded.\n\n" +
          "- **Default:** Dropzone with upload icon, drag-and-drop or file picker\n" +
          "- **Error:** Red border, alert icon, error message below dropzone\n" +
          "- **Uploading:** Spinning loader while the resume is uploaded and read (POST /api/resume)\n" +
          "- **Uploaded:** Check icon, file name with delete action\n\n" +
          "Desktop only (1280px). No responsive breakpoints yet.",
      },
    },
  },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/onboarding"]}>
        <OnboardingProvider>
          <Story />
        </OnboardingProvider>
      </MemoryRouter>
    ),
  ],
};

export const Default = {
  name: "Default State",
  parameters: {
    docs: {
      description: {
        story:
          "Initial state with upload icon and drag-and-drop instructions. Clicking 'Find jobs' without uploading transitions to Error state.",
      },
    },
  },
};
