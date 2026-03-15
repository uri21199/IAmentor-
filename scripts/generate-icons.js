/**
 * Generates PWA icon PNGs in /public/icons/ using only Node.js built-ins.
 * Background: #0A0F1E  |  Foreground: #3B82F6  |  Letters: "MI"
 * Usage: node scripts/generate-icons.js
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG chunk builder ──────────────────────────────────────────────────────
function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── Pixel font: 5×9 bitmaps for M and I ──────────────────────────────────
const FONT = {
  M: [
    [1,0,0,0,1],
    [1,1,0,1,1],
    [1,0,1,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
  ],
  I: [
    [1,1,1],
    [0,1,0],
    [0,1,0],
    [0,1,0],
    [0,1,0],
    [0,1,0],
    [0,1,0],
    [0,1,0],
    [1,1,1],
  ],
};

// ── Draw scaled pixel letter into RGBA buffer ─────────────────────────────
function drawLetter(pixels, W, letter, startX, startY, scale, color) {
  const bitmap = FONT[letter];
  for (let row = 0; row < bitmap.length; row++) {
    for (let col = 0; col < bitmap[row].length; col++) {
      if (!bitmap[row][col]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = startX + col * scale + dx;
          const py = startY + row * scale + dy;
          if (px < 0 || py < 0 || px >= W || py >= W) continue;
          const idx = (py * W + px) * 4;
          pixels[idx]   = color[0];
          pixels[idx+1] = color[1];
          pixels[idx+2] = color[2];
          pixels[idx+3] = 255;
        }
      }
    }
  }
}

// ── Generate one PNG ───────────────────────────────────────────────────────
function generatePNG(size) {
  const BG = [0x0A, 0x0F, 0x1E];   // #0A0F1E
  const FG = [0x3B, 0x82, 0xF6];   // #3B82F6

  // Fill background (RGBA)
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i*4]   = BG[0];
    pixels[i*4+1] = BG[1];
    pixels[i*4+2] = BG[2];
    pixels[i*4+3] = 255;
  }

  // Scale: letters are 9 rows tall; we want letters to fill ~50% of the icon
  const scale    = Math.max(1, Math.floor(size * 0.5 / 9));
  const mW       = 5 * scale;  // M is 5 cols wide
  const iW       = 3 * scale;  // I is 3 cols wide
  const gap      = Math.max(1, Math.round(scale * 1.5));
  const totalW   = mW + gap + iW;
  const totalH   = 9 * scale;
  const startX   = Math.floor((size - totalW) / 2);
  const startY   = Math.floor((size - totalH) / 2);

  drawLetter(pixels, size, 'M', startX,          startY, scale, FG);
  drawLetter(pixels, size, 'I', startX + mW + gap, startY, scale, FG);

  // Build raw PNG filter-byte rows (filter type 0 = None) — RGB (drop alpha)
  const rowSize = 1 + size * 3;
  const raw = Buffer.alloc(size * rowSize);
  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0;  // filter byte
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * rowSize + 1 + x * 3;
      raw[dst]   = pixels[src];
      raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  // IHDR: width, height, 8-bit depth, color type 2 (RGB)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 2;  // color type: RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Main ───────────────────────────────────────────────────────────────────
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUT   = path.join(__dirname, '..', 'public', 'icons');

fs.mkdirSync(OUT, { recursive: true });

for (const size of SIZES) {
  const png  = generatePNG(size);
  const file = path.join(OUT, `icon-${size}x${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`✓  icon-${size}x${size}.png  (${png.length} bytes)`);
}

// Also write apple-touch-icon (180×180)
const apple = generatePNG(180);
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), apple);
console.log('✓  apple-touch-icon.png  (180×180)');

console.log('\nAll icons generated successfully.');
