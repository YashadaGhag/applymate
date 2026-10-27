import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, CircleAlert, Plus } from "lucide-react";
import Navbar from "../components/Navbar";
import MultiselectChips from "../components/MultiselectChips";
import Radio from "../components/Radio";
import Checkbox from "../components/Checkbox";
import Select from "../components/Select";
import Button from "../components/Button";
import Banner from "../components/Banner";
import WebsiteRow from "../components/WebsiteRow";
import YearsStepper from "../components/YearsStepper";
import { useOnboarding } from "../context/OnboardingContext";
import { useLocationFields } from "../hooks/useLocationFields";
import { startOthersAfterRole } from "../utils/startOthers";
import { isUsLocation, locationLabel } from "../../shared/location.js";
import { useRoleSuggestions } from "../hooks/useRoleSuggestions";
import { WORK_AUTH_OPTIONS } from "../../shared/workAuthOptions.js";
import { REQUIRED_MESSAGE, sameValues } from "../utils/roleOptions";
import {
  WEBSITE_LABELS,
  MAX_WEBSITES,
  websiteError,
  websitesToRows,
  rowsToWebsites,
  newWebsiteRow,
} from "../../shared/websites.js";

// "needs": the section isn't complete yet. "found": complete, and every value is still exactly
// what the resume supplied. "answered": complete, with at least one value from the user.
// Derived from current values only, so a return visit (e.g. via Edit) shows the same tags.
function sectionStatus({ complete, fromResume }) {
  if (!complete) return "needs";
  return fromResume ? "found" : "answered";
}

const STATUS_CHIPS = {
  found: { label: "Found in resume", icon: Check, className: "bg-success-50 text-success-500" },
  answered: { label: "Answered", icon: Check, className: "bg-success-50 text-success-500" },
  needs: { label: "Needs your answer", icon: CircleAlert, className: "bg-warning-50 text-warning-700" },
};

