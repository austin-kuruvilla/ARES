#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(scriptDir, "mcp-server.mjs");
const pluginRoot = path.dirname(scriptDir);
const exportRoot = await mkdtemp(path.join(os.tmpdir(), "arc-mcp-smoke-"));
const child = spawn(process.execPath, [serverPath], {
  cwd: pluginRoot,
  env: { ...process.env, ARC_EXPORT_DIR: exportRoot },
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
let stdoutBuffer = "";
let sequence = 0;
const pending = new Map();

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

function fail(error) {
  child.kill();
  const detail = stderr.trim() ? `\nServer stderr:\n${stderr.trim()}` : "";
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}${detail}\n`);
  process.exitCode = 1;
}

function receive(line) {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    fail(new Error(`Server emitted invalid JSON: ${line}`, { cause: error }));
    return;
  }
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
  else waiter.resolve(message.result);
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;
  for (;;) {
    const newline = stdoutBuffer.indexOf("\n");
    if (newline < 0) break;
    const line = stdoutBuffer.slice(0, newline);
    stdoutBuffer = stdoutBuffer.slice(newline + 1);
    receive(line);
  }
});

function request(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, 5_000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseToolText(result) {
  assert(result?.isError !== true, result?.content?.[0]?.text ?? "Tool returned an error");
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}

try {
  const initialized = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "arc-smoke-test", version: "0.1.0" },
  });
  assert(initialized.serverInfo?.name === "arc-cyber-decision-engine", "initialize failed");

  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
  );

  const listedTools = await request("tools/list");
  assert(listedTools.tools?.length === 5, "expected exactly five ARES tools");

  const scenarioResult = parseToolText(
    await request("tools/call", { name: "arc_list_scenarios", arguments: {} }),
  );
  assert(Array.isArray(scenarioResult.scenarios), "scenario list is not an array");
  assert(scenarioResult.scenarios.length > 0, "no bundled scenarios found");

  const scenario = scenarioResult.scenarios[0];
  const scenarioId = scenario.id ?? scenario.scenarioId ?? scenario.scenario_id;
  assert(typeof scenarioId === "string", "scenario record has no ID");

  const runResult = parseToolText(
    await request("tools/call", {
      name: "arc_run_deterministic_pipeline",
      arguments: { scenario_id: scenarioId },
    }),
  );
  assert(runResult.bundle && typeof runResult.bundle === "object", "pipeline returned no bundle");

  const validationResult = parseToolText(
    await request("tools/call", {
      name: "arc_validate_bundle",
      arguments: { bundle: runResult.bundle },
    }),
  );
  const validation = validationResult.validation;
  assert(validation && typeof validation === "object", "validator returned no result");
  assert(
    validation.valid !== false && validation.ok !== false && validation.isValid !== false,
    `fresh bundle failed validation: ${JSON.stringify(validation)}`,
  );

  const hostBundle = structuredClone(runResult.bundle);
  hostBundle.hostAnalysis = {
    model: "GPT-5.6",
    surface: "Codex host",
    generatedAt: hostBundle.scenario.asOf,
    specialists: hostBundle.agents.map((agent) => ({
      agentId: agent.id,
      disposition:
        agent.vote.actionId === hostBundle.recommendation.id ? "support" : "challenge",
      claims: [
        {
          text: agent.assessment.headline,
          evidenceIds: agent.assessment.evidenceIds,
        },
      ],
      actionId: agent.vote.actionId,
      assumptions: [],
      missingEvidence: ["Live-system verification is outside this synthetic demo."],
      confidenceLabel: "high",
    })),
    debate: {
      summary: hostBundle.debate.consensus.rule,
      dissent: hostBundle.debate.conflict ? [hostBundle.debate.conflict.summary] : [],
      evidenceIds: hostBundle.debate.consensus.evidenceIds,
    },
    audienceSummaries: Object.fromEntries(
      Object.entries(hostBundle.projections).map(([audience, projection]) => [
        audience,
        { summary: projection.summary, evidenceIds: projection.evidenceIds },
      ]),
    ),
  };

  const hostValidationResult = parseToolText(
    await request("tools/call", {
      name: "arc_validate_bundle",
      arguments: { bundle: hostBundle },
    }),
  );
  assert(
    hostValidationResult.validation.valid === true,
    `valid hostAnalysis was rejected: ${JSON.stringify(hostValidationResult.validation)}`,
  );

  const invalidHostBundle = structuredClone(hostBundle);
  invalidHostBundle.hostAnalysis.modelScore = 99;
  const invalidHostResult = parseToolText(
    await request("tools/call", {
      name: "arc_validate_bundle",
      arguments: { bundle: invalidHostBundle },
    }),
  );
  assert(
    invalidHostResult.validation.valid === false &&
      invalidHostResult.validation.errors.some((error) => error.includes("numeric values")),
    "validator accepted a model-generated numeric value",
  );

  const actionId = runResult.bundle.recommendation?.id;
  assert(typeof actionId === "string", "bundle has no recommended action ID");
  const simulationResult = parseToolText(
    await request("tools/call", {
      name: "arc_apply_simulated_action",
      arguments: {
        bundle: runResult.bundle,
        action_id: actionId,
        approved_by: "ARES smoke test",
      },
    }),
  );
  assert(simulationResult.mode === "SIMULATED", "action result was not marked simulated");
  assert(simulationResult.liveSystemsChanged === false, "action claimed a live-system change");
  assert(
    simulationResult.result?.approval?.state === "approved-and-simulated",
    "approval audit state was not updated",
  );

  const exportResult = parseToolText(
    await request("tools/call", {
      name: "arc_export_bundle",
      arguments: { bundle: hostBundle },
    }),
  );
  assert(exportResult.exported === false, "export without path wrote a file");
  assert(typeof exportResult.json === "string", "export returned no canonical JSON");

  try {
    const destination = path.join(exportRoot, "decision-bundle.json");
    const fileExport = parseToolText(
      await request("tools/call", {
        name: "arc_export_bundle",
        arguments: { bundle: hostBundle, path: destination },
      }),
    );
    assert(fileExport.exported === true, "path export did not report success");
    const savedBundle = JSON.parse(await readFile(destination, "utf8"));
    assert(savedBundle.run?.id === hostBundle.run?.id, "saved bundle does not match the run");
    assert(savedBundle.hostAnalysis?.specialists?.length === 8, "saved bundle lost hostAnalysis");

    const protectedOverwrite = await request("tools/call", {
      name: "arc_export_bundle",
      arguments: { bundle: hostBundle, path: destination },
    });
    assert(protectedOverwrite.isError === true, "existing file was overwritten without approval");
  } finally {
    await rm(exportRoot, { recursive: true, force: true });
  }

  process.stdout.write(
    `ARES MCP smoke test passed: ${listedTools.tools.length} tools, ${scenarioResult.scenarios.length} scenarios, eight-specialist hostAnalysis validated, action simulated.\n`,
  );
  child.stdin.end();
} catch (error) {
  fail(error);
}
