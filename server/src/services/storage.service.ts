import { config } from "../config.js";
import { supabaseAdmin } from "../lib/supabase.js";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export async function uploadMealImage(
  userId: string,
  imageHash: string,
  data: Buffer,
  contentType: string,
): Promise<string | null> {
  const path = `${userId}/${imageHash}.jpg`;
  const { error } = await supabaseAdmin.storage
    .from(config.SUPABASE_STORAGE_BUCKET)
    .upload(path, data, { contentType, upsert: true });
  if (error) {
    // Non-fatal: analysis result is still saved, just without a photo.
    console.error("Storage upload failed:", error.message);
    return null;
  }
  return path;
}

export async function signImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(config.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function signImageUrls(paths: (string | null)[]): Promise<Map<string, string>> {
  const valid = paths.filter((p): p is string => !!p);
  const result = new Map<string, string>();
  if (valid.length === 0) return result;
  const { data, error } = await supabaseAdmin.storage
    .from(config.SUPABASE_STORAGE_BUCKET)
    .createSignedUrls(valid, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return result;
  for (const item of data) {
    if (item.signedUrl && item.path) result.set(item.path, item.signedUrl);
  }
  return result;
}

export async function removeImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabaseAdmin.storage.from(config.SUPABASE_STORAGE_BUCKET).remove(paths);
  if (error) {
    console.error("Storage batch remove failed:", error.message);
    throw error;
  }
}
