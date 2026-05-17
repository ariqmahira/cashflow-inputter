import { useContext } from 'react';
import { GoogleAuthContext } from './GoogleAuthProvider';

export function useGoogleAuth() {
  const ctx = useContext(GoogleAuthContext);
  if (!ctx) throw new Error('useGoogleAuth must be used inside GoogleAuthProvider');
  return ctx;
}
