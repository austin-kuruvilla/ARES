import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("ARES defaults to the DB binding without publishing deployment metadata", async () => {
  const viteConfig = await source("vite.config.ts");
  assert.match(viteConfig, /ARES_D1_BINDING \?\? "DB"/);
  assert.match(viteConfig, /ARES_R2_BINDING/);
  assert.doesNotMatch(viteConfig, /hosting\.json/);
});

test("ARES API exposes the scenario, run, action, and memory contracts", async () => {
  const [scenarios, run, actions, memory] = await Promise.all([
    source("app/api/arc/scenarios/route.ts"),
    source("app/api/arc/run/route.ts"),
    source("app/api/arc/actions/route.ts"),
    source("app/api/arc/memory/route.ts"),
  ]);

  assert.match(scenarios, /export async function GET/);
  assert.match(run, /export async function POST/);
  assert.match(run, /assertValidDecisionBundle\(generated/);
  assert.match(actions, /claimArcAction/);
  assert.match(actions, /idempotencyKey/);
  assert.match(actions, /applySimulatedAction/);
  assert.match(memory, /export async function GET/);
  assert.match(memory, /export async function POST/);
  assert.match(run, /requireChatGPTApiUser/);
  assert.match(actions, /requireChatGPTApiUser/);
  assert.match(memory, /requireChatGPTApiUser/);
});

test("ARES persistence uses prepared D1 statements and no browser storage", async () => {
  const persistence = await source("lib/arc-memory.ts");
  assert.match(persistence, /db\.prepare\(/);
  assert.match(persistence, /db\.batch\(/);
  assert.doesNotMatch(persistence, /\.exec\(/);
  assert.doesNotMatch(persistence, /localStorage|sessionStorage/);
  assert.match(persistence, /non-durable and reset when the worker restarts/);
  assert.match(persistence, /action\.simulated/);
  assert.match(persistence, /decision\.created/);
  assert.match(persistence, /json_each\(arc_memory\.tags_json\)/);
});
