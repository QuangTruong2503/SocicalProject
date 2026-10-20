// Generates the built-in avatar frames in public/avatar-frames/ from vector art
// drawn in this file (no outside assets). Run: node scripts/generate-avatar-frames.mjs
//
// - 6 static SVG frames: plain Node.
// - 2 animated frames (APNG + animated WebP) and their still fallbacks: frames are
//   rasterised with `sharp` (librsvg), the APNG is assembled here with zlib and the
//   WebP is encoded by sharp (libwebp). sharp is not a project dependency:
//     npm i --no-save sharp@0.34.5   (or SHARP_FROM=<dir containing node_modules/sharp>)
//
// Frame geometry: square canvas 260×260 (viewBox), avatar circle r=100 at (130,130),
// i.e. the avatar is 1/1.3 of the frame side (AVATAR_FRAME_SCALE).
// Motion is slow and smooth (≤ 0.5 Hz, no flashing).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { validateFrameBytes } from '../supabase/functions/avatar-frame-inspect/frameImage.js';

const out = new URL('../public/avatar-frames/', import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name, data) => writeFileSync(new URL(name, out), data);

const C = 130;
const f = (n) => Number(n.toFixed(2));
const polar = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [f(C + r * Math.cos(a)), f(C + r * Math.sin(a))];
};
const svg = (title, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260" width="260" height="260">\n<title>${title}</title>\n${body}\n</svg>\n`;
const star = (cx, cy, outer, inner, rot = 0) => {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? inner : outer;
    const a = ((rot + i * 36 - 90) * Math.PI) / 180;
    pts.push(`${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(' ')}"/>`;
};
const arc = (r, from, to) => {
  const [x1, y1] = polar(r, from);
  const [x2, y2] = polar(r, to);
  const large = ((to - from + 360) % 360) > 180 ? 1 : 0;
  return `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
};

// ─── Static SVG frames ───────────────────────────────────────────────────────

// 1. Classic ring: blue→violet double ring with beads.
{
  const beads = [0, 90, 180, 270].map((d) => { const [x, y] = polar(106, d); return `<circle cx="${x}" cy="${y}" r="7" fill="#fff" stroke="url(#cr)" stroke-width="3"/>`; }).join('\n');
  write('classic-ring.svg', svg('Viền cổ điển', `<defs><linearGradient id="cr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset=".55" stop-color="#2563eb"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
<circle cx="130" cy="130" r="106" fill="none" stroke="url(#cr)" stroke-width="11"/>
<circle cx="130" cy="130" r="100" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="2"/>
<circle cx="130" cy="130" r="120" fill="none" stroke="url(#cr)" stroke-opacity=".6" stroke-width="3" stroke-dasharray="1 9" stroke-linecap="round"/>
${beads}`));
}

// 2. Laurel: two leafy branches meeting at a ribbon.
{
  const leaves = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i += 1) {
      const deg = 180 + side * (22 + i * 17);
      const [x, y] = polar(112, deg);
      const tangent = deg + 90;
      const tilt = side > 0 ? -28 : 28;
      const fill = i % 2 ? '#16a34a' : '#22c55e';
      leaves.push(`<ellipse cx="${x}" cy="${y}" rx="5.5" ry="13" fill="${fill}" stroke="#14532d" stroke-width="1" transform="rotate(${f(tangent + tilt)} ${x} ${y})"/>`);
      const [ix, iy] = polar(97, deg + side * 8);
      if (i % 2 === 0 && i < 8) leaves.push(`<ellipse cx="${ix}" cy="${iy}" rx="4" ry="9.5" fill="#4ade80" stroke="#14532d" stroke-width="1" transform="rotate(${f(tangent - tilt)} ${ix} ${iy})"/>`);
    }
  }
  const stems = `<path d="${arc(108, 30, 172)}" fill="none" stroke="#166534" stroke-width="3" stroke-linecap="round"/><path d="${arc(108, 188, 330)}" fill="none" stroke="#166534" stroke-width="3" stroke-linecap="round"/>`;
  const ribbon = `<path d="M112 232 L100 254 L110 250 L114 258 L124 236 Z" fill="#dc2626"/><path d="M148 232 L160 254 L150 250 L146 258 L136 236 Z" fill="#b91c1c"/><circle cx="130" cy="232" r="9" fill="#ef4444" stroke="#7f1d1d" stroke-width="1.5"/>`;
  write('laurel.svg', svg('Vòng nguyệt quế', `${stems}\n${leaves.join('\n')}\n${ribbon}`));
}

// 3. Starlight: golden ring with stars.
{
  const stars = [];
  for (let i = 0; i < 10; i += 1) {
    const deg = i * 36 + 18;
    const [x, y] = polar(117, deg);
    const big = i % 2 === 0;
    stars.push(star(x, y, big ? 9.5 : 6, big ? 4 : 2.6, deg));
  }
  const sparkles = [6, 54, 126, 162, 234, 306].map((d) => { const [x, y] = polar(124, d); return `<circle cx="${x}" cy="${y}" r="1.8"/>`; }).join('');
  write('starlight.svg', svg('Ánh sao', `<defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset=".5" stop-color="#f59e0b"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs>
<circle cx="130" cy="130" r="105" fill="none" stroke="url(#sg)" stroke-width="8"/>
<circle cx="130" cy="130" r="100" fill="none" stroke="#fffbeb" stroke-opacity=".8" stroke-width="1.5"/>
<g fill="url(#sg)" stroke="#78350f" stroke-width="1" stroke-linejoin="round">${stars.join('')}</g>
<g fill="#fbbf24">${sparkles}</g>`));
}

// 4. Neon: glowing cyan + magenta arcs.
{
  write('neon-glow.svg', svg('Neon', `<defs><filter id="ng" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<g fill="none" stroke-linecap="round" filter="url(#ng)">
<path d="${arc(107, 300, 150)}" stroke="#22d3ee" stroke-width="6"/>
<path d="${arc(107, 160, 290)}" stroke="#e879f9" stroke-width="6"/>
<path d="${arc(119, 20, 110)}" stroke="#e879f9" stroke-width="3"/>
<path d="${arc(119, 200, 290)}" stroke="#22d3ee" stroke-width="3"/>
</g>
<g fill="#f0abfc">${[150, 290].map((d) => { const [x, y] = polar(107, d); return `<circle cx="${x}" cy="${y}" r="4.5"/>`; }).join('')}</g>
<g fill="#a5f3fc">${[300, 160].map((d) => { const [x, y] = polar(107, d); return `<circle cx="${x}" cy="${y}" r="4.5"/>`; }).join('')}</g>`));
}

// 5. Sakura: pink ring with blossoms.
{
  const flower = (cx, cy, size, rot) => {
    const petals = [];
    for (let i = 0; i < 5; i += 1) {
      const a = rot + i * 72;
      petals.push(`<ellipse cx="${cx}" cy="${f(cy - size * 0.62)}" rx="${f(size * 0.42)}" ry="${f(size * 0.62)}" transform="rotate(${a} ${cx} ${cy})"/>`);
    }
    return `<g fill="#fbcfe8" stroke="#db2777" stroke-width="1">${petals.join('')}</g><circle cx="${cx}" cy="${cy}" r="${f(size * 0.26)}" fill="#f9a8d4" stroke="#be185d" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${f(size * 0.1)}" fill="#facc15"/>`;
  };
  const blossoms = [[318, 15], [345, 11], [28, 8], [150, 13], [176, 9], [205, 7]].map(([d, s], i) => { const [x, y] = polar(110, d); return flower(x, y, s, i * 17); }).join('\n');
  const petals = [60, 95, 250, 280].map((d, i) => { const [x, y] = polar(121, d); return `<ellipse cx="${x}" cy="${y}" rx="3" ry="5" fill="#f9a8d4" transform="rotate(${d + i * 40} ${x} ${y})"/>`; }).join('');
  write('sakura.svg', svg('Hoa anh đào', `<circle cx="130" cy="130" r="104" fill="none" stroke="#f472b6" stroke-width="5"/>
<circle cx="130" cy="130" r="111" fill="none" stroke="#fbcfe8" stroke-width="2" stroke-dasharray="3 6" stroke-linecap="round"/>
<path d="${arc(114, 300, 40)}" fill="none" stroke="#9d174d" stroke-width="2.5" stroke-linecap="round"/>
<path d="${arc(114, 140, 215)}" fill="none" stroke="#9d174d" stroke-width="2.5" stroke-linecap="round"/>
${blossoms}
${petals}`));
}

// 6. Royal crown: gold ring, crown on top and gems.
{
  const gems = [[90, '#2563eb'], [180, '#dc2626'], [270, '#2563eb'], [135, '#16a34a'], [225, '#16a34a']].map(([d, c]) => { const [x, y] = polar(106, d); return `<circle cx="${x}" cy="${y}" r="6" fill="${c}" stroke="#fef3c7" stroke-width="2"/>`; }).join('');
  write('royal-crown.svg', svg('Vương miện', `<defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fef08a"/><stop offset=".5" stop-color="#eab308"/><stop offset="1" stop-color="#a16207"/></linearGradient></defs>
<circle cx="130" cy="130" r="106" fill="none" stroke="url(#rg)" stroke-width="10"/>
<circle cx="130" cy="130" r="118" fill="none" stroke="#ca8a04" stroke-opacity=".7" stroke-width="2"/>
<circle cx="130" cy="130" r="100.5" fill="none" stroke="#713f12" stroke-opacity=".45" stroke-width="1.5"/>
<path d="M96 42 L90 10 L113 27 L130 5 L147 27 L170 10 L164 42 Q130 33 96 42 Z" fill="url(#rg)" stroke="#713f12" stroke-width="2" stroke-linejoin="round"/>
<circle cx="90" cy="10" r="4" fill="#fef3c7" stroke="#713f12" stroke-width="1.5"/><circle cx="130" cy="6" r="4.5" fill="#fef3c7" stroke="#713f12" stroke-width="1.5"/><circle cx="170" cy="10" r="4" fill="#fef3c7" stroke="#713f12" stroke-width="1.5"/>
<circle cx="130" cy="30" r="5" fill="#dc2626" stroke="#fef3c7" stroke-width="1.5"/>
${gems}`));
}

console.log('static: 6 SVG frames written');

// ─── Animated frames ─────────────────────────────────────────────────────────

let sharp;
try {
  sharp = createRequire(process.env.SHARP_FROM ? `${process.env.SHARP_FROM.replace(/[\\/]$/, '')}/` : import.meta.url)('sharp');
} catch {
  console.log('animated: skipped (sharp not found; npm i --no-save sharp@0.34.5 or set SHARP_FROM)');
  process.exit(0);
}

const SIZE = 256;

/** Orbit glow: a soft comet circles the ring once per cycle; two dots drift the other way. */
function orbitGlowSvg(t) {
  const head = 360 * t;
  const trail = [];
  const segments = 16;
  for (let i = 0; i < segments; i += 1) {
    const from = head - 110 + (i * 110) / segments;
    const to = from + 110 / segments + 0.6;
    trail.push(`<path d="${arc(106, from, to)}" stroke="#38bdf8" stroke-opacity="${f((i + 1) / segments)}" stroke-width="${f(3 + (4 * i) / segments)}"/>`);
  }
  const [hx, hy] = polar(106, head);
  const dots = [0, 180].map((offset) => { const [x, y] = polar(121, offset - head * 0.5); return `<circle cx="${x}" cy="${y}" r="2.6"/>`; }).join('');
  return svg('Vầng sáng xoay', `<defs>
<linearGradient id="og" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#a855f7"/></linearGradient>
<filter id="oglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<circle cx="130" cy="130" r="106" fill="none" stroke="url(#og)" stroke-width="6" stroke-opacity=".75"/>
<circle cx="130" cy="130" r="100" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="1.5"/>
<g fill="none" stroke-linecap="round">${trail.join('')}</g>
<circle cx="${hx}" cy="${hy}" r="9" fill="#67e8f9" filter="url(#oglow)"/>
<circle cx="${hx}" cy="${hy}" r="5" fill="#ffffff"/>
<g fill="#c4b5fd">${dots}</g>`).replace('width="260" height="260"', `width="${SIZE}" height="${SIZE}"`);
}

/** Twinkle stars: eight stars on a golden ring breathe in turn (slow, out of phase). */
function twinkleStarsSvg(t, still = false) {
  const stars = [];
  for (let k = 0; k < 8; k += 1) {
    const deg = k * 45 + 22.5;
    const [x, y] = polar(116, deg);
    const wave = still ? 1 : 0.5 + 0.5 * Math.sin(2 * Math.PI * (t + k / 8));
    const scale = 0.62 + 0.38 * wave;
    stars.push(`<g opacity="${f(0.5 + 0.5 * wave)}">${star(x, y, f(10 * scale), f(4.2 * scale), deg)}</g>`);
  }
  return svg('Sao lấp lánh', `<defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef3c7"/><stop offset=".5" stop-color="#fbbf24"/><stop offset="1" stop-color="#d97706"/></linearGradient></defs>
<circle cx="130" cy="130" r="105" fill="none" stroke="url(#tg)" stroke-width="7"/>
<circle cx="130" cy="130" r="100" fill="none" stroke="#fffbeb" stroke-opacity=".85" stroke-width="1.5"/>
<g fill="url(#tg)" stroke="#92400e" stroke-width="1" stroke-linejoin="round">${stars.join('')}</g>`).replace('width="260" height="260"', `width="${SIZE}" height="${SIZE}"`);
}

const rasterize = async (markup) => sharp(Buffer.from(markup)).ensureAlpha().raw().toBuffer();
const stillPng = (markup) => sharp(Buffer.from(markup)).png({ compressionLevel: 9 }).toBuffer();

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const result = Buffer.alloc(body.length + 8);
  result.writeUInt32BE(data.length, 0);
  body.copy(result, 4);
  result.writeUInt32BE(crc32(body), body.length + 4);
  return result;
}

