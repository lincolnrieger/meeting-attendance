import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/**
 * Load JSON from the API. Re-fetches when `url` changes.
 * Returns { data, error, loading, reload, setData }.
 */
export function useApi(url) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const load = useCallback(async () => {
    if (!url) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.get(url);
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);

  return { ...state, reload: load, setData };
}
