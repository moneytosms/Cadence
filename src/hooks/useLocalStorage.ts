import { useCallback, useEffect, useState } from 'react';

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function deepMerge<T>(defaults: T, stored: unknown): T {
  if (!isPlainObject(defaults) || !isPlainObject(stored)) {
    return (stored !== undefined ? stored : defaults) as T;
  }
  const result: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in stored) {
      result[key] = deepMerge(defaults[key], stored[key]);
    }
  }
  return result as T;
}

export function useLocalStorage<T>(key: string, initialValue: T, mergeObjects = false) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return initialValue;
      const parsed = JSON.parse(raw);
      return mergeObjects ? deepMerge(initialValue, parsed) : (parsed as T);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota errors gracefully
    }
  }, [key, value]);

  const reset = useCallback(() => {
    setValue(initialValue);
  }, [initialValue]);

  return [value, setValue, reset] as const;
}
