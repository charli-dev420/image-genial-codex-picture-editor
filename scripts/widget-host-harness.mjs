import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const portFlag = process.argv.indexOf("--port");
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 4317;
const imageFlag = process.argv.indexOf("--image");
const sourceImagePath = imageFlag >= 0 ? path.resolve(process.argv[imageFlag + 1]) : path.join(root, "assets", "logo.png");
const requestFlag = process.argv.indexOf("--request");
const initialUserRequest = requestFlag >= 0 ? String(process.argv[requestFlag + 1] || "") : "Décrivez la modification à appliquer à l’image ou à la zone sélectionnée.";
const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "codex-image-editor-widget-"));
const targetPath = path.join(workspaceRoot, path.basename(sourceImagePath) || "target.png");
copyFileSync(sourceImagePath, targetPath);

const child = spawn(process.execPath, [path.join(root, "mcp", "server.mjs")], {
  cwd: root,
  stdio: ["pipe", "pipe", "inherit"],
  windowsHide: true
});
const responses = new Map();
let stdoutBuffer = "";
let nextId = 1;

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;
  let newline;
  while ((newline = stdoutBuffer.indexOf("\n")) >= 0) {
    const line = stdoutBuffer.slice(0, newline).trim();
    stdoutBuffer = stdoutBuffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const pending = responses.get(message.id);
    if (!pending) continue;
    responses.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }
});

function send(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      responses.delete(id);
      reject(new Error(`MCP timeout: ${method}`));
    }, 10000);
    responses.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) })}\n`);
  });
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) })}\n`);
}

const initialized = (async () => {
  await send("initialize", { clientInfo: { name: "widget-host-harness", version: "0.2.0" } });
  notify("notifications/initialized");
  const listed = await send("tools/list");
  const renderTool = listed.tools.find((tool) => tool.name === "get_editor_state");
  if (!renderTool?._meta?.ui?.resourceUri) throw new Error("get_editor_state has no UI resource URI");
  return { widgetUri: renderTool._meta.ui.resourceUri };
})();

const diagnostics = {
  initialized: false,
  lastTool: "",
  lastMessage: "",
  messageCount: 0,
  displayMode: "inline",
  modelContextUpdates: 0
};

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error("request body too large"));
    });
    request.on("end", () => resolve(body ? JSON.parse(body) : {}));
    request.on("error", reject);
  });
}

function hostHtml() {
  const input = JSON.stringify({ workspaceRoot, sessionId: "browser-smoke", baseImagePath: targetPath, userRequest: initialUserRequest });
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Codex Image Editor host harness</title>
<style>body{margin:0;background:#e8eef7;color:#101828;font:14px system-ui}header{display:flex;gap:18px;align-items:center;padding:9px 14px;background:#fff;border-bottom:1px solid #cbd5e1}strong{font-size:15px}.metric{font-family:ui-monospace,monospace;font-size:12px}iframe{display:block;width:100%;height:calc(100vh - 47px);border:0}</style>
</head><body><header><strong>Codex host simulé</strong><span id="hostReady">initialisation…</span><span class="metric">outil: <b id="lastTool">—</b></span><span class="metric">messages: <b id="messageCount">0</b></span><span class="metric">mode: <b id="displayMode">inline</b></span></header>
<iframe id="widget" title="Codex Image Editor" src="/widget"></iframe>
<script>
const frame = document.getElementById('widget');
const initialToolInput = ${input};
function renderHost(data) {
  document.getElementById('hostReady').textContent = data.initialized ? 'MCP Apps connecté' : 'initialisation…';
  document.getElementById('lastTool').textContent = data.lastTool || '—';
  document.getElementById('messageCount').textContent = String(data.messageCount || 0);
  document.getElementById('displayMode').textContent = data.displayMode || 'inline';
}
async function diagnostics() {
  try {
    const data = await fetch('/diagnostics').then((r) => r.json());
    renderHost(data);
    return data;
  } catch {
    return null;
  }
}
function reply(target, id, result, error) { target.postMessage({ jsonrpc:'2.0', id, ...(error ? { error:{ code:-32000, message:error } } : { result }) }, '*'); }
window.addEventListener('message', async (event) => {
  const message = event.data;
  if (!message || message.jsonrpc !== '2.0' || message.id === undefined) return;
  try {
    let result = {};
    if (message.method === 'ui/initialize') {
      result = { protocolVersion:'2026-01-26', hostContext:{ theme:'light', displayMode:'inline' } };
      await fetch('/host-event', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ type:'initialized' }) });
    } else if (message.method === 'tools/call') {
      result = await fetch('/mcp-call', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(message.params) }).then((r) => r.json());
    } else if (message.method === 'ui/message') {
      result = await fetch('/host-event', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ type:'message', params:message.params }) }).then((r) => r.json());
    } else if (message.method === 'ui/update-model-context') {
      result = await fetch('/host-event', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ type:'model-context' }) }).then((r) => r.json());
    } else if (message.method === 'ui/request-display-mode') {
      result = await fetch('/host-event', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ type:'display-mode', mode:message.params?.mode }) }).then((r) => r.json());
    } else {
      throw new Error('Unsupported host method: ' + message.method);
    }
    reply(event.source, message.id, result);
    await diagnostics();
  } catch (error) { reply(event.source, message.id, null, error.message || String(error)); }
});
frame.addEventListener('load', async () => {
  const result = await fetch('/mcp-call', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ name:'get_editor_state', arguments:initialToolInput }) }).then((r) => r.json());
  frame.contentWindow.postMessage({ jsonrpc:'2.0', method:'ui/notifications/tool-result', params:result }, '*');
  frame.contentWindow.postMessage({ jsonrpc:'2.0', method:'ui/notifications/tool-input', params:{ arguments:initialToolInput } }, '*');
  await diagnostics();
});
setInterval(() => { void diagnostics(); }, 1000);
</script></body></html>`;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(hostHtml());
      return;
    }
    if (request.method === "GET" && url.pathname === "/favicon.ico") {
      response.writeHead(204, { "cache-control": "public, max-age=86400" });
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/widget") {
      const { widgetUri } = await initialized;
      const resource = await send("resources/read", { uri: widgetUri });
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(resource.contents[0].text);
      return;
    }
    if (request.method === "POST" && url.pathname === "/mcp-call") {
      const params = await readJson(request);
      diagnostics.lastTool = params.name || "";
      sendJson(response, 200, await send("tools/call", params));
      return;
    }
    if (request.method === "POST" && url.pathname === "/host-event") {
      const event = await readJson(request);
      if (event.type === "initialized") diagnostics.initialized = true;
      if (event.type === "message") {
        diagnostics.messageCount += 1;
        diagnostics.lastMessage = (event.params?.content || []).map((item) => item.text || "").join("\n");
      }
      if (event.type === "display-mode") diagnostics.displayMode = event.mode || "inline";
      if (event.type === "model-context") diagnostics.modelContextUpdates += 1;
      sendJson(response, 200, { accepted: true, displayMode: diagnostics.displayMode });
      return;
    }
    if (request.method === "GET" && url.pathname === "/diagnostics") {
      sendJson(response, 200, diagnostics);
      return;
    }
    response.writeHead(404).end("Not found");
  } catch (error) {
    sendJson(response, 500, { error: error?.message || String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`WIDGET_HARNESS_URL=http://127.0.0.1:${port}`);
  console.log(`WIDGET_HARNESS_WORKSPACE=${workspaceRoot}`);
});

function close() {
  server.close();
  child.kill();
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
process.on("exit", () => child.kill());
