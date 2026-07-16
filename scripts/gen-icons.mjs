/**
 * Generates the PWA icons (PNG) for PoopBook without any image dependency:
 * the mascot is rasterized with plain math and encoded with node:zlib.
 *
 * Usage: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'icons');

// ---------------------------------------------------------------- PNG encode

const CRC_TABLE = new Int32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c;
});

function crc32(buf) {
	let c = 0xffffffff;
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type: RGBA
	const stride = size * 4;
	const raw = Buffer.alloc((stride + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (stride + 1)] = 0; // filter: none
		rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

// ------------------------------------------------------------------- drawing

const BUTTER = [0xf5, 0xe5, 0xaa];
const BROWN = [0x6a, 0x52, 0x48];
const CREAM = [0xfd, 0xfa, 0xf0];
const DARK = [0x36, 0x2a, 0x26];

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** Color at unit coordinates (0..1, 0..1). Painter's order, last wins. */
function colorAt(x, y) {
	let c = BUTTER;
	// poop body: stacked ellipses + top curl
	if (
		inEllipse(x, y, 0.5, 0.72, 0.3, 0.14) ||
		inEllipse(x, y, 0.5, 0.56, 0.23, 0.13) ||
		inEllipse(x, y, 0.5, 0.41, 0.15, 0.11) ||
		inEllipse(x, y, 0.51, 0.29, 0.06, 0.06)
	) {
		c = BROWN;
	}
	// eyes
	if (inEllipse(x, y, 0.41, 0.55, 0.055, 0.055) || inEllipse(x, y, 0.59, 0.55, 0.055, 0.055)) {
		c = CREAM;
	}
	if (inEllipse(x, y, 0.415, 0.56, 0.025, 0.025) || inEllipse(x, y, 0.595, 0.56, 0.025, 0.025)) {
		c = DARK;
	}
	// smile: lower segment of a thin ring
	const dx = x - 0.5;
	const dy = y - 0.6;
	const d = Math.sqrt(dx * dx + dy * dy);
	if (d >= 0.075 && d <= 0.1 && dy > 0.045) c = DARK;
	return c;
}

/**
 * Renders one icon. `inset` shrinks the artwork around the center — used for
 * the maskable icon so the mascot stays inside the safe zone.
 */
function render(size, inset = 0) {
	const rgba = Buffer.alloc(size * size * 4);
	const SS = 3; // supersampling factor for smooth edges
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			let r = 0;
			let g = 0;
			let b = 0;
			for (let sy = 0; sy < SS; sy++) {
				for (let sx = 0; sx < SS; sx++) {
					let x = (px + (sx + 0.5) / SS) / size;
					let y = (py + (sy + 0.5) / SS) / size;
					x = (x - 0.5) / (1 - inset) + 0.5;
					y = (y - 0.5) / (1 - inset) + 0.5;
					const c = colorAt(x, y);
					r += c[0];
					g += c[1];
					b += c[2];
				}
			}
			const i = (py * size + px) * 4;
			const n = SS * SS;
			rgba[i] = Math.round(r / n);
			rgba[i + 1] = Math.round(g / n);
			rgba[i + 2] = Math.round(b / n);
			rgba[i + 3] = 255;
		}
	}
	return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [file, size, inset] of [
	['icon-192.png', 192, 0],
	['icon-512.png', 512, 0],
	['icon-maskable-512.png', 512, 0.2],
	['apple-touch-icon-180.png', 180, 0]
]) {
	writeFileSync(join(OUT_DIR, file), render(size, inset));
	console.log(`wrote static/icons/${file}`);
}
