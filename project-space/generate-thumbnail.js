/*
 * Renders project-space/thumbnail-generator.html into
 * images/project-space/thumbnail.jpg at the standard 1200x630 OG size.
 *
 * Usage: node project-space/generate-thumbnail.js
 *
 * Uses whichever Chrome/Chromium is already installed rather than pulling in
 * puppeteer, so this needs no npm install. Override detection with CHROME_PATH.
 * Renders at 2x and downscales, which gives noticeably cleaner text edges.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });

  if (!found) {
    throw new Error(
      "No Chrome/Chromium found. Set CHROME_PATH to a browser binary.",
    );
  }
  return found;
}

function toJpeg(pngPath, jpegPath) {
  // sips ships with macOS; fall back to ImageMagick elsewhere.
  try {
    execFileSync("sips", [
      "-s", "format", "jpeg",
      "-s", "formatOptions", "88",
      "-Z", String(Math.max(WIDTH, HEIGHT)),
      pngPath,
      "--out", jpegPath,
    ], { stdio: "pipe" });
    return "sips";
  } catch {
    execFileSync("magick", [
      pngPath,
      "-resize", `${WIDTH}x${HEIGHT}`,
      "-quality", "88",
      jpegPath,
    ], { stdio: "pipe" });
    return "imagemagick";
  }
}

function main() {
  const chrome = findChrome();
  const templatePath = path.join(__dirname, "thumbnail-generator.html");
  const outputDir = path.join(__dirname, "..", "images", "project-space");
  const jpegPath = path.join(outputDir, "thumbnail.jpg");

  fs.mkdirSync(outputDir, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ps-thumb-"));
  const pngPath = path.join(tempDir, "thumbnail.png");

  try {
    execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-sandbox",
        "--default-background-color=00000000",
        `--force-device-scale-factor=${SCALE}`,
        `--window-size=${WIDTH},${HEIGHT}`,
        "--virtual-time-budget=8000",
        `--screenshot=${pngPath}`,
        `file://${templatePath}`,
      ],
      { stdio: "pipe" },
    );

    if (!fs.existsSync(pngPath)) {
      throw new Error("Chrome produced no screenshot.");
    }

    const converter = toJpeg(pngPath, jpegPath);
    const kb = (fs.statSync(jpegPath).size / 1024).toFixed(0);

    console.log(`Rendered with: ${path.basename(chrome)} at ${SCALE}x`);
    console.log(`Converted with: ${converter}`);
    console.log(`Saved images/project-space/thumbnail.jpg (${kb} KB)`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