function StatusChip({ status }) {
  const { label, icon: ChipIcon, className } = STATUS_CHIPS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-sp4 rounded-lg px-sp8 py-sp4 text-body-small ${className}`}
    >
      <ChipIcon size={14} />
      {label}
    </span>
  );
}


// Each section after Designation. Below md Figma separates sections with a 1px line and 24 either
// side; from md it is the plain 32 gap.
const SECTION_DIVIDER =
  "mt-sp24 flex flex-col gap-sp16 border-t border-neutral-100 pt-sp24 md:mt-sp32 md:border-t-0 md:pt-0";

function FieldHeader({ label, status }) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-x-sp16 gap-y-sp8">
      <span className="text-body-medium font-regular text-neutral-800">{label}</span>
      <StatusChip status={status} />
    </div>
  );
}

export default function OnboardingRolePage() {
  const navigate = useNavigate();
  const { onboardingData, updateOnboarding } = useOnboarding();

  const [roles, setRoles] = useState(onboardingData.roles);
  const [yearsOfExperience, setYearsOfExperience] = useState(onboardingData.yearsOfExperience);
  const [relocation, setRelocation] = useState(onboardingData.relocation);
  const {
    selectedLocations,
    locationSearch,
    pendingLocations,
    workTypes,
    toggleWorkType,
    handleLocationsChange,
  } = useLocationFields({
    locations: onboardingData.locations,
    workTypes: onboardingData.workTypes,
  });
  const [workAuth, setWorkAuth] = useState(onboardingData.workAuth);
  const [websites, setWebsites] = useState(() => websitesToRows(onboardingData.websites));
  // Errors show once a field loses focus, or on every field after a Continue attempt.
  const [triedContinue, setTriedContinue] = useState(false);

  const { resumeValues, resumeExtractionFailed } = onboardingData;
  const roleSuggestions = useRoleSuggestions({ resumeRoles: resumeValues.roles, selected: roles });

  const addWebsite = () => {
    if (websites.length < MAX_WEBSITES) {
      setWebsites((prev) => [...prev, newWebsiteRow()]);
    }
  };

  const updateWebsite = (id, patch) => {
    setWebsites((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeWebsite = (id) => {
    setWebsites((prev) => prev.filter((row) => row.id !== id));
  };

  const hasWebsiteErrors = websites.some((row) => websiteError(row.kind, row.value));

  // The resume can't answer these, so they're required and never prefilled.
  const missingRelocation = relocation === null;
  // Work authorization is a US question: asked (and required) only when a desired location is
  // in the US or a US territory. When it's hidden, any earlier answer is dropped on save.
  const asksWorkAuth = selectedLocations.some(isUsLocation);
  const missingWorkAuth = asksWorkAuth && !workAuth;

  const handleContinue = () => {
    if (pendingLocations > 0) return; // a typed location is still being looked up (button is disabled)
    if (hasWebsiteErrors || missingRelocation || missingWorkAuth) {
      setTriedContinue(true);
      return;
    }
    updateOnboarding("roles", roles);
    updateOnboarding("yearsOfExperience", yearsOfExperience);
    updateOnboarding("relocation", relocation);
    updateOnboarding("locations", selectedLocations);
    updateOnboarding("workTypes", workTypes);
    updateOnboarding("workAuth", asksWorkAuth ? workAuth : null);
    updateOnboarding("websites", rowsToWebsites(websites));
    // Background only: starts the Others scrape and scoring; navigation does not wait for it.
    startOthersAfterRole({
      ...onboardingData,
      roles,
      yearsOfExperience,
      relocation,
      locations: selectedLocations,
      workTypes,
      workAuth: asksWorkAuth ? workAuth : null,
      websites: rowsToWebsites(websites),
    });
    navigate("/onboarding/matching");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar variant="onboarding" />

      <main className="flex flex-1 flex-col items-center px-sp16 md:px-sp40 xl:px-sp80">
        <div className="mt-sp40 w-full max-w-[600px]">
          {/* Heading */}
          <div className="flex flex-col gap-sp12">
            <h2 className="text-body-large font-medium text-neutral-800 text-center">
              Help us find you a job!
            </h2>
            <p className="text-center text-body-medium text-neutral-700">
              We pulled these from your resume. Fix anything that looks off so the
              jobs we show you actually fit.
            </p>
            {resumeExtractionFailed && (
              <Banner variant="warning">
                We couldn't read your resume, so please fill in these fields yourself.
              </Banner>
            )}
          </div>

          {/* Designation */}
          <div className="mt-sp32 flex flex-col gap-sp16">
            <FieldHeader
              label="Designation"
              status={sectionStatus({
                complete: roles.length > 0,
                fromResume: sameValues(roles, resumeValues.roles),
              })}
            />
            <MultiselectChips
              values={roles}
              onChange={setRoles}
              placeholder="Type to add more"
              suggestions={roleSuggestions.suggestions}
              filterSuggestions={false}
              showWhenEmpty
              onInputChange={roleSuggestions.onInputChange}
              maxSelections={5}
            />
          </div>

          {/* Years of experience */}
          <div className={SECTION_DIVIDER}>
            <FieldHeader
              label="Years of experience"
              status={sectionStatus({
                complete: yearsOfExperience !== null,
                fromResume: yearsOfExperience === resumeValues.yearsOfExperience,
              })}
            />
            <YearsStepper value={yearsOfExperience} onChange={setYearsOfExperience} />
          </div>

          {/* Location + relocation */}
          <div className={SECTION_DIVIDER}>
            {/* One tag covers both questions. Relocation is never in the resume, so this
                section is never "Found in resume": it needs an answer until both are filled. */}
            <FieldHeader
              label="Location"
              status={sectionStatus({
                complete: selectedLocations.length > 0 && !missingRelocation,
                fromResume: false,
              })}
            />

            <div className="flex flex-col gap-sp12">
              <p className="text-body-medium text-neutral-700">Where would you like to work?</p>
              <MultiselectChips
                values={selectedLocations.map(locationLabel)}
                onChange={handleLocationsChange}
                onInputChange={locationSearch.search}
                filterSuggestions={false}
                placeholder="Type to add more"
                suggestions={locationSearch.results.map((loc) => loc.label)}
                maxSelections={5}
              />
              <div className="flex items-center gap-sp24">
                <Checkbox
                  label="Remote"
                  checked={workTypes.remote}
                  onChange={() => toggleWorkType("remote")}
                />
                <Checkbox
                  label="On-site"
                  checked={workTypes.onsite}
                  onChange={() => toggleWorkType("onsite")}
                />
                <Checkbox
                  label="Hybrid"
                  checked={workTypes.hybrid}
                  onChange={() => toggleWorkType("hybrid")}
                />
              </div>
            </div>

            <div className="flex flex-col gap-sp16">
              <p className="text-body-medium text-neutral-700">Are you open to relocation?</p>
              <div className="flex items-center gap-sp16">
                <Radio
                  label="Yes"
                  selected={relocation === "yes"}
                  onChange={() => setRelocation("yes")}
                  name="relocation"
                  value="yes"
                />
                <Radio
                  label="No"
                  selected={relocation === "no"}
                  onChange={() => setRelocation("no")}
                  name="relocation"
                  value="no"
                />
              </div>
              {triedContinue && missingRelocation && (
                <p className="text-body-small text-error-500">{REQUIRED_MESSAGE}</p>
              )}
            </div>
          </div>

          {/* Work authorization: only when a desired location is in the US */}
          {asksWorkAuth && (
            <div className={SECTION_DIVIDER}>
              <FieldHeader
                label="What's your work authorization status in the US?"
                status={sectionStatus({ complete: !missingWorkAuth, fromResume: false })}
              />
              <Select
                value={workAuth}
                onChange={setWorkAuth}
                placeholder="Select status"
                options={WORK_AUTH_OPTIONS}
                error={triedContinue && missingWorkAuth}
                errorMessage={REQUIRED_MESSAGE}
              />
            </div>
          )}

          {/* Websites */}
          <div className={SECTION_DIVIDER}>
            <div className="flex w-full items-end justify-between">
              <span className="text-body-medium font-regular text-neutral-800">Websites</span>
              <span className="text-body-small text-neutral-500">Optional</span>
            </div>

            {websites.length > 0 && (
              <div className="flex flex-col gap-sp24">
                {websites.map((row) => (
                  <WebsiteRow
                    key={row.id}
                    label={WEBSITE_LABELS[row.kind]}
                    value={row.value}
                    error={row.touched || triedContinue ? websiteError(row.kind, row.value) : null}
                    onChange={(e) => updateWebsite(row.id, { value: e.target.value })}
                    onBlur={() => updateWebsite(row.id, { touched: true })}
                    onRemove={() => removeWebsite(row.id)}
                  />
                ))}
              </div>
            )}

            {websites.length < MAX_WEBSITES && (
              <Button
                variant="link"
                iconPosition="left"
                icon={<Plus size={18} />}
                onClick={addWebsite}
                className="self-start text-neutral-700"
              >
                Add website
              </Button>
            )}
          </div>

          {/* Continue */}
          <div className="mt-sp32 mb-sp40 flex justify-center">
            <Button
              variant="primary"
              iconPosition="right"
              icon={<ArrowRight size={18} />}
              onClick={handleContinue}
              disabled={pendingLocations > 0}
            >
              Continue
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
