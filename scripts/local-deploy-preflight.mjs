import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceRootDefault = path.resolve(__dirname, "..");

export const PLUGIN_NAME = "codex-image-editor";
export const PERSONAL_MARKETPLACE_NAME = "personal";
export const MARKETPLACE_SOURCE_PATH = "./plugins/codex-image-editor";
export const SUPPORTED_NODE_RANGE = ">=22 <25";
export const MIN_NODE_MAJOR = 22;
export const MAX_NODE_MAJOR_EXCLUSIVE = 25;

export function expectedMarketplaceEntry() {
  return {
    name: PLUGIN_NAME,
    source: {
      source: "local",
      path: MARKETPLACE_SOURCE_PATH
    },
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL"
    },
    category: "Productivity"
  };
}

function executableFor(command) {
  if (command !== "codex" || process.platform !== "win32") return command;
  const candidates = [
    process.env.CODEX_CLI_PATH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin", "codex.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || command;
}

export function runSystemCommand(command, args) {
  const result = spawnSync(executableFor(command), args, { encoding: "utf8", windowsHide: true });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? String(result.error.message || result.error) : ""
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function check(id, passed, details) {
  return { id, passed: Boolean(passed), details: String(details || "") };
}

function isSafeRelativePath(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath.startsWith("./")) return false;
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function supportedVersion(version) {
  const match = /^(\d+)\./.exec(String(version || ""));
  const major = match ? Number(match[1]) : Number.NaN;
  return {
    version: String(version || ""),
    major,
    supported: Number.isInteger(major) && major >= MIN_NODE_MAJOR && major < MAX_NODE_MAJOR_EXCLUSIVE
  };
}

export function inspectPluginRoot(pluginRoot) {
  const root = path.resolve(pluginRoot);
  const manifestPath = path.join(root, ".codex-plugin", "plugin.json");
  const packagePath = path.join(root, "package.json");
  const errors = [];
  let manifest = null;
  let packageJson = null;

  if (!existsSync(manifestPath)) errors.push("Missing .codex-plugin/plugin.json.");
  if (!existsSync(packagePath)) errors.push("Missing package.json.");

  if (!errors.length) {
    try {
      manifest = readJson(manifestPath);
      packageJson = readJson(packagePath);
    } catch (error) {
      errors.push(`Invalid JSON: ${error.message}`);
    }
  }

  if (manifest) {
    if (manifest.name !== PLUGIN_NAME) errors.push(`Manifest name must be ${PLUGIN_NAME}.`);
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(String(manifest.version || ""))) {
      errors.push("Manifest version is not valid semver.");
    }
    for (const field of ["skills", "mcpServers"]) {
      if (!isSafeRelativePath(root, manifest[field])) {
        errors.push(`Manifest ${field} must be a safe ./ relative path.`);
        continue;
      }
      if (!existsSync(path.resolve(root, manifest[field]))) errors.push(`Manifest ${field} target is missing.`);
    }
    if (manifest.apps !== undefined) {
      if (!isSafeRelativePath(root, manifest.apps)) errors.push("Manifest apps must be a safe ./ relative path when present.");
      else if (!existsSync(path.resolve(root, manifest.apps))) errors.push("Manifest apps target is missing.");
    }
  }

  if (packageJson?.engines?.node !== SUPPORTED_NODE_RANGE) {
    errors.push(`package.json engines.node must be ${SUPPORTED_NODE_RANGE}.`);
  }

  return {
    root,
    manifestPath,
    packagePath,
    manifest,
    packageJson,
    ok: errors.length === 0,
    errors
  };
}

function marketplaceEntryMatches(entry) {
  const expected = expectedMarketplaceEntry();
  return entry?.name === expected.name
    && entry?.source?.source === expected.source.source
    && entry?.source?.path === expected.source.path
    && entry?.policy?.installation === expected.policy.installation
    && entry?.policy?.authentication === expected.policy.authentication
    && entry?.category === expected.category;
}

export function inspectMarketplace(marketplacePath, checkoutPath) {
  const resolvedMarketplacePath = path.resolve(marketplacePath);
  const marketplaceRoot = path.resolve(path.dirname(resolvedMarketplacePath), "..", "..");
  const expectedCheckoutPath = path.resolve(marketplaceRoot, MARKETPLACE_SOURCE_PATH);
  const errors = [];
  let marketplace = null;

  if (!existsSync(resolvedMarketplacePath)) {
    errors.push("Marketplace file is missing.");
  } else {
    try {
      marketplace = readJson(resolvedMarketplacePath);
    } catch (error) {
      errors.push(`Marketplace JSON is invalid: ${error.message}`);
    }
  }

  if (marketplace) {
    if (marketplace.name !== PERSONAL_MARKETPLACE_NAME) errors.push(`Marketplace name must be ${PERSONAL_MARKETPLACE_NAME}.`);
    if (!Array.isArray(marketplace.plugins)) errors.push("Marketplace plugins must be an array.");
  }

  if (path.resolve(checkoutPath) !== expectedCheckoutPath) {
    errors.push(`Checkout must resolve to ${expectedCheckoutPath}.`);
  }

  const entry = marketplace?.plugins?.find((item) => item?.name === PLUGIN_NAME) || null;
  const entryStatus = !entry ? "missing" : marketplaceEntryMatches(entry) ? "matching" : "mismatched";
  if (entryStatus !== "matching") errors.push(`Marketplace entry is ${entryStatus}.`);

  return {
    marketplacePath: resolvedMarketplacePath,
    expectedCheckoutPath,
    marketplace,
    entry,
    entryStatus,
    ok: errors.length === 0,
    errors
  };
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}

export function writeMarketplaceEntry(marketplacePath, checkoutPath) {
  const inspected = inspectMarketplace(marketplacePath, checkoutPath);
  if (!inspected.marketplace || !Array.isArray(inspected.marketplace.plugins)) {
    throw new Error(inspected.errors.join(" "));
  }
  if (path.resolve(checkoutPath) !== inspected.expectedCheckoutPath) {
    throw new Error(`Refusing to write a marketplace entry outside its root: ${checkoutPath}`);
  }

  const marketplace = structuredClone(inspected.marketplace);
  const index = marketplace.plugins.findIndex((item) => item?.name === PLUGIN_NAME);
  const expected = expectedMarketplaceEntry();
  let action = "unchanged";

  if (index < 0) {
    marketplace.plugins.push(expected);
    action = "added";
  } else if (!marketplaceEntryMatches(marketplace.plugins[index])) {
    const existing = marketplace.plugins[index] || {};
    marketplace.plugins[index] = {
      ...existing,
      ...expected,
      source: { ...existing.source, ...expected.source },
      policy: { ...existing.policy, ...expected.policy }
    };
    action = "updated";
  }

  if (action !== "unchanged") writeJsonAtomic(inspected.marketplacePath, marketplace);
  return { action, marketplacePath: inspected.marketplacePath };
}

function gitStatus(repoRoot, commandRunner, allowLocalCachebuster) {
  const resolvedRoot = path.resolve(repoRoot);
  const status = commandRunner("git", ["-c", `safe.directory=${resolvedRoot}`, "-C", resolvedRoot, "status", "--porcelain"]);
  if (status.status !== 0) {
    return { passed: false, state: "unavailable", details: status.stderr || status.error || "git status failed" };
  }

  const changedPaths = status.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
  if (!changedPaths.length) return { passed: true, state: "clean", details: "Git worktree is clean." };
  if (!allowLocalCachebuster || changedPaths.length !== 1 || changedPaths[0] !== ".codex-plugin/plugin.json") {
    return { passed: false, state: "dirty", details: `Unexpected local changes: ${changedPaths.join(", ")}` };
  }

  try {
    const current = readJson(path.join(resolvedRoot, ".codex-plugin", "plugin.json"));
    const baselineResult = commandRunner("git", ["-c", `safe.directory=${resolvedRoot}`, "-C", resolvedRoot, "show", "HEAD:.codex-plugin/plugin.json"]);
    if (baselineResult.status !== 0) throw new Error(baselineResult.stderr || baselineResult.error || "git show failed");
    const baseline = JSON.parse(baselineResult.stdout);
    const normalizedCurrent = structuredClone(current);
    normalizedCurrent.version = baseline.version;
    const onlyCachebuster = String(current.version || "").includes("+codex.")
      && JSON.stringify(normalizedCurrent) === JSON.stringify(baseline);
    return onlyCachebuster
      ? { passed: true, state: "local-cachebuster-only", details: "Only the generated local Codex cachebuster differs." }
      : { passed: false, state: "dirty", details: "plugin.json contains changes beyond the generated Codex cachebuster." };
  } catch (error) {
    return { passed: false, state: "dirty", details: `Cannot validate generated cachebuster: ${error.message}` };
  }
}

export function inspectCodexHost(commandRunner = runSystemCommand) {
  const help = commandRunner("codex", ["--help"]);
  const pluginHelp = help.status === 0 && /^\s+plugin\s/m.test(help.stdout)
    ? commandRunner("codex", ["plugin", "--help"])
    : { status: 1, stdout: "", stderr: "", error: "" };
  const login = commandRunner("codex", ["login", "status"]);
  const pluginManagementAvailable = pluginHelp.status === 0;
  const pluginCommandAvailable = pluginManagementAvailable && /^\s+add\s/m.test(pluginHelp.stdout);
  const cliAuthenticated = login.status === 0;
  const manualGates = [
    "Open a new Codex desktop thread and verify the inline MCP widget.",
    "Verify native Image Gen in the same ChatGPT/Codex session.",
    "Verify that a real Codex Image Gen artifact can return to the workspace."
  ];
  if (!pluginCommandAvailable) manualGates.unshift("The installed CLI does not expose codex plugin add; install from the Codex desktop plugin manager.");
  if (!cliAuthenticated) manualGates.unshift("The terminal Codex CLI is not authenticated; desktop authentication must be checked separately.");

  return {
    cliAvailable: help.status === 0,
    cliAuthenticated,
    pluginManagementAvailable,
    pluginCommandAvailable,
    desktopVerificationRequired: true,
    imageGenVerificationRequired: true,
    manualGates
  };
}

export function createPreflightReport({
  sourceRoot = sourceRootDefault,
  checkoutPath = path.join(os.homedir(), "plugins", PLUGIN_NAME),
  marketplacePath = path.join(os.homedir(), ".agents", "plugins", "marketplace.json"),
  nodeVersion = process.versions.node,
  allowLocalCachebuster = false,
  commandRunner = runSystemCommand
} = {}) {
  const source = inspectPluginRoot(sourceRoot);
  const checkout = inspectPluginRoot(checkoutPath);
  const marketplace = inspectMarketplace(marketplacePath, checkoutPath);
  const node = supportedVersion(nodeVersion);
  const sourceGit = gitStatus(sourceRoot, commandRunner, false);
  const checkoutGit = checkout.ok ? gitStatus(checkoutPath, commandRunner, allowLocalCachebuster) : { passed: false, state: "missing", details: "Checkout cannot be inspected before manifest validation." };
  const host = inspectCodexHost(commandRunner);
  const checks = [
    check("node", node.supported, node.supported ? `Node ${node.version} matches ${SUPPORTED_NODE_RANGE}.` : `Node ${node.version} is outside ${SUPPORTED_NODE_RANGE}.`),
    check("source-plugin", source.ok, source.ok ? "Source plugin manifest is valid." : source.errors.join(" ")),
    check("source-git", sourceGit.passed, sourceGit.details),
    check("checkout-plugin", checkout.ok, checkout.ok ? "Deployment checkout manifest is valid." : checkout.errors.join(" ")),
    check("checkout-git", checkoutGit.passed, checkoutGit.details),
    check("marketplace", marketplace.ok, marketplace.ok ? "Personal marketplace entry matches the local checkout." : marketplace.errors.join(" "))
  ];
  const sourceReady = checks.slice(0, 3).every((item) => item.passed);
  const localReady = checks.every((item) => item.passed);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    pluginName: PLUGIN_NAME,
    sourceReady,
    localReady,
    releaseReady: false,
    source: { path: path.resolve(sourceRoot), version: source.manifest?.version || null },
    checkout: { path: path.resolve(checkoutPath), version: checkout.manifest?.version || null, gitState: checkoutGit.state },
    marketplace: { path: path.resolve(marketplacePath), entryStatus: marketplace.entryStatus, expectedSourcePath: MARKETPLACE_SOURCE_PATH },
    node,
    host,
    checks
  };
}

