/**
 * Generates assets/images/adaptive-icon.png from assets/images/icon.png.
 *
 * Android adaptive icons are masked per-device (circle/squircle/rounded
 * square): only the central ~66% (safe zone ≈ 676px of 1024) is guaranteed
 * visible. We scale the full artwork into that safe zone and fill the rest
 * with the same backgroundColor used in app.json (#F7F4EC) so any mask shape
 * shows a clean result.
 *
 * Zero dependencies: PNG decode/encode via Node's zlib.
 * Source must be 8-bit RGB/RGBA non-interlaced (our icon.png is RGB).
 * Run: node scripts/make-adaptive-icon.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, '..', 'assets', 'images', 'icon.png');
const OUT = path.join(__dirname, '..', 'assets', 'images', 'adaptive-icon.png');
const SIZE = 1024;
const SAFE = Math.round(SIZE * 0.66); // 676px safe zone
const BG = [0xf7, 0xf4, 0xec, 0xff]; // #F7F4EC — matches app.json

// ---------------------------------------------------------------------------
// CRC32
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// ---------------------------------------------------------------------------
// PNG decode (8-bit, color type 2=RGB / 6=RGBA, non-interlaced)
// ---------------------------------------------------------------------------
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
      if (interlace !== 0) throw new Error('interlaced PNG unsupported');
      if (colorType !== 2 && colorType !== 6)
        throw new Error(`unsupported color type ${colorType}`);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;

  // Undo per-row filters (0 none, 1 sub, 2 up, 3 average, 4 paeth).
  const pixels = new Uint8Array(width * height * channels);
  const previousRow = Buffer.alloc(stride);
  const currentRow = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    raw.copy(currentRow, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? currentRow[x - channels] : 0;
      const b = previousRow[x];
      const c = x >= channels ? previousRow[x - channels] : 0;
      switch (filter) {
        case 1:
          currentRow[x] = (currentRow[x] + a) & 0xff;
          break;
        case 2:
          currentRow[x] = (currentRow[x] + b) & 0xff;
          break;
        case 3:
          currentRow[x] = (currentRow[x] + ((a + b) >> 1)) & 0xff;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          currentRow[x] = (currentRow[x] + predictor) & 0xff;
          break;
        }
        default:
          break;
      }
    }
    currentRow.copy(pixels, y * stride);
    currentRow.copy(previousRow);
  }
  return { width, height, channels, pixels };
}

// ---------------------------------------------------------------------------
// Encode RGBA PNG (filter 0 rows)
// ---------------------------------------------------------------------------
function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(pixels.buffer, y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Main: scale artwork into the centered safe zone
// ---------------------------------------------------------------------------
function main() {
  const source = decodePng(fs.readFileSync(SRC));
  if (source.width !== SIZE || source.height !== SIZE)
    throw new Error(`expected ${SIZE}x${SIZE}, got ${source.width}x${source.height}`);

  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < out.length; i += 4) out.set(BG, i); // background fill

  const margin = Math.floor((SIZE - SAFE) / 2); // 174px each side
  const scale = source.width / SAFE;

  // Bilinear sample of the source into the SAFE×SAFE centered region.
  for (let y = 0; y < SAFE; y += 1) {
    const sy = Math.min(y * scale, source.height - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, source.height - 1);
    const fy = sy - y0;
    for (let x = 0; x < SAFE; x += 1) {
      const sx = Math.min(x * scale, source.width - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, source.width - 1);
      const fx = sx - x0;
      for (let ch = 0; ch < 3; ch += 1) {
        const p00 = source.pixels[(y0 * source.width + x0) * source.channels + ch];
        const p10 = source.pixels[(y0 * source.width + x1) * source.channels + ch];
        const p01 = source.pixels[(y1 * source.width + x0) * source.channels + ch];
        const p11 = source.pixels[(y1 * source.width + x1) * source.channels + ch];
        const value =
          p00 * (1 - fx) * (1 - fy) +
          p10 * fx * (1 - fy) +
          p01 * (1 - fx) * fy +
          p11 * fx * fy;
        out[((y + margin) * SIZE + (x + margin)) * 4 + ch] = Math.round(value);
      }
      out[((y + margin) * SIZE + (x + margin)) * 4 + 3] = 0xff;
    }
  }

  fs.writeFileSync(OUT, encodePng(SIZE, SIZE, out));
  console.log(`written: ${OUT} (${SIZE}x${SIZE}, safe zone ${SAFE}px, bg #F7F4EC)`);
}

main();
