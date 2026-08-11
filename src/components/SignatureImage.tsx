import { useState, useEffect } from 'react';
import { Loader2, ImageOff } from 'lucide-react';
import { resolveSignatureUrl } from '../lib/signatures';

/**
 * Renders a stored consent signature, whether it was drawn (inline data URL) or
 * uploaded (private storage path needing a signed URL). Handles its own loading
 * and failure states so callers do not each reimplement the async resolve.
 */
export default function SignatureImage({ signatureData, className, alt = 'Client signature' }: {
  signatureData: string | null | undefined;
  className?: string;
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    if (!signatureData) { setState('failed'); setSrc(null); return; }
    setState('loading');
    (async () => {
      const url = await resolveSignatureUrl(signatureData);
      if (cancelled) return;
      setSrc(url);
      setState(url ? 'ready' : 'failed');
    })();
    return () => { cancelled = true; };
  }, [signatureData]);

  if (state === 'loading') {
    return (
      <div className={`flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl ${className ?? 'h-24'}`}>
        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
      </div>
    );
  }

  if (state === 'failed' || !src) {
    return (
      <div className={`flex items-center justify-center gap-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400 ${className ?? 'h-24'}`}>
        <ImageOff className="w-4 h-4" /> Signature unavailable
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} />;
}
