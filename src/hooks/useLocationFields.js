import { useState } from "react";
import { useLocationSearch } from "./useLocationSearch";
import { freeTextLocation, isRemoteOnly, matchTypedLocation } from "../../shared/location.js";

/**
 * The Role page's location + work mode fields, shared with the Change Preferences location modal.
 * `locations` are saved location objects (or plain strings from an old profile), `workTypes`
 * is { remote, onsite, hybrid }.
 */
export function useLocationFields({ locations, workTypes: initialWorkTypes }) {
  // Location objects ({ label, city, region, country, countryCode }); the chips show labels.
  const [selectedLocations, setSelectedLocations] = useState(() =>
    locations.map((loc) => (typeof loc === "string" ? freeTextLocation(loc) : loc))
  );
  const locationSearch = useLocationSearch();
  // Typed locations still waiting on their search; Continue / Save waits for them.
  const [pendingLocations, setPendingLocations] = useState(0);
  const [workTypes, setWorkTypes] = useState(initialWorkTypes);
  // Once the user ticks or unticks a work mode, the defaults below never override it.
  const [workTypesTouched, setWorkTypesTouched] = useState(false);

  const toggleWorkType = (key) => {
    setWorkTypesTouched(true);
    setWorkTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Remote and Hybrid are pre-checked when the first location is added, and cleared again if
  // every location is removed, unless the user has set work modes themselves.
  const applyWorkTypeDefaults = (prevCount, nextCount) => {
    if (workTypesTouched) return;
    if (prevCount === 0 && nextCount > 0 && !Object.values(workTypes).some(Boolean)) {
      setWorkTypes({ remote: true, onsite: false, hybrid: true });
    } else if (nextCount === 0) {
      setWorkTypes({ remote: false, onsite: false, hybrid: false });
    }
  };

  // Maps the chip labels back to location objects: keep ones already selected and picked
  // search results. Typed text is matched with matchTypedLocation (exact label, or the only
  // city of that name); if its search hasn't returned yet, it's added as free text first and
  // replaced once the search for exactly that text resolves.
  // "Remote" typed as a location isn't a place: it ticks the Remote work mode instead of
  // becoming a chip.
  const handleLocationsChange = (allLabels) => {
    const { results } = locationSearch;
    const typedRemote = allLabels.some((label) => isRemoteOnly(label));
    const labels = allLabels.filter((label) => !isRemoteOnly(label));
    const byLabel = new Map(
      [...results, ...selectedLocations].map((loc) => [loc.label.toLowerCase(), loc])
    );
    const unresolved = [];
    const next = labels.map((label) => {
      const known = byLabel.get(label.toLowerCase()) ?? matchTypedLocation(label, results);
      if (known) return known;
      const placeholder = freeTextLocation(label);
      if (!placeholder.countryCode) unresolved.push(placeholder);
      return placeholder;
    });

    applyWorkTypeDefaults(selectedLocations.length, next.length);
    if (typedRemote) {
      setWorkTypesTouched(true);
      setWorkTypes((prev) => ({ ...prev, remote: true }));
    }
    setSelectedLocations(next);

    for (const placeholder of unresolved) {
      setPendingLocations((n) => n + 1);
      locationSearch
        .resultsFor(placeholder.label)
        .then((found) => {
          const match = matchTypedLocation(placeholder.label, found);
          if (!match) return;
          setSelectedLocations((current) => {
            // Skip if the chip was removed meanwhile, or the match is already selected.
            if (current.some((loc) => loc.label === match.label)) {
              return current.filter((loc) => loc !== placeholder);
            }
            return current.map((loc) => (loc === placeholder ? match : loc));
          });
        })
        .finally(() => setPendingLocations((n) => n - 1));
    }
  };

  return {
    selectedLocations,
    locationSearch,
    pendingLocations,
    workTypes,
    toggleWorkType,
    handleLocationsChange,
  };
}
