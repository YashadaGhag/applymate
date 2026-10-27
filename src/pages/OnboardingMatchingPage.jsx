import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import DotsLoader from "../components/DotsLoader";

const MATCHING_DURATION_MS = 2500;

export default function OnboardingMatchingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => {
      navigate("/watchlist", { replace: true });
    }, MATCHING_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar variant="onboarding" />

      <main className="flex flex-1 items-center justify-center px-sp16">
        <DotsLoader label="Finding your matches" />
      </main>
    </div>
  );
}
