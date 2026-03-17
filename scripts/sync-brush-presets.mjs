import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

import { AbrBrushFile } from "./lib/abr/abr-brush-file.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "public", "brush-presets");
const metadataPath = path.join(projectRoot, "src", "components", "uv-editor-port", "brush-presets.ts");

const roundPresets = [
  {
    id: "soft-round",
    name: "Soft Round",
    group: "Basic",
    kind: "brush",
    shape: "procedural",
    previewSrc: null,
    maskSrc: null,
    spacing: 0.18,
    source: "Built-in",
    sourceUrl: null,
  },
  {
    id: "hard-round",
    name: "Hard Round",
    group: "Basic",
    kind: "brush",
    shape: "procedural",
    previewSrc: null,
    maskSrc: null,
    spacing: 0.12,
    source: "Built-in",
    sourceUrl: null,
  },
];

const sourcePacks = [
  {
    id: "buzz-grunge-splatter",
    name: "Buzz Grunge Splatter",
    group: "Grunge",
    kind: "brush",
    source: "Danilin",
    sourceUrl: "https://danilin.biz/200-photoshop-brushes-free",
    archivePath: path.join(projectRoot, "tmp", "brush-downloads", "504-buzzGRUNGEsplatter.zip"),
    takePerFile: 10,
    spacing: 0.2,
  },
  {
    id: "grunge-paint",
    name: "Grunge Paint",
    group: "Paint",
    kind: "brush",
    source: "Danilin",
    sourceUrl: "https://danilin.biz/200-photoshop-brushes-free",
    archivePath: path.join(projectRoot, "tmp", "brush-downloads", "506-Photoshop_Grunge_Paint_Brushes_by_missmandyx2.zip"),
    takePerFile: 10,
    spacing: 0.22,
  },
  {
    id: "smudge",
    name: "Smudge",
    group: "Paint",
    kind: "brush",
    source: "Danilin",
    sourceUrl: "https://danilin.biz/200-photoshop-brushes-free",
    archivePath: path.join(projectRoot, "tmp", "brush-downloads", "smudge_brushes_by_drift_angel.abr"),
    takePerFile: 8,
    spacing: 0.16,
  },
  {
    id: "water-waves",
    name: "Water Waves",
    group: "Nature",
    kind: "brush",
    source: "Danilin",
    sourceUrl: "https://danilin.biz/200-photoshop-brushes-free",
    archivePath: path.join(projectRoot, "tmp", "brush-downloads", "Free_Water_Waves_Photoshop_Brushes_2.zip"),
    takePerFile: 8,
    spacing: 0.24,
  },
  {
    id: "plant",
    name: "Plant",
    group: "Nature",
    kind: "brush",
    source: "Danilin",
    sourceUrl: "https://danilin.biz/200-photoshop-brushes-free",
    archivePath: path.join(projectRoot, "tmp", "brush-downloads", "_11-Plant-brushes.abr.zip"),
    takePerFile: 10,
    spacing: 0.28,
  },
  {
    id: "lightning",
    name: "Lightning",
    group: "FX",
    kind: "brush",
    source: "Danilin",
    sourceUrl: "https://danilin.biz/200-photoshop-brushes-free",
    archivePath: path.join(projectRoot, "tmp", "brush-downloads", "lightning_photoshop_brushes_by_artistmef-d9jjdwj.zip"),
    takePerFile: 10,
    spacing: 0.32,
  },
  {
    id: "marble",
    name: "Marble Texture",
    group: "Texture",
    kind: "brush",
    source: "Videoinfographica",
    sourceUrl: "https://videoinfographica.com/ph-brushes/",
    archivePath: path.join(projectRoot, "tmp", "brush-downloads", "20-Marble-Texture-PS-Brushes-abr.zip"),
    takePerFile: 10,
    spacing: 0.24,
  },
  {
    id: "travel-stamps",
    name: "Travel Stamps",
    group: "Travel",
    kind: "stamp",
    source: "Creativo",
    sourceUrl: "https://creativo.one/adds/brushes/21754-kisti-dlya-fotoshopa-shtampyi.html",
    archivePath: path.join(projectRoot, "tmp", "creativo-stamps-real.zip"),
    takePerFile: 16,
    spacing: 1.1,
  },
];

