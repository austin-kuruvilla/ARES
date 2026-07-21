import { listScenarios } from "@/plugins/arc-cyber-decision-engine/runtime/engine.mjs";
import { jsonError } from "../_shared";

export async function GET() {
  try {
    const scenarios = await Promise.resolve(listScenarios());
    return Response.json({
      scenarios,
      mode: "deterministic-demo",
      synthetic: true,
      disclosure: "All scenario evidence and actions are synthetic and safe to replay.",
    });
  } catch (error) {
    return jsonError(error);
  }
}
