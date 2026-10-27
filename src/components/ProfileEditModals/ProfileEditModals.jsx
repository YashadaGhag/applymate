import { useState } from "react";
import PropTypes from "prop-types";
import { Plus } from "lucide-react";
import Modal from "../Modal/Modal";
import Banner from "../Banner/Banner";
import Button from "../Button/Button";
import MultiselectChips from "../MultiselectChips";
import Checkbox from "../Checkbox";
import Radio from "../Radio";
import Select from "../Select";
import WebsiteRow from "../WebsiteRow";
import YearsStepper from "../YearsStepper";
import { useLocationFields } from "../../hooks/useLocationFields";
import { isUsLocation, locationLabel } from "../../../shared/location.js";
import { useRoleSuggestions } from "../../hooks/useRoleSuggestions";
import { WORK_AUTH_OPTIONS } from "../../../shared/workAuthOptions.js";
import { REQUIRED_MESSAGE, sameValues } from "../../utils/roleOptions";
import {
  WEBSITE_LABELS,
  MAX_WEBSITES,
  websiteError,
  websitesToRows,
  rowsToWebsites,
  newWebsiteRow,
} from "../../../shared/websites.js";

const NO_WORK_MODES = { remote: false, onsite: false, hybrid: false };

// Change Preferences > Details edit dialogs (Figma 2679:6888, 2679:7219, 2679:7551, 2679:7751,
// 2679:7949). Each one edits a copy of the saved values, so Cancel discards. They share the same
// fields and validation as the Role page. `save(patch)` is useProfile().save: it merges the patch
// into the stored profile, so only these fields change.

// The shared dialog: Save is disabled until something changed and the form is valid; while saving
// the inputs are disabled and the button reads "Saving…"; a failed save keeps the draft and shows
// an error Banner inside the dialog.
export function EditModal({ title, onClose, onSaved, save, buildPatch, changed, valid, size, children }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await save(buildPatch());
    setSaving(false);
    if (result.ok) onSaved();
    else setError(result.error);
  };

  return (
    <Modal
      variant="form"
      isOpen
      title={title}
      onClose={onClose}
      onConfirm={handleSave}
      confirmLabel={saving ? "Saving…" : "Save"}
      confirmDisabled={!changed || !valid}
      busy={saving}
      size={size}
    >
      {/* A disabled fieldset disables every input and button inside it while saving. */}
      <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-sp16 border-0 p-0">
        {children}
        {error && <Banner variant="error">{error}</Banner>}
      </fieldset>
    </Modal>
  );
}

EditModal.propTypes = {
  title: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  save: PropTypes.func.isRequired,
  buildPatch: PropTypes.func.isRequired,
  changed: PropTypes.bool.isRequired,
  valid: PropTypes.bool.isRequired,
  size: PropTypes.oneOf(["default", "wide"]),
  children: PropTypes.node,
};

const modalProps = {
  profile: PropTypes.object.isRequired,
  save: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};

export function DesignationModal({ profile, save, onClose, onSaved }) {
  const saved = profile.roles ?? [];
  const [roles, setRoles] = useState(saved);
  const { suggestions, onInputChange } = useRoleSuggestions({ resumeRoles: profile.resumeValues?.roles, selected: roles });

  return (
    <EditModal
      title="Edit designation"
      onClose={onClose}
      onSaved={onSaved}
      save={save}
      buildPatch={() => ({ roles })}
      changed={!sameValues(roles, saved)}
      valid
    >
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
    </EditModal>
  );
}
DesignationModal.propTypes = modalProps;

export function YearsModal({ profile, save, onClose, onSaved }) {
  const saved = profile.yearsOfExperience ?? null;
  const [years, setYears] = useState(saved);

  return (
    <EditModal
      title="Edit years of experience"
      onClose={onClose}
      onSaved={onSaved}
      save={save}
      buildPatch={() => ({ yearsOfExperience: years })}
      changed={years !== saved}
      valid
    >
      <YearsStepper value={years} onChange={setYears} />
    </EditModal>
  );
}
YearsModal.propTypes = modalProps;

