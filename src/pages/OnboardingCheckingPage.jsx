import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import CompanyCheckLoader from "../components/CompanyCheckLoader";
import { useCompanyCheck } from "../hooks/useCompanyCheck";

// The loader after "Save watchlist & continue" on the onboarding watchlist (Figma "Loading after
// Save", four states). The background work (detect, scrape, score) was started by the save and keeps
// running whatever this page does; the page only reads its progress, and moves on to Job
// Recommendations by itself when there is nothing left to wait for. The person can always leave:
// the logo goes home, and Back returns to the watchlist. Change Preferences > Company Watchlist has
// no loader: its banners on Job Recommendations cover the wait.
export default function OnboardingCheckingPage() {
  const navigate = useNavigate();
  const { loader, retry } = useCompanyCheck();
  const goToJobs = () => navigate("/jobs", { replace: true });

  useEffect(() => {
    if (loader.kind === "done") navigate("/jobs", { replace: true });
  }, [loader.kind, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar variant="onboarding" />

      <main className="flex flex-1 items-center justify-center px-sp16">
        {loader.kind !== "done" && (
          <CompanyCheckLoader loader={loader} onViewJobs={goToJobs} onContinue={goToJobs} onRetry={retry} />
        )}
      </main>
    </div>
  );
}
