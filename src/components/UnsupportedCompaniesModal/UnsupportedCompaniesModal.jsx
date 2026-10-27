import PropTypes from "prop-types";
import Modal from "../Modal/Modal";
import { CompanyRow } from "../WatchlistEditor/WatchlistEditor";

/**
 * Change Preferences > Company Watchlist: every watchlist company we can't check (Figma 2908:12462),
 * opened from the "N more" link in the banner. The same rows as the watchlist (logo, name, domain;
 * "No website added" for a custom company without one) with a remove X each. Unlike Add Companies,
 * a removal is written at once by the parent (`onRemove(company)`); the list is the parent's shared
 * unsupported list, so it shrinks live. The parent closes the modal when the list is empty. The
 * list scrolls inside the modal.
 */
const UnsupportedCompaniesModal = ({ isOpen, companies, onRemove, removing = false, onClose }) => (
  <Modal
    variant="form"
    isOpen={isOpen}
    title="Companies we can’t check yet"
    onClose={onClose}
    onConfirm={onClose}
    confirmLabel="Close"
    hideCancel
  >
    <p className="text-body-medium font-regular text-neutral-700">
      These companies’ careers pages use a system ApplyMate can’t read, so their roles won’t appear in your
      recommendations. They stay on your list.
    </p>
    <div className="flex max-h-80 flex-col overflow-y-auto">
      {companies.map((company) => (
        <CompanyRow
          key={company.id}
          company={company}
          noDomainLabel="No website added"
          onRemove={() => onRemove(company)}
          disabled={removing}
        />
      ))}
    </div>
  </Modal>
);

UnsupportedCompaniesModal.propTypes = {
  isOpen: PropTypes.bool,
  /** The unsupported companies, in list order */
  companies: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, name: PropTypes.string, domain: PropTypes.string })).isRequired,
  /** Called with the company whose X was clicked */
  onRemove: PropTypes.func.isRequired,
  /** A removal is being written: the X buttons are disabled so two writes never cross */
  removing: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
};

export default UnsupportedCompaniesModal;
