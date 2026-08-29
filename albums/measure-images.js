/*
 * Stamps every album photo in albums/data.js with the pixel size a browser
 * will actually render it at.
 *
 * Usage: node albums/measure-images.js
 *
 * The album pages use those numbers to reserve each photo's exact box before
 * the file downloads, so the masonry grid never reflows as images arrive.
 * Re-run this after adding, removing or replacing any album photo.
 *
 * Measuring is done by decoding each file in headless Chrome and reading
 * naturalWidth/naturalHeight, not by reading the JPEG header. Six of these
 * photos are stored landscape with an EXIF rotation flag, so the header size
 * is transposed from what the browser lays out — and a wrong ratio would crop
 * the photo instead of merely shifting it. Chrome applies the flag the same
 * way at measure time and at render time, so the two can never disagree.
 * Needs a local Chrome/Chromium (override with CHROME_PATH); no npm install.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const DATA_FILE = path.join(__dirname, "data.js");

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

function measure(chrome, files) {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "album-measure-"));
  const probePath = path.join(probeDir, "probe.html");

  const page = `<!doctype html><meta charset="utf-8"><pre id="out"></pre>
<script id="targets" type="application/json">${JSON.stringify(files)}</script>
<script>
  var targets = JSON.parse(document.getElementById("targets").textContent);
  var results = [];
  var done = 0;
  function finish() {
    document.getElementById("out").textContent = JSON.stringify(results);
  }
  if (!targets.length) finish();
  targets.forEach(function (target) {
    var img = new Image();
    img.onload = function () {
      results.push({ src: target.src, w: img.naturalWidth, h: img.naturalHeight });
      if (++done === targets.length) finish();
    };
    img.onerror = function () {
      results.push({ src: target.src, w: 0, h: 0 });
      if (++done === targets.length) finish();
    };
    img.src = target.url;
  });
</script>`;

  fs.writeFileSync(probePath, page);

  try {
    const dom = execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--allow-file-access-from-files",
        "--virtual-time-budget=60000",
        "--dump-dom",
        `file://${probePath}`,
      ],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );

    const match = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
    if (!match || !match[1].trim()) {
      throw new Error("Chrome returned no measurements.");
    }

    const decoded = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");

    const sizes = new Map();
    for (const item of JSON.parse(decoded)) {
      sizes.set(item.src, { w: item.w, h: item.h });
    }
    return sizes;
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

function main() {
  const source = fs.readFileSync(DATA_FILE, "utf8");

  // Walk each `images: [ ... ]` block. Entries may already be objects from a
  // previous run, so only the quoted paths inside are read back out.
  const blockPattern = /images:\s*\[([\s\S]*?)\]/g;
  const blocks = [];
  let match;
  while ((match = blockPattern.exec(source)) !== null) {
    const srcs = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    blocks.push({ start: match.index, end: blockPattern.lastIndex, srcs });
  }

  const allSrcs = [...new Set(blocks.flatMap((block) => block.srcs))];
  const skipped = [];
  const measurable = [];

  for (const src of allSrcs) {
    if (src.toLowerCase().endsWith(".pdf")) {
      skipped.push(`${src} (pdf placeholder, no box needed)`);
      continue;
    }
    const abs = path.join(REPO_ROOT, src);
    if (!fs.existsSync(abs)) {
      skipped.push(`${src} (file missing)`);
      continue;
    }
    measurable.push({ src, url: `file://${encodeURI(abs)}` });
  }

  const sizes = measure(findChrome(), measurable);
  const bySrc = new Map();
  for (const { src } of measurable) {
    const size = sizes.get(src);
    if (size && size.w && size.h) {
      bySrc.set(src, size);
    } else {
      skipped.push(`${src} (could not be decoded)`);
    }
  }

  // Rebuild back to front so earlier offsets stay valid.
  let output = source;
  for (const block of [...blocks].reverse()) {
    const lines = block.srcs.map((src) => {
      const size = bySrc.get(src);
      const escaped = src.replace(/"/g, '\\"');
      return size
        ? `      { src: "${escaped}", w: ${size.w}, h: ${size.h} },`
        : `      { src: "${escaped}" },`;
    });
    output =
      output.slice(0, block.start) +
      `images: [\n${lines.join("\n")}\n    ]` +
      output.slice(block.end);
  }

  fs.writeFileSync(DATA_FILE, output);

  console.log(`Measured ${bySrc.size} of ${allSrcs.length} album photos.`);
  if (skipped.length) {
    console.log("Left without dimensions:");
    for (const note of skipped) console.log(`  - ${note}`);
  }
  console.log("Updated albums/data.js");
}

main();
