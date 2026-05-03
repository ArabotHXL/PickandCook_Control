import { apiFetch, apiUrl } from "./query-client";

export interface UploadedObject {
  objectPath: string;
}

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

export async function uploadImageFile(file: File): Promise<UploadedObject> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error(
      `File type "${file.type}" is not allowed. Only image files (JPEG, PNG, GIF, WebP, AVIF) may be uploaded.`
    );
  }

  const reqRes = await apiFetch("/api/storage/uploads/request-url", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type,
    }),
  });
  if (!reqRes.ok) {
    throw new Error(`Failed to request upload URL: ${reqRes.status}`);
  }
  const { uploadURL, objectPath } = (await reqRes.json()) as {
    uploadURL: string;
    objectPath: string;
  };
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed: ${putRes.status}`);
  }
  return { objectPath };
}

export function resolveImageSrc(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/objects/")) return apiUrl(`/api/storage${url}`);
  if (url.startsWith("/public-objects/")) return apiUrl(`/api/storage${url}`);
  return url;
}
