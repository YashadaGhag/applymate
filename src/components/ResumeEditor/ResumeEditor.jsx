import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import { RESUME_DOCUMENT_CLASSES } from "../../../shared/resumeHtml.js";

/**
 * A copy of the document for printing, outside #root: the print styles (src/index.css) hide the
 * app and show only this, on US Letter. `html` is the editor's own output (or the draft's HTML).
 */
export function ResumePrint({ html }) {
  return createPortal(
    // The editor's serializer (or draftToHtml) produced this; it only contains the schema's tags.
    <div id="resume-print" className={`hidden ${RESUME_DOCUMENT_CLASSES}`} dangerouslySetInnerHTML={{ __html: html }} />,
    document.body
  );
}

ResumePrint.propTypes = { html: PropTypes.string.isRequired };
