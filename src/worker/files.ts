/**
 * Note files in R2. A key is `<workspace>/<card>/<note>`, so deleting a card or
 * a workspace deletes its files by prefix.
 */

export const fileKey = (workspaceId: string, cardId: string, noteId: string): string =>
  `${workspaceId}/${cardId}/${noteId}`;

export const cardPrefix = (workspaceId: string, cardId: string): string => `${workspaceId}/${cardId}/`;

export const workspacePrefix = (workspaceId: string): string => `${workspaceId}/`;

export async function putFile(bucket: R2Bucket, key: string, file: File): Promise<void> {
  await bucket.put(key, file, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
}

export async function deleteFile(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

/** Deletes every object under a prefix. R2 lists and deletes at most 1000 keys per call. */
export async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    if (page.objects.length > 0) await bucket.delete(page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/**
 * Types a browser may show in place. They cannot run script in the app's
 * origin. Every other type, SVG and HTML included, downloads.
 */
const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
  "text/plain",
]);

/** The response that serves a stored file under a name and type the note recorded. */
export async function serveFile(
  bucket: R2Bucket,
  key: string,
  file: { name: string; type: string },
): Promise<Response | undefined> {
  const object = await bucket.get(key);
  if (!object) return undefined;
  const inline = INLINE_TYPES.has(file.type);
  const encoded = encodeURIComponent(file.name);
  const type = !inline
    ? "application/octet-stream"
    : file.type === "text/plain"
      ? "text/plain; charset=utf-8"
      : file.type;
  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`,
    "Content-Length": String(object.size),
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  // Chrome refuses to show a PDF in a sandboxed document. The PDF viewer runs
  // outside the page's origin, so a PDF needs no sandbox.
  if (file.type !== "application/pdf") headers.set("Content-Security-Policy", "sandbox");
  return new Response(object.body, { headers });
}
