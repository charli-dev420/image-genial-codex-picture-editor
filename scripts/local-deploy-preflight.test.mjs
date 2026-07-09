import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLUGIN_NAME,
  SUPPORTED_NODE_RANGE,
  createPreflightReport,
  writeMarketplaceEntry,
  writePreflightReport
} from "./local-deploy-preflight.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const tmp = mkdtempSync(path.join(os.tmpdir(), "codex-image-editor-deploy-"));
const sourceRoot = path.join(tmp, "source");
const marketplaceRoot = path.join(tmp, "marketplace");
const checkoutPath = path.join(marketplaceRoot, "plugins", PLUGIN_NAME);
const marketplacePath = path.join(marketplaceRoot, "marketplace.json");

writePluginFixture(sourceRoot, "0.1.0");
writePluginFixture(checkoutPath, "0.1.0");
writeFileSync(marketplacePath, JSON.stringify({
  name: "personal",
  interface: { displayName: "Personal" },
  plugins: [{
    name: "codex-unity-comfyui-pipeline",
    source: { source: "local", path: "./plugins/codex-unity-comfyui-pipeline" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity"
  }]
}, null, 2));

const cleanRunner = commandRunner({ gitStatus: "" });
const missingEntry = createPreflightReport({ sourceRoot, checkoutPath, marketplacePath, nodeVersion: "24.14.0", commandRunner: cleanRunner });
assert.equal(missingEntry.localReady, false);
assert.equal(missingEntry.sourceReady, true);
assert.equal(missingEntry.marketplace.entryStatus, "missing");

const update = writeMarketplaceEntry(marketplacePath, checkoutPath);
assert.equal(update.action, "added");
const marketplace = JSON.parse(readFileSync(marketplacePath, "utf8"));
assert.equal(marketplace.plugins.length, 2);
assert.equal(marketplace.plugins[0].name, "codex-unity-comfyui-pipeline");
assert.equal(marketplace.plugins[1].name, PLUGIN_NAME);

const ready = createPreflightReport({ sourceRoot, checkoutPath, marketplacePath, nodeVersion: "24.14.0", commandRunner: cleanRunner });
assert.equal(ready.localReady, true);
assert.equal(ready.releaseReady, false);
assert.equal(ready.host.pluginManagementAvailable, true);
assert.equal(ready.host.pluginCommandAvailable, false);
assert.ok(ready.host.manualGates.some((gate) => gate.includes("desktop")));

const reportPath = path.join(tmp, "reports", "preflight.json");
writePreflightReport(reportPath, ready);
assert.equal(existsSync(reportPath), true);
assert.equal(JSON.parse(readFileSync(reportPath, "utf8")).localReady, true);

writePluginFixture(checkoutPath, "0.1.0+codex.local-test");
const cachebusterRunner = commandRunner({
  gitStatus: " M .codex-plugin/plugin.json\n",
  dirtyRepository: checkoutPath,
  baselineManifest: fixtureManifest("0.1.0")
});
const cachebuster = createPreflightReport({
  sourceRoot,
  checkoutPath,
  marketplacePath,
  nodeVersion: "24.14.0",
  allowLocalCachebuster: true,
  commandRunner: cachebusterRunner
});
assert.equal(cachebuster.localReady, true);
assert.equal(cachebuster.checkout.gitState, "local-cachebuster-only");

const dirty = createPreflightReport({
  sourceRoot,
  checkoutPath,
  marketplacePath,
  nodeVersion: "24.14.0",
  allowLocalCachebuster: true,
  commandRunner: commandRunner({ gitStatus: " M README.md\n", dirtyRepository: checkoutPath })
});
assert.equal(dirty.localReady, false);
assert.ok(dirty.checks.some((item) => item.id === "checkout-git" && !item.passed));

const unsupportedNode = createPreflightReport({
  sourceRoot,
  checkoutPath,
  marketplacePath,
  nodeVersion: "20.0.0",
  allowLocalCachebuster: true,
  commandRunner: cachebusterRunner
});
assert.equal(unsupportedNode.localReady, false);

const deploymentScript = readFileSync(path.join(root, "scripts", "deploy-local.ps1"), "utf8");
for (const token of ["[switch]$Apply", "Split-Path -Parent $PSScriptRoot", "update_plugin_cachebuster.py", "--write-marketplace", "codex://plugins/"]) {
  assert.ok(deploymentScript.includes(token), `deployment script missing ${token}`);
}
for (const banned of ["OPENAI" + "_API_KEY", "openai.images." + "generate", "openai.images." + "edit", "api.openai.com" + "/v1/images"]) {
  assert.equal(deploymentScript.includes(banned), false, `deployment script contains banned token ${banned}`);
}

console.log("Local deployment preflight passed.");

function fixtureManifest(version) {
  return {
    name: PLUGIN_NAME,
    version,
    description: "Fixture plugin.",
    author: { name: "fixture" },
    skills: "./skills/",
    mcpServers: "./.mcp.json",
    apps: "./.app.json",
    interface: { displayName: "Fixture", shortDescription: "Fixture" }
  };
}

function writePluginFixture(pluginRoot, version) {
  mkdirSync(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  mkdirSync(path.join(pluginRoot, "skills"), { recursive: true });
  writeFileSync(path.join(pluginRoot, ".codex-plugin", "plugin.json"), JSON.stringify(fixtureManifest(version), null, 2));
  writeFileSync(path.join(pluginRoot, ".mcp.json"), "{\"mcpServers\":{}}\n");
  writeFileSync(path.join(pluginRoot, ".app.json"), "{\"apps\":{}}\n");
  writeFileSync(path.join(pluginRoot, "package.json"), JSON.stringify({ name: PLUGIN_NAME, engines: { node: SUPPORTED_NODE_RANGE } }, null, 2));
}

function commandRunner({ gitStatus = "", dirtyRepository = "", baselineManifest = fixtureManifest("0.1.0") } = {}) {
  return (command, args) => {
    const joined = args.join(" ");
    if (command === "git" && joined.includes(" status --porcelain")) {
      const isDirtyRepository = !dirtyRepository || args.includes(dirtyRepository);
      return { status: 0, stdout: isDirtyRepository ? gitStatus : "", stderr: "", error: "" };
    }
    if (command === "git" && joined.includes(" show HEAD:.codex-plugin/plugin.json")) return { status: 0, stdout: JSON.stringify(baselineManifest), stderr: "", error: "" };
    if (command === "codex" && args[0] === "--help") return { status: 0, stdout: "Commands:\n  plugin\n", stderr: "", error: "" };
    if (command === "codex" && args[0] === "plugin") return { status: 0, stdout: "Commands:\n  marketplace\n", stderr: "", error: "" };
    if (command === "codex" && args[0] === "login") return { status: 1, stdout: "", stderr: "Not logged in", error: "" };
    return { status: 0, stdout: "", stderr: "", error: "" };
  };
}