function sanitizeSlug(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function humanizeBrushName(input, fallback) {
  const cleaned = input
    ?.replace(/[\u0000-\u001F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !cleaned ||
    /^brush\s*\d+$/i.test(cleaned) ||
    /^\d+$/.test(cleaned) ||
    cleaned.length < 2
  ) {
    return fallback;
  }

  return cleaned;
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function pickEvenly(items, count) {
  if (count >= items.length) {
    return items;
  }

  const selected = [];

  for (let index = 0; index < count; index += 1) {
    const sampleIndex = Math.min(items.length - 1, Math.round((index * (items.length - 1)) / Math.max(1, count - 1)));
    selected.push(items[sampleIndex]);
  }

  return Array.from(new Set(selected));
}

async function ensureOutput() {
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(outputRoot, "brushes"), { recursive: true });
  await fs.mkdir(path.join(outputRoot, "stamps"), { recursive: true });
}

async function loadAbrEntries(pack) {
  const lowerPath = pack.archivePath.toLowerCase();

  if (lowerPath.endsWith(".abr")) {
    return [
      {
        name: path.basename(pack.archivePath),
        buffer: await fs.readFile(pack.archivePath),
      },
    ];
  }

  if (!lowerPath.endsWith(".zip")) {
    throw new Error(`Unsupported archive format: ${pack.archivePath}`);
  }

  const zip = await JSZip.loadAsync(await fs.readFile(pack.archivePath));
  const entries = [];

  for (const zipEntry of Object.values(zip.files)) {
    const name = zipEntry.name;

    if (zipEntry.dir || !name.toLowerCase().endsWith(".abr") || name.includes("__MACOSX")) {
      continue;
    }

    if (pack.includeEntries?.length) {
      const included = pack.includeEntries.some((snippet) => name.includes(snippet));

      if (!included) {
        continue;
      }
    }

    entries.push({
      name,
      buffer: await zipEntry.async("nodebuffer"),
    });
  }

  return entries;
}

async function writePresetPng(preset, pack) {
  const kindFolder = pack.kind === "stamp" ? "stamps" : "brushes";
  const relativePath = `/brush-presets/${kindFolder}/${preset.fileName}`;
  const absolutePath = path.join(outputRoot, kindFolder, preset.fileName);
  await fs.writeFile(absolutePath, preset.png);

  return {
    id: preset.id,
    name: preset.name,
    group: pack.group,
    kind: pack.kind,
    shape: "mask",
    previewSrc: relativePath,
    maskSrc: relativePath,
    spacing: pack.spacing,
    source: pack.source,
    sourceUrl: pack.sourceUrl,
  };
}

async function buildCatalog() {
  const catalog = [...roundPresets];

  for (const pack of sourcePacks) {
    const entries = await loadAbrEntries(pack);
    let packIndex = 0;

    for (const entry of entries) {
      let brushFile;

      try {
        brushFile = new AbrBrushFile(toArrayBuffer(entry.buffer));
      } catch (error) {
        console.warn(`Skipping ${entry.name}: ${error.message}`);
        continue;
      }

      const selectedSamples = pickEvenly(brushFile.samples, pack.takePerFile);

      for (const sample of selectedSamples) {
        const fallbackName = `${pack.name} ${packIndex + 1}`;
        const decoded = sample.createMaskPng({ maxSize: 512, threshold: 8 });

        if (!decoded || decoded.png.byteLength < 1024 || decoded.width < 24 || decoded.height < 24) {
          continue;
        }

        const name = humanizeBrushName(sample.brushName, fallbackName);
        const fileName = `${pack.id}-${String(packIndex + 1).padStart(2, "0")}-${sanitizeSlug(name)}.png`;
        const id = `${pack.id}-${String(packIndex + 1).padStart(2, "0")}`;

        catalog.push(
          await writePresetPng(
            {
              id,
              name,
              fileName,
              png: decoded.png,
            },
            pack,
          ),
        );

        packIndex += 1;
      }
    }
  }

  return catalog;
}

async function writeMetadata(catalog) {
  const fileContents = `export type BrushPresetKind = "brush" | "stamp";
export type BrushPresetShape = "procedural" | "mask";

export type BrushPreset = {
  id: string;
  name: string;
  group: string;
  kind: BrushPresetKind;
  shape: BrushPresetShape;
  previewSrc: string | null;
  maskSrc: string | null;
  spacing: number;
  source: string;
  sourceUrl: string | null;
};

export const DEFAULT_BRUSH_PRESET_ID = "soft-round";

export const BRUSH_PRESET_CATALOG: BrushPreset[] = ${JSON.stringify(catalog, null, 2)};

export const BRUSH_PRESETS = BRUSH_PRESET_CATALOG.filter((preset) => preset.kind === "brush");
export const STAMP_PRESETS = BRUSH_PRESET_CATALOG.filter((preset) => preset.kind === "stamp");
`;

  await fs.writeFile(metadataPath, fileContents);
}

async function main() {
  await ensureOutput();
  const catalog = await buildCatalog();
  await writeMetadata(catalog);

  const brushCount = catalog.filter((preset) => preset.kind === "brush").length;
  const stampCount = catalog.filter((preset) => preset.kind === "stamp").length;

  console.log(`Generated ${brushCount} brushes and ${stampCount} stamps.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
