import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { normalizeSavedLocations } from '../utils/locationSearch.js';

const OnboardingContext = createContext();

function defaultOnboardingData() {
  return {
    resumeFile: null,

    // Filled from the resume by applyResumeExtraction. Empty until then; never guessed.
    resumeVersion: null,
    roles: [],
    yearsOfExperience: null,
    seniority: null,
    // The values the resume supplied, kept so the Role page can tell "Found in resume"
    // (still exactly what was extracted) from "Answered" (the user changed or added it).
    resumeValues: { roles: [], yearsOfExperience: null },
    // True when the last upload couldn't be read; the Role page says to fill fields in by hand.
    resumeExtractionFailed: false,

    relocation: null,
    // [{ label, city, region, country, countryCode }], see shared/location.js
    locations: [],
    // Unticked until the user answers: no work mode is assumed.
    workTypes: { remote: false, onsite: false, hybrid: false },

    workAuth: null,

    websites: {
      linkedin: '',
      portfolio: '',
      additional: [],
    },
  };
}

export function OnboardingProvider({ children }) {
  const [onboardingData, setOnboardingData] = useState(defaultOnboardingData);
  // Guards the write-through effect so it never fires with the default
  // answers before the server's saved profile has loaded.
  const hasLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/state')
      .then((res) => {
        if (!res.ok) throw new Error(`/api/state responded ${res.status}`);
        return res.json();
      })
      .then(async (state) => {
        if (cancelled) return;
        if (state.profile && typeof state.profile === 'object') {
          // Upgrades plain-string locations, and turns a saved "Remote (US)" location into the
          // Remote work mode (locations are always real places; remote is a checkbox).
          const { locations, remote } = await normalizeSavedLocations(state.profile.locations);
          if (cancelled) return;
          setOnboardingData((prev) => {
            const merged = { ...prev, ...state.profile, locations };
            return remote ? { ...merged, workTypes: { ...merged.workTypes, remote: true } } : merged;
          });
        }
      })
      .catch((err) => {
        console.warn('[onboarding] could not load persisted profile, continuing in memory only:', err);
      })
      .finally(() => {
        if (!cancelled) hasLoaded.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    // resumeFile is a local File object (not JSON-serializable) and isn't
    // part of the server-side profile — exclude it from the write-through.
    const profile = { ...onboardingData };
    delete profile.resumeFile;
    fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    }).catch((err) => {
      console.warn('[onboarding] could not persist profile, continuing in memory only:', err);
    });
  }, [onboardingData]);

  const updateOnboarding = (key, value) => {
    setOnboardingData(prev => ({ ...prev, [key]: value }));
  };

  // Takes the result of extractResume() (src/utils/resumeExtraction.js).
  // A different resume starts from a clean slate: every answer, including the user-only ones
  // (relocation, work authorization, work modes), is reset so nothing carries over from the
  // previous resume. Re-uploading the same file (same resumeVersion) keeps the user's answers.
  // An upload that never reached the server has no version and counts as a different resume.
  // On success the extracted fields are applied; anything not found stays empty.
  const applyResumeExtraction = (result) => {
    setOnboardingData((prev) => {
      const sameResume = result.resumeVersion !== null && result.resumeVersion === prev.resumeVersion;
      const base = sameResume
        ? prev
        : {
            ...defaultOnboardingData(),
            // Not tied to a resume: keep anything the provider holds beyond the Role answers.
            resumeFile: prev.resumeFile,
          };

      if (result.error) {
        return {
          ...base,
          resumeVersion: result.resumeVersion,
          resumeValues: { roles: [], yearsOfExperience: null },
          resumeExtractionFailed: true,
        };
      }
      return {
        ...base,
        resumeVersion: result.resumeVersion,
        roles: result.fields.roles,
        yearsOfExperience: result.fields.yearsOfExperience,
        seniority: result.fields.seniority,
        locations: result.fields.locations,
        // Same default as adding a first location on the Role page: Remote and Hybrid, and
        // only when no work mode is set yet (a kept answer from the same resume wins).
        workTypes:
          result.fields.locations.length > 0 && !Object.values(base.workTypes).some(Boolean)
            ? { remote: true, onsite: false, hybrid: true }
            : base.workTypes,
        websites: result.fields.websites,
        resumeValues: {
          roles: result.fields.roles,
          yearsOfExperience: result.fields.yearsOfExperience,
        },
        resumeExtractionFailed: false,
      };
    });
  };

  return (
    <OnboardingContext.Provider value={{ onboardingData, updateOnboarding, applyResumeExtraction }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export const useOnboarding = () => useContext(OnboardingContext);
