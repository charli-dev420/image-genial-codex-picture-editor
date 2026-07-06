import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const runtimeDirs = ["mcp", "scripts"];
const banned = [
  "openai.images.generate",
  "openai.images.edit",
  "client.images.generate",
  "client.images.edit",
  "responses.create({",
  "OPENAI_API_KEY",
  "api.openai.com/v1/images",
  "fetch(",
  "WebSocket",
  "XMLHttpRequest",
  "<iframe",
  "window.location",
  "document.location"
];
const skipFiles = new Set(["validate-no-openai-api.mjs", "widget-contract.mjs"]);

const files = [];
for (const dir of runtimeDirs) walk(path.join(root, dir));

let failed = false;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const pattern of banned) {
    if (text.includes(pattern) && !skipFiles.has(path.basename(file))) {
      console.error(`Banned runtime pattern "${pattern}" found in ${path.relative(root, file)}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log(`No banned OpenAI API runtime patterns found in ${files.length} file(s).`);

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (/\.(mjs|js|json|html)$/i.test(name)) files.push(full);
  }
}
