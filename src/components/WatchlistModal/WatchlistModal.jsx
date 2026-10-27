import { useState } from "react";
import PropTypes from "prop-types";
import { EditModal } from "../ProfileEditModals/ProfileEditModals";
import WatchlistEditor from "../WatchlistEditor";
import { withCompany } from "../../utils/watchlist";

/**
 * Change Preferences > Company Watchlist: the "Add company" dialog (Figma 2684:8155). The
 * onboarding watchlist's search and list, working on a copy of the saved list: adds and removals
 * are held until Save, Cancel discards. Save writes the items only (`save` is the context's
 * saveCompanies; companyMeta is server-owned and never sent).
 */
export default function WatchlistModal({ companies, save, onClose, onSaved }) {
  const [draft, setDraft] = useState(companies);

  // Changed means the set of companies differs (adding then removing the same one is no change).
  const changed = draft.length !== companies.length || draft.some((c, i) => c.id !== companies[i].id);

  return (
    <EditModal
      title="Add company"
      size="wide"
      onClose={onClose}
      onSaved={onSaved}
      save={save}
      buildPatch={() => draft}
      changed={changed}
      valid
    >
      {/* 444 = Figma's 480 content height minus the 20 title and its 16 gap; only the list scrolls. */}
      <div className="flex h-111 flex-col gap-sp16">
        <WatchlistEditor
          companies={draft}
          onAdd={(company) => setDraft((prev) => withCompany(prev, company))}
          onRemove={(id) => setDraft((prev) => prev.filter((c) => c.id !== id))}
          showSearchLabel={false}
        />
      </div>
    </EditModal>
  );
}

WatchlistModal.propTypes = {
  companies: PropTypes.array.isRequired,
  save: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
