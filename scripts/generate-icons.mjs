// Generates PWA app icons (public/icon-192.png, public/icon-512.png) and the
// favicon (src/app/favicon.ico) from the brand mark at public/icon.svg.
// Run with `node scripts/generate-icons.mjs`.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const BG = { r: 0, g: 0, b: 0, alpha: 0 };
const svg = readFileSync(new URL("../public/icon.svg", import.meta.url));

async function makeIcon(size) {
  const padding = 0;
  const inner = size - padding * 2;
  const mark = await sharp(svg, { density: 300 })
    .resize(inner, inner, { fit: "contain", background: BG })
    .png()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();
}

/** Wraps a single square PNG in a minimal ICO container (supported since Vista). */
function encodeIco(size, png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // width (0 means 256)
  entry[1] = size >= 256 ? 0 : size; // height (0 means 256)
  entry[2] = 0; // color palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8); // image data size
  entry.writeUInt32LE(header.length + entry.length, 12); // offset

  return Buffer.concat([header, entry, png]);
}

for (const size of [192, 512]) {
  writeFileSync(
    new URL(`../public/icon-${size}.png`, import.meta.url),
    await makeIcon(size),
  );
}

const faviconSize = 48;
writeFileSync(
  new URL("../src/app/favicon.ico", import.meta.url),
  encodeIco(faviconSize, await makeIcon(faviconSize)),
);

console.log(
  "Generated public/icon-192.png, public/icon-512.png and src/app/favicon.ico",
);
