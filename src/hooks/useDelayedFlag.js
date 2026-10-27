import { useEffect, useState } from "react";

/** True once `active` has stayed true for `delay` ms, so a fast load never flashes a loader. */
export function useDelayedFlag(active, delay) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setShown(true), delay);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [active, delay]);
  return active && shown;
}
