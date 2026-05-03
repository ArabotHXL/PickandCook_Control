import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError, ALLOWED_IMAGE_CONTENT_TYPES } from "../lib/objectStorage";
import { requireAdmin } from "./ops/auth.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 * Body: { name: string, size?: number, contentType?: string }
 * Returns presigned PUT URL + the persistent objectPath that can later be served.
 *
 * Admin-only — issuing signed PUT URLs lets the holder write arbitrary content
 * into the private object bucket.
 *
 * contentType must be an allowed image MIME type. This prevents issuing signed
 * URLs for non-image content that could later be served as executable HTML on
 * the app origin.
 */
router.post("/storage/uploads/request-url", requireAdmin, async (req: Request, res: Response) => {
  const { name, size, contentType } = (req.body ?? {}) as {
    name?: string;
    size?: number;
    contentType?: string;
  };
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!contentType || !ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
    res.status(400).json({
      error: `contentType must be one of: ${[...ALLOWED_IMAGE_CONTENT_TYPES].join(", ")}`,
    });
    return;
  }
  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/objects/*  — serve uploaded object entities.
 *
 * Public reads are intentional: <img> tags in the dashboard cannot send our
 * Bearer token, and object identifiers are unguessable UUIDs (security by
 * obscurity is acceptable here as the bucket only stores ops-uploaded recipe
 * imagery and the private bucket is not enumerable). Anything that should be
 * truly access-controlled must not flow through this endpoint.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

/**
 * GET /storage/public-objects/* — serve unconditionally public assets.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

export default router;
