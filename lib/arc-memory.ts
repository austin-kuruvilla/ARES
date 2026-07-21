const runtimeEnv = await import("cloudflare:workers")
  .then((module) => module.env as unknown as { DB?: D1Database })
  .catch(() => ({} as { DB?: D1Database }));

export type JsonObject = Record<string, unknown>;

export type ArcPersistenceInfo = {
  mode: "d1" | "memory";
  durable: boolean;
  label: string;
};

export type ArcMemoryItem = {
  memoryId: string;
  runId: string | null;
  scenarioId: string;
  kind: string;
  summary: string;
  tags: string[];
  payload: JsonObject;
  createdAt: string;
};

export type StoredArcRun = {
  runId: string;
  scenarioId: string;
  question: string;
  status: string;
  tags: string[];
  bundle: JsonObject;
  actionState: "ready" | "applying" | "applied";
  selectedActionId: string | null;
  selectedIdempotencyKey: string | null;
  actionLeaseExpiresAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredArcAction = {
  runId: string;
  actionId: string;
  status: "pending" | "applying" | "applied";
  action: JsonObject;
  result: JsonObject | null;
  idempotencyKey: string | null;
  createdAt: string;
  appliedAt: string | null;
};

type RunRow = {
  run_id: string;
  scenario_id: string;
  question: string;
  status: string;
  tags_json: string;
  bundle_json: string;
  action_state: "ready" | "applying" | "applied";
  selected_action_id: string | null;
  selected_idempotency_key: string | null;
  action_lease_expires_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

type AttemptRow = {
  idempotency_key: string;
  run_id: string;
  action_id: string;
  status: "applying" | "applied" | "expired";
  lease_expires_at: string;
  result_json: string | null;
  created_at: string;
  updated_at: string;
};

type ActionRow = {
  run_id: string;
  action_id: string;
  status: "pending" | "applying" | "applied";
  action_json: string;
  result_json: string | null;
  idempotency_key: string | null;
  created_at: string;
  applied_at: string | null;
};

type MemoryRow = {
  memory_id: string;
  run_id: string | null;
  scenario_id: string;
  kind: string;
  summary: string;
  tags_json: string;
  payload_json: string;
  created_at: string;
};

type FallbackState = {
  runs: Map<string, StoredArcRun>;
  actions: Map<string, StoredArcAction>;
  attempts: Map<string, AttemptRow>;
  memory: ArcMemoryItem[];
  audit: JsonObject[];
};

const fallbackState: FallbackState = {
  runs: new Map(),
  actions: new Map(),
  attempts: new Map(),
  memory: [],
  audit: [],
};

const D1_PERSISTENCE: ArcPersistenceInfo = {
  mode: "d1",
  durable: true,
  label: "Durable ARES decision memory (Cloudflare D1)",
};

const FALLBACK_PERSISTENCE: ArcPersistenceInfo = {
  mode: "memory",
  durable: false,
  label: "Local demo memory — non-durable and reset when the worker restarts",
};

// Long enough for the deterministic reducer, short enough that a crashed
// worker cannot strand a run. A retry with the same key renews this lease.
export const ARC_ACTION_LEASE_MS = 30_000;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS arc_runs (
    run_id TEXT PRIMARY KEY NOT NULL,
    scenario_id TEXT NOT NULL,
    question TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ready',
    tags_json TEXT NOT NULL DEFAULT '[]',
    bundle_json TEXT NOT NULL,
    action_state TEXT NOT NULL DEFAULT 'ready',
    selected_action_id TEXT,
    selected_idempotency_key TEXT,
    action_lease_expires_at TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS arc_runs_scenario_created_idx ON arc_runs (scenario_id, created_at)",
  "CREATE INDEX IF NOT EXISTS arc_runs_status_idx ON arc_runs (status)",
  `CREATE TABLE IF NOT EXISTS arc_action_attempts (
    idempotency_key TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL REFERENCES arc_runs(run_id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'applying',
    lease_expires_at TEXT NOT NULL,
    result_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS arc_action_attempts_run_status_idx ON arc_action_attempts (run_id, status)",
  "CREATE INDEX IF NOT EXISTS arc_action_attempts_lease_idx ON arc_action_attempts (lease_expires_at)",
  `CREATE TABLE IF NOT EXISTS arc_actions (
    run_id TEXT NOT NULL REFERENCES arc_runs(run_id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    action_json TEXT NOT NULL,
    result_json TEXT,
    idempotency_key TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_at TEXT
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS arc_actions_run_action_uidx ON arc_actions (run_id, action_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS arc_actions_idempotency_uidx ON arc_actions (idempotency_key)",
  "CREATE INDEX IF NOT EXISTS arc_actions_run_status_idx ON arc_actions (run_id, status)",
  `CREATE TABLE IF NOT EXISTS arc_memory (
    memory_id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT REFERENCES arc_runs(run_id) ON DELETE SET NULL,
    scenario_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS arc_memory_scenario_created_idx ON arc_memory (scenario_id, created_at)",
  "CREATE INDEX IF NOT EXISTS arc_memory_run_idx ON arc_memory (run_id)",
  "CREATE INDEX IF NOT EXISTS arc_memory_kind_idx ON arc_memory (kind)",
  `CREATE TABLE IF NOT EXISTS arc_audit_events (
    event_id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'arc-demo',
    idempotency_key TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS arc_audit_events_idempotency_uidx ON arc_audit_events (idempotency_key)",
  "CREATE INDEX IF NOT EXISTS arc_audit_events_run_created_idx ON arc_audit_events (run_id, created_at)",
  "CREATE INDEX IF NOT EXISTS arc_audit_events_type_idx ON arc_audit_events (event_type)",
] as const;

let initializedBinding: D1Database | undefined;
let initialization: Promise<void> | undefined;

function d1Binding(): D1Database | undefined {
  return runtimeEnv.DB;
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseJsonObject(value: string | null): JsonObject {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : {};
  } catch {
    return {};
  }
}

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizedTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

function runFromRow(row: RunRow): StoredArcRun {
  return {
    runId: row.run_id,
    scenarioId: row.scenario_id,
    question: row.question,
    status: row.status,
    tags: parseTags(row.tags_json),
    bundle: parseJsonObject(row.bundle_json),
    actionState: row.action_state ?? "ready",
    selectedActionId: row.selected_action_id ?? null,
    selectedIdempotencyKey: row.selected_idempotency_key ?? null,
    actionLeaseExpiresAt: row.action_lease_expires_at ?? null,
    revision: Number.isInteger(row.revision) ? row.revision : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function attemptFromRow(row: AttemptRow): AttemptRow {
  return {
    ...row,
    result_json: row.result_json ?? null,
  };
}

function actionFromRow(row: ActionRow): StoredArcAction {
  return {
    runId: row.run_id,
    actionId: row.action_id,
    status: row.status,
    action: parseJsonObject(row.action_json),
    result: row.result_json ? parseJsonObject(row.result_json) : null,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
  };
}

function memoryFromRow(row: MemoryRow): ArcMemoryItem {
  return {
    memoryId: row.memory_id,
    runId: row.run_id,
    scenarioId: row.scenario_id,
    kind: row.kind,
    summary: row.summary,
    tags: parseTags(row.tags_json),
    payload: parseJsonObject(row.payload_json),
    createdAt: row.created_at,
  };
}

function fallbackActionKey(runId: string, actionId: string) {
  return `${runId}\u0000${actionId}`;
}

export function arcPersistenceInfo(): ArcPersistenceInfo {
  return d1Binding() ? D1_PERSISTENCE : FALLBACK_PERSISTENCE;
}

/** Creates every table/index lazily, with one SQL statement per prepare(). */
export async function ensureArcSchema(): Promise<D1Database | undefined> {
  const db = d1Binding();
  if (!db) return undefined;
  if (initializedBinding === db && initialization) {
    await initialization;
    return db;
  }

  initializedBinding = db;
  initialization = db.batch(schemaStatements.map((statement) => db.prepare(statement))).then(() => undefined);
  await initialization;
  return db;
}

export async function listArcMemory(filters: {
  scenarioId?: string;
  tags?: string[];
  limit?: number;
} = {}): Promise<{ items: ArcMemoryItem[]; persistence: ArcPersistenceInfo }> {
  const wantedTags = normalizedTags(filters.tags ?? []);
  const limit = Math.max(1, Math.min(filters.limit ?? 20, 50));
  const db = await ensureArcSchema();

  if (!db) {
    const items = fallbackState.memory
      .filter((item) => !filters.scenarioId || item.scenarioId === filters.scenarioId)
      .filter((item) => wantedTags.every((tag) => item.tags.includes(tag)))
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
    return { items, persistence: FALLBACK_PERSISTENCE };
  }

  const tagPredicates = wantedTags.map(
    () =>
      "EXISTS (SELECT 1 FROM json_each(arc_memory.tags_json) AS arc_tag WHERE arc_tag.value = ?)",
  );
  const result = await db
    .prepare(
      `SELECT memory_id, run_id, scenario_id, kind, summary, tags_json, payload_json, created_at
       FROM arc_memory
       WHERE (? IS NULL OR scenario_id = ?)
       ${tagPredicates.length ? `AND ${tagPredicates.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(
      filters.scenarioId ?? null,
      filters.scenarioId ?? null,
      ...wantedTags,
      limit,
    )
    .all<MemoryRow>();

  const items = (result.results ?? []).map(memoryFromRow);
  return { items, persistence: D1_PERSISTENCE };
}

export async function loadArcRun(runId: string): Promise<StoredArcRun | null> {
  const db = await ensureArcSchema();
  if (!db) return fallbackState.runs.get(runId) ?? null;
  const row = await db
    .prepare(
      `SELECT run_id, scenario_id, question, status, tags_json, bundle_json,
              action_state, selected_action_id, selected_idempotency_key,
              action_lease_expires_at, revision, created_at, updated_at
       FROM arc_runs WHERE run_id = ? LIMIT 1`,
    )
    .bind(runId)
    .first<RunRow>();
  return row ? runFromRow(row) : null;
}

export async function loadArcAction(runId: string, actionId: string): Promise<StoredArcAction | null> {
  const db = await ensureArcSchema();
  if (!db) return fallbackState.actions.get(fallbackActionKey(runId, actionId)) ?? null;
  const row = await db
    .prepare(
      `SELECT run_id, action_id, status, action_json, result_json, idempotency_key, created_at, applied_at
       FROM arc_actions WHERE run_id = ? AND action_id = ? LIMIT 1`,
    )
    .bind(runId, actionId)
    .first<ActionRow>();
  return row ? actionFromRow(row) : null;
}

export async function findArcActionByIdempotencyKey(idempotencyKey: string): Promise<StoredArcAction | null> {
  const db = await ensureArcSchema();
  if (!db) {
    return (
      [...fallbackState.actions.values()].find(
        (action) => action.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }
  const row = await db
    .prepare(
      `SELECT run_id, action_id, status, action_json, result_json, idempotency_key, created_at, applied_at
       FROM arc_actions WHERE idempotency_key = ? LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<ActionRow>();
  return row ? actionFromRow(row) : null;
}

async function loadArcActionAttempt(idempotencyKey: string): Promise<AttemptRow | null> {
  const db = await ensureArcSchema();
  if (!db) return fallbackState.attempts.get(idempotencyKey) ?? null;
  const row = await db
    .prepare(
      `SELECT idempotency_key, run_id, action_id, status, lease_expires_at,
              result_json, created_at, updated_at
       FROM arc_action_attempts WHERE idempotency_key = ? LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<AttemptRow>();
  return row ? attemptFromRow(row) : null;
}

export async function persistArcRun(input: {
  runId: string;
  scenarioId: string;
  question: string;
  tags: string[];
  bundle: JsonObject;
  actions: Array<{ actionId: string; action: JsonObject }>;
  summary: string;
  actor: string;
}): Promise<{ persistence: ArcPersistenceInfo; bundle: JsonObject; created: boolean }> {
  const db = await ensureArcSchema();
  const createdAt = nowIso();
  const tags = normalizedTags(input.tags);
  const run: StoredArcRun = {
    runId: input.runId,
    scenarioId: input.scenarioId,
    question: input.question,
    status: "ready",
    tags,
    bundle: input.bundle,
    actionState: "ready",
    selectedActionId: null,
    selectedIdempotencyKey: null,
    actionLeaseExpiresAt: null,
    revision: 0,
    createdAt,
    updatedAt: createdAt,
  };
  const memory: ArcMemoryItem = {
    memoryId: `mem_decision_${input.runId}`,
    runId: input.runId,
    scenarioId: input.scenarioId,
    kind: "decision",
    summary: input.summary,
    tags,
    payload: { runId: input.runId, synthetic: true },
    createdAt,
  };

  if (!db) {
    // Re-read immediately before the synchronous mutation. This closes the
    // Promise scheduling window between two concurrent fallback requests.
    const existing = fallbackState.runs.get(input.runId) ?? null;
    if (
      existing &&
      (existing.scenarioId !== input.scenarioId || existing.question !== input.question)
    ) {
      throw new Error("run_id_conflict");
    }
    const storedRun = existing ?? run;
    fallbackState.runs.set(input.runId, storedRun);
    for (const item of input.actions) {
      const key = fallbackActionKey(input.runId, item.actionId);
      const storedAction = fallbackState.actions.get(key);
      if (!storedAction) {
        fallbackState.actions.set(key, {
          runId: input.runId,
          actionId: item.actionId,
          status: "pending",
          action: item.action,
          result: null,
          idempotencyKey: null,
          createdAt,
          appliedAt: null,
        });
      } else if (storedAction.status === "pending") {
        fallbackState.actions.set(key, { ...storedAction, action: item.action });
      }
    }
    if (!existing) {
      fallbackState.memory.push(memory);
      fallbackState.audit.push({
        eventId: `evt_decision_${input.runId}`,
        runId: input.runId,
        eventType: "decision.created",
        idempotencyKey: `decision:${input.runId}`,
        actor: input.actor,
        synthetic: true,
        createdAt,
      });
    }
    return {
      persistence: FALLBACK_PERSISTENCE,
      bundle: storedRun.bundle,
      created: !existing,
    };
  }

  // RETURNING is the source of truth for HTTP 201. A pre-read can race when
  // two workers materialize the same deterministic run concurrently.
  const inserted = await db
    .prepare(
      `INSERT INTO arc_runs
       (run_id, scenario_id, question, status, tags_json, bundle_json,
        action_state, revision, created_at, updated_at)
       VALUES (?, ?, ?, 'ready', ?, ?, 'ready', 0, ?, ?)
       ON CONFLICT(run_id) DO NOTHING
       RETURNING run_id`,
    )
    .bind(
      input.runId,
      input.scenarioId,
      input.question,
      JSON.stringify(tags),
      JSON.stringify(input.bundle),
      createdAt,
      createdAt,
    )
    .first<{ run_id: string }>();

  const storedBeforeChildren = await loadArcRun(input.runId);
  if (!storedBeforeChildren) throw new Error("run_persistence_failed");
  if (
    storedBeforeChildren.scenarioId !== input.scenarioId ||
    storedBeforeChildren.question !== input.question
  ) {
    throw new Error("run_id_conflict");
  }

  const statements: D1PreparedStatement[] = [
    ...input.actions.map((item) =>
      db
        .prepare(
          `INSERT INTO arc_actions
           (run_id, action_id, status, action_json, created_at)
           SELECT ?, ?, 'pending', ?, ?
           WHERE EXISTS (
             SELECT 1 FROM arc_runs
             WHERE run_id = ? AND scenario_id = ? AND question = ?
               AND action_state = 'ready'
           )
           ON CONFLICT(run_id, action_id) DO UPDATE SET
             action_json = excluded.action_json
           WHERE arc_actions.status = 'pending'
             AND EXISTS (
               SELECT 1 FROM arc_runs
               WHERE run_id = ? AND action_state = 'ready'
             )`,
        )
        .bind(
          input.runId,
          item.actionId,
          JSON.stringify(item.action),
          createdAt,
          input.runId,
          input.scenarioId,
          input.question,
          input.runId,
        ),
    ),
    db
      .prepare(
         `INSERT INTO arc_memory
         (memory_id, run_id, scenario_id, kind, summary, tags_json, payload_json, created_at)
         SELECT ?, ?, ?, 'decision', ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM arc_runs
           WHERE run_id = ? AND scenario_id = ? AND question = ?
         )
         ON CONFLICT(memory_id) DO NOTHING`,
      )
      .bind(
        memory.memoryId,
        input.runId,
        input.scenarioId,
        input.summary,
        JSON.stringify(tags),
        JSON.stringify(memory.payload),
        createdAt,
        input.runId,
        input.scenarioId,
        input.question,
      ),
    db
      .prepare(
         `INSERT INTO arc_audit_events
         (event_id, run_id, event_type, actor, idempotency_key, payload_json, created_at)
         SELECT ?, ?, 'decision.created', ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM arc_runs
           WHERE run_id = ? AND scenario_id = ? AND question = ?
         )
         ON CONFLICT(event_id) DO NOTHING`,
      )
      .bind(
        `evt_decision_${input.runId}`,
        input.runId,
        input.actor,
        `decision:${input.runId}`,
        JSON.stringify({ scenarioId: input.scenarioId, synthetic: true }),
        createdAt,
        input.runId,
        input.scenarioId,
        input.question,
      ),
  ];
  await db.batch(statements);
  const stored = await loadArcRun(input.runId);
  if (!stored) throw new Error("run_persistence_failed");
  if (stored.scenarioId !== input.scenarioId || stored.question !== input.question) {
    throw new Error("run_id_conflict");
  }
  return {
    persistence: D1_PERSISTENCE,
    bundle: stored.bundle,
    created: Boolean(inserted),
  };
}

/**
 * Claims the run, not merely an action row. The run revision is the optimistic
 * concurrency token used during completion, so different actions cannot both
 * win and a stale worker cannot replace a newer bundle snapshot.
 */
export type ArcActionClaim = {
  action: StoredArcAction;
  replay: boolean;
  revision: number;
  leaseExpiresAt: string;
};

export async function claimArcAction(input: {
  runId: string;
  actionId: string;
  idempotencyKey: string;
}): Promise<ArcActionClaim> {
  const requestedAction = await loadArcAction(input.runId, input.actionId);
  if (!requestedAction) throw new Error("action_not_found");
  const initialRun = await loadArcRun(input.runId);
  if (!initialRun) throw new Error("action_not_found");

  // Preserve compatibility with receipts created before the attempts table
  // existed, while treating the new attempts table as the canonical mapping.
  const legacyReplay = await findArcActionByIdempotencyKey(input.idempotencyKey);
  if (legacyReplay) {
    if (
      legacyReplay.runId !== input.runId ||
      legacyReplay.actionId !== input.actionId
    ) {
      throw new Error("idempotency_key_conflict");
    }
    if (legacyReplay.status === "applied" && legacyReplay.result) {
      if (
        initialRun.actionState === "applied" &&
        initialRun.selectedActionId &&
        initialRun.selectedActionId !== input.actionId
      ) {
        throw new Error("action_selection_conflict");
      }
      return {
        action: legacyReplay,
        replay: true,
        revision: initialRun.revision,
        leaseExpiresAt: initialRun.actionLeaseExpiresAt ?? initialRun.updatedAt,
      };
    }
  }

  const db = await ensureArcSchema();
  const claimedAt = nowIso();
  const leaseExpiresAt = new Date(Date.now() + ARC_ACTION_LEASE_MS).toISOString();

  if (!db) {
    const existingAttempt = fallbackState.attempts.get(input.idempotencyKey);
    if (
      existingAttempt &&
      (existingAttempt.run_id !== input.runId ||
        existingAttempt.action_id !== input.actionId)
    ) {
      throw new Error("idempotency_key_conflict");
    }
    if (existingAttempt?.status === "applied") {
      const replayAction = fallbackState.actions.get(
        fallbackActionKey(input.runId, input.actionId),
      );
      if (replayAction?.status === "applied" && replayAction.result) {
        return {
          action: replayAction,
          replay: true,
          revision: initialRun.revision,
          leaseExpiresAt: existingAttempt.lease_expires_at,
        };
      }
      throw new Error("action_receipt_incomplete");
    }

    const currentRun = fallbackState.runs.get(input.runId);
    const key = fallbackActionKey(input.runId, input.actionId);
    const currentAction = fallbackState.actions.get(key);
    if (!currentRun || !currentAction) throw new Error("action_not_found");
    const sameOwner =
      currentRun.actionState === "applying" &&
      currentRun.selectedActionId === input.actionId &&
      currentRun.selectedIdempotencyKey === input.idempotencyKey;
    const leaseExpired =
      currentRun.actionState === "applying" &&
      (!currentRun.actionLeaseExpiresAt ||
        currentRun.actionLeaseExpiresAt <= claimedAt);

    if (currentRun.actionState === "applied") {
      throw new Error("action_selection_conflict");
    }
    if (currentRun.actionState === "applying" && !sameOwner && !leaseExpired) {
      throw new Error("action_selection_conflict");
    }

    if (!sameOwner && currentRun.selectedIdempotencyKey) {
      const abandoned = fallbackState.attempts.get(
        currentRun.selectedIdempotencyKey,
      );
      if (abandoned?.status === "applying") {
        fallbackState.attempts.set(abandoned.idempotency_key, {
          ...abandoned,
          status: "expired",
          updated_at: claimedAt,
        });
      }
    }
    for (const [actionKey, action] of fallbackState.actions) {
      if (
        action.runId === input.runId &&
        action.actionId !== input.actionId &&
        action.status === "applying"
      ) {
        fallbackState.actions.set(actionKey, {
          ...action,
          status: "pending",
          idempotencyKey: null,
        });
      }
    }

    const revision = sameOwner ? currentRun.revision : currentRun.revision + 1;
    fallbackState.runs.set(input.runId, {
      ...currentRun,
      actionState: "applying",
      selectedActionId: input.actionId,
      selectedIdempotencyKey: input.idempotencyKey,
      actionLeaseExpiresAt: leaseExpiresAt,
      revision,
      updatedAt: claimedAt,
    });
    const claimedAction: StoredArcAction = {
      ...currentAction,
      status: "applying",
      result: null,
      idempotencyKey: input.idempotencyKey,
      appliedAt: null,
    };
    fallbackState.actions.set(key, claimedAction);
    fallbackState.attempts.set(input.idempotencyKey, {
      idempotency_key: input.idempotencyKey,
      run_id: input.runId,
      action_id: input.actionId,
      status: "applying",
      lease_expires_at: leaseExpiresAt,
      result_json: null,
      created_at: existingAttempt?.created_at ?? claimedAt,
      updated_at: claimedAt,
    });
    return {
      action: claimedAction,
      replay: Boolean(existingAttempt || legacyReplay),
      revision,
      leaseExpiresAt,
    };
  }

  const reserved = await db
    .prepare(
      `INSERT INTO arc_action_attempts
       (idempotency_key, run_id, action_id, status, lease_expires_at,
        created_at, updated_at)
       VALUES (?, ?, ?, 'applying', ?, ?, ?)
       ON CONFLICT(idempotency_key) DO NOTHING
       RETURNING idempotency_key, run_id, action_id, status, lease_expires_at,
                 result_json, created_at, updated_at`,
    )
    .bind(
      input.idempotencyKey,
      input.runId,
      input.actionId,
      leaseExpiresAt,
      claimedAt,
      claimedAt,
    )
    .first<AttemptRow>();
  const attempt = reserved ?? (await loadArcActionAttempt(input.idempotencyKey));
  if (!attempt) throw new Error("action_claim_failed");
  if (attempt.run_id !== input.runId || attempt.action_id !== input.actionId) {
    throw new Error("idempotency_key_conflict");
  }
  if (attempt.status === "applied") {
    const replayAction = await loadArcAction(input.runId, input.actionId);
    const replayRun = await loadArcRun(input.runId);
    if (replayAction?.status === "applied" && replayAction.result && replayRun) {
      return {
        action: replayAction,
        replay: true,
        revision: replayRun.revision,
        leaseExpiresAt: attempt.lease_expires_at,
      };
    }
    throw new Error("action_receipt_incomplete");
  }

  const claimedRun = await db
    .prepare(
      `UPDATE arc_runs
       SET action_state = 'applying',
           selected_action_id = ?,
           selected_idempotency_key = ?,
           action_lease_expires_at = ?,
           revision = CASE
             WHEN action_state = 'applying'
              AND selected_action_id = ?
              AND selected_idempotency_key = ?
             THEN revision ELSE revision + 1 END,
           updated_at = ?
       WHERE run_id = ?
         AND action_state <> 'applied'
         AND EXISTS (
           SELECT 1 FROM arc_actions
           WHERE run_id = ? AND action_id = ? AND status <> 'applied'
         )
         AND EXISTS (
           SELECT 1 FROM arc_action_attempts
           WHERE idempotency_key = ? AND run_id = ? AND action_id = ?
         )
         AND (
           action_state = 'ready'
           OR (
             action_state = 'applying'
             AND selected_action_id = ?
             AND selected_idempotency_key = ?
           )
           OR (
             action_state = 'applying'
             AND action_lease_expires_at IS NOT NULL
             AND action_lease_expires_at <= ?
           )
         )
       RETURNING run_id, scenario_id, question, status, tags_json, bundle_json,
                 action_state, selected_action_id, selected_idempotency_key,
                 action_lease_expires_at, revision, created_at, updated_at`,
    )
    .bind(
      input.actionId,
      input.idempotencyKey,
      leaseExpiresAt,
      input.actionId,
      input.idempotencyKey,
      claimedAt,
      input.runId,
      input.runId,
      input.actionId,
      input.idempotencyKey,
      input.runId,
      input.actionId,
      input.actionId,
      input.idempotencyKey,
      claimedAt,
    )
    .first<RunRow>();

  if (!claimedRun) {
    await db
      .prepare(
        `UPDATE arc_action_attempts
         SET status = 'expired', updated_at = ?
         WHERE idempotency_key = ? AND status <> 'applied'`,
      )
      .bind(claimedAt, input.idempotencyKey)
      .run();
    throw new Error("action_selection_conflict");
  }

  const revision = claimedRun.revision;
  await db.batch([
    db
      .prepare(
        `UPDATE arc_action_attempts
         SET status = 'expired', updated_at = ?
         WHERE run_id = ? AND idempotency_key <> ? AND status = 'applying'
           AND EXISTS (
             SELECT 1 FROM arc_runs
             WHERE run_id = ? AND action_state = 'applying'
               AND selected_action_id = ? AND selected_idempotency_key = ?
               AND revision = ?
           )`,
      )
      .bind(
        claimedAt,
        input.runId,
        input.idempotencyKey,
        input.runId,
        input.actionId,
        input.idempotencyKey,
        revision,
      ),
    db
      .prepare(
        `UPDATE arc_actions
         SET status = 'pending', idempotency_key = NULL
         WHERE run_id = ? AND action_id <> ? AND status = 'applying'
           AND EXISTS (
             SELECT 1 FROM arc_runs
             WHERE run_id = ? AND action_state = 'applying'
               AND selected_action_id = ? AND selected_idempotency_key = ?
               AND revision = ?
           )`,
      )
      .bind(
        input.runId,
        input.actionId,
        input.runId,
        input.actionId,
        input.idempotencyKey,
        revision,
      ),
    db
      .prepare(
        `UPDATE arc_actions
         SET status = 'applying', idempotency_key = ?, result_json = NULL,
             applied_at = NULL
         WHERE run_id = ? AND action_id = ? AND status <> 'applied'
           AND EXISTS (
             SELECT 1 FROM arc_runs
             WHERE run_id = ? AND action_state = 'applying'
               AND selected_action_id = ? AND selected_idempotency_key = ?
               AND revision = ?
           )`,
      )
      .bind(
        input.idempotencyKey,
        input.runId,
        input.actionId,
        input.runId,
        input.actionId,
        input.idempotencyKey,
        revision,
      ),
    db
      .prepare(
        `UPDATE arc_action_attempts
         SET status = 'applying', lease_expires_at = ?, updated_at = ?
         WHERE idempotency_key = ? AND run_id = ? AND action_id = ?
           AND EXISTS (
             SELECT 1 FROM arc_runs
             WHERE run_id = ? AND action_state = 'applying'
               AND selected_action_id = ? AND selected_idempotency_key = ?
               AND revision = ?
           )`,
      )
      .bind(
        leaseExpiresAt,
        claimedAt,
        input.idempotencyKey,
        input.runId,
        input.actionId,
        input.runId,
        input.actionId,
        input.idempotencyKey,
        revision,
      ),
  ]);

  const action = await loadArcAction(input.runId, input.actionId);
  if (
    !action ||
    action.status !== "applying" ||
    action.idempotencyKey !== input.idempotencyKey
  ) {
    throw new Error("action_claim_failed");
  }
  return {
    action,
    replay: !reserved || Boolean(legacyReplay),
    revision,
    leaseExpiresAt,
  };
}

export async function completeArcAction(input: {
  run: StoredArcRun;
  action: StoredArcAction;
  idempotencyKey: string;
  revision: number;
  result: JsonObject;
  updatedBundle: JsonObject;
  summary: string;
  actor: string;
}): Promise<{ action: StoredArcAction; persistence: ArcPersistenceInfo }> {
  if (
    input.action.runId !== input.run.runId ||
    input.action.idempotencyKey !== input.idempotencyKey
  ) {
    throw new Error("action_claim_mismatch");
  }

  if (input.action.status === "applied" && input.action.result) {
    return { action: input.action, persistence: arcPersistenceInfo() };
  }

  const db = await ensureArcSchema();
  const appliedAt = nowIso();
  const completed: StoredArcAction = {
    ...input.action,
    status: "applied",
    result: input.result,
    appliedAt,
  };
  const memory: ArcMemoryItem = {
    memoryId: `mem_action_${input.run.runId}`,
    runId: input.run.runId,
    scenarioId: input.run.scenarioId,
    kind: "simulated_action",
    summary: input.summary,
    tags: normalizedTags([...input.run.tags, "simulated-action"]),
    payload: {
      actionId: input.action.actionId,
      result: input.result,
      synthetic: true,
    },
    createdAt: appliedAt,
  };

  if (!db) {
    const currentRun = fallbackState.runs.get(input.run.runId);
    const currentAction = fallbackState.actions.get(
      fallbackActionKey(input.action.runId, input.action.actionId),
    );
    if (
      currentRun?.actionState === "applied" &&
      currentRun.selectedActionId === input.action.actionId &&
      currentRun.selectedIdempotencyKey === input.idempotencyKey &&
      currentAction?.status === "applied" &&
      currentAction.result
    ) {
      return { action: currentAction, persistence: FALLBACK_PERSISTENCE };
    }
    if (
      !currentRun ||
      currentRun.actionState !== "applying" ||
      currentRun.selectedActionId !== input.action.actionId ||
      currentRun.selectedIdempotencyKey !== input.idempotencyKey ||
      currentRun.revision !== input.revision
    ) {
      throw new Error("action_completion_conflict");
    }
    fallbackState.actions.set(
      fallbackActionKey(input.action.runId, input.action.actionId),
      completed,
    );
    fallbackState.runs.set(input.run.runId, {
      ...currentRun,
      bundle: input.updatedBundle,
      status: "action-simulated",
      actionState: "applied",
      actionLeaseExpiresAt: null,
      revision: currentRun.revision + 1,
      updatedAt: appliedAt,
    });
    fallbackState.attempts.set(input.idempotencyKey, {
      idempotency_key: input.idempotencyKey,
      run_id: input.run.runId,
      action_id: input.action.actionId,
      status: "applied",
      lease_expires_at: appliedAt,
      result_json: JSON.stringify(input.result),
      created_at:
        fallbackState.attempts.get(input.idempotencyKey)?.created_at ?? appliedAt,
      updated_at: appliedAt,
    });
    if (!fallbackState.memory.some((item) => item.memoryId === memory.memoryId)) {
      fallbackState.memory.push(memory);
    }
    if (
      !fallbackState.audit.some(
        (event) => event.idempotencyKey === input.idempotencyKey,
      )
    ) {
      fallbackState.audit.push({
        eventId: `evt_action_${input.run.runId}`,
        runId: input.run.runId,
        eventType: "action.simulated",
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
        payload: memory.payload,
        createdAt: appliedAt,
      });
    }
    return { action: completed, persistence: FALLBACK_PERSISTENCE };
  }

  await db.batch([
    db
      .prepare(
        `UPDATE arc_actions
         SET status = 'applied', result_json = ?, applied_at = ?
         WHERE run_id = ? AND action_id = ? AND status = 'applying'
           AND idempotency_key = ?
           AND EXISTS (
             SELECT 1 FROM arc_runs
             WHERE run_id = ? AND action_state = 'applying'
               AND selected_action_id = ? AND selected_idempotency_key = ?
               AND revision = ?
           )`,
      )
      .bind(
        JSON.stringify(input.result),
        appliedAt,
        input.action.runId,
        input.action.actionId,
        input.idempotencyKey,
        input.run.runId,
        input.action.actionId,
        input.idempotencyKey,
        input.revision,
      ),
    db
      .prepare(
        `UPDATE arc_runs
         SET status = 'action-simulated', bundle_json = ?,
             action_state = 'applied', action_lease_expires_at = NULL,
             revision = revision + 1, updated_at = ?
         WHERE run_id = ? AND action_state = 'applying'
           AND selected_action_id = ? AND selected_idempotency_key = ?
           AND revision = ?
           AND EXISTS (
             SELECT 1 FROM arc_actions
             WHERE run_id = ? AND action_id = ? AND status = 'applied'
               AND idempotency_key = ?
           )`,
      )
      .bind(
        JSON.stringify(input.updatedBundle),
        appliedAt,
        input.run.runId,
        input.action.actionId,
        input.idempotencyKey,
        input.revision,
        input.run.runId,
        input.action.actionId,
        input.idempotencyKey,
      ),
    db
      .prepare(
        `UPDATE arc_action_attempts
         SET status = 'applied', result_json = ?, lease_expires_at = ?,
             updated_at = ?
         WHERE idempotency_key = ? AND run_id = ? AND action_id = ?
           AND EXISTS (
             SELECT 1 FROM arc_runs
             WHERE run_id = ? AND action_state = 'applied'
               AND selected_action_id = ? AND selected_idempotency_key = ?
           )`,
      )
      .bind(
        JSON.stringify(input.result),
        appliedAt,
        appliedAt,
        input.idempotencyKey,
        input.run.runId,
        input.action.actionId,
        input.run.runId,
        input.action.actionId,
        input.idempotencyKey,
      ),
    db
      .prepare(
        `INSERT INTO arc_memory
         (memory_id, run_id, scenario_id, kind, summary, tags_json, payload_json, created_at)
         SELECT ?, ?, ?, 'simulated_action', ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM arc_runs
           WHERE run_id = ? AND action_state = 'applied'
             AND selected_action_id = ? AND selected_idempotency_key = ?
         )
         ON CONFLICT(memory_id) DO NOTHING`,
      )
      .bind(
        memory.memoryId,
        input.run.runId,
        input.run.scenarioId,
        input.summary,
        JSON.stringify(memory.tags),
        JSON.stringify(memory.payload),
        appliedAt,
        input.run.runId,
        input.action.actionId,
        input.idempotencyKey,
      ),
    db
      .prepare(
        `INSERT INTO arc_audit_events
         (event_id, run_id, event_type, actor, idempotency_key, payload_json, created_at)
         SELECT ?, ?, 'action.simulated', ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM arc_runs
           WHERE run_id = ? AND action_state = 'applied'
             AND selected_action_id = ? AND selected_idempotency_key = ?
         )
         ON CONFLICT(idempotency_key) DO NOTHING`,
      )
      .bind(
        `evt_action_${input.run.runId}`,
        input.run.runId,
        input.actor,
        input.idempotencyKey,
        JSON.stringify(memory.payload),
        appliedAt,
        input.run.runId,
        input.action.actionId,
        input.idempotencyKey,
      ),
  ]);

  const durableRun = await loadArcRun(input.run.runId);
  const durableAction = await loadArcAction(
    input.action.runId,
    input.action.actionId,
  );
  if (
    durableRun?.actionState === "applied" &&
    durableRun.selectedActionId === input.action.actionId &&
    durableRun.selectedIdempotencyKey === input.idempotencyKey &&
    durableAction?.status === "applied" &&
    durableAction.result
  ) {
    return { action: durableAction, persistence: D1_PERSISTENCE };
  }
  throw new Error("action_completion_conflict");
}

export async function persistArcFeedback(input: {
  runId?: string;
  scenarioId: string;
  kind: "feedback" | "outcome";
  summary: string;
  tags: string[];
  payload: JsonObject;
  actor: string;
}): Promise<{ item: ArcMemoryItem; persistence: ArcPersistenceInfo }> {
  const db = await ensureArcSchema();
  const createdAt = nowIso();
  const item: ArcMemoryItem = {
    memoryId: id("mem"),
    runId: input.runId ?? null,
    scenarioId: input.scenarioId,
    kind: input.kind,
    summary: input.summary,
    tags: normalizedTags(input.tags),
    payload: { ...input.payload, synthetic: true },
    createdAt,
  };

  if (!db) {
    fallbackState.memory.push(item);
    fallbackState.audit.push({
      eventId: id("evt"),
      runId: input.runId ?? null,
      eventType: `memory.${input.kind}`,
      actor: input.actor,
      payload: item.payload,
      createdAt,
    });
    return { item, persistence: FALLBACK_PERSISTENCE };
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO arc_memory
         (memory_id, run_id, scenario_id, kind, summary, tags_json, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        item.memoryId,
        item.runId,
        item.scenarioId,
        item.kind,
        item.summary,
        JSON.stringify(item.tags),
        JSON.stringify(item.payload),
        createdAt,
      ),
    db
      .prepare(
        `INSERT INTO arc_audit_events
         (event_id, run_id, event_type, actor, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id("evt"),
        item.runId,
        `memory.${item.kind}`,
        input.actor,
        JSON.stringify({ memoryId: item.memoryId, synthetic: true }),
        createdAt,
      ),
  ]);

  return { item, persistence: D1_PERSISTENCE };
}
