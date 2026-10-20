import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

/** Load a GET endpoint; `reload` refetches. A null path waits. `initial` skips the first fetch (server-inlined data). */
export function useApi<T>(path: string | null, initial?: T) {
  const [data, setData] = useState<T | undefined>(initial);
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(initial === undefined && path !== null);
  const [skip, setSkip] = useState(initial !== undefined);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason : new ApiError(0, 'Network error. Check your connection.'));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    if (skip) { setSkip(false); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `skip` only guards the first run
  }, [load]);
  return { data, setData, error, loading, reload: load };
}
