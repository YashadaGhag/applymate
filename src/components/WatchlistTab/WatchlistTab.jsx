import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "../Button/Button";
import CompanyAvatar from "../CompanyAvatar";
import Toast from "../Toast";
import WatchlistModal from "../WatchlistModal";
import UnsupportedCompaniesNotice from "../UnsupportedCompaniesNotice";
import UnsupportedCompaniesModal from "../UnsupportedCompaniesModal";
import { useWatchlist } from "../../context/WatchlistContext";
import { useUnsupportedNotice } from "../../hooks/useUnsupportedNotice";
import { modalVisible, withoutCompany } from "../../utils/unsupportedNotice";

/**
 * Change Preferences > Company Watchlist (Figma 2662:7757): how many companies, an Add Companies
 * link, then the list (logo, name, domain). Removing happens in the Add company dialog, not here.
 * Zero companies isn't designed: the same count line and the Add Companies link, no list.
 */
export default function WatchlistTab() {
  const { companies, saveCompanies } = useWatchlist();
  const [open, setOpen] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const { companies: unsupported } = useUnsupportedNotice(companies);
  const [listOpen, setListOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [toast, setToast] = useState(null); // { message, variant }

  // Removes one company from the list at once, with the same write the watchlist save uses. The
  // banner, the count line and the modal all read the same list, so they update together.
  const removeUnsupported = async (company) => {
    setRemoving(true);
    const result = await saveCompanies(withoutCompany(companies, company.id));
    setRemoving(false);
    setToast(
      result.ok
        ? { message: `${company.name} removed from your watchlist` }
        : { message: `Couldn’t remove ${company.name}. Try again.`, variant: "error", company }
    );
  };

  return (
    <>
      <div className="flex flex-col gap-sp24">
        {/* Notice for companies we can't check yet (Figma 2862:12544); they stay on the list. */}
        <UnsupportedCompaniesNotice names={unsupported.map((c) => c.name)} onShowAll={() => setListOpen(true)} />

        <div className="flex flex-col gap-sp16">
        <div className="flex flex-col items-start gap-sp16">
          <p className="text-body-small font-regular text-neutral-500">
            You have added {companies.length} {companies.length === 1 ? "company" : "companies"} so far.
          </p>
          <Button
            variant="link"
            iconPosition="left"
            icon={<Plus size={18} />}
            // Figma: Text/Link/Default (Primary/500); a link button with an icon is Neutral/700.
            className="text-primary-500"
            onClick={() => setOpen(true)}
          >
            Add Companies
          </Button>
        </div>

        {companies.length > 0 && (
          <div className="flex flex-col gap-sp4">
            {companies.map((company) => (
              <div
                key={company.id}
                className="flex w-full items-center gap-sp12 border-b border-neutral-100 py-sp12"
              >
                <CompanyAvatar name={company.name} domain={company.domain} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-medium font-medium text-neutral-700">{company.name}</p>
                  {company.domain && (
                    <p className="truncate text-body-small text-neutral-500">{company.domain}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      <UnsupportedCompaniesModal
        isOpen={modalVisible(listOpen, unsupported)}
        companies={unsupported}
        onRemove={removeUnsupported}
        removing={removing}
        onClose={() => setListOpen(false)}
      />

      {open && (
        <WatchlistModal
          companies={companies}
          save={saveCompanies}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setShowSavedToast(true);
          }}
        />
      )}

      {showSavedToast && <Toast message="Watchlist saved" onHide={() => setShowSavedToast(false)} />}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onHide={() => setToast(null)}
          onAction={toast.company ? () => removeUnsupported(toast.company) : undefined}
        />
      )}
    </>
  );
}
