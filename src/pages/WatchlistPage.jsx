import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase, CircleAlert } from "lucide-react";
import Navbar from "../components/Navbar";
import Button from "../components/Button";
import WatchlistEditor from "../components/WatchlistEditor";
import { useOnboarding } from "../context/OnboardingContext";
import { useWatchlist } from "../context/WatchlistContext";
import { locationLabel } from "../../shared/location.js";

function SelectedRoleCard({ onEdit }) {
  const { onboardingData } = useOnboarding();
  const role = onboardingData?.roles?.[0];
  const location = locationLabel(onboardingData?.locations?.[0]);
  const workTypeLabels = [];
  if (onboardingData?.workTypes?.remote) workTypeLabels.push("Remote");
  if (onboardingData?.workTypes?.onsite) workTypeLabels.push("On-site");
  if (onboardingData?.workTypes?.hybrid) workTypeLabels.push("Hybrid");
  const subtext = [location, workTypeLabels.join("/")].filter(Boolean).join(" · ");

  return (
    <div className="flex w-full flex-col gap-sp8 rounded-md border border-neutral-100 bg-white p-sp16">
      <p className="text-body-small font-medium uppercase tracking-[0.6px] text-neutral-500">
        Selected role
      </p>
      <div className="flex w-full items-center gap-sp12">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary-50">
          <Briefcase size={18} className="text-primary-500" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col text-left">
          {role ? (
            <p className="truncate text-body-medium font-regular text-neutral-800">{role}</p>
          ) : (
            <span className="inline-flex w-fit shrink-0 items-center gap-sp4 rounded-lg bg-warning-50 px-sp8 py-sp4 text-body-small text-warning-700">
              <CircleAlert size={14} />
              Needs your answer
            </span>
          )}
          {subtext && (
            <p className="truncate text-body-small text-neutral-500">{subtext}</p>
          )}
        </div>
        <Button variant="link" onClick={onEdit} className="shrink-0">
          Edit
        </Button>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const navigate = useNavigate();
  const { companies, addCompany, removeCompany, saveCompanies } = useWatchlist();
  const [saving, setSaving] = useState(false);

  // Writes the whole list (the same save as every add and remove, so the background work for the new
  // companies is under way), then shows the loader that reads its progress. The loader and the work
  // never depend on this call succeeding: each add was already saved as it was made.
  const handleSave = async () => {
    setSaving(true);
    await saveCompanies(companies);
    navigate("/onboarding/checking");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white min-[744px]:h-screen min-[744px]:overflow-hidden">
      <Navbar variant="onboarding" />

      <main className="flex flex-1 justify-center overflow-y-auto px-sp16 min-[744px]:min-h-0 min-[744px]:overflow-hidden min-[744px]:px-sp40 xl:px-sp80">
        <div className="flex w-full max-w-[968px] flex-col gap-sp24 py-sp40 min-[744px]:min-h-0 min-[744px]:flex-1 min-[744px]:flex-row min-[744px]:items-stretch min-[744px]:justify-between">
          {/* Introduction */}
          <div className="flex w-full flex-col items-start gap-sp24 text-left min-[744px]:w-[300px] min-[744px]:shrink-0 lg:w-[320px]">
            <div className="flex flex-col gap-sp12">
              <h2 className="text-body-large font-medium text-neutral-800">
                Which companies should we watch?
              </h2>
              <p className="text-body-medium text-neutral-500">
                Add your dream companies. We&rsquo;ll monitor new roles and surface the best
                matches for you.
              </p>
            </div>
            <SelectedRoleCard onEdit={() => navigate("/onboarding/role")} />
          </div>

          {/* Watchlist form */}
          <div className="flex min-h-0 w-full flex-1 flex-col gap-sp24 lg:max-w-[576px]">
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-sp24 rounded-xl border border-neutral-100 p-sp24 min-[744px]:overflow-hidden">
                <WatchlistEditor companies={companies} onAdd={addCompany} onRemove={removeCompany} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 flex-col gap-sp24 min-[744px]:items-end">
              <p className="w-full text-center text-body-small text-neutral-500 min-[744px]:text-left">
                We&rsquo;ll check these companies for new roles daily.
              </p>
              <div className="flex w-full items-center justify-between gap-sp16 min-[744px]:w-auto min-[744px]:justify-end lg:gap-sp24">
                <Button variant="link" onClick={() => navigate("/jobs")}>
                  I&rsquo;ll do it later
                </Button>
                <Button
                  variant="primary"
                  iconPosition="right"
                  icon={<ArrowRight size={18} />}
                  disabled={companies.length === 0 || saving}
                  onClick={handleSave}
                >
                  Save watchlist &amp; continue
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
