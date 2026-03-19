import fs from "node:fs/promises";

import { grayscaleBitmapToMaskPng } from "./bitmap-decoder.mjs";

class FakeCanvasContext {
  constructor(canvas) {
    this.canvas = canvas;
  }

  getImageData(_x, _y, width, height) {
    return {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    };
  }

  putImageData(imageData) {
    this.canvas.__imageData = new Uint8ClampedArray(imageData.data);
  }
}

class FakeCanvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.__imageData = new Uint8ClampedArray(0);
  }

  getContext(type) {
    if (type !== "2d") {
      return null;
    }

    return new FakeCanvasContext(this);
  }
}

function ensureCanvasDocument() {
  if (typeof globalThis.document?.createElement === "function") {
    return;
  }

  globalThis.document = {
    createElement(tagName) {
      if (tagName !== "canvas") {
        throw new Error(`Unsupported fallback element: ${tagName}`);
      }

      return new FakeCanvas();
    },
  };
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

let abrJsModulePromise = null;

async function getAbrJsModule() {
  ensureCanvasDocument();
  abrJsModulePromise ??= (async () => {
    let source = await fs.readFile(new URL("../../../node_modules/abr-js/dist/abr.esm.js", import.meta.url), "utf8");

    source = source.replace(/case 6:/g, "case 6:case 10:");
    source = source.replace(
      "switch(t.version){case 1:case 2:return!0;case 6:case 10:if(1==t.subversion||2==t.subversion)return!0}return!1}",
      "switch(t.version){case 1:case 2:return!0;case 6:if(1==t.subversion||2==t.subversion)return!0;case 10:if(2==t.subversion)return!0}return!1}",
    );
    source = source.replace("catch(t){throw console.error(t),new Error(`Error: cannot parse ABR file: ${e}`)}", "catch(t){throw new Error(`Error: cannot parse ABR file: ${e}`)}");

    const specifier = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    return import(specifier);
  })();
  return abrJsModulePromise;
}

class AbrJsSampleBrush {
  constructor(brush) {
    this.brush = brush;
    this.brushName = brush.name;
  }

  createMaskPng(options) {
    const canvas = this.brush.brushTipImage;
    const rgba = canvas?.__imageData;

    if (!rgba?.length || !canvas.width || !canvas.height) {
      return null;
    }

    const grayscale = new Uint8Array(canvas.width * canvas.height);

    for (let index = 0; index < grayscale.length; index += 1) {
      grayscale[index] = 255 - rgba[index * 4];
    }

    return grayscaleBitmapToMaskPng(
      {
        width: canvas.width,
        height: canvas.height,
        data: grayscale,
      },
      options,
    );
  }
}

export async function loadAbrFallbackSamples(buffer, fileName) {
  const { loadAbrFromArrayBuffer } = await getAbrJsModule();
  const brushes = await loadAbrFromArrayBuffer(toArrayBuffer(buffer), fileName);

  return brushes.map((brush) => new AbrJsSampleBrush(brush));
}
