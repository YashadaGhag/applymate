import { useState } from "react";
import PropTypes from "prop-types";
import { EditModal } from "../ProfileEditModals/ProfileEditModals";
import MultiselectChips from "../MultiselectChips";
import YearsStepper from "../YearsStepper";
import { useLocationFields } from "../../hooks/useLocationFields";
import { locationLabel } from "../../../shared/location.js";
import { useRoleSuggestions } from "../../hooks/useRoleSuggestions";
import { sameValues } from "../../utils/roleOptions";

const NO_WORK_MODES = { remote: false, onsite: false, hybrid: false };
const HINT = "text-body-small font-regular text-neutral-500";

/**
 * "Confirm your details": shown when the new resume looks different from the saved details (the
 * server's mismatch check said so). No Figma frame yet: the simplest version. A line of context,
 * then the fields the check flagged, prefilled with the saved values, each with what the new
 * resume says (only values the server actually returned). Save sends only the fields that changed
 * as profilePatch (an empty patch when nothing did) and the scoring starts; Cancel discards the
 * pending resume. \`save(patch)\` resolves { ok, error? } (useResumeReplace's submitConfirm).
 */
export default function ConfirmDetailsModal({ confirm, profile, save, onCancel }) {
  const { reasons, current, fromResume } = confirm;
  const codes = new Set(reasons.map((r) => r.code));
  const savedRoles = current?.designation ?? profile?.roles ?? [];
  const savedYears = current?.years ?? null;
  const savedWorkTypes = { ...NO_WORK_MODES, ...(profile?.workTypes ?? {}) };

  const [roles, setRoles] = useState(savedRoles);
  const [years, setYears] = useState(savedYears);
  const { selectedLocations, locationSearch, pendingLocations, workTypes, handleLocationsChange } = useLocationFields({
    locations: profile?.locations ?? [],
    workTypes: savedWorkTypes,
  });

  const newRoles = [fromResume?.designation, ...(fromResume?.adjacentRoles ?? [])].filter(Boolean);
  // The roles to suggest first are the new resume's (the one being checked), not the saved ones.
  const { suggestions, onInputChange } = useRoleSuggestions({ resumeRoles: newRoles, selected: roles });
  const labels = selectedLocations.map(locationLabel);
  const savedLabels = (profile?.locations ?? []).map(locationLabel);

  const buildPatch = () => {
    const patch = {};
    if (!sameValues(roles, savedRoles)) patch.roles = roles;
    if (years !== savedYears) patch.yearsOfExperience = years;
    if (codes.has("location") && !sameValues(labels, savedLabels)) {
      patch.locations = selectedLocations;
      if (Object.keys(NO_WORK_MODES).some((k) => Boolean(workTypes[k]) !== savedWorkTypes[k])) patch.workTypes = workTypes;
    }
    return patch;
  };

  return (
    <EditModal
      title="Confirm your details"
      size="default"
      onClose={onCancel}
      onSaved={() => {}}
      save={save}
      buildPatch={buildPatch}
      changed
      valid={pendingLocations === 0}
    >
      <p className="text-body-medium font-regular text-neutral-700">
        This resume looks different from the details you saved. Check them before your jobs are scored.
      </p>

      <div className="flex flex-col gap-sp8">
        <p className="text-body-medium font-regular text-neutral-800">Designation</p>
        <MultiselectChips
          values={roles}
          onChange={setRoles}
          placeholder="Type to add more"
          suggestions={suggestions}
          filterSuggestions={false}
          showWhenEmpty
          onInputChange={onInputChange}
          maxSelections={5}
        />
        {newRoles.length > 0 && <p className={HINT}>Your new resume says: {newRoles.join(", ")}</p>}
      </div>

      <div className="flex flex-col gap-sp8">
        <p className="text-body-medium font-regular text-neutral-800">Years of experience</p>
        <YearsStepper value={years} onChange={setYears} />
        {Number.isInteger(fromResume?.years) && (
          <p className={HINT}>Your new resume adds up to {fromResume.years} years.</p>
        )}
      </div>

      {codes.has("location") && (
        <div className="flex flex-col gap-sp8">
          <p className="text-body-medium font-regular text-neutral-800">Where would you like to work?</p>
          <MultiselectChips
            values={labels}
            onChange={handleLocationsChange}
            onInputChange={locationSearch.search}
            filterSuggestions={false}
            placeholder="Type to add more"
            suggestions={locationSearch.results.map((loc) => loc.label)}
            maxSelections={5}
          />
          {fromResume?.headerLocation && <p className={HINT}>Your new resume's header says: {fromResume.headerLocation}</p>}
        </div>
      )}
    </EditModal>
  );
}

ConfirmDetailsModal.propTypes = {
  /** { reasons: [{ code, message }], current, fromResume, fileName } from the replace routes */
  confirm: PropTypes.shape({
    reasons: PropTypes.array.isRequired,
    current: PropTypes.object,
    fromResume: PropTypes.object,
  }).isRequired,
  /** The saved profile (full location objects for the location field) */
  profile: PropTypes.object,
  save: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
