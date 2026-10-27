import { useState } from "react";
import PropTypes from "prop-types";
import { Download, Loader2 } from "lucide-react";
import { useJobActions } from "../../context/JobActionsContext";
import { downloadFile } from "../../utils/downloadFile";
import pdfIcon from "../../assets/pdf-file.svg";

const GENERIC_FAILURE = "The PDF couldn't be generated. Try again.";

// One row (Figma "Download Assets"): PDF icon, file name over its kind, a download icon. The whole row
// is the button: pointer cursor, Figma's hover state (Design System 788:4616: the same Neutral card fill
// gains the card drop shadow, no color change) and a
// visible keyboard focus outline. While the server generates the PDF it shows a spinner and is
// disabled (default cursor, no hover); then the browser saves the file.
function FileRow({ jobId, file }) {
  const { showError } = useJobActions();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const query = new URLSearchParams({ tab: file.tab, origin: window.location.origin });
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/pdf?${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || GENERIC_FAILURE);
      }
      const url = URL.createObjectURL(await res.blob());
      downloadFile(url, file.fileName);
      // The link has been clicked; the browser keeps the data it needs.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      showError(err instanceof TypeError ? "Couldn't reach ApplyMate's server. Check that it's running." : err.message || GENERIC_FAILURE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="m-0">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-busy={busy}
        aria-label={`Download ${file.fileName}`}
        className="flex w-full items-center justify-between gap-sp8 rounded-xs border-none bg-card-neutral p-sp8 text-left enabled:hover:shadow-card focus-visible:outline-solid focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-neutral-700"
      >
      <div className="flex min-w-0 items-center gap-sp4">
        <img src={pdfIcon} alt="" className="shrink-0" />
        <div className="flex min-w-0 flex-col gap-sp4">
          <span className="break-words text-body-small text-neutral-700">
            {file.fileName}
          </span>
          <span className="text-body-small text-neutral-500">{file.label}</span>
        </div>
      </div>
      <span className="grid size-9 shrink-0 place-items-center text-neutral-700" aria-hidden="true">
        {busy ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" /> : <Download size={18} />}
      </span>
      </button>
    </li>
  );
}

/**
 * Job Details' "Download Files" panel (Figma 2690:6611; panelRef is the spotlight target of its one-time tip): one row per
 * document the job has, Resume first. Not shown when there are none.
 */
const DownloadFilesPanel = ({ jobId, documents, panelRef }) => {
  if (documents.length === 0) return null;
  return (
    <section ref={panelRef} aria-labelledby="download-files-title" className="flex w-full flex-col gap-sp8 rounded-sm border border-neutral-100 bg-white p-sp16">
      <h2 id="download-files-title" className="m-0 text-body-medium font-regular text-neutral-800">
        Download Files
      </h2>
      <ul className="m-0 flex list-none flex-col gap-sp16 p-0">
        {documents.map((file) => (
          <FileRow key={file.tab} jobId={jobId} file={file} />
        ))}
      </ul>
    </section>
  );
};

DownloadFilesPanel.propTypes = {
  jobId: PropTypes.string.isRequired,
  documents: PropTypes.arrayOf(
    PropTypes.shape({
      tab: PropTypes.oneOf(["resume", "cover"]).isRequired,
      label: PropTypes.string.isRequired,
      fileName: PropTypes.string.isRequired,
    })
  ).isRequired,
  panelRef: PropTypes.shape({ current: PropTypes.any }),
};

export default DownloadFilesPanel;
