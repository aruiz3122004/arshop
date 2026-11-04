// One-shot: genera los iconos PNG de la PWA a partir del logo JPG.
//   node scripts/generate-pwa-icons.mjs
// Produce:
//   public/icon-192.png
//   public/icon-512.png
//   public/icon-512-maskable.png (con padding para safe area)
//   public/apple-touch-icon.png (180x180)
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "public", "arshop-logo.jpg");
const OUT = (name) => path.join(__dirname, "..", "public", name);

// Fondo blanco (coincide con el "white-cube" del design system)
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

async function fitSquare(size, outName, { padding = 0 } = {}) {
  const inner = size - padding * 2;
  const resized = await sharp(SRC)
    .resize({ width: inner, height: inner, fit: "contain", background: BG })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: resized, top: padding, left: padding }])
    .png()
    .toFile(OUT(outName));

  console.log(`✓ ${outName} (${size}x${size})`);
}

await fitSquare(192, "icon-192.png");
await fitSquare(512, "icon-512.png");
// Maskable: 10% padding en cada lado para la safe area (iconos Android circulares)
await fitSquare(512, "icon-512-maskable.png", { padding: 51 });
await fitSquare(180, "apple-touch-icon.png");

console.log("Done.");
