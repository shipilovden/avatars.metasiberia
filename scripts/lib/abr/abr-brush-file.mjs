import { createRequire } from "node:module";

import { decodeBrushMaskAsPng } from "./bitmap-decoder.mjs";

const require = createRequire(import.meta.url);
const KaitaiStream = require("kaitai-struct/KaitaiStream.js");
const Abr = require("./Abr.cjs");

const ASCII_DECODER = new TextDecoder("ascii");

export class AbrBrushFile {
  constructor(data) {
    this.abr = new Abr(new KaitaiStream(data));
    this.samples = [];
    this.samplesById = new Map();
    this.brushDataById = new Map();
    this.version = this.abr.header.version;
    this.subversion = this.abr.header.subversion;

    for (const section of this.abr.sections) {
      if (section.body instanceof Abr.SamplesSectionBody) {
        const samplesData = section.body.samples;

        for (let index = 0; index < samplesData.length; index += 1) {
          const sampleData = samplesData[index].data;
          const imageData = sampleData.bodyV61
            ? sampleData.bodyV61.imageData
            : sampleData.bodyV62.channels.find((channel) => channel.imageData)?.imageData;

          if (!imageData) {
            continue;
          }

          const sample = new AbrSampleBrush(sampleData.brushId, imageData, index);
          this.samplesById.set(sample.brushId, sample);
          this.samples.push(sample);
        }
      }

      if (section.body instanceof Abr.DescriptorsSectionBody) {
        const parsed = this.parseDescriptor(section.body);

        for (const brushData of parsed.Brsh || []) {
          const brushId = brushData.Brsh.sampledData;
          this.brushDataById.set(brushId, brushData);
        }
      }
    }

    for (const [brushId, sample] of this.samplesById.entries()) {
      const brushData = this.brushDataById.get(brushId);

      if (brushData) {
        sample.setBrushData(brushData);
      }
    }
  }

  parseDescriptor(descriptor) {
    const objectValue = {};

    for (const keyedItem of descriptor.keyedItems) {
      const key = keyedItem.key.text;
      objectValue[key] = this.parseValue(keyedItem.item);
    }

    return objectValue;
  }

  cleanString(text) {
    return text.replace(/(\u0000|\x00)+$/g, "");
  }

  parseValue(typedValue) {
    const { value } = typedValue;

    if (typeof value === "number") {
      return value;
    }

    if (
      value instanceof Abr.UnicodeString ||
      value instanceof Abr.PascalStringU4 ||
      value instanceof Abr.CompactString
    ) {
      return this.cleanString(value.text);
    }

    if (value instanceof Abr.DescriptorList) {
      return value.items.map((item) => this.parseValue(item));
    }

    if (value instanceof Abr.Descriptor) {
      return this.parseDescriptor(value);
    }

    if (value instanceof Abr.UnitFloatValue) {
      return value.value;
    }

    if (value instanceof Abr.EnumeratedValue) {
      return this.cleanString(value.enum.text);
    }

    return value;
  }
}

class AbrSampleBrush {
  constructor(brushId, imageData, index) {
    this.brushData = {};
    this.brushName = undefined;
    this.brushId = ASCII_DECODER.decode(brushId);
    this.index = index;
    this.depthBits = imageData.depth;
    this.width = imageData.right - imageData.left;
    this.height = imageData.bottom - imageData.top;
    this.isCompressed = imageData.compression === 1;
    this.encodedBitmap = imageData.bitmap;
  }

  setBrushData(data) {
    this.brushData = data;
    this.brushName = data["Nm  "];
  }

  getDecodeOptions() {
    return {
      data: this.encodedBitmap,
      isCompressed: this.isCompressed,
      depthBits: this.depthBits,
      width: this.width,
      height: this.height,
    };
  }

  createMaskPng(options) {
    return decodeBrushMaskAsPng(this.getDecodeOptions(), options);
  }
}
