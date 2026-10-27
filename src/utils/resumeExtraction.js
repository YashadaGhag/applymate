import { freeTextLocation, isRemoteOnly } from '../../shared/location.js';

// The UI's only entry point to resume extraction. It never throws: on any failure it returns
// an empty result, so the Role page always works and the user fills it in by hand.
//
// Result shape:
// {
//   resumeVersion: string | null,   // id of the stored resume (null if the upload never reached the server)
//   fields: {
//     roles: string[], yearsOfExperience: number | null, seniority: string | null,
//     locations: { label, city, region, country, countryCode }[],  // see shared/location.js
//     websites: { linkedin: string, portfolio: string, additional: string[] },  // "" when not found
//   },
//   found:  { roles: boolean, yearsOfExperience: boolean, locations: boolean, websites: boolean },
//   error:  string | null,
// }

function emptyResult(resumeVersion = null, error = null) {
  return {
    resumeVersion,
    fields: {
      roles: [],
      yearsOfExperience: null,
      seniority: null,
      locations: [],
      websites: { linkedin: '', portfolio: '', additional: [] },
    },
    found: { roles: false, yearsOfExperience: false, locations: false, websites: false },
    error,
  };
}

const MAX_ROLES = 5;

export async function extractResume(file) {
  try {
    const res = await fetch('/api/resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
    });
    if (!res.ok) throw new Error(`/api/resume responded ${res.status}`);
    const data = await res.json();

    if (data.extraction?.status !== 'ok') {
      return emptyResult(data.resumeVersion, data.extraction?.error ?? 'Extraction failed');
    }

    const f = data.extraction.fields;
    const roles = f.designation ? [f.designation, ...f.adjacentRoles].slice(0, MAX_ROLES) : [];
    // The server maps the extracted place to the city list when it names exactly one city;
    // otherwise it's kept as free text, never matched to a guess. "Remote" isn't a place, so a
    // remote-only value is dropped.
    const location =
      f.locationResolved ?? (f.location && !isRemoteOnly(f.location) ? freeTextLocation(f.location) : null);
    const locations = location ? [location] : [];
    const sites = f.websites ?? {};
    const websites = {
      linkedin: sites.linkedin ?? '',
      portfolio: sites.portfolio ?? '',
      additional: sites.other ?? [],
    };

    return {
      resumeVersion: data.resumeVersion,
      fields: { roles, yearsOfExperience: f.yearsOfExperience, seniority: f.seniority, locations, websites },
      found: {
        roles: roles.length > 0,
        yearsOfExperience: f.yearsOfExperience !== null,
        locations: locations.length > 0,
        websites: Boolean(websites.linkedin || websites.portfolio || websites.additional.length),
      },
      error: null,
    };
  } catch (err) {
    console.warn('[resume] extraction unavailable, Role page will need manual answers:', err);
    return emptyResult(null, err.message);
  }
}
