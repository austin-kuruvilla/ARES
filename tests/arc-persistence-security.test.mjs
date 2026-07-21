import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (file) => readFile(new URL(file, root), "utf8");

test("every mutating ARES route requires the server-side ChatGPT user", async () => {
  const routes = await Promise.all(
    ["run", "actions", "memory"].map((name) =>
      source(`app/api/arc/${name}/route.ts`),
    ),
  );
  for (const route of routes) {
    assert.match(route, /requireChatGPTApiUser\(\)/);
  }
  const auth = await source("app/chatgpt-auth.ts");
  assert.match(auth, /oai-authenticated-user-email/);
  assert.match(auth, /ChatGPTApiAuthenticationError/);
});

test("action persistence uses one run winner, leases, revisions, and durable keys", async () => {
  const persistence = await source("lib/arc-memory.ts");
  const schema = await source("db/schema.ts");
  const migration = await source("drizzle/0001_spotty_songbird.sql");

  assert.match(schema, /arc_action_attempts/);
  assert.match(schema, /selected_action_id/);
  assert.match(schema, /selected_idempotency_key/);
  assert.match(schema, /action_lease_expires_at/);
  assert.match(schema, /revision/);
  assert.match(migration, /CREATE TABLE `arc_action_attempts`/);
  assert.match(migration, /ALTER TABLE `arc_runs` ADD `revision`/);
  assert.match(migration, /SET `action_state` = 'applied'/);
  assert.match(migration, /INSERT INTO `arc_action_attempts`/);

  assert.match(persistence, /ARC_ACTION_LEASE_MS = 30_000/);
  assert.match(persistence, /UPDATE arc_runs[\s\S]*action_state = 'applying'/);
  assert.match(persistence, /selected_action_id = \?/);
  assert.match(persistence, /selected_idempotency_key = \?/);
  assert.match(persistence, /action_lease_expires_at <= \?/);
  assert.match(persistence, /AND revision = \?/);
  assert.match(persistence, /RETURNING run_id/);
  assert.match(persistence, /ON CONFLICT\(idempotency_key\) DO NOTHING/);
});

test("D1 memory tag filters execute in SQL instead of a bounded recent scan", async () => {
  const persistence = await source("lib/arc-memory.ts");
  assert.match(persistence, /json_each\(arc_memory\.tags_json\)/);
  assert.doesNotMatch(persistence, /scanLimit/);
});

test("fallback persistence enforces one winner and replays the winning key", async () => {
  const persistence = await import(
    `../lib/arc-memory.ts?fallback-test=${Date.now()}`
  );
  const runId = `RUN-TEST-${crypto.randomUUID()}`;
  const baseInput = {
    runId,
    scenarioId: "oauth-phishing",
    question: "Which synthetic action should be simulated?",
    tags: ["identity"],
    bundle: { run: { id: runId }, state: "pending" },
    actions: [
      { actionId: "action-a", action: { id: "action-a" } },
      { actionId: "action-b", action: { id: "action-b" } },
    ],
    summary: "Synthetic test decision",
    actor: "tester@example.com",
  };

  const creations = await Promise.all([
    persistence.persistArcRun(baseInput),
    persistence.persistArcRun(baseInput),
  ]);
  assert.deepEqual(
    creations.map((item) => item.created).sort(),
    [false, true],
  );
  const pendingRun = await persistence.loadArcRun(runId);
  assert.equal(pendingRun.actionState, "ready");

  const requests = [
    { actionId: "action-a", idempotencyKey: `key-a-${crypto.randomUUID()}` },
    { actionId: "action-b", idempotencyKey: `key-b-${crypto.randomUUID()}` },
  ];
  const claims = await Promise.allSettled(
    requests.map((request) =>
      persistence.claimArcAction({ runId, ...request }),
    ),
  );
  assert.equal(claims.filter((claim) => claim.status === "fulfilled").length, 1);
  assert.equal(claims.filter((claim) => claim.status === "rejected").length, 1);

  const winnerIndex = claims.findIndex((claim) => claim.status === "fulfilled");
  const winnerRequest = requests[winnerIndex];
  const winnerClaim = claims[winnerIndex].value;
  const completed = await persistence.completeArcAction({
    run: pendingRun,
    action: winnerClaim.action,
    idempotencyKey: winnerRequest.idempotencyKey,
    revision: winnerClaim.revision,
    result: { synthetic: true, status: "simulated" },
    updatedBundle: {
      run: { id: runId },
      state: "simulated",
      selectedActionId: winnerRequest.actionId,
    },
    summary: "Synthetic action simulated",
    actor: "tester@example.com",
  });
  assert.equal(completed.action.status, "applied");

  const replay = await persistence.claimArcAction({
    runId,
    ...winnerRequest,
  });
  assert.equal(replay.replay, true);
  assert.equal(replay.action.status, "applied");

  const loserRequest = requests[1 - winnerIndex];
  await assert.rejects(
    persistence.claimArcAction({ runId, ...loserRequest }),
    /action_selection_conflict/,
  );
  await assert.rejects(
    persistence.claimArcAction({
      runId,
      actionId: loserRequest.actionId,
      idempotencyKey: winnerRequest.idempotencyKey,
    }),
    /idempotency_key_conflict/,
  );
});
