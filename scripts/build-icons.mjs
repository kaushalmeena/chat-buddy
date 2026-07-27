/**
 * Renders every PWA/browser icon from the single SVG brand source, so the
 * artwork has exactly one place to be edited.
 *
 *   node scripts/build-icons.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src/assets/brand-icon.svg");
const iconsDir = resolve(root, "public/icons");

/** Maskable icons need their art inside the safe zone, so shrink and pad. */
const MASKABLE_SAFE_RATIO = 0.8;

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
];

async function render(svg, { file, size, maskable = false }) {
  const out = resolve(iconsDir, file);

  if (!maskable) {
    await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
    return out;
  }

  const inner = Math.round(size * MASKABLE_SAFE_RATIO);
  const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#6366f1",
    },
  })
    .composite([{ input: art, gravity: "centre" }])
    .png()
    .toFile(out);

  return out;
}

const svg = await readFile(source);

await mkdir(iconsDir, { recursive: true });

for (const target of targets) {
  const out = await render(svg, target);
  console.log(`  ${out.replace(`${root}/`, "")}`);
}

// Apple's touch icon is composited onto an opaque tile by iOS regardless, so
// render it flat at the documented 180px.
await sharp(svg, { density: 384 })
  .resize(180, 180)
  .flatten({ background: "#6366f1" })
  .png()
  .toFile(resolve(root, "public/apple-touch-icon.png"));
console.log("  public/apple-touch-icon.png");

// The SVG favicon is served as-is; modern browsers prefer it over any raster.
await writeFile(resolve(root, "public/favicon.svg"), svg);
console.log("  public/favicon.svg");
