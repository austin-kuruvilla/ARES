import {
  applySimulatedAction,
  type DecisionBundle,
  validateDecisionBundle,
} from "@/plugins/arc-cyber-decision-engine/runtime/engine.mjs";
import { requireChatGPTApiUser } from "@/app/chatgpt-auth";
import {
  claimArcAction,
  completeArcAction,
  arcPersistenceInfo,
  loadArcRun,
  type JsonObject,
} from "@/lib/arc-memory";
import {
  ArcHttpError,
  assertValidDecisionBundle,
  boundedString,
  jsonError,
  readBoundedJson,
  safeIdPattern,
} from "../_shared";

function actionFromBundle(bundle: JsonObject, actionId: string) {
  const actions = Array.isArray(bundle.actions) ? bundle.actions : [];
  const match = actions.find(
    (action) =>
      action &&
      typeof action === "object" &&
      !Array.isArray(action) &&
      (action as JsonObject).id === actionId,
  );
  return match && typeof match === "object" ? (match as JsonObject) : null;
}

export async function POST(request: Request) {
  try {
    const actor = await requireChatGPTApiUser();
    const payload = await readBoundedJson(request, 8_192);
    const runId = boundedString(payload.runId, "runId", {
      required: true,
      max: 120,
      pattern: safeIdPattern,
    });
    const actionId = boundedString(payload.actionId, "actionId", {
      required: true,
      max: 100,
      pattern: safeIdPattern,
    });
    const idempotencyKey = boundedString(payload.idempotencyKey, "idempotencyKey", {
      required: true,
      min: 8,
      max: 160,
      pattern: safeIdPattern,
    });

    const run = await loadArcRun(runId);
    if (!run) throw new ArcHttpError(404, "ARES run not found");
    const validatedStoredBundle = assertValidDecisionBundle(
      run.bundle,
      validateDecisionBundle,
    ) as unknown as DecisionBundle;

    const claim = await claimArcAction({ runId, actionId, idempotencyKey });
    if (claim.replay && claim.action.status === "applied" && claim.action.result) {
      const currentRun = (await loadArcRun(runId)) ?? run;
      return Response.json({
        action: claim.action,
        bundle: currentRun.bundle,
        result: claim.action.result,
        replayed: true,
        simulated: true,
        persistence: arcPersistenceInfo(),
        disclosure: "No external system was changed; this approval is a simulation.",
      });
    }

    // applySimulatedAction never contacts a control plane; it changes only the receipt.
    const updated = await Promise.resolve(
      applySimulatedAction(validatedStoredBundle, actionId),
    );
    const updatedBundle = assertValidDecisionBundle(updated, validateDecisionBundle);
    const updatedAction = actionFromBundle(updatedBundle, actionId);
    if (!updatedAction) {
      throw new ArcHttpError(422, "Simulated action result is missing its action receipt");
    }
    const result: JsonObject = {
      actionId,
      status: updatedAction.status ?? "simulated",
      simulation: updatedAction.simulation ?? { executed: false },
      approval: updatedBundle.approval ?? {},
      synthetic: true,
    };
    const title = typeof updatedAction.title === "string" ? updatedAction.title : actionId;
    const completed = await completeArcAction({
      run,
      action: claim.action,
      idempotencyKey,
      revision: claim.revision,
      result,
      updatedBundle,
      summary: `Simulated approval for ${title}; no external system was changed.`.slice(0, 500),
      actor: actor.email,
    });

    return Response.json({
      action: completed.action,
      bundle: updatedBundle,
      result,
      replayed: claim.replay,
      simulated: true,
      persistence: completed.persistence,
      disclosure: "No external system was changed; this approval is a simulation.",
    });
  } catch (error) {
    return jsonError(error);
  }
}
