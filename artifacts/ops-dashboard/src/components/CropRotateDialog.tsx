import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  RotateCcw,
  RotateCw,
  Check,
  X as XIcon,
  Loader2,
  RefreshCcw,
} from "lucide-react";

type Source = { kind: "file"; file: File } | { kind: "url"; url: string };

interface CropRotateDialogProps {
  open: boolean;
  source: Source | null;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
  /**
   * Called when the user opts to save a remote URL without editing
   * (used as a fallback when the image cannot be loaded for cropping
   * due to CORS restrictions). Only invoked for `kind: "url"` sources.
   */
  onSaveUrlAsIs?: (url: string) => void | Promise<void>;
  saving?: boolean;
}

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DISPLAY_MAX_W = 640;
const DISPLAY_MAX_H = 420;
const MIN_CROP = 32;

type DragMode =
  | { kind: "none" }
  | { kind: "move"; startX: number; startY: number; orig: CropRect }
  | {
      kind: "resize";
      handle: "nw" | "ne" | "sw" | "se";
      startX: number;
      startY: number;
      orig: CropRect;
    };

export function CropRotateDialog({
  open,
  source,
  onCancel,
  onConfirm,
  onSaveUrlAsIs,
  saving = false,
}: CropRotateDialogProps) {
  const { toast } = useToast();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270 (degrees clockwise)
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [processing, setProcessing] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragMode>({ kind: "none" });

  // Track the file backing object URL so we revoke it
  const objectUrlRef = useRef<string | null>(null);

  // Load image whenever source changes
  useEffect(() => {
    if (!open || !source) return;
    setImg(null);
    setLoadError(null);
    setRotation(0);
    setCrop(null);
    setLoading(true);

    let cancelled = false;
    const el = new Image();
    // Always try crossOrigin for URLs so canvas readback works.
    if (source.kind === "url") {
      el.crossOrigin = "anonymous";
    }

    el.onload = () => {
      if (cancelled) return;
      setImg(el);
      setLoading(false);
    };
    el.onerror = () => {
      if (cancelled) return;
      setLoading(false);
      setLoadError(
        source.kind === "url"
          ? "Could not load this image for editing (it may block cross-origin access)."
          : "Could not read this image file.",
      );
    };

    if (source.kind === "file") {
      const url = URL.createObjectURL(source.file);
      objectUrlRef.current = url;
      el.src = url;
    } else {
      el.src = source.url;
    }

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [open, source]);

  // Compute display size from the rotated image
  const display = useMemo(() => {
    if (!img) return { w: 0, h: 0, srcW: 0, srcH: 0 };
    const rotated = rotation % 180 !== 0;
    const srcW = rotated ? img.naturalHeight : img.naturalWidth;
    const srcH = rotated ? img.naturalWidth : img.naturalHeight;
    const scale = Math.min(DISPLAY_MAX_W / srcW, DISPLAY_MAX_H / srcH, 1);
    return {
      w: Math.round(srcW * scale),
      h: Math.round(srcH * scale),
      srcW,
      srcH,
      scale,
    };
  }, [img, rotation]);

  // Initialize / reset crop rectangle when display dimensions change
  useEffect(() => {
    if (display.w > 0 && display.h > 0) {
      setCrop({ x: 0, y: 0, w: display.w, h: display.h });
    }
  }, [display.w, display.h]);

  if (!open) return null;

  const clampCrop = (c: CropRect): CropRect => {
    const w = Math.max(MIN_CROP, Math.min(c.w, display.w));
    const h = Math.max(MIN_CROP, Math.min(c.h, display.h));
    const x = Math.max(0, Math.min(c.x, display.w - w));
    const y = Math.max(0, Math.min(c.y, display.h - h));
    return { x, y, w, h };
  };

  const onPointerDown = (e: React.PointerEvent, mode: DragMode) => {
    if (!crop) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = mode;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag.kind === "none" || !crop) return;
    const dx = e.clientX - (drag.kind === "move" ? drag.startX : drag.startX);
    const dy = e.clientY - (drag.kind === "move" ? drag.startY : drag.startY);
    if (drag.kind === "move") {
      setCrop(clampCrop({ ...drag.orig, x: drag.orig.x + dx, y: drag.orig.y + dy }));
      return;
    }
    // resize
    let { x, y, w, h } = drag.orig;
    switch (drag.handle) {
      case "nw":
        x = drag.orig.x + dx;
        y = drag.orig.y + dy;
        w = drag.orig.w - dx;
        h = drag.orig.h - dy;
        break;
      case "ne":
        y = drag.orig.y + dy;
        w = drag.orig.w + dx;
        h = drag.orig.h - dy;
        break;
      case "sw":
        x = drag.orig.x + dx;
        w = drag.orig.w - dx;
        h = drag.orig.h + dy;
        break;
      case "se":
        w = drag.orig.w + dx;
        h = drag.orig.h + dy;
        break;
    }
    // prevent flipping
    if (w < MIN_CROP) {
      if (drag.handle === "nw" || drag.handle === "sw") x = drag.orig.x + drag.orig.w - MIN_CROP;
      w = MIN_CROP;
    }
    if (h < MIN_CROP) {
      if (drag.handle === "nw" || drag.handle === "ne") y = drag.orig.y + drag.orig.h - MIN_CROP;
      h = MIN_CROP;
    }
    setCrop(clampCrop({ x, y, w, h }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current.kind !== "none") {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      dragRef.current = { kind: "none" };
    }
  };

  const rotate = (delta: 90 | -90) => {
    setRotation((r) => (((r + delta) % 360) + 360) % 360);
  };

  const reset = () => {
    setRotation(0);
    if (display.w > 0) setCrop({ x: 0, y: 0, w: display.w, h: display.h });
  };

  const handleConfirm = async () => {
    if (!img || !crop || !display.scale) return;
    setProcessing(true);
    try {
      // Map display crop -> source pixel coords (in rotated space)
      const scale = display.scale;
      const sx = Math.round(crop.x / scale);
      const sy = Math.round(crop.y / scale);
      const sw = Math.round(crop.w / scale);
      const sh = Math.round(crop.h / scale);

      const out = document.createElement("canvas");
      out.width = sw;
      out.height = sh;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas context");

      // Draw the rotated image onto the output canvas, offset so the crop
      // origin lands at (0, 0).
      ctx.save();
      ctx.translate(-sx, -sy);
      // Translate then rotate around the eventual top-left of the rotated image
      const w0 = img.naturalWidth;
      const h0 = img.naturalHeight;
      switch (rotation) {
        case 0:
          ctx.drawImage(img, 0, 0);
          break;
        case 90:
          ctx.translate(h0, 0);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(img, 0, 0);
          break;
        case 180:
          ctx.translate(w0, h0);
          ctx.rotate(Math.PI);
          ctx.drawImage(img, 0, 0);
          break;
        case 270:
          ctx.translate(0, w0);
          ctx.rotate((3 * Math.PI) / 2);
          ctx.drawImage(img, 0, 0);
          break;
      }
      ctx.restore();

      const blob: Blob | null = await new Promise((resolve) =>
        out.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("Failed to encode cropped image");
      const baseName =
        source?.kind === "file"
          ? source.file.name.replace(/\.[^.]+$/, "")
          : "image";
      const file = new File([blob], `${baseName}-cropped.jpg`, {
        type: "image/jpeg",
      });
      await onConfirm(file);
    } catch (e) {
      toast({
        title: "Could not save edited image",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const busy = processing || saving;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onCancel();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop &amp; rotate image</DialogTitle>
          <DialogDescription>
            Drag the corners to crop, rotate to straighten, then save to upload
            the result.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            className="relative bg-muted/40 rounded-md flex items-center justify-center overflow-hidden"
            style={{
              width: DISPLAY_MAX_W,
              height: DISPLAY_MAX_H,
              maxWidth: "100%",
            }}
          >
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading image…
              </div>
            )}
            {loadError && !loading && (
              <div className="px-6 text-center text-sm text-destructive space-y-2">
                <p>{loadError}</p>
                {source?.kind === "url" && onSaveUrlAsIs && (
                  <p className="text-xs text-muted-foreground">
                    You can still save the URL as-is without cropping.
                  </p>
                )}
              </div>
            )}
            {img && !loadError && crop && (
              <div
                ref={containerRef}
                className="relative"
                style={{ width: display.w, height: display.h }}
              >
                {/* Rotated source image rendered as a CSS-rotated <img> for preview.
                    The actual crop math is done in source-pixel space. */}
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: display.w, height: display.h }}
                >
                  <img
                    src={img.src}
                    alt=""
                    draggable={false}
                    style={{
                      width: rotation % 180 === 0 ? display.w : display.h,
                      height: rotation % 180 === 0 ? display.h : display.w,
                      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      userSelect: "none",
                      pointerEvents: "none",
                    }}
                  />
                </div>

                {/* Dim outside the crop using 4 overlays */}
                <div
                  className="absolute bg-black/50 pointer-events-none"
                  style={{ left: 0, top: 0, width: display.w, height: crop.y }}
                />
                <div
                  className="absolute bg-black/50 pointer-events-none"
                  style={{
                    left: 0,
                    top: crop.y + crop.h,
                    width: display.w,
                    height: display.h - (crop.y + crop.h),
                  }}
                />
                <div
                  className="absolute bg-black/50 pointer-events-none"
                  style={{ left: 0, top: crop.y, width: crop.x, height: crop.h }}
                />
                <div
                  className="absolute bg-black/50 pointer-events-none"
                  style={{
                    left: crop.x + crop.w,
                    top: crop.y,
                    width: display.w - (crop.x + crop.w),
                    height: crop.h,
                  }}
                />

                {/* Crop rectangle */}
                <div
                  data-testid="crop-rect"
                  className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)] cursor-move"
                  style={{
                    left: crop.x,
                    top: crop.y,
                    width: crop.w,
                    height: crop.h,
                  }}
                  onPointerDown={(e) =>
                    onPointerDown(e, {
                      kind: "move",
                      startX: e.clientX,
                      startY: e.clientY,
                      orig: crop,
                    })
                  }
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  {(["nw", "ne", "sw", "se"] as const).map((h) => (
                    <div
                      key={h}
                      onPointerDown={(e) =>
                        onPointerDown(e, {
                          kind: "resize",
                          handle: h,
                          startX: e.clientX,
                          startY: e.clientY,
                          orig: crop,
                        })
                      }
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      data-testid={`crop-handle-${h}`}
                      className={cn(
                        "absolute w-3 h-3 bg-white border border-black/40 rounded-sm",
                        h === "nw" && "-left-1.5 -top-1.5 cursor-nwse-resize",
                        h === "ne" && "-right-1.5 -top-1.5 cursor-nesw-resize",
                        h === "sw" && "-left-1.5 -bottom-1.5 cursor-nesw-resize",
                        h === "se" && "-right-1.5 -bottom-1.5 cursor-nwse-resize",
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {img && !loadError && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => rotate(-90)}
                disabled={busy}
                data-testid="button-rotate-left"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-input bg-background hover:bg-muted disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Rotate left
              </button>
              <button
                type="button"
                onClick={() => rotate(90)}
                disabled={busy}
                data-testid="button-rotate-right"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-input bg-background hover:bg-muted disabled:opacity-50"
              >
                <RotateCw className="w-3.5 h-3.5" /> Rotate right
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                data-testid="button-crop-reset"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-input bg-background hover:bg-muted disabled:opacity-50"
              >
                <RefreshCcw className="w-3.5 h-3.5" /> Reset
              </button>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-testid="button-crop-cancel"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-input bg-background hover:bg-muted disabled:opacity-50"
          >
            <XIcon className="w-3.5 h-3.5" /> Cancel
          </button>
          {source?.kind === "url" && loadError && onSaveUrlAsIs && (
            <button
              type="button"
              onClick={() => onSaveUrlAsIs(source.url)}
              disabled={busy}
              data-testid="button-crop-save-url-as-is"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-input bg-background hover:bg-muted disabled:opacity-50"
            >
              Save URL as-is
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !img || !!loadError || !crop}
            data-testid="button-crop-confirm"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Save image
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
