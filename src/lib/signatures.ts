import { supabase } from './supabase';

// Consent signatures are stored two ways (see ConsentSignatureModal):
//   - drawn on screen  -> `signature_data` is a base64 `data:image/png` URL
//   - uploaded photo   -> `signature_data` is a path inside the `client-documents`
//                         bucket, which is PRIVATE
//
// The private bucket is why getPublicUrl() does not work for the upload case: it
// returns a URL that never resolves, so uploaded signatures rendered as broken
// images and downloaded as nothing. Private buckets need a signed URL, which is
// asynchronous — hence this helper rather than a plain string function.

const SIGNED_URL_TTL_SECONDS = 3600;

export function isInlineSignature(signatureData: string | null | undefined): boolean {
  return !!signatureData && signatureData.startsWith('data:');
}

/**
 * Resolves stored signature data to something an <img> or download link can use.
 * Returns null when there is nothing to show or the signed URL could not be
 * created (expired session, missing object, storage policy).
 */
export async function resolveSignatureUrl(signatureData: string | null | undefined): Promise<string | null> {
  if (!signatureData) return null;
  if (isInlineSignature(signatureData)) return signatureData;

  const { data, error } = await supabase.storage
    .from('client-documents')
    .createSignedUrl(signatureData, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error('[Signature] Could not create signed URL for', signatureData, error?.message);
    return null;
  }
  return data.signedUrl;
}
