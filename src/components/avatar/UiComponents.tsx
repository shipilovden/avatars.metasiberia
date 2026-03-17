import { useEffect, useState } from "react";
import type { UiCopy } from "./shared";

export function ClearAssetIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M18 46L46 18" fill="none" stroke="currentColor" strokeWidth="5" />
    </svg>
  );
}

export function SettingsGearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M19.14 12.94a7.2 7.2 0 0 0 .05-.94 7.2 7.2 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.29 7.29 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7.29 7.29 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.85a.5.5 0 0 0 .12.63l2.03 1.58a7.2 7.2 0 0 0-.05.94 7.2 7.2 0 0 0 .05.94L2.82 14.52a.5.5 0 0 0-.12.63l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58ZM12 15.35A3.35 3.35 0 1 1 12 8.65a3.35 3.35 0 0 1 0 6.7Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PaintPaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="paletteShell" x1="5" y1="4" x2="18" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd98a" />
          <stop offset="1" stopColor="#f2b65b" />
        </linearGradient>
        <linearGradient id="paletteThumb" x1="10" y1="13" x2="18" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f0a94b" />
          <stop offset="1" stopColor="#d9822b" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.25C6.62 2.25 2.25 6.31 2.25 11.34c0 2.15.84 4.1 2.24 5.58 1.4 1.48 3.38 2.48 5.68 2.73.63.07 1.02.66.83 1.25l-.22.71a1.63 1.63 0 0 0 1.56 2.14h.98c4.62 0 8.43-3.39 8.43-7.55 0-1.77-.71-3.18-2.09-4.14-.72-.5-1.55-.77-2.49-.77h-1.72c-.98 0-1.78-.73-1.78-1.62 0-.24.06-.47.17-.69l.55-1.06c.33-.64.5-1.33.5-2.04 0-2-1.53-3.63-3.42-3.63Z"
        fill="url(#paletteShell)"
      />
      <path
        d="M17.4 13.2c1.03 0 1.86.8 1.86 1.8 0 .99-.83 1.8-1.86 1.8h-1.86c-.87 0-1.58.69-1.58 1.53 0 .25.07.5.18.71l.42.74c.21.37.31.79.31 1.2 0 .84-.41 1.59-1.03 2.06.14.02.29.03.44.03h.98c4.62 0 8.43-3.39 8.43-7.55 0-1.77-.71-3.18-2.09-4.14-.72-.5-1.55-.77-2.49-.77h-.82c-.18.55-.67.99-1.29 1.2Z"
        fill="url(#paletteThumb)"
        opacity="0.95"
      />
      <circle cx="7.1" cy="10.15" r="1.38" fill="#ff6b6b" />
      <circle cx="10.25" cy="7.55" r="1.38" fill="#4dabf7" />
      <circle cx="14.35" cy="7.7" r="1.38" fill="#ffd43b" />
      <circle cx="16.95" cy="11" r="1.38" fill="#51cf66" />
      <circle cx="17.85" cy="6.1" r="0.9" fill="#845ef7" />
      <path
        d="M8.15 4.85c1.16-.88 2.58-1.4 4.1-1.4"
        fill="none"
        stroke="#fff5d9"
        strokeLinecap="round"
        strokeWidth="1.2"
        opacity="0.9"
      />
    </svg>
  );
}

export function EyedropperIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.9 3.6a2.9 2.9 0 0 1 4.1 4.1l-1.2 1.2 1 1a1 1 0 0 1 0 1.4l-2.1 2.1a1 1 0 0 1-1.4 0l-.4-.4-6.8 6.8a2.6 2.6 0 0 1-1.44.73l-2.22.3a.9.9 0 0 1-1.01-1.01l.3-2.22a2.6 2.6 0 0 1 .73-1.44l6.8-6.8-.4-.4a1 1 0 0 1 0-1.4l2.1-2.1a1 1 0 0 1 1.4 0l1 1 1.2-1.2Z"
        fill="currentColor"
      />
      <path
        d="M6.4 17.8 13 11.2"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <circle cx="5.35" cy="18.65" r="1.55" fill="#7fe7ff" />
    </svg>
  );
}

