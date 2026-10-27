import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { withCompany } from '../utils/watchlist';

// Safe default so any consumer rendered outside a <WatchlistProvider> (e.g.
// during tests or a route that forgets to wrap it) reads an empty watchlist
// instead of crashing on `undefined`.
const WatchlistContext = createContext({
  companies: [],
  addCompany: () => false,
  removeCompany: () => {},
  saveCompanies: async () => ({ ok: false, error: 'No watchlist provider.' }),
});

export function WatchlistProvider({ children }) {
  const [companies, setCompanies] = useState([]);
  // Guards the write-through effect so it never fires with the initial
  // empty state before the server's saved watchlist has loaded — otherwise
  // it would overwrite a non-empty store with [] on every app start.
  const hasLoaded = useRef(false);
  // saveCompanies has already written the list; the write-through below skips that one change.
  const skipNextPersist = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/state')
      .then((res) => {
        if (!res.ok) throw new Error(`/api/state responded ${res.status}`);
        return res.json();
      })
      .then((state) => {
        if (cancelled) return;
        if (Array.isArray(state.watchlist)) {
          setCompanies(state.watchlist);
        }
      })
      .catch((err) => {
        console.warn('[watchlist] could not load persisted watchlist, continuing in memory only:', err);
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
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    fetch('/api/watchlist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: companies }),
    }).catch((err) => {
      console.warn('[watchlist] could not persist watchlist, continuing in memory only:', err);
    });
  }, [companies]);

  const addCompany = (company) => {
    let added = false;
    setCompanies((prev) => {
      const next = withCompany(prev, company);
      added = next !== prev;
      return next;
    });
    return added;
  };

  const removeCompany = (id) => {
    setCompanies((prev) => prev.filter((c) => c.id !== id));
  };

  // Replaces the whole list in one write and waits for the server (Change Preferences > Company
  // Watchlist). Only the item fields are sent: companyMeta is server-owned. Resolves
  // { ok: true } or { ok: false, error }; never throws.
  const saveCompanies = async (items) => {
    try {
      const res = await fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(`/api/watchlist responded ${res.status}`);
      const data = await res.json();
      skipNextPersist.current = true;
      setCompanies(Array.isArray(data.watchlist) ? data.watchlist : items);
      return { ok: true };
    } catch (err) {
      console.warn('[watchlist] could not save:', err);
      return { ok: false, error: "Couldn't save your watchlist. Try again." };
    }
  };

  return (
    <WatchlistContext.Provider value={{ companies, addCompany, removeCompany, saveCompanies }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export const useWatchlist = () => useContext(WatchlistContext);
