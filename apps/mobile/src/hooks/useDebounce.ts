import { useEffect, useState } from 'react';

/**
 * Debounces a value — only updates after the specified delay has passed
 * without the value changing. Useful for search inputs to avoid
 * firing an API call on every keystroke.
 *
 * @param value  - The value to debounce.
 * @param delay  - Debounce delay in milliseconds (default: 500ms).
 * @returns The debounced value.
 *
 * @example
 * const [query, setQuery] = useState('');
 * const debouncedQuery = useDebounce(query, 400);
 *
 * useEffect(() => {
 *   if (debouncedQuery) searchApi(debouncedQuery);
 * }, [debouncedQuery]);
 */
export function useDebounce<T>(value: T, delay = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
