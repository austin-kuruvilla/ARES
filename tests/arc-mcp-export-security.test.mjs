import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runArcScenario } from "../plugins/arc-cyber-decision-engine/runtime/engine.mjs";

const projectRoot = new URL("../", import.meta.url);
const serverPath = new URL(
  "../plugins/arc-cyber-decision-engine/scripts/mcp-server.mjs",
  import.meta.url,
);

function startServer(exportDirectory) {
  const child = spawn(process.execPath, [fileURLToPath(serverPath)], {
    cwd: fileURLToPath(projectRoot),
    env: { ...process.env, ARC_EXPORT_DIR: exportDirectory },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let nextId = 1;
  let stdout = "";
  let stderr = "";
  const pending = new Map();

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    for (;;) {
      const newline = stdout.indexOf("\n");
      if (newline < 0) break;
      const line = stdout.slice(0, newline);
      stdout = stdout.slice(newline + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter.resolve(message);
      }
    }
  });
  child.on("exit", (code) => {
    for (const waiter of pending.values()) {
      waiter.reject(
        new Error(`MCP server exited with ${code}: ${stderr || "no stderr"}`),
      );
    }
    pending.clear();
  });

  function request(method, params) {
    const id = nextId++;
    const response = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return response;
  }

  return {
    request,
    async close() {
      child.stdin.end();
      if (child.exitCode === null) {
        await new Promise((resolve) => child.once("exit", resolve));
      }
    },
  };
}

test("MCP export confines writes and never follows overwrite symlinks", async (t) => {
  const sandbox = await mkdtemp(path.join(tmpdir(), "arc-export-test-"));
  const exportDirectory = path.join(sandbox, "exports");
  const outside = path.join(sandbox, "outside.json");
  await mkdir(exportDirectory);
  await writeFile(outside, "KEEP", "utf8");
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const server = startServer(exportDirectory);
  t.after(() => server.close());
  const bundle = runArcScenario({ scenarioId: "oauth-phishing" });
  const invoke = async (arguments_) => {
    const response = await server.request("tools/call", {
      name: "arc_export_bundle",
      arguments: { bundle, ...arguments_ },
    });
    assert.equal(response.error, undefined);
    return response.result;
  };

  const listed = await server.request("tools/list", {});
  const exportTool = listed.result.tools.find(
    (tool) => tool.name === "arc_export_bundle",
  );
  assert.equal(exportTool.annotations.destructiveHint, true);

  assert.equal((await invoke({ path: outside })).isError, true);
  assert.equal((await invoke({ path: "../escape.json" })).isError, true);

  const first = await invoke({ path: "decision.json" });
  assert.equal(first.isError, undefined);
  assert.equal(first.structuredContent.exported, true);
  assert.equal(
    first.structuredContent.path,
    path.join(await realpath(exportDirectory), "decision.json"),
  );
  assert.equal(
    JSON.parse(await readFile(path.join(exportDirectory, "decision.json"), "utf8"))
      .run.id,
    bundle.run.id,
  );

  assert.equal((await invoke({ path: "decision.json" })).isError, true);
  assert.equal(
    (await invoke({ path: "decision.json", overwrite: true })).isError,
    undefined,
  );

  const link = path.join(exportDirectory, "linked.json");
  await symlink(outside, link);
  const linked = await invoke({ path: link, overwrite: true });
  assert.equal(linked.isError, true);
  assert.match(linked.content[0].text, /symbolic link/i);
  assert.equal(await readFile(outside, "utf8"), "KEEP");
});
