import PropTypes from "prop-types";
import { getLogoUrl } from "../../utils/logo";

const CompanyLogo = ({ company, companyDomain }) => {
  const logoUrl = getLogoUrl(companyDomain);
  const initials = company.charAt(0);

  if (!logoUrl) {
    return (
      <div className="size-12 shrink-0 rounded-sm border border-primary-200 overflow-hidden flex items-center justify-center bg-primary-100 text-primary-500 text-body-large font-bold">
        {initials}
      </div>
    );
  }

  return (
    <div className="size-12 shrink-0 rounded-sm border border-primary-200 overflow-hidden flex items-center justify-center bg-white">
      <img
        src={logoUrl}
        alt={`${company} logo`}
        className="size-full object-contain"
        onError={(e) => {
          e.target.style.display = "none";
          e.target.nextSibling.style.display = "flex";
        }}
      />
      <div
        className="size-full items-center justify-center bg-primary-100 text-primary-500 text-body-large font-bold"
        style={{ display: "none" }}
      >
        {initials}
      </div>
    </div>
  );
};

CompanyLogo.propTypes = {
  company: PropTypes.string.isRequired,
  companyDomain: PropTypes.string,
};

export default CompanyLogo;
