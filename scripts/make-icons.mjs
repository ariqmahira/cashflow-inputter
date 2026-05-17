// Generate solid-color PNG icons (no external deps).
// Run: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// Hex → [r,g,b]
const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

const BG = rgb('#0f172a'); // brand bg
const FG = rgb('#22c55e'); // brand accent

// CRC32 (PNG)
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
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

function makePng(size, draw) {
  const channels = 4; // RGBA
  const raw = Buffer.alloc(size * (1 + size * channels));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * channels);
    raw[rowStart] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y, size);
      const off = rowStart + 1 + x * channels;
      raw[off + 0] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Draw a rounded square background with a centered ring "logo".
function makeIcon(size, { maskable = false } = {}) {
  const radius = maskable ? size * 0.5 : size * 0.22;
  const cx = size / 2;
  const cy = size / 2;
  const ringOuter = (maskable ? 0.32 : 0.36) * size;
  const ringInner = (maskable ? 0.20 : 0.24) * size;
  const dotR = (maskable ? 0.07 : 0.08) * size;

  return makePng(size, (x, y) => {
    // rounded-rect background (skip for maskable — full bleed)
    if (!maskable) {
      const dx = Math.max(0, Math.abs(x - cx) - (size / 2 - radius));
      const dy = Math.max(0, Math.abs(y - cy) - (size / 2 - radius));
      if (dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0];
    }
    const dr = Math.hypot(x - cx, y - cy);
    // outer accent dot
    if (Math.hypot(x - cx, y - (cy - ringOuter * 0.85)) <= dotR) return [...FG, 255];
    // ring (FG)
    if (dr >= ringInner && dr <= ringOuter) return [...FG, 255];
    // background
    return [...BG, 255];
  });
}

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-512-maskable.png', size: 512, maskable: true },
];

for (const t of targets) {
  const buf = makeIcon(t.size, { maskable: t.maskable });
  writeFileSync(join(outDir, t.name), buf);
  console.log(`wrote ${t.name} (${buf.length} bytes)`);
}
