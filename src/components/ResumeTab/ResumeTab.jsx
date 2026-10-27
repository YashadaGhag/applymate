import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import Button from "../Button/Button";
import Modal from "../Modal/Modal";
import Toast from "../Toast";
import ConfirmDetailsModal from "./ConfirmDetailsModal";
import { ScoreNewResumeBanner } from "../ScoreNewResume";
import { useResumeReplace } from "../../hooks/useResumeReplace";
import { useResumeScoring } from "../../hooks/useResumeScoring";
import { downloadFile } from "../../utils/downloadFile";
import { UPLOAD_HELP } from "../../utils/uploadHelp";

/**
 * Change Preferences > Resume (Figma 2506:23829; warning 2645:46633; loading 2719:6303; failure
 * 2719:10781; score new resume banners 2766:2869, 2774:10114, 2774:10199). The latest uploaded resume's
 * name and download, and "Replace file": a warning dialog, then the file picker, then the server
 * reads it and checks it against the saved details (Confirm your details when it looks different).
 * The new resume then waits to be scored: a banner says so, and scoring starts only from a click
 * ("Score now" on Job Recommendations, "Try again" here). Replace file is disabled while it runs.
 */
export default function ResumeTab({ profile, onReplaced }) {
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [warning, setWarning] = useState(false);
  const scoring = useResumeScoring({
    // The new resume became active: its name and download, and the profile, are read again.
    onFinished: (state) => {
      if (state !== "done") return;
      reloadFile();
      onReplaced?.();
    },
  });
  const { resumeFile, reloadFile, busy, fileError, confirm, toast, chooseFile, submitConfirm, cancelConfirm, showNotice, dismissToast } =
    useResumeReplace({ onReady: scoring.refresh });
  const scoringState = scoring.status?.state;
  const running = scoringState === "running";

  const tryAgain = async () => {
    const result = await scoring.start();
    if (!result.ok) showNotice(result.error);
  };

  const openPicker = () => fileInput.current?.click();

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again still fires change
    if (file) chooseFile(file);
  };

  // The LATEST uploaded file: the new resume while it waits to be scored, is being scored or failed
  // (Figma 2766:2869, 2774:10114, 2774:10199), otherwise the active one. Scoring and tailoring keep
  // using the active (old) resume until the run finishes.
  const fileName = resumeFile?.fileName;

  return (
    <div className="flex flex-col gap-sp24">
      {["ready", "running", "failed"].includes(scoringState) && (
        <ScoreNewResumeBanner
          place="resume"
          state={scoringState}
          busy={scoring.starting}
          onGoToJobs={() => navigate("/jobs")}
          onTryAgain={tryAgain}
        />
      )}
      <div className="flex flex-col gap-sp8">
        <p id="resume-label" className="text-body-medium font-medium text-neutral-800">
          Resume
        </p>
        <div className="flex flex-col items-start gap-sp8">
          <div className="flex w-full items-center gap-sp24 pr-sp16">
            <Button
              className="shrink-0"
              variant="secondary"
              iconPosition="left"
              iconName="upload"
              loading={busy}
              disabled={running}
              aria-describedby="resume-help"
              onClick={() => setWarning(true)}
            >
              Replace file
            </Button>
            {fileName && (
              <div className="flex min-w-0 items-center gap-sp8">
                <span className="min-w-0 truncate text-body-medium font-regular text-neutral-700" title={fileName}>
                  {fileName}
                </span>
                {resumeFile.hasFile && (
                  <Button
                    variant="link"
                    iconPosition="alone"
                    iconName="download"
                    className="text-primary-500"
                    aria-label={`Download ${fileName}`}
                    onClick={() => downloadFile("/api/resume/latest-file", fileName)}
                  />
                )}
              </div>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx"
            aria-labelledby="resume-label"
            className="hidden"
            onChange={handleFile}
          />
          <p id="resume-help" className={`text-body-small font-regular ${fileError ? "text-error-500" : "text-neutral-500"}`}>
            {fileError ?? UPLOAD_HELP}
          </p>
        </div>
      </div>

      {warning && (
        <Modal
          variant="form"
          isOpen
          title="Replace resume?"
          confirmLabel="Replace"
          onClose={() => setWarning(false)}
          onConfirm={() => {
            setWarning(false);
            openPicker();
          }}
        >
          <p className="text-body-medium font-regular text-neutral-700">
            Replacing your resume re-scores all jobs. This can take a couple of minutes. Resumes and cover letters
            you&rsquo;ve already tailored stay as they are.
          </p>
        </Modal>
      )}

      {confirm && <ConfirmDetailsModal confirm={confirm} profile={profile} save={submitConfirm} onCancel={cancelConfirm} />}

      {/* An upload that failed: RETRY opens the file picker again. */}
      {toast?.kind === "error" && (
        <Toast
          variant="error"
          message={toast.message}
          onHide={dismissToast}
          onAction={() => {
            dismissToast();
            openPicker();
          }}
        />
      )}
      {(toast?.kind === "same" || toast?.kind === "notice") && <Toast message={toast.message} onHide={dismissToast} />}
    </div>
  );
}

ResumeTab.propTypes = {
  /** The saved profile (for the location field in Confirm your details) */
  profile: PropTypes.object,
  /** Called when the new resume became active (its scoring run finished), so the page can refetch */
  onReplaced: PropTypes.func,
};
