import { useRef } from "react";
import PropTypes from "prop-types";
import { CircleX, Loader2, RotateCcw } from "lucide-react";
import SearchBar from "../SearchBar";
import Button from "../Button";
import CompanyAvatar from "../CompanyAvatar";
import { useCompanySearch } from "../../hooks/useCompanySearch";
import { searchErrorInfo } from "../../utils/companySearchError";

/** A watchlist row: logo, name, domain and the remove X. `noDomainLabel` stands in for a missing domain. */
export function CompanyRow({ company, onRemove, noDomainLabel, disabled = false }) {
  return (
    <div className="flex w-full items-center gap-sp12 border-b border-neutral-100 py-sp12 last:border-b-0">
      <CompanyAvatar name={company.name} domain={company.domain} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-medium font-medium text-neutral-700">{company.name}</p>
        {(company.domain || noDomainLabel) && (
          <p className="truncate text-body-small text-neutral-500">{company.domain || noDomainLabel}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(company.id)}
        disabled={disabled}
        aria-label={`Remove ${company.name} from watchlist`}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent text-primary-500 hover:bg-neutral-50 disabled:cursor-default disabled:opacity-50"
      >
        <CircleX size={18} />
      </button>
    </div>
  );
}

function SearchResultRow({ result, isAdded, isHighlighted, onSelect }) {
  return (
    <div
      role="option"
      aria-selected={isHighlighted}
      aria-disabled={isAdded}
      onClick={() => !isAdded && onSelect(result)}
      className={`flex w-full items-center gap-sp12 border-b border-neutral-100 py-sp12 last:border-b-0 ${
        isAdded ? "cursor-default opacity-50" : "cursor-pointer"
      } ${isHighlighted && !isAdded ? "rounded-xs bg-primary-50" : ""}`}
    >
      <CompanyAvatar name={result.name} domain={result.domain} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-medium font-medium text-neutral-700">{result.name}</p>
        <p className="truncate text-body-small text-neutral-500">{result.domain}</p>
      </div>
      {isAdded && (
        <span className="shrink-0 text-body-small font-medium text-success-500">Added</span>
      )}
    </div>
  );
}

/**
 * The watchlist search + "Your watchlist" list, shared by the onboarding watchlist card and the
 * Change Preferences Add company dialog. It renders two blocks (search, then list) for a parent
 * flex column to lay out: the parent gives it a height, and only the list scrolls.
 * `onAdd({ name, domain, isCustom })` and `onRemove(id)` change whatever list the parent holds.
 */
const WatchlistEditor = ({ companies, onAdd, onRemove, showSearchLabel = true }) => {
  const searchInputRef = useRef(null);
  const {
    query,
    setQuery,
    status,
    results,
    errorCode,
    highlightedIndex,
    setHighlightedIndex,
    isSearchActive,
    runSearch,
    resetSearch,
  } = useCompanySearch();

  const searchError = searchErrorInfo(errorCode);
  const addedDomains = new Set(companies.map((c) => c.domain?.toLowerCase()).filter(Boolean));

  const tryAdd = (company) => {
    onAdd(company);
    resetSearch();
    searchInputRef.current?.focus();
  };

  const selectResult = (result) => {
    if (addedDomains.has(result.domain?.toLowerCase())) return;
    tryAdd({ name: result.name, domain: result.domain, isCustom: false });
  };

  const addCustom = () => {
    tryAdd({ name: query.trim(), domain: null, isCustom: true });
  };

  const selectableResults = results.filter((r) => !addedDomains.has(r.domain?.toLowerCase()));

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      resetSearch();
      return;
    }

    if (status === "results") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (selectableResults.length === 0) return;
        setHighlightedIndex((i) => (i + 1) % selectableResults.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (selectableResults.length === 0) return;
        setHighlightedIndex((i) => (i - 1 + selectableResults.length) % selectableResults.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const current = selectableResults[highlightedIndex] || selectableResults[0];
        if (current) selectResult(current);
      }
    } else if (status === "no-results" && e.key === "Enter") {
      e.preventDefault();
      addCustom();
    }
  };

  const countLabel = `${companies.length} ${companies.length === 1 ? "company" : "companies"} added`;

  return (
    <>
      {/* Search — fixed at top */}
      <div className="flex shrink-0 flex-col gap-sp8">
        {showSearchLabel && (
          <p className="text-body-medium font-regular text-neutral-800">Add a company</p>
        )}
        <SearchBar
          ref={searchInputRef}
          placeholder="Search Companies"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={resetSearch}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* List — only this scrolls */}
      <div className="flex min-h-0 flex-1 flex-col gap-sp4">
        <div className="flex h-sp24 shrink-0 items-center justify-between">
          <p className="text-body-medium font-regular text-neutral-800">Your watchlist</p>
          {companies.length > 0 && (
            <span className="rounded-lg bg-primary-50 px-sp8 py-sp4 text-body-small text-primary-500">
              {countLabel}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!isSearchActive && (
            <>
              {companies.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-body-small text-neutral-500">No companies added yet</p>
                </div>
              ) : (
                companies.map((c) => <CompanyRow key={c.id} company={c} onRemove={onRemove} />)
              )}
            </>
          )}

          {isSearchActive && status === "loading" && (
            <div className="flex h-full items-center justify-center gap-sp8 py-sp32 text-neutral-500">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-body-medium">Searching&hellip;</span>
            </div>
          )}

          {isSearchActive && status === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-sp12 py-sp32 text-center">
              <p className="text-body-medium text-neutral-500">{searchError.message}</p>
              {searchError.canRetry && (
                <Button
                  variant="secondary"
                  iconPosition="left"
                  icon={<RotateCcw size={16} />}
                  onClick={() => runSearch(query.trim())}
                >
                  Retry
                </Button>
              )}
            </div>
          )}

          {isSearchActive && status === "no-results" && (
            <div
              role="option"
              aria-selected="true"
              onClick={addCustom}
              className="flex w-full cursor-pointer items-center gap-sp12 rounded-xs bg-primary-50 py-sp12"
            >
              <CompanyAvatar name={query.trim() || "?"} domain={null} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-medium font-medium text-neutral-700">
                  No company found.
                </p>
                <p className="truncate text-body-small text-primary-500">
                  {`Add "${query.trim()}" anyway`}
                </p>
              </div>
            </div>
          )}

          {isSearchActive && status === "results" &&
            results.map((result) => (
              <SearchResultRow
                key={result.domain}
                result={result}
                isAdded={addedDomains.has(result.domain?.toLowerCase())}
                isHighlighted={selectableResults[highlightedIndex]?.domain === result.domain}
                onSelect={selectResult}
              />
            ))}
        </div>
      </div>
    </>
  );
};

WatchlistEditor.propTypes = {
  companies: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string, name: PropTypes.string, domain: PropTypes.string })
  ).isRequired,
  onAdd: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  /** The "Add a company" label above the search field (onboarding has it; the dialog's title replaces it) */
  showSearchLabel: PropTypes.bool,
};

export default WatchlistEditor;
