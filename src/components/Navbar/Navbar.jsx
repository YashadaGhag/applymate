import PropTypes from "prop-types";
import { Briefcase, ArrowRight } from "lucide-react";
import Button from "../Button/Button";

const Logo = () => (
  <a href="/" className="flex items-center gap-sp8 no-underline">
    {/* Figma: Blue/200 → Blue/500 at 135°. The glow has no token, so it stays inline. */}
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-linear-135 from-primary-200 to-primary-500"
      style={{ filter: "drop-shadow(0px 0px 7.5px rgba(59,130,246,0.5))" }}
    >
      <Briefcase size={14} color="white" strokeWidth={2.5} />
    </span>
    <span className="whitespace-nowrap text-body-large font-medium text-neutral-800">
      ApplyMate
    </span>
  </a>
);

const Navbar = ({ variant = "default", onGetStarted, className = "" }) => {
  if (variant === "onboarding") {
    return (
      <header className={`w-full bg-white shadow-button ${className}`}>
        <nav className="mx-auto flex items-center py-sp16 px-sp16 md:px-sp40 xl:px-sp80">
          <Logo />
        </nav>
      </header>
    );
  }

  return (
    <header className={`w-full bg-white shadow-button ${className}`}>
      <nav className="mx-auto flex items-center justify-between py-sp16 px-sp16 md:px-sp40 xl:px-sp80">
        {/* ── Logo ─────────────────────────────────────────────── */}
        <Logo />

        {/* ── CTA ────────────────────────────────────────────── */}
        <Button
          variant="primary"
          iconPosition="right"
          icon={<ArrowRight size={18} />}
          onClick={onGetStarted}
        >
          Get started
        </Button>
      </nav>
    </header>
  );
};

Navbar.propTypes = {
  variant: PropTypes.oneOf(["default", "onboarding"]),
  onGetStarted: PropTypes.func,
  className: PropTypes.string,
};

export default Navbar;
