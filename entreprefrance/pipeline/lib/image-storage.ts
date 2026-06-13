import axios from "axios";
import { log, logError } from "./logger";

const BUCKET = "article-images";

/**
 * Download an image from sourceUrl and upload it to Supabase Storage.
 * Returns the public URL or null on failure.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars on Render.
 */
export async function uploadImageFromUrl(
  sourceUrl: string,
  filename: string
): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    logError("image-storage", "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — cannot upload image");
    return null;
  }

  try {
    // Download image as binary buffer
    const imageResponse = await axios.get<ArrayBuffer>(sourceUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const buffer = Buffer.from(imageResponse.data);
    const contentType = (imageResponse.headers["content-type"] as string) || "image/png";

    // Upload to Supabase Storage via REST API (upsert)
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${filename}`;
    await axios.post(uploadUrl, buffer, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      timeout: 30000,
    });

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${filename}`;
    log("image-storage", `Uploaded ${filename} (${(buffer.length / 1024).toFixed(0)} KB) → ${publicUrl.slice(0, 80)}…`);
    return publicUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("image-storage", `Upload failed for ${filename}: ${message}`);
    return null;
  }
}
