import {
  listArcMemory,
  loadArcRun,
  persistArcFeedback,
} from "@/lib/arc-memory";
import { requireChatGPTApiUser } from "@/app/chatgpt-auth";
import { listScenarios } from "@/plugins/arc-cyber-decision-engine/runtime/engine.mjs";
import {
  ArcHttpError,
  boundedString,
  boundedTags,
  jsonError,
  readBoundedJson,
  safeIdPattern,
} from "../_shared";

function positiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new ArcHttpError(400, "limit must be an integer between 1 and 50");
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawScenarioId = url.searchParams.get("scenarioId");
    const scenarioId = rawScenarioId
      ? boundedString(rawScenarioId, "scenarioId", {
          required: true,
          max: 80,
          pattern: safeIdPattern,
        })
      : undefined;
    const rawTags = url.searchParams.get("tags");
    const tags = rawTags
      ? boundedTags(rawTags.split(",").map((tag) => tag.trim()))
      : [];
    const result = await listArcMemory({
      scenarioId,
      tags,
      limit: positiveInt(url.searchParams.get("limit"), 20),
    });
    return Response.json({ ...result, synthetic: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireChatGPTApiUser();
    const payload = await readBoundedJson(request, 12_288);
    const runId = payload.runId
      ? boundedString(payload.runId, "runId", {
          required: true,
          max: 120,
          pattern: safeIdPattern,
        })
      : undefined;
    const run = runId ? await loadArcRun(runId) : null;
    if (runId && !run) throw new ArcHttpError(404, "ARES run not found");

    const suppliedScenarioId = payload.scenarioId
      ? boundedString(payload.scenarioId, "scenarioId", {
          required: true,
          max: 80,
          pattern: safeIdPattern,
        })
      : "";
    const scenarioId = run?.scenarioId ?? suppliedScenarioId;
    if (!scenarioId) throw new ArcHttpError(400, "scenarioId or runId is required");
    if (run && suppliedScenarioId && run.scenarioId !== suppliedScenarioId) {
      throw new ArcHttpError(409, "scenarioId does not match the stored run");
    }
    const listed = await Promise.resolve(listScenarios());
    const scenarios = Array.isArray(listed)
      ? listed
      : listed && typeof listed === "object" && "scenarios" in listed
        ? (listed as { scenarios?: unknown }).scenarios
        : [];
    if (
      !Array.isArray(scenarios) ||
      !scenarios.some(
        (scenario) =>
          scenario &&
          typeof scenario === "object" &&
          "id" in scenario &&
          scenario.id === scenarioId,
      )
    ) {
      throw new ArcHttpError(404, "Unknown ARES scenario");
    }

    const kind = payload.kind ?? "feedback";
    if (kind !== "feedback" && kind !== "outcome") {
      throw new ArcHttpError(400, "kind must be feedback or outcome");
    }
    const summary = boundedString(payload.summary, "summary", {
      required: true,
      max: 1_000,
    });
    const tags = boundedTags(payload.tags);
    const rating = payload.rating;
    if (
      rating != null &&
      (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5)
    ) {
      throw new ArcHttpError(400, "rating must be an integer between 1 and 5");
    }

    const result = await persistArcFeedback({
      runId,
      scenarioId,
      kind,
      summary,
      tags,
      payload: rating == null ? {} : { rating },
      actor: actor.email,
    });
    return Response.json(
      {
        ...result,
        synthetic: true,
        disclosure: "This feedback is stored as demo memory and does not trigger any action.",
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
