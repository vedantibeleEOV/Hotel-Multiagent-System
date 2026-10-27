import { useState, useEffect, useCallback } from 'react';
import { hotelApi } from '../api/hotelApi';

/**
 * Custom hook to load AI Operations summary data
 * with automatic 10-second polling and manual refresh.
 */
export function useAiOperations() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    }
    try {
      const summary = await hotelApi.getAiOperationsSummary();
      setData(summary);
      setError(null);
    } catch (err) {
      console.error('Failed to load AI operations summary:', err);
      setError(err.message || 'Unable to connect to AI operations service');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // 10-second polling for live updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchData]);

  const refreshAiOperations = useCallback(async () => {
    await fetchData(false);
  }, [fetchData]);

  return {
    data,
    header: data?.header || null,
    agents: data?.agents || [],
    runs: data?.runs || [],
    feed: data?.feed || [],
    loading,
    error,
    refreshAiOperations,
  };
}
