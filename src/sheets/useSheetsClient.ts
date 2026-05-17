import { useMemo } from 'react';
import { createSheetsClient } from './sheetsClient';
import { useGoogleAuth } from '../auth/useGoogleAuth';

export function useSheetsClient() {
  const { ensureToken } = useGoogleAuth();
  return useMemo(() => createSheetsClient(ensureToken), [ensureToken]);
}
