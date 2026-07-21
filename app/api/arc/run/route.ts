import {
  listScenarios,
  runArcScenario,
  validateDecisionBundle,
} from "@/plugins/arc-cyber-decision-engine/runtime/engine.mjs";
import { listArcMemory, persistArcRun, type JsonObject } from "@/lib/arc-memory";
import { requireChatGPTApiUser } from "@/app/chatgpt-auth";
import {
  ArcHttpError,
  assertValidDecisionBundle,
  boundedString,
  jsonError,
  readBoundedJson,
  safeIdPattern,
} from "../_shared";

type ScenarioSummary = { id?: unknown; tags?: unknown };

function scenarioList(value: unknown): ScenarioSummary[] {
  if (Array.isArray(value)) return value as ScenarioSummary[];
  if (value && typeof value === "object") {
    const nested = (value as { scenarios?: unknown }).scenarios;
    if (Array.isArray(nested)) return nested as ScenarioSummary[];
  }
  return [];
}

function bundleActions(bundle: JsonObject) {
  const actions = bundle.actions;
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > 20) {
    throw new ArcHttpError(422, "DecisionBundle must contain between 1 and 20 actions");
  }
  return actions.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ArcHttpError(422, `DecisionBundle action ${index} is invalid`);
    }
    const action = value as JsonObject;
    const actionId = boundedString(action.id, `actions[${index}].id`, {
      required: true,
      max: 100,
      pattern: safeIdPattern,
    });
    return { actionId, action };
  });
}

function bundleRunId(bundle: JsonObject) {
  const run = bundle.run;
  if (!run || typeof run !== "object" || Array.isArray(run)) {
    throw new ArcHttpError(422, "DecisionBundle run receipt is missing");
  }
  return boundedString((run as JsonObject).id, "DecisionBundle.run.id", {
    required: true,
    max: 120,
    pattern: safeIdPattern,
  });
}

function bundleQuestion(bundle: JsonObject) {
  const run = bundle.run as JsonObject;
  return boundedString(run.question, "DecisionBundle.run.question", {
    required: true,
    max: 600,
  });
}

function decisionSummary(bundle: JsonObject, actions: Array<{ action: JsonObject }>) {
  const recommendation =
    bundle.recommendation && typeof bundle.recommendation === "object"
      ? (bundle.recommendation as JsonObject)
      : {};
  const primaryId = recommendation.id;
  const selected = actions.find(({ action }) => action.id === primaryId)?.action ?? actions[0].action;
  const title = typeof selected.title === "string" ? selected.title : "top-ranked response";
  return `ARES recommended ${title} from synthetic evidence.`.slice(0, 500);
}

function decisionTags(scenarioId: string, scenario: ScenarioSummary | undefined, bundle: JsonObject) {
  const supplied = Array.isArray(scenario?.tags)
    ? scenario.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const risk =
    bundle.risk && typeof bundle.risk === "object"
      ? (bundle.risk as { band?: unknown }).band
      : undefined;
  return [scenarioId, ...supplied, typeof risk === "string" ? `risk-${risk}` : ""]
    .filter(Boolean)
    .map((tag) => tag.toLowerCase())
    .slice(0, 12);
}

export async function POST(request: Request) {
  try {
    const actor = await requireChatGPTApiUser();
    const payload = await readBoundedJson(request);
    const scenarioId = boundedString(payload.scenarioId, "scenarioId", {
      required: true,
      max: 80,
      pattern: safeIdPattern,
    });
    const question = boundedString(payload.question, "question", { max: 600 });

    const available = scenarioList(await Promise.resolve(listScenarios()));
    const scenario = available.find((item) => item.id === scenarioId);
    if (!scenario) {
      throw new ArcHttpError(404, "Unknown ARES scenario");
    }

    const related = await listArcMemory({ scenarioId, limit: 8 });
    // Auto-generated decision receipts must not recursively change the next
    // deterministic run ID. Only operator feedback/outcomes and simulated
    // action results are meaningful prior state for a new decision.
    const relevantPriorMemory = related.items.filter((item) => item.kind !== "decision");
    const generated = await Promise.resolve(
      runArcScenario({
        scenarioId,
        question: question || undefined,
        priorMemory: relevantPriorMemory,
      }),
    );
    // The canonical validator checks claim/evidence/action citation integrity.
    const bundle = assertValidDecisionBundle(generated, validateDecisionBundle);
    const actions = bundleActions(bundle);
    const runId = bundleRunId(bundle);
    const canonicalQuestion = bundleQuestion(bundle);
    const tags = decisionTags(scenarioId, scenario, bundle);
    const persisted = await persistArcRun({
      runId,
      scenarioId,
      question: canonicalQuestion,
      tags,
      bundle,
      actions,
      summary: decisionSummary(bundle, actions),
      actor: actor.email,
    });

    return Response.json(
      {
        bundle: persisted.bundle,
        relatedMemory: related.items,
        persistence: persisted.persistence,
        synthetic: true,
        disclosure:
          "This is a deterministic replay with synthetic evidence. Approval actions are simulated only.",
      },
      { status: persisted.created ? 201 : 200 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
