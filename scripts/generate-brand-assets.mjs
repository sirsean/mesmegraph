/**
 * Generates favicon / touch icons from art/hyperspec-badge-source.png
 * and copies the social preview image into public/.
 * Run: npm run brand-assets
 */
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const badge = path.join(root, "art/hyperspec-badge-source.png");
const ogSource = path.join(root, "art/4994fb85-b9c6-4129-8d7f-6298f87932a6.png");

const voidBg = { r: 13, g: 12, b: 11, alpha: 1 };

async function main() {
  await sharp(badge)
    .resize(512, 512, { fit: "contain", background: voidBg })
    .png()
    .toFile(path.join(root, "public/favicon.png"));

  await sharp(badge)
    .resize(32, 32, { fit: "contain", background: voidBg })
    .png()
    .toFile(path.join(root, "public/favicon-32.png"));

  await sharp(badge)
    .resize(180, 180, { fit: "contain", background: voidBg })
    .png()
    .toFile(path.join(root, "public/apple-touch-icon.png"));

  await copyFile(ogSource, path.join(root, "public/og-social-card.png"));

  console.log("Wrote public/favicon.png, favicon-32.png, apple-touch-icon.png, og-social-card.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