export function PresetPreviewImage({ src, alt }: { src: string; alt: string }) {
  const [normalizedSrc, setNormalizedSrc] = useState(src);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = src;

    image.onload = () => {
      if (cancelled) return;

      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) {
        setNormalizedSrc(src);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        setNormalizedSrc(src);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData.data;
      const pixelCount = width * height;
      const visited = new Uint8Array(pixelCount);
      const queue = new Int32Array(pixelCount);
      let head = 0;
      let tail = 0;

      const getOffset = (x: number, y: number) => (y * width + x) * 4;

      const corners = [
        getOffset(0, 0),
        getOffset(width - 1, 0),
        getOffset(0, height - 1),
        getOffset(width - 1, height - 1),
      ];

      const bgR = Math.round(
        corners.reduce((sum, offset) => sum + data[offset], 0) / corners.length
      );
      const bgG = Math.round(
        corners.reduce((sum, offset) => sum + data[offset + 1], 0) / corners.length
      );
      const bgB = Math.round(
        corners.reduce((sum, offset) => sum + data[offset + 2], 0) / corners.length
      );
      const toHsv = (red: number, green: number, blue: number) => {
        const r = red / 255;
        const g = green / 255;
        const b = blue / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let hue = 0;
        if (delta > 0) {
          if (max === r) {
            hue = ((g - b) / delta) % 6;
          } else if (max === g) {
            hue = (b - r) / delta + 2;
          } else {
            hue = (r - g) / delta + 4;
          }
          hue /= 6;
          if (hue < 0) hue += 1;
        }

        const saturation = max === 0 ? 0 : delta / max;
        const value = max;
        return { hue, saturation, value };
      };

      const hueDistance = (left: number, right: number) => {
        const diff = Math.abs(left - right);
        return Math.min(diff, 1 - diff);
      };

      const bgHsv = toHsv(bgR, bgG, bgB);
      const isDarkColorBackground = bgHsv.value < 0.62 && bgHsv.saturation > 0.14;
      if (!isDarkColorBackground) {
        setNormalizedSrc(src);
        return;
      }

      const distanceToBg = (offset: number) => {
        const dr = data[offset] - bgR;
        const dg = data[offset + 1] - bgG;
        const db = data[offset + 2] - bgB;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      const threshold = 38;
      const isBackgroundLike = (offset: number) => {
        const distance = distanceToBg(offset);
        if (distance > threshold) {
          return false;
        }

        const hsv = toHsv(data[offset], data[offset + 1], data[offset + 2]);
        const hDiff = hueDistance(hsv.hue, bgHsv.hue);
        const sDiff = Math.abs(hsv.saturation - bgHsv.saturation);
        const vDiff = Math.abs(hsv.value - bgHsv.value);

        return hDiff < 0.08 && sDiff < 0.24 && vDiff < 0.24;
      };

      const push = (x: number, y: number) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return;
        const index = y * width + x;
        if (visited[index]) return;

        const offset = index * 4;
        if (!isBackgroundLike(offset)) return;

        visited[index] = 1;
        queue[tail] = index;
        tail += 1;
      };

      for (let x = 0; x < width; x += 1) {
        push(x, 0);
        push(x, height - 1);
      }
      for (let y = 0; y < height; y += 1) {
        push(0, y);
        push(width - 1, y);
      }

      while (head < tail) {
        const index = queue[head];
        head += 1;
        const x = index % width;
        const y = Math.floor(index / width);

        push(x - 1, y);
        push(x + 1, y);
        push(x, y - 1);
        push(x, y + 1);
      }

      for (let index = 0; index < pixelCount; index += 1) {
        if (!visited[index]) continue;
        const offset = index * 4;
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
      }

      context.putImageData(imageData, 0, 0);
      setNormalizedSrc(canvas.toDataURL("image/png"));
    };

    image.onerror = () => {
      if (!cancelled) {
        setNormalizedSrc(src);
      }
    };

    return () => {
      cancelled = true;
    };
  }, [src]);

  return <img src={normalizedSrc} alt={alt} loading="lazy" />;
}

export function ExportPreviewModal({
  copy,
  previewUrl,
  downloadUrl,
  fileName,
  onClose,
}: {
  copy: UiCopy;
  previewUrl: string | null;
  downloadUrl: string | null;
  fileName: string;
  onClose: () => void;
}) {
  return (
    <div className="export-modal-backdrop" onClick={onClose}>
      <div
        className="export-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <button className="export-modal__close" type="button" onClick={onClose}>
          ×
        </button>
        <div className="export-modal__preview">
          {previewUrl ? <img src={previewUrl} alt={copy.exportPreviewTitle} /> : null}
        </div>
        <div className="export-modal__panel">
          <div className="export-modal__title">{copy.exportPreviewTitle}</div>
          <div className="export-modal__hint">{copy.exportPreviewHint}</div>
          {downloadUrl ? (
            <>
              <div className="export-modal__label">{copy.exportLinkLabel}</div>
              <div className="export-modal__link">{fileName}</div>
              <a className="export-modal__download" href={downloadUrl} download={fileName}>
                {copy.exportDownload}
              </a>
            </>
          ) : (
            <div className="export-modal__busy">{copy.exportBusy}</div>
          )}
        </div>
      </div>
    </div>
  );
}
