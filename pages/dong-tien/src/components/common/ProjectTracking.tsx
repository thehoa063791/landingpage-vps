import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { tokenKey } from '@/lib/brand';

declare global {
  interface Window {
    FunnelTrackingToken?: () => string;
    FunnelTracking?: {
      context: () => Record<string, string>;
      navigate: () => void;
      browserEvent: (event: string, details: Record<string, unknown>, id: string) => void;
    };
  }
}

// The runtime and its configuration are served from the parent project.
export default function ProjectTracking() {
  const router = useRouter();
  useEffect(() => {
    window.FunnelTrackingToken = () => { try { return localStorage.getItem(tokenKey()) || ''; } catch { return ''; } };
    if (router.isReady) window.FunnelTracking?.navigate();
  }, [router.isReady, router.asPath]);
  return null;
}
