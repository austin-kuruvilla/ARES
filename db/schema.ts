import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Durable decision receipts. The serialized bundle is immutable for normal
 * reads; action simulations append an audit event and replace only the stored
 * current bundle snapshot for that run.
 */
export const arcRuns = sqliteTable(
  "arc_runs",
  {
    runId: text("run_id").primaryKey(),
    scenarioId: text("scenario_id").notNull(),
    question: text("question").notNull().default(""),
    status: text("status").notNull().default("ready"),
    tagsJson: text("tags_json").notNull().default("[]"),
    bundleJson: text("bundle_json").notNull(),
    actionState: text("action_state").notNull().default("ready"),
    selectedActionId: text("selected_action_id"),
    selectedIdempotencyKey: text("selected_idempotency_key"),
    actionLeaseExpiresAt: text("action_lease_expires_at"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("arc_runs_scenario_created_idx").on(table.scenarioId, table.createdAt),
    index("arc_runs_status_idx").on(table.status),
  ],
);

/**
 * Durable idempotency receipts are separate from action rows so an abandoned
 * lease can expire without allowing the same key to target another run/action.
 */
export const arcActionAttempts = sqliteTable(
  "arc_action_attempts",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => arcRuns.runId, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    status: text("status").notNull().default("applying"),
    leaseExpiresAt: text("lease_expires_at").notNull(),
    resultJson: text("result_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("arc_action_attempts_run_status_idx").on(table.runId, table.status),
    index("arc_action_attempts_lease_idx").on(table.leaseExpiresAt),
  ],
);

/** Actions are materialized from a validated DecisionBundle before approval. */
export const arcActions = sqliteTable(
  "arc_actions",
  {
    runId: text("run_id")
      .notNull()
      .references(() => arcRuns.runId, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    status: text("status").notNull().default("pending"),
    actionJson: text("action_json").notNull(),
    resultJson: text("result_json"),
    idempotencyKey: text("idempotency_key"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    appliedAt: text("applied_at"),
  },
  (table) => [
    uniqueIndex("arc_actions_run_action_uidx").on(table.runId, table.actionId),
    uniqueIndex("arc_actions_idempotency_uidx").on(table.idempotencyKey),
    index("arc_actions_run_status_idx").on(table.runId, table.status),
  ],
);

/**
 * Outcome and feedback memory is append-only. It is deliberately separate
 * from the current run snapshot so judges can inspect what changed over time.
 */
export const arcMemory = sqliteTable(
  "arc_memory",
  {
    memoryId: text("memory_id").primaryKey(),
    runId: text("run_id").references(() => arcRuns.runId, { onDelete: "set null" }),
    scenarioId: text("scenario_id").notNull(),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    tagsJson: text("tags_json").notNull().default("[]"),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("arc_memory_scenario_created_idx").on(table.scenarioId, table.createdAt),
    index("arc_memory_run_idx").on(table.runId),
    index("arc_memory_kind_idx").on(table.kind),
  ],
);

/** Every material transition gets an immutable synthetic audit receipt. */
export const arcAuditEvents = sqliteTable(
  "arc_audit_events",
  {
    eventId: text("event_id").primaryKey(),
    runId: text("run_id"),
    eventType: text("event_type").notNull(),
    actor: text("actor").notNull().default("arc-demo"),
    idempotencyKey: text("idempotency_key"),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("arc_audit_events_idempotency_uidx").on(table.idempotencyKey),
    index("arc_audit_events_run_created_idx").on(table.runId, table.createdAt),
    index("arc_audit_events_type_idx").on(table.eventType),
  ],
);

export type ArcRunRow = typeof arcRuns.$inferSelect;
export type ArcActionRow = typeof arcActions.$inferSelect;
export type ArcActionAttemptRow = typeof arcActionAttempts.$inferSelect;
export type ArcMemoryRow = typeof arcMemory.$inferSelect;
export type ArcAuditEventRow = typeof arcAuditEvents.$inferSelect;
