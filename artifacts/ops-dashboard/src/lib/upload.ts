import { apiFetch, apiUrl } from "./query-client";

export interface UploadedObject {
  objectPath: string;
}

export async function uploadImageFile(file: File): Promise<UploadedObject> {
  const reqRes = await apiFetch("/api/storage/uploads/request-url", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
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
    headers: { "Content-Type": file.type || "application/octet-stream" },
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
