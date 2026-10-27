import { useState } from "react";
import PropTypes from "prop-types";
import { getLogoUrl } from "../../utils/logo";

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

const AVATAR_COLORS = [
  "bg-primary-100 text-primary-600",
  "bg-success-100 text-success-700",
  "bg-warning-100 text-warning-700",
  "bg-error-100 text-error-700",
];

function avatarColor(name) {
  const code = name.charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

/**
 * A company's logo from its domain (never stored), or an initials avatar when there is no domain
 * (a custom company) or the logo fails to load. Shared by the onboarding watchlist, the Change
 * Preferences watchlist tab and its Add company dialog.
 */
const CompanyAvatar = ({ name, domain, size = 40 }) => {
  const [failed, setFailed] = useState(false);
  const boxSize = { 40: "size-sp40", 32: "size-sp32", 24: "size-6" }[size] ?? "size-sp32";
  const logoUrl = getLogoUrl(domain);
  // The 24 size sits in the Tracker and Saved Jobs tables, where the logo has a 4px radius.
  const radius = size === 24 ? "rounded-xs" : "rounded-sm";

  if (!logoUrl || failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center ${radius} ${boxSize} ${avatarColor(name)}`}
      >
        <span className="text-body-small font-medium">{initials(name)}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden ${radius} border border-neutral-100 bg-neutral-50 ${boxSize}`}
    >
      <img
        src={logoUrl}
        alt=""
        className="size-full object-contain p-sp4"
        onError={() => setFailed(true)}
      />
    </div>
  );
};

CompanyAvatar.propTypes = {
  name: PropTypes.string.isRequired,
  domain: PropTypes.string,
  size: PropTypes.oneOf([40, 32, 24]),
};

export default CompanyAvatar;
