import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MainLayout from "../components/MainLayout";
import Button from "../components/Button/Button";
import Banner from "../components/Banner/Banner";
import Toast from "../components/Toast";
import SecondaryTabBar from "../components/SecondaryTabBar";
import Textarea from "../components/Textarea";
import ProfileDetails from "../components/ProfileDetails";
import WatchlistTab from "../components/WatchlistTab";
import ResumeTab from "../components/ResumeTab";
import {
  DesignationModal,
  YearsModal,
  LocationModal,
  WorkAuthModal,
  WebsitesModal,
} from "../components/ProfileEditModals";
import { useWritingStyle, TONE_MAX_CHARS } from "../hooks/useWritingStyle";
import { useProfile } from "../hooks/useProfile";
import { downloadFile } from "../utils/downloadFile";
import { UPLOAD_HELP } from "../utils/uploadHelp";

// Details, Company Watchlist (Figma sometimes says "Target Companies"), Resume and Cover Letter.
// Details is first, so it's the default: a missing or unknown ?tab= opens it.
const TABS = [
  { key: "details", label: "Details" },
  { key: "watchlist", label: "Company Watchlist" },
  { key: "resume", label: "Resume" },
  { key: "cover-letter", label: "Cover Letter" },
];

const EDIT_MODALS = {
  designation: DesignationModal,
  years: YearsModal,
  location: LocationModal,
  workAuth: WorkAuthModal,
  websites: WebsitesModal,
};

const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;
// Not in Figma: simplest option.
const PREFERENCES_SAVED = "Preferences saved";

const FIELD_LABEL = "text-body-medium font-medium text-neutral-800";
const HELP_TEXT = "text-body-small font-regular text-neutral-500";

function TitleRow() {
  return (
    <div className="flex flex-col gap-sp8">
      <h1 className="m-0 text-h5 font-medium text-neutral-800">Change Preferences</h1>
      <p className={HELP_TEXT}>These apply across every job, not just one application.</p>
    </div>
  );
}

function fileProblem(file) {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) return "Unsupported file format. Please attach a PDF or DOCX.";
  if (file.size > MAX_FILE_SIZE) return "File exceeds 25MB limit.";
  return null;
}

