import PropTypes from "prop-types";
import { Briefcase } from "lucide-react";

const OPEN_SOURCE_LINKS = [
  { label: "About", href: "#about" },
  { label: "GitHub", href: "#github" },
];

const Footer = ({ variant = "default", links = OPEN_SOURCE_LINKS, className = "" }) => {
  if (variant === "onboarding") {
    return (
      <footer className={`w-full bg-white ${className}`}>
        <div className="mx-auto flex items-center justify-between border-t border-neutral-100 px-sp16 py-sp16 md:px-sp40 xl:px-sp80" style={{ height: 52 }}>
          <span className="text-body-small text-neutral-500">
            &copy; 2026 ApplyMate. All rights reserved.
          </span>
          <div className="flex items-center gap-sp24">
            <a
              href="#privacy"
              className="text-body-small text-neutral-500 no-underline transition-colors hover:text-primary-500"
            >
              Privacy Policy
            </a>
            <a
              href="#terms"
              className="text-body-small text-neutral-500 no-underline transition-colors hover:text-primary-500"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className={`w-full border-t border-neutral-100 bg-white ${className}`}>
      <div className="mx-auto flex flex-col gap-sp32 px-sp16 py-sp40 md:px-sp40 xl:px-sp80">
        <div className="flex flex-col gap-sp24 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-sp16 md:max-w-[300px]">
            <a href="/" className="flex items-center gap-sp8 no-underline">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-sm"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, #BCC5F1 0%, #5065D3 100%)",
                  filter: "drop-shadow(0px 0px 7.5px rgba(59,130,246,0.5))",
                }}
              >
                <Briefcase size={14} color="white" strokeWidth={2.5} />
              </span>
              <span className="text-body-large font-medium text-neutral-800">
                ApplyMate
              </span>
            </a>
            <p className="text-body-medium text-neutral-500">
              The AI agent that handles the cognitive work of job searching.
            </p>
          </div>

          <div className="flex flex-col gap-sp16 md:max-w-[300px]">
            <span className="text-body-large font-medium text-neutral-700">
              Open Source
            </span>
            <ul className="m-0 flex list-none flex-col gap-sp12 p-0">
              {links.map(({ label, href }) => (
                <li key={label}>
                  <a
                    href={href}
                    className="text-body-medium text-primary-500 no-underline transition-colors hover:text-primary-600"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <span className="block w-full text-center text-body-small text-neutral-400">
          &copy; 2026 ApplyMate. All rights reserved.
        </span>
      </div>
    </footer>
  );
};

Footer.propTypes = {
  variant: PropTypes.oneOf(["default", "onboarding"]),
  links: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      href: PropTypes.string.isRequired,
    })
  ),
  className: PropTypes.string,
};

export default Footer;