export function LocationModal({ profile, save, onClose, onSaved }) {
  const savedLocations = profile.locations ?? [];
  const savedWorkTypes = { ...NO_WORK_MODES, ...(profile.workTypes ?? {}) };
  const savedRelocation = profile.relocation ?? null;

  const [relocation, setRelocation] = useState(savedRelocation);
  const { selectedLocations, locationSearch, pendingLocations, workTypes, toggleWorkType, handleLocationsChange } =
    useLocationFields({ locations: savedLocations, workTypes: savedWorkTypes });

  const labels = selectedLocations.map(locationLabel);
  const savedLabels = savedLocations.map(locationLabel);
  const changed =
    !sameValues(labels, savedLabels) ||
    relocation !== savedRelocation ||
    Object.keys(NO_WORK_MODES).some((key) => Boolean(workTypes[key]) !== savedWorkTypes[key]);
  // Relocation is required; a typed location still being looked up has to finish first.
  const valid = relocation !== null && pendingLocations === 0;

  return (
    <EditModal
      title="Edit location"
      onClose={onClose}
      onSaved={onSaved}
      save={save}
      // With no US location left, work authorization is dropped (as on the Role page).
      buildPatch={() => ({
        locations: selectedLocations,
        workTypes,
        relocation,
        workAuth: selectedLocations.some(isUsLocation) ? (profile.workAuth ?? null) : null,
      })}
      changed={changed}
      valid={valid}
    >
      <div className="flex flex-col gap-sp12">
        <p className="text-body-medium text-neutral-700">Where would you like to work?</p>
        <MultiselectChips
          values={labels}
          onChange={handleLocationsChange}
          onInputChange={locationSearch.search}
          filterSuggestions={false}
          placeholder="Type to add more"
          suggestions={locationSearch.results.map((loc) => loc.label)}
          maxSelections={5}
        />
        <div className="flex items-center gap-sp24">
          <Checkbox label="Remote" checked={Boolean(workTypes.remote)} onChange={() => toggleWorkType("remote")} />
          <Checkbox label="On-site" checked={Boolean(workTypes.onsite)} onChange={() => toggleWorkType("onsite")} />
          <Checkbox label="Hybrid" checked={Boolean(workTypes.hybrid)} onChange={() => toggleWorkType("hybrid")} />
        </div>
      </div>

      <div className="flex flex-col gap-sp16">
        <p className="text-body-medium text-neutral-700">Are you open to relocation?</p>
        <div className="flex items-center gap-sp16">
          <Radio
            label="Yes"
            selected={relocation === "yes"}
            onChange={() => setRelocation("yes")}
            name="edit-relocation"
            value="yes"
          />
          <Radio
            label="No"
            selected={relocation === "no"}
            onChange={() => setRelocation("no")}
            name="edit-relocation"
            value="no"
          />
        </div>
        {relocation === null && <p className="text-body-small text-error-500">{REQUIRED_MESSAGE}</p>}
      </div>
    </EditModal>
  );
}
LocationModal.propTypes = modalProps;

export function WorkAuthModal({ profile, save, onClose, onSaved }) {
  const saved = profile.workAuth ?? null;
  const [workAuth, setWorkAuth] = useState(saved);

  return (
    <EditModal
      title="Edit work authorization status"
      onClose={onClose}
      onSaved={onSaved}
      save={save}
      buildPatch={() => ({ workAuth })}
      changed={workAuth !== saved}
      valid={Boolean(workAuth)}
    >
      <Select value={workAuth} onChange={setWorkAuth} placeholder="Select status" options={WORK_AUTH_OPTIONS} />
    </EditModal>
  );
}
WorkAuthModal.propTypes = modalProps;

export function WebsitesModal({ profile, save, onClose, onSaved }) {
  const [rows, setRows] = useState(() => websitesToRows(profile.websites));
  const savedWebsites = rowsToWebsites(websitesToRows(profile.websites));
  const draft = rowsToWebsites(rows);

  const changed = JSON.stringify(draft) !== JSON.stringify(savedWebsites);
  // Format is checked on every row; Save is blocked while any row is invalid.
  const valid = !rows.some((row) => websiteError(row.kind, row.value));

  const updateRow = (id, patch) => setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <EditModal
      title="Edit websites"
      onClose={onClose}
      onSaved={onSaved}
      save={save}
      buildPatch={() => ({ websites: draft })}
      changed={changed}
      valid={valid}
    >
      {rows.length > 0 && (
        <div className="flex flex-col gap-sp24">
          {rows.map((row) => (
            <WebsiteRow
              key={row.id}
              label={WEBSITE_LABELS[row.kind]}
              value={row.value}
              error={row.touched ? websiteError(row.kind, row.value) : null}
              onChange={(e) => updateRow(row.id, { value: e.target.value })}
              onBlur={() => updateRow(row.id, { touched: true })}
              onRemove={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
            />
          ))}
        </div>
      )}
      {rows.length < MAX_WEBSITES && (
        <Button
          variant="link"
          iconPosition="left"
          icon={<Plus size={18} />}
          onClick={() => setRows((prev) => [...prev, newWebsiteRow()])}
          className="self-start text-neutral-700"
        >
          Add website
        </Button>
      )}
    </EditModal>
  );
}
WebsitesModal.propTypes = modalProps;
