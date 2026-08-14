// Fetch the consultations for the currently selected date range.
//
// The drill-down screens read from here rather than from AppDataProvider's
// in-memory list: the range is applied in the database, so a screen showing one
// week never downloads a practice's full history to filter it away. AppData
// remains the cache for screens that genuinely want everything.
import { useCallback, useEffect, useState } from 'react';
import { Consultation } from '../types';
import { fetchConsultationsInRange } from '../services/api';
import { DateRange, rangeQuery } from '../utils/dateRange';

export function useRangedConsultations(
  range: DateRange,
  options: { pendingFollowUps?: boolean } = {},
): {
  consultations: Consultation[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pending = !!options.pendingFollowUps;
  const query = `${rangeQuery(range)}${pending ? '&pendingFollowUps=true' : ''}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConsultations(await fetchConsultationsInRange(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load consultations.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Refetches whenever the range changes, which is what makes the filter chips
  // update the list rather than only the heading.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchConsultationsInRange(query);
        if (active) setConsultations(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load consultations.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [query]);

  return { consultations, loading, error, reload: load };
}
