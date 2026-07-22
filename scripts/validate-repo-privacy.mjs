import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = execFileSync(
  "git",
  ["-c", `safe.directory=${root}`, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" }
).split("\0").filter(Boolean);

const textExtensions = new Set([
  ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".ps1",
  ".sh", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"
]);
const textNames = new Set([".gitignore", ".mcp.json"]);
const privatePathPatterns = [
  { name: "Windows user-profile path", regex: /[A-Za-z]:[\\/]+Users[\\/]+(?!Public(?:[\\/]|$))[^\\/\r\n]+[\\/]/i },
  { name: "macOS user-home path", regex: /\/Users\/(?!Shared(?:\/|$))[^/\r\n]+\//i },
  { name: "Linux user-home path", regex: /\/home\/[^/\r\n]+\//i },
  { name: "Windows AppData path", regex: /AppData[\\/]+(?:Local|Roaming)[\\/]/i }
];
const secretPatterns = [
  { name: "OpenAI-style secret", regex: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/ },
  { name: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { name: "AWS access key", regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "Stripe live secret", regex: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { name: "Private key material", regex: new RegExp("BEGIN " + "(?:RSA |EC |OPENSSH )?PRIVATE KEY") },
  {
    name: "Assigned OpenAI API key",
    regex: new RegExp("OPENAI_" + "API_KEY" + "\\s*=\\s*[\"']?(?!<|example|your_|dummy|test)[A-Za-z0-9_-]{16,}", "i")
  }
];

const findings = [];
for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) continue;
  const buffer = readFileSync(absolutePath);
  const latin1 = buffer.toString("latin1");
  for (const pattern of privatePathPatterns) {
    if (pattern.regex.test(latin1)) findings.push(`${relativePath}: ${pattern.name}`);
  }

  const extension = path.extname(relativePath).toLowerCase();
  const baseName = path.basename(relativePath).toLowerCase();
  if (!textExtensions.has(extension) && !textNames.has(baseName)) continue;
  const text = buffer.toString("utf8");
  for (const pattern of secretPatterns) {
    if (pattern.regex.test(text)) findings.push(`${relativePath}: ${pattern.name}`);
  }
}

if (findings.length) {
  console.error("Repository privacy scan failed:");
  for (const finding of [...new Set(findings)].sort()) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Repository privacy scan passed (${files.length} files; no secret or personal-path patterns found).`);
