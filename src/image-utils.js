import { execFileSync, spawnSync } from "child_process";

const DEFAULT_JPEG_QUALITY = 75;

export class ImageTransformer {
  constructor(buffer) {
    this.buffer = buffer;
    this.newWidth = 0;
    this.newFormat = "png";
    this.jpegOptions = { quality: DEFAULT_JPEG_QUALITY };
  }

  resize(width) {
    this.newWidth = width;
    return this;
  }

  jpeg(options) {
    this.newFormat = "jpg";
    this.jpegOptions = options;
    return this;
  }

  png() {
    this.newFormat = "png";
    return this;
  }

  toBuffer() {
    const proc = spawnSync("magick", ["-", "-resize", `${this.newWidth}x`, "-quality", `${this.jpegOptions.quality}`, `${this.newFormat}:-`], {
      maxBuffer: 8 * 1024 * 1024,
      input: this.buffer
    });

    return proc.stdout;
  }
}

export class Image {
  constructor(buffer) {
    this.buffer = buffer;
  }

  static fromBuffer(buffer) {
    return new Image(buffer);
  }

  resize(width) {
    return new ImageTransformer(this.buffer).resize(width);
  }

  jpeg(options) {
    return new ImageTransformer(this.buffer).jpeg(options);
  }
}

export const isImageMagickInstalled = () => {
  try {
    return execFileSync("magick", ["--version"])
      .toString()
      .split("\n")
      .filter(line => line.includes("Version: ImageMagick"))
      .length > 0;
  } catch (error) {
    return false;
  }
};
