import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "mcp", "image-editor-widget.html");
const html = readFileSync(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];

if (!scripts.length) throw new Error("Widget has no inline script to validate.");

for (const [index, match] of scripts.entries()) {
  new vm.Script(match[1], { filename: `${htmlPath}#script-${index + 1}` });
}

console.log(`Widget inline script syntax passed (${scripts.length} script).`);
