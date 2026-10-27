import PropTypes from "prop-types";
import { ChevronRight } from "lucide-react";
import Button from "../Button/Button";
import { isUsLocation, locationLabel } from "../../../shared/location.js";
import { WEBSITE_LABELS } from "../../../shared/websites.js";

// Change Preferences > Details (Figma 2672:11664): read-only rows, each with an Edit link that opens
// its edit dialog. Values come from the saved profile passed in (never OnboardingContext).

const NOT_ADDED = "Not added";
const NOT_ANSWERED = "Not answered";
// Figma lists the work modes in this order.
const WORK_MODE_LABELS = [
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
];

const LABEL = "text-body-medium font-regular text-neutral-800 md:w-65 md:shrink-0";
const SUB_LABEL = "text-body-medium font-regular text-neutral-700 md:w-65 md:shrink-0";
const VALUE = "text-body-medium font-regular text-neutral-500";

function EditLink({ label, onClick }) {
  return (
    <Button
      variant="link"
      iconPosition="right"
      icon={<ChevronRight size={18} />}
      // Figma: Edit and its chevron are Text/Link/Default (Primary/500); a link button with an
      // icon is Neutral/700 by default.
      className="text-primary-500"
      onClick={onClick}
      aria-label={`Edit ${label}`}
    >
      Edit
    </Button>
  );
}

EditLink.propTypes = { label: PropTypes.string.isRequired, onClick: PropTypes.func.isRequired };

// A label column (259 in Figma) and a value column; the Edit link sits 8 below the value.
function Row({ label, labelClassName = LABEL, children }) {
  return (
    <div className="flex flex-col gap-sp4 md:flex-row md:items-start md:gap-sp16">
      <p className={labelClassName}>{label}</p>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-sp8">{children}</div>
    </div>
  );
}

Row.propTypes = { label: PropTypes.string.isRequired, labelClassName: PropTypes.string, children: PropTypes.node };

function Divider() {
  return <div className="h-px w-full bg-neutral-100" />;
}

export default function ProfileDetails({ profile, onEdit }) {
  const roles = profile.roles ?? [];
  const years = profile.yearsOfExperience;
  const locations = profile.locations ?? [];
  const workModes = WORK_MODE_LABELS.filter(([key]) => profile.workTypes?.[key]).map(([, label]) => label);
  const relocation = profile.relocation;
  // Work authorization is a US question: hidden unless a desired location is in the US or a US
  // territory. With one but no answer yet, it shows "Not answered".
  const asksWorkAuth = locations.some((loc) => typeof loc !== "string" && isUsLocation(loc));
  const websites = [
    ...(profile.websites?.linkedin ? [[WEBSITE_LABELS.linkedin, profile.websites.linkedin]] : []),
    ...(profile.websites?.portfolio ? [[WEBSITE_LABELS.portfolio, profile.websites.portfolio]] : []),
    ...(profile.websites?.additional ?? []).filter(Boolean).map((url) => [WEBSITE_LABELS.other, url]),
  ];

  return (
    <div className="flex w-full flex-col gap-sp24">
      <Row label="Designation">
        <p className={VALUE}>{roles.length ? roles.join(", ") : NOT_ADDED}</p>
        <EditLink label="designation" onClick={() => onEdit("designation")} />
      </Row>

      <Divider />

      <Row label="Years of experience">
        <p className={VALUE}>{years === null || years === undefined ? NOT_ADDED : years}</p>
        <EditLink label="years of experience" onClick={() => onEdit("years")} />
      </Row>

      <Divider />

      <div className="flex flex-col gap-sp16">
        <p className={LABEL}>Location</p>
        <div className="flex flex-col gap-sp16">
          <Row label="Where would you like to work?" labelClassName={SUB_LABEL}>
            {locations.length || workModes.length ? (
              <div className="flex flex-wrap items-center gap-x-sp8">
                <p className={VALUE}>{locations.length ? locations.map(locationLabel).join("; ") : NOT_ADDED}</p>
                {workModes.length > 0 && (
                  <>
                    {locations.length > 0 && <span className="size-1 shrink-0 rounded-full bg-neutral-500" aria-hidden="true" />}
                    <p className={VALUE}>Open to: {workModes.join(", ")}</p>
                  </>
                )}
              </div>
            ) : (
              <p className={VALUE}>{NOT_ADDED}</p>
            )}
          </Row>
          <Row label="Are you open to relocation?" labelClassName={SUB_LABEL}>
            <p className={VALUE}>{relocation === "yes" ? "Yes" : relocation === "no" ? "No" : NOT_ANSWERED}</p>
            <EditLink label="location" onClick={() => onEdit("location")} />
          </Row>
        </div>
      </div>

      {asksWorkAuth && (
        <>
          <Divider />
          {/* The label keeps the app's "in the US" wording (Figma: "What’s your work authorization status?"). */}
          <Row label="What’s your work authorization status in the US?">
            <p className={VALUE}>{profile.workAuth || NOT_ANSWERED}</p>
            <EditLink label="work authorization" onClick={() => onEdit("workAuth")} />
          </Row>
        </>
      )}

      <Divider />

      <div className="flex flex-col gap-sp16">
        <p className={LABEL}>Websites</p>
        {websites.length ? (
          <div className="flex flex-col gap-sp12">
            {websites.map(([label, url], index) => (
              <Row key={`${label}-${url}`} label={label} labelClassName={SUB_LABEL}>
                <p className={`${VALUE} break-all`}>{url}</p>
                {index === websites.length - 1 && <EditLink label="websites" onClick={() => onEdit("websites")} />}
              </Row>
            ))}
          </div>
        ) : (
          // Not in Figma: simplest option.
          <div className="flex flex-col items-start gap-sp8">
            <p className={VALUE}>{NOT_ADDED}</p>
            <EditLink label="websites" onClick={() => onEdit("websites")} />
          </div>
        )}
      </div>
    </div>
  );
}

ProfileDetails.propTypes = {
  profile: PropTypes.object.isRequired,
  /** Called with "designation" | "years" | "location" | "workAuth" | "websites" */
  onEdit: PropTypes.func.isRequired,
};
