import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Outlet, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import OnboardingResumePage from "./pages/OnboardingResumePage";
import OnboardingMatchingPage from "./pages/OnboardingMatchingPage";
import OnboardingCheckingPage from "./pages/OnboardingCheckingPage";
import OnboardingRolePage from "./pages/OnboardingRolePage";
import WatchlistPage from "./pages/WatchlistPage";
import JobRecommendationsPage from "./pages/JobRecommendationsPage";
import JobDetailPage from "./pages/JobDetailPage";
import ApplicationTrackerPage from "./pages/ApplicationTrackerPage";
import SavedJobsPage from "./pages/SavedJobsPage";
import ChangePreferencesPage from "./pages/ChangePreferencesPage";
import PrintDocumentPage from "./pages/PrintDocumentPage";
import { OnboardingProvider } from "./context/OnboardingContext";
import { WatchlistProvider } from "./context/WatchlistContext";
import { JobActionsProvider } from "./context/JobActionsContext";

// Loaded only when opened: it carries the resume editor (TipTap/ProseMirror), which would
// otherwise double the bundle every other page downloads.
const CustomizeApplicationPage = lazy(() => import("./pages/CustomizeApplicationPage"));

function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Outlet />
    </OnboardingProvider>
  );
}

// "/" sends a returning user (onboarding complete: a resume exists and Role answers were saved
// for it, see onboardingComplete in server/routes/state.js) straight to Job Recommendations.
// Checked on every visit, so finishing onboarding takes effect without a reload. Onboarding
// routes stay reachable directly. If the check fails, the landing page shows as before.
function RootRoute() {
  const [onboardingComplete, setOnboardingComplete] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/state")
      .then((res) => {
        if (!res.ok) throw new Error(`/api/state responded ${res.status}`);
        return res.json();
      })
      .then((state) => {
        if (!cancelled) setOnboardingComplete(Boolean(state.onboardingComplete));
      })
      .catch(() => {
        if (!cancelled) setOnboardingComplete(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (onboardingComplete === null) return null;
  return onboardingComplete ? <Navigate to="/jobs" replace /> : <LandingPage />;
}

function App() {
  return (
    <WatchlistProvider>
      <JobActionsProvider>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route element={<OnboardingLayout />}>
            <Route path="/onboarding" element={<OnboardingResumePage />} />
            <Route path="/onboarding/matching" element={<OnboardingMatchingPage />} />
            <Route path="/onboarding/checking" element={<OnboardingCheckingPage />} />
            <Route path="/onboarding/role" element={<OnboardingRolePage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
          </Route>
          <Route path="/jobs" element={<JobRecommendationsPage />} />
          <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          <Route
            path="/jobs/:jobId/customize"
            element={
              <Suspense fallback={null}>
                <CustomizeApplicationPage />
              </Suspense>
            }
          />
          <Route path="/tracker" element={<ApplicationTrackerPage />} />
          <Route path="/saved" element={<SavedJobsPage />} />
          <Route path="/preferences" element={<ChangePreferencesPage />} />
          {/* Opened by the server's headless browser to make a PDF; not linked from the app. */}
          <Route path="/print/:jobId/:tab" element={<PrintDocumentPage />} />
        </Routes>
      </JobActionsProvider>
    </WatchlistProvider>
  );
}

export default App;
