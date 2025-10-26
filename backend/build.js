// build.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const publicDir = path.join(__dirname, "public");
const assetsDir = path.join(publicDir, "assets");

if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir);

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash("md5").update(content).digest("hex").slice(0, 8);
  return hash;
}

function processFile(fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  const srcPath = path.join(publicDir, fileName);

  const hash = hashFile(srcPath);
  const newName = `${base}.${hash}${ext}`;
  const destPath = path.join(assetsDir, newName);

  fs.copyFileSync(srcPath, destPath);
  return `assets/${newName}`;
}

function updateHTML() {
  const indexPath = path.join(publicDir, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");

  const jsFile = processFile("app.js");
  const cssFile = processFile("style.css");

  // replace original references
  html = html
    .replace(/app\.js/g, jsFile)
    .replace(/style\.css/g, cssFile);

  fs.writeFileSync(indexPath, html);
  console.log("✅ Build complete with hashed assets!");
}
fs.unlinkSync(path.join(publicDir, "app.js"));
fs.unlinkSync(path.join(publicDir, "style.css"));

updateHTML();