/** PNG scanline filtering, picking the filter with the smallest sum per row. */
function filterRows(rgba, width, height) {
  const stride = width * 4;
  const out = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    const prev = y ? rgba.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    let best = null;
    let bestScore = Infinity;
    for (let type = 0; type < 5; type += 1) {
      let score = 0;
      for (let i = 0; i < stride; i += 1) {
        const a = i >= 4 ? row[i - 4] : 0;
        const b = prev[i];
        const c = i >= 4 ? prev[i - 4] : 0;
        let predictor = 0;
        if (type === 1) predictor = a;
        else if (type === 2) predictor = b;
        else if (type === 3) predictor = (a + b) >> 1;
        else if (type === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const value = (row[i] - predictor) & 0xff;
        candidate[i] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) { bestScore = score; best = [type, Buffer.from(candidate)]; }
    }
    out[y * (stride + 1)] = best[0];
    best[1].copy(out, y * (stride + 1) + 1);
  }
  return out;
}

/** Minimal APNG writer: full-canvas RGBA frames, infinite loop, delays in ms. */
function encodeApng(frames, width, height, delaysMs) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length, 0); actl.writeUInt32BE(0, 4);
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('acTL', actl)];
  let sequence = 0;
  frames.forEach((rgba, index) => {
    const fctl = Buffer.alloc(26);
    fctl.writeUInt32BE(sequence++, 0);
    fctl.writeUInt32BE(width, 4); fctl.writeUInt32BE(height, 8);
    fctl.writeUInt32BE(0, 12); fctl.writeUInt32BE(0, 16);
    fctl.writeUInt16BE(delaysMs[index], 20); fctl.writeUInt16BE(1000, 22);
    fctl[24] = 0; fctl[25] = 0; // dispose: none, blend: source (full frames)
    parts.push(chunk('fcTL', fctl));
    const data = deflateSync(filterRows(rgba, width, height), { level: 9 });
    if (index === 0) {
      parts.push(chunk('IDAT', data));
    } else {
      const seq = Buffer.alloc(4);
      seq.writeUInt32BE(sequence++, 0);
      parts.push(chunk('fdAT', Buffer.concat([seq, data])));
    }
  });
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