// The form starts from the saved style. "Changed" is always measured against `saved`, which the
// hook replaces with the server's answer after each save, so a save makes Save disabled again.
function CoverLetterForm({ saved, save }) {
  const [tone, setTone] = useState(saved.tone);
  // A newly attached file (sent on save), and whether the saved letter was removed or replaced.
  const [pendingFile, setPendingFile] = useState(null);
  const [savedLetterRemoved, setSavedLetterRemoved] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const fileInput = useRef(null);

  const shownLetterName = pendingFile?.name ?? (!savedLetterRemoved && saved.letter ? saved.letter.fileName : null);
  const letterChanged = Boolean(pendingFile) || (savedLetterRemoved && Boolean(saved.letter));
  const changed = tone !== saved.tone || letterChanged;
  // A letter saved before original files were kept has nothing to download.
  const canDownload = Boolean(pendingFile) || Boolean(saved.letter?.downloadable);

  const edited = () => setSaveError(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again still fires change
    if (!file) return;
    const problem = fileProblem(file);
    setFileError(problem);
    if (problem) return;
    setPendingFile(file);
    setSavedLetterRemoved(true);
    edited();
  };

  const removeLetter = () => {
    setPendingFile(null);
    setSavedLetterRemoved(true);
    setFileError(null);
    edited();
  };

  const downloadLetter = () => {
    if (pendingFile) {
      const url = URL.createObjectURL(pendingFile);
      downloadFile(url, pendingFile.name);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } else {
      downloadFile("/api/writing-style/letter", saved.letter.fileName);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setShowSavedToast(false);
    const letter = pendingFile ?? (savedLetterRemoved && saved.letter ? "remove" : "keep");
    const result = await save({ tone, letter });
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    setPendingFile(null);
    setSavedLetterRemoved(false);
    setShowSavedToast(true);
  };

  return (
    <div className="flex flex-col gap-sp24">
      <p className={HELP_TEXT}>
        Help the AI write cover letters that sound like you, not generic AI voice. Add either or both.
      </p>

      <div className="flex flex-col gap-sp16">
        <div className="flex flex-col gap-sp8">
          <p id="cover-letter-label" className={FIELD_LABEL}>
            Cover letter
          </p>
          <div className="flex flex-col items-start gap-sp8">
            {/* Figma 2642:46531: Replace file, then the file name with download and delete. */}
            <div className="flex w-full max-w-field items-center gap-sp24 pr-sp16">
              <Button
                className="shrink-0"
                variant="secondary"
                iconPosition="left"
                iconName="upload"
                aria-describedby="cover-letter-help"
                onClick={() => fileInput.current?.click()}
                disabled={saving}
              >
                {shownLetterName ? "Replace file" : "Attach file"}
              </Button>
              {shownLetterName && (
                <div className="flex min-w-0 flex-1 items-center gap-sp8">
                  <span className="min-w-0 truncate text-body-medium font-regular text-neutral-700">{shownLetterName}</span>
                  <div className="flex shrink-0 items-center">
                    {canDownload && (
                      <Button
                        variant="link"
                        iconPosition="alone"
                        iconName="download"
                        className="text-primary-500"
                        aria-label={`Download ${shownLetterName}`}
                        onClick={downloadLetter}
                        disabled={saving}
                      />
                    )}
                    <Button
                      variant="link"
                      iconPosition="alone"
                      iconName="delete"
                      className="text-error-500 hover:bg-error-50"
                      aria-label={`Remove ${shownLetterName}`}
                      onClick={removeLetter}
                      disabled={saving}
                    />
                  </div>
                </div>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx"
              aria-labelledby="cover-letter-label"
              className="hidden"
              onChange={handleFile}
            />
            {/* Figma lists DOC too; .doc isn't accepted, so the copy leaves it out. */}
            <p id="cover-letter-help" className={fileError ? "text-body-small font-regular text-error-500" : HELP_TEXT}>
              {fileError ?? UPLOAD_HELP}
            </p>
          </div>
        </div>

        <p className={HELP_TEXT}>or</p>

        <div className="flex flex-col gap-sp8">
          <label htmlFor="tone" className={FIELD_LABEL}>
            Describe your tone
          </label>
          <Textarea
            id="tone"
            showLabel={false}
            className="max-w-field"
            placeholder="e.g. Direct and concise. I avoid buzzwords and lead with outcomes, not responsibilities."
            value={tone}
            maxLength={TONE_MAX_CHARS}
            disabled={saving}
            onChange={(e) => {
              setTone(e.target.value);
              edited();
            }}
            helpText={`${tone.length.toLocaleString()}/${TONE_MAX_CHARS.toLocaleString()} characters`}
          />
        </div>
      </div>

      {saveError && (
        <Banner variant="error" className="max-w-field">
          {saveError}
        </Banner>
      )}

      {/* Save isn't in Figma: simplest option, reported as a gap. */}
      <div>
        <Button variant="primary" onClick={handleSave} disabled={!changed || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {showSavedToast && <Toast message="Writing style saved" onHide={() => setShowSavedToast(false)} />}
    </div>
  );
}

// Details: the saved profile as read-only rows. Edit opens one dialog (a copy of the values, so
// Cancel discards); Save writes only those fields to the profile and the row updates. Nothing is
// rescored: the lists filter live from the saved profile.
function DetailsTab({ profile, status, save }) {
  const [editing, setEditing] = useState(null);
  const [showSavedToast, setShowSavedToast] = useState(false);

  const EditModalForRow = editing ? EDIT_MODALS[editing] : null;

  return (
    <>
      {status === "error" && (
        <Banner variant="error" className="max-w-field">
          Couldn&apos;t load your preferences. Refresh to try again.
        </Banner>
      )}
      {status === "ready" && <ProfileDetails profile={profile} onEdit={setEditing} />}

      {EditModalForRow && (
        <EditModalForRow
          profile={profile}
          save={save}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setShowSavedToast(true);
          }}
        />
      )}

      {showSavedToast && <Toast message={PREFERENCES_SAVED} onHide={() => setShowSavedToast(false)} />}
    </>
  );
}

function ChangePreferencesPage() {
  const { style, status, save } = useWritingStyle();
  // Read here, not inside the Details tab, so switching tabs doesn't refetch it: Details shows its
  // rows at once instead of rendering nothing first (which made the page jump).
  const { profile, status: profileStatus, save: saveProfile, reload: reloadProfile } = useProfile();
  // ?tab=<key> opens that tab (Customize Application links to ?tab=cover-letter); anything else
  // opens the first one.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab = TABS.some((t) => t.key === requested) ? requested : TABS[0].key;

  return (
    <MainLayout activeItem="preferences">
      {/* Figma: the title starts 52 from the top on desktop (MainLayout's 28 plus 24) and 40 under the
          top bar on mobile (the layout's 16 plus 24). */}
      <div className="flex flex-col gap-sp24 pt-sp24">
        <TitleRow />
        <SecondaryTabBar scrollable tabs={TABS} activeKey={activeTab} onChange={(key) => setSearchParams({ tab: key })} />
        {activeTab === "details" && <DetailsTab profile={profile} status={profileStatus} save={saveProfile} />}
        {activeTab === "watchlist" && <WatchlistTab />}
        {activeTab === "resume" && <ResumeTab profile={profile} onReplaced={reloadProfile} />}
        {activeTab === "cover-letter" && status === "error" && (
          <Banner variant="error" className="max-w-field">
            Couldn&apos;t load your writing style. Refresh to try again.
          </Banner>
        )}
        {activeTab === "cover-letter" && status === "ready" && <CoverLetterForm saved={style} save={save} />}
      </div>
    </MainLayout>
  );
}

export default ChangePreferencesPage;
