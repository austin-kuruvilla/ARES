#!/usr/bin/env node

import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  applySimulatedAction,
  exportDecisionBundle,
  listScenarios,
  runDeterministicPipeline,
  validateDecisionBundle,
} from "../runtime/engine.mjs";

const SERVER_NAME = "arc-cyber-decision-engine";
const SERVER_VERSION = "0.1.0";
const FALLBACK_PROTOCOL_VERSION = "2024-11-05";

const tools = [
  {
    name: "arc_list_scenarios",
    title: "List ARES synthetic scenarios",
    description:
      "List ARES bundled synthetic cyber incident scenarios and deterministic counterfactual variants. Performs no network access.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "arc_run_deterministic_pipeline",
    title: "Run ARES deterministic pipeline",
    description:
      "Run ARES evidence fusion, ontology, graph, risk, confidence, and action ranking for one bundled synthetic scenario. All numeric outputs come from deterministic code.",
    inputSchema: {
      type: "object",
      properties: {
        scenario_id: {
          type: "string",
          minLength: 1,
          description: "Exact scenario ID returned by arc_list_scenarios.",
        },
        question: {
          type: "string",
          minLength: 1,
          description: "Optional user question recorded as intent context; it does not alter formulas.",
        },
        overrides: {
          type: "object",
          description: "Optional deterministic scenario overrides supported by the runtime.",
          additionalProperties: true,
        },
        prior_memory: {
          type: "array",
          maxItems: 20,
          description: "Optional prior synthetic outcome records to include in the receipt.",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      required: ["scenario_id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "arc_validate_bundle",
    title: "Validate an ARES DecisionBundle",
    description:
      "Validate an ARES DecisionBundle's contract fields, deterministic invariants, provenance labels, and citations without modifying the bundle.",
    inputSchema: {
      type: "object",
      properties: {
        bundle: {
          type: "object",
          description: "DecisionBundle returned by the ARES pipeline, optionally with validated hostAnalysis.",
          additionalProperties: true,
        },
      },
      required: ["bundle"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "arc_apply_simulated_action",
    title: "Apply an ARES simulated action",
    description:
      "Record an ARES SIMULATED action transition inside a DecisionBundle. Never contacts or changes a live security system.",
    inputSchema: {
      type: "object",
      properties: {
        bundle: {
          type: "object",
          description: "DecisionBundle containing the candidate action.",
          additionalProperties: true,
        },
        action_id: {
          type: "string",
          minLength: 1,
          description: "Exact candidate action ID from the bundle.",
        },
        approved_by: {
          type: "string",
          minLength: 1,
          description: "Optional synthetic approver label for the audit receipt.",
        },
        note: {
          type: "string",
          description: "Optional operator note recorded in the simulation receipt.",
        },
      },
      required: ["bundle", "action_id"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "arc_export_bundle",
    title: "Export an ARES DecisionBundle",
    description:
      "Serialize an ARES-validated DecisionBundle as canonical JSON and optionally write one file inside ARC_EXPORT_DIR (or ./arc-exports). Existing regular files are protected unless overwrite is true; symlinks are always rejected.",
    inputSchema: {
      type: "object",
      properties: {
        bundle: {
          type: "object",
          description: "DecisionBundle to validate and serialize.",
          additionalProperties: true,
        },
        path: {
          type: "string",
          minLength: 1,
          description:
            "Optional filename inside the configured export directory, or an absolute path whose parent is that directory. Subdirectories and traversal are rejected.",
        },
        overwrite: {
          type: "boolean",
          default: false,
          description: "Allow replacing an existing file only after explicit user approval.",
        },
      },
      required: ["bundle"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function normalizeToolResult(value, fallbackKey = "result") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return { [fallbackKey]: value };
}

function toolSuccess(value, fallbackKey) {
  const structuredContent = normalizeToolResult(value, fallbackKey);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

function toolFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `ARES tool error: ${message}` }],
    isError: true,
  };
}

function validationFailed(validation) {
  if (!validation || typeof validation !== "object") return false;
  return (
    validation.valid === false ||
    validation.ok === false ||
    validation.isValid === false
  );
}

function invalidPathError() {
  return new Error(
    "path must name a file directly inside ARC_EXPORT_DIR (or the default ./arc-exports directory).",
  );
}

async function exportDirectory() {
  const configured = process.env.ARC_EXPORT_DIR?.trim();
  const root = configured || path.join(process.cwd(), "arc-exports");
  if (!path.isAbsolute(root)) {
    throw new Error("ARC_EXPORT_DIR must be an absolute path when configured.");
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  return realpath(root);
}

async function resolveExportDestination(requestedPath) {
  if (requestedPath.includes("\0")) {
    throw new Error("path contains an invalid null byte.");
  }
  const root = await exportDirectory();
  let destination;
  if (path.isAbsolute(requestedPath)) {
    destination = path.normalize(requestedPath);
  } else {
    if (
      requestedPath === "." ||
      requestedPath === ".." ||
      path.basename(requestedPath) !== requestedPath
    ) {
      throw invalidPathError();
    }
    destination = path.join(root, requestedPath);
  }

  const realParent = await realpath(path.dirname(destination));
  if (realParent !== root || path.basename(destination) === "") {
    throw invalidPathError();
  }
  return path.join(root, path.basename(destination));
}

async function existingFileKind(destination) {
  try {
    const stats = await lstat(destination);
    if (stats.isSymbolicLink()) return "symlink";
    if (stats.isFile()) return "file";
    return "other";
  } catch (error) {
    if (error && error.code === "ENOENT") return "missing";
    throw error;
  }
}

async function writeProtectedExport(destination, contents, overwrite) {
  const noFollow = fsConstants.O_NOFOLLOW;
  if (typeof noFollow !== "number") {
    throw new Error("This platform cannot guarantee no-follow export writes.");
  }

  const kind = await existingFileKind(destination);
  if (kind === "symlink") {
    throw new Error("destination is a symbolic link; ARES never follows export symlinks.");
  }
  if (kind === "other") {
    throw new Error("destination exists and is not a regular file.");
  }
  if (!overwrite && kind === "file") {
    throw new Error(
      "destination already exists; obtain explicit user approval before setting overwrite to true.",
    );
  }

  if (!overwrite) {
    const handle = await open(
      destination,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        noFollow,
      0o600,
    );
    try {
      await handle.writeFile(contents, "utf8");
    } finally {
      await handle.close();
    }
    return;
  }

  // Write-then-rename replaces the directory entry itself. Even if an attacker
  // swaps the destination after lstat(), ARES cannot truncate a symlink target.
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${crypto.randomUUID()}.tmp`,
  );
  let renamed = false;
  try {
    const handle = await open(
      temporary,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        noFollow,
      0o600,
    );
    try {
      await handle.writeFile(contents, "utf8");
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
    renamed = true;
  } finally {
    if (!renamed) await unlink(temporary).catch(() => undefined);
  }
}

async function callArcTool(name, rawArguments) {
  const args = assertObject(rawArguments ?? {}, "arguments");

  switch (name) {
    case "arc_list_scenarios": {
      return toolSuccess({ scenarios: await listScenarios() });
    }

    case "arc_run_deterministic_pipeline": {
      const scenarioId = assertNonEmptyString(args.scenario_id, "scenario_id");
      const bundle = await runDeterministicPipeline({
        scenarioId,
        question: args.question,
        overrides: args.overrides,
        priorMemory: args.prior_memory,
      });
      return toolSuccess({ bundle });
    }

    case "arc_validate_bundle": {
      const bundle = assertObject(args.bundle, "bundle");
      const validation = await validateDecisionBundle(bundle);
      return toolSuccess({ validation });
    }

    case "arc_apply_simulated_action": {
      const bundle = assertObject(args.bundle, "bundle");
      const actionId = assertNonEmptyString(args.action_id, "action_id");
      const result = await applySimulatedAction({
        bundle,
        actionId,
        approvedBy: args.approved_by,
        note: args.note,
      });
      return toolSuccess({
        mode: "SIMULATED",
        liveSystemsChanged: false,
        result,
      });
    }

    case "arc_export_bundle": {
      const bundle = assertObject(args.bundle, "bundle");
      const validation = await validateDecisionBundle(bundle);
      if (validationFailed(validation)) {
        throw new Error("DecisionBundle validation failed; repair it before export.");
      }

      const canonical = await exportDecisionBundle(bundle);
      const json =
        typeof canonical === "string"
          ? canonical.endsWith("\n")
            ? canonical
            : `${canonical}\n`
          : `${JSON.stringify(canonical, null, 2)}\n`;

      if (args.path === undefined) {
        return toolSuccess({
          exported: false,
          mediaType: "application/json",
          validation,
          json,
        });
      }

      const requestedPath = assertNonEmptyString(args.path, "path");
      const destination = await resolveExportDestination(requestedPath);
      const overwrite = args.overwrite === true;
      await writeProtectedExport(destination, json, overwrite);

      return toolSuccess({
        exported: true,
        path: destination,
        bytes: Buffer.byteLength(json, "utf8"),
        mediaType: "application/json",
        validation,
      });
    }

    default:
      throw new Error(`Unknown ARES tool: ${name}`);
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  send({ jsonrpc: "2.0", id: id ?? null, error });
}

async function handleRequest(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    sendError(null, -32600, "Invalid Request");
    return;
  }

  const { id, method, params } = message;
  const isNotification = id === undefined;

  try {
    switch (method) {
      case "initialize": {
        if (isNotification) return;
        const protocolVersion =
          typeof params?.protocolVersion === "string"
            ? params.protocolVersion
            : FALLBACK_PROTOCOL_VERSION;
        sendResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions:
            "ARES uses synthetic evidence, deterministic computation, and simulated actions only. Host-model reasoning must cite returned IDs and must not invent numeric facts.",
        });
        return;
      }

      case "notifications/initialized":
      case "notifications/cancelled":
        return;

      case "ping":
        if (!isNotification) sendResult(id, {});
        return;

      case "tools/list":
        if (!isNotification) sendResult(id, { tools });
        return;

      case "tools/call": {
        if (isNotification) return;
        const toolName = assertNonEmptyString(params?.name, "tool name");
        try {
          const result = await callArcTool(toolName, params?.arguments ?? {});
          sendResult(id, result);
        } catch (error) {
          process.stderr.write(
            `[${SERVER_NAME}] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
          );
          sendResult(id, toolFailure(error));
        }
        return;
      }

      default:
        if (!isNotification) sendError(id, -32601, "Method not found", { method });
    }
  } catch (error) {
    process.stderr.write(
      `[${SERVER_NAME}] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    if (!isNotification) {
      sendError(
        id,
        -32603,
        "Internal error",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false,
});

input.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    sendError(null, -32700, "Parse error");
    return;
  }

  if (Array.isArray(message)) {
    for (const item of message) void handleRequest(item);
  } else {
    void handleRequest(message);
  }
});

input.on("close", () => {
  process.exitCode = 0;
});