export function writePreflightReport(reportPath, report) {
  writeJsonAtomic(path.resolve(reportPath), report);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write-marketplace") options.writeMarketplace = true;
    else if (argument === "--source-only") options.sourceOnly = true;
    else if (argument === "--allow-local-cachebuster") options.allowLocalCachebuster = true;
    else if (argument === "--source") options.sourceRoot = argv[++index];
    else if (argument === "--checkout") options.checkoutPath = argv[++index];
    else if (argument === "--marketplace") options.marketplacePath = argv[++index];
    else if (argument === "--report") options.reportPath = argv[++index];
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/local-deploy-preflight.mjs [options]\n\n`);
  process.stdout.write(`  --source <path>                  Source checkout to validate.\n`);
  process.stdout.write(`  --checkout <path>                Deployment checkout to validate.\n`);
  process.stdout.write(`  --marketplace <path>             Personal marketplace.json path.\n`);
  process.stdout.write(`  --write-marketplace              Add or repair only this plugin entry atomically.\n`);
  process.stdout.write(`  --source-only                    Validate only the source checkout before initial deployment.\n`);
  process.stdout.write(`  --allow-local-cachebuster        Accept the generated manifest-only cachebuster diff.\n`);
  process.stdout.write(`  --report <path>                  Persist the JSON preflight report atomically.\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const checkoutPath = options.checkoutPath || path.join(os.homedir(), "plugins", PLUGIN_NAME);
  const marketplacePath = options.marketplacePath || path.join(os.homedir(), ".agents", "plugins", "marketplace.json");
  if (options.writeMarketplace) writeMarketplaceEntry(marketplacePath, checkoutPath);
  const report = createPreflightReport({ ...options, checkoutPath, marketplacePath });
  if (options.reportPath) writePreflightReport(options.reportPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (options.sourceOnly ? !report.sourceReady : !report.localReady) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
