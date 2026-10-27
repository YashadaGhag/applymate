import PropTypes from "prop-types";
import { ArrowRight } from "lucide-react";
import Button from "../Button/Button";
import DotsLoader from "../DotsLoader";
import { loaderCopy } from "../../utils/companyCheck";

// The onboarding loader after Save, the four states of Figma "Loading after Save": Checking
// companies 2862:14179, Taking longer 2862:14187, Some companies not checked 2862:14194, Failed
// 2862:14205. The copy and the state mapping are src/utils/companyCheck.js (real data only).
// Checking and Taking longer: a heading, one line and the small dots. Some companies not checked:
// the list of companies and one button. Checking and Taking longer also carry a "Continue to jobs"
// link under the dots. Failed: Continue and Try again.
const CompanyCheckLoader = ({ loader, onViewJobs, onContinue, onRetry }) => {
  const { kind } = loader;
  const { heading, body, lines } = loaderCopy(loader);
  const working = kind === "checking" || kind === "longer";

  return (
    <div className="flex w-full max-w-120 flex-col items-center gap-sp24 text-center">
      <div className="flex w-full flex-col items-center gap-sp8">
        <p className="text-body-large font-medium text-neutral-800" aria-live="polite">
          {heading}
        </p>
        {body && <p className="max-w-105 text-body-small font-regular text-neutral-500">{body}</p>}
      </div>

      {lines.length > 0 && (
        <ul className="flex w-full max-w-105 flex-col items-center gap-sp8 text-body-small font-regular text-neutral-500">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {working && <DotsLoader label={heading} size="small" />}

      {/* Leaves the loader only: the background work keeps running (Figma "Continue link"). */}
      {working && (
        <Button variant="link" iconPosition="right" icon={<ArrowRight size={18} />} onClick={onViewJobs}>
          Continue to jobs
        </Button>
      )}

      {kind === "partial" && <Button onClick={onViewJobs}>View jobs</Button>}

      {kind === "failed" && (
        <div className="flex items-start gap-sp16">
          <Button variant="secondary" onClick={onContinue}>
            Continue
          </Button>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
};

CompanyCheckLoader.propTypes = {
  /** What loaderState() (src/utils/companyCheck.js) returns: { kind, rolesFound, companiesWithRoles, total, checked, notChecked } */
  loader: PropTypes.shape({
    kind: PropTypes.oneOf(["checking", "longer", "partial", "failed"]).isRequired,
    rolesFound: PropTypes.number,
    companiesWithRoles: PropTypes.number,
    total: PropTypes.number,
    checked: PropTypes.number,
    notChecked: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, name: PropTypes.string })),
  }).isRequired,
  /** "View jobs" (the partial state) and "Continue to jobs" (the checking and taking longer states): both only go to Job Recommendations */
  onViewJobs: PropTypes.func,
  /** "Continue" (the failed state) */
  onContinue: PropTypes.func,
  /** "Try again" (the failed state) */
  onRetry: PropTypes.func,
};

export default CompanyCheckLoader;