const report = [];
async function animated({ name, title, ext, frames, delayMs, draw, still }) {
  const markups = Array.from({ length: frames }, (_, i) => draw(i / frames));
  let bytes;
  if (ext === 'png') {
    bytes = encodeApng(await Promise.all(markups.map(rasterize)), SIZE, SIZE, Array(frames).fill(delayMs));
  } else {
    const pngs = await Promise.all(markups.map((markup) => sharp(Buffer.from(markup)).png().toBuffer()));
    bytes = await sharp(pngs, { join: { animated: true } }).webp({ lossless: true, effort: 6, loop: 0, delay: Array(frames).fill(delayMs) }).toBuffer();
  }
  const stillBytes = await stillPng(still);
  write(`${name}.${ext}`, bytes);
  write(`${name}-still.png`, stillBytes);

  for (const [file, data] of [[`${name}.${ext}`, bytes], [`${name}-still.png`, stillBytes]]) {
    const result = validateFrameBytes(new Uint8Array(readFileSync(new URL(file, out))));
    if (result.error) throw new Error(`${file}: ${result.error}`);
    if (result.info.fileSize !== data.length) throw new Error(`${file}: size mismatch`);
    report.push({ file, title, ...result.info });
  }
}

await animated({ name: 'orbit-glow', title: 'Vầng sáng xoay', ext: 'png', frames: 30, delayMs: 80, draw: orbitGlowSvg, still: orbitGlowSvg(0.125) });
await animated({ name: 'twinkle-stars', title: 'Sao lấp lánh', ext: 'webp', frames: 24, delayMs: 100, draw: twinkleStarsSvg, still: twinkleStarsSvg(0, true) });

// Paste into the seed of supabase/migrations/20261021090000_avatar_frames_animated.sql when these change.
console.table(report.map(({ file, format, type, width, height, fileSize, frameCount, durationMs }) => ({ file, format, type, width, height, fileSize, frameCount, durationMs })));
