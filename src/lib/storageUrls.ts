import { supabase } from './supabase';

// The `payment-receipts` and `attendance-photos` buckets were created public,
// and every upload site stored the result of getPublicUrl() straight into a
// database column. Public buckets serve reads without consulting RLS, so those
// receipts and staff photos were readable by anyone holding the URL — no login,
// no approval, no expiry.
//
// The fix is to store the object PATH and mint a short-lived signed URL at read
// time, the way finance-receipts and client-documents already work (see
// Dashboard.openReceipt and lib/signatures.ts).
//
// Rows written before that change still hold a full public URL, so every helper
// here accepts either shape. That tolerance is what lets the buckets be flipped
// private without a backfill running first: a legacy URL still resolves, because
// toObjectPath() recovers the path from it.

const SIGNED_URL_TTL_SECONDS = 3600;

export type PrivateBucket = 'payment-receipts' | 'attendance-photos';

/**
 * Accepts either an object path or a legacy public URL and returns the path.
 *
 * Public URLs look like:
 *   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>?<query>
 */
export function toObjectPath(bucket: PrivateBucket, value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;

  const marker = `/object/public/${bucket}/`;
  const at = value.indexOf(marker);
  // A URL we do not recognise is passed through untouched; createSignedUrl will
  // fail on it and resolveStorageUrl logs, which beats silently mangling it.
  if (at === -1) return value;

  const raw = value.slice(at + marker.length).split('?')[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Resolves a stored value to a signed URL an <img> or link can use.
 * Returns null when there is nothing to show, or when the URL could not be
 * signed (expired session, missing object, storage policy).
 */
export async function resolveStorageUrl(
  bucket: PrivateBucket,
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;

  const path = toObjectPath(bucket, value);
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error(`[storage] Could not sign ${bucket}/${path}`, error?.message);
    return null;
  }
  return data.signedUrl;
}

/** Signs a stored value and opens it in a new tab. */
export async function openStorageObject(
  bucket: PrivateBucket,
  value: string | null | undefined,
): Promise<boolean> {
  const url = await resolveStorageUrl(bucket, value);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
