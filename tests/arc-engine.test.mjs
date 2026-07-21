import assert from "node:assert/strict";
import test from "node:test";

import {
  applySimulatedAction,
  exportDecisionBundle,
  getScenario,
  listScenarios,
  runArcScenario,
  runDeterministicPipeline,
  validateDecisionBundle,
} from "../plugins/arc-cyber-decision-engine/runtime/engine.mjs";

const EXPECTED_LAYERS = [
  "intent",
  "plan",
  "evidence",
  "contextFusion",
  "ontology",
  "decisionGraph",
  "agents",
  "debate",
  "ranking",
  "receipt",
  "projections",
  "executionMemory",
];

const EXPECTED_AGENTS = ["Attack", "Identity", "Cloud", "Network", "GRC", "Threat", "Business", "Compliance"];

function collectEvidenceReferences(value, path = "bundle", found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectEvidenceReferences(item, `${path}[${index}]`, found));
    return found;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "evidenceIds") found.push({ path: `${path}.${key}`, ids: item });
    else collectEvidenceReferences(item, `${path}.${key}`, found);
  }
  return found;
}

function makeHostAnalysis(bundle) {
  return {
    model: "GPT-5.6",
    surface: "Codex host",
    generatedAt: bundle.run.generatedAt,
    specialists: bundle.agents.map((agent) => ({
      agentId: agent.id,
      disposition: agent.vote.actionId === bundle.recommendation.id ? "support" : "challenge",
      claims: [
        {
          text: "The specialist assessment is grounded in the attached deterministic evidence and graph entity.",
          evidenceIds: [agent.assessment.evidenceIds[0]],
          nodeOrEdgeIds: [bundle.graph.nodes[0].id],
        },
      ],
      actionId: agent.vote.actionId,
      assumptions: [],
      missingEvidence: [],
      confidenceLabel: "high",
    })),
    debate: {
      summary: "The host narrative preserves the deterministic recommendation and records specialist dissent.",
      dissent: [],
      evidenceIds: [bundle.evidence[0].id],
    },
    audienceSummaries: {
      soc: { summary: "Use the deterministic action packet.", evidenceIds: [bundle.evidence[0].id] },
    },
  };
}

test("scenario catalog exposes the immutable synthetic hero variants", () => {
  const catalog = listScenarios();
  assert.ok(catalog.some((scenario) => scenario.id === "oauth-phishing"));
  assert.ok(catalog.some((scenario) => scenario.id === "oauth-phishing-endpoint-malware"));
  assert.ok(catalog.every((scenario) => scenario.synthetic));
  assert.equal(catalog.find((scenario) => scenario.id === "oauth-phishing").expectedPathCount, 3);
  assert.equal(catalog.find((scenario) => scenario.id === "oauth-phishing-endpoint-malware").expectedPathCount, 7);
  assert.ok(catalog.every((scenario) => Array.isArray(scenario.products)));
  assert.ok(catalog.every((scenario) => scenario.story));
  assert.ok(catalog.every((scenario) => typeof scenario.defaultQuestion === "string"));

  const copy = getScenario("oauth-phishing");
  copy.title = "mutated";
  assert.equal(getScenario("oauth-phishing").title, "Finance OAuth compromise");
  assert.equal(getScenario("does-not-exist"), null);
});

test("every run emits all 12 functional layers and a completed ordered trace", () => {
  for (const { id } of listScenarios()) {
    const bundle = runArcScenario({ scenarioId: id });
    assert.deepEqual(Object.keys(bundle.layers), EXPECTED_LAYERS);
    assert.deepEqual(bundle.trace.map((entry) => entry.layer), EXPECTED_LAYERS);
    assert.deepEqual(bundle.trace.map((entry) => entry.index), Array.from({ length: 12 }, (_, index) => index + 1));
    assert.ok(bundle.trace.every((entry) => entry.status === "completed" && entry.summary.length > 0));
    assert.equal(bundle.layers.decisionGraph.pathCount, bundle.graph.pathCount);
    assert.equal(bundle.layers.ranking.recommendationId, bundle.recommendation.id);
    assert.equal(bundle.layers.receipt.provenance.modelCalls, false);
    assert.equal(bundle.layers.receipt.provenance.externalActions, false);
  }
});

test("the agent layer contains eight distinct, cited specialist artifacts without fake model output", () => {
  const bundle = runArcScenario({ scenarioId: "oauth-phishing" });
  assert.deepEqual(bundle.agents.map((agent) => agent.name), EXPECTED_AGENTS);
  assert.equal(new Set(bundle.agents.map((agent) => agent.id)).size, 8);
  for (const agent of bundle.agents) {
    assert.equal(agent.status, "structured-input-ready");
    assert.equal(agent.hostNarrative.hostGenerated, false);
    assert.equal(agent.hostNarrative.text, null);
    assert.ok(agent.assessment.evidenceIds.length > 0);
    assert.ok(agent.assessment.findings.every((finding) => finding.evidenceIds.length > 0));
  }
});

test("every factual claim and every evidenceIds field cites real evidence", () => {
  for (const { id } of listScenarios()) {
    const bundle = runArcScenario({ scenarioId: id });
    const evidenceIds = new Set(bundle.evidence.map((evidence) => evidence.id));
    assert.deepEqual(new Set(bundle.claims.map((claim) => claim.classification)), new Set(["observed", "derived", "hypothesis"]));
    for (const claim of bundle.claims) {
      assert.ok(claim.evidenceIds.length > 0, `${claim.id} lacks a citation`);
      assert.ok(claim.evidenceIds.every((evidenceId) => evidenceIds.has(evidenceId)), `${claim.id} has an invalid citation`);
    }
    for (const reference of collectEvidenceReferences(bundle)) {
      assert.ok(Array.isArray(reference.ids) && reference.ids.length > 0, `${reference.path} must be non-empty`);
      assert.ok(reference.ids.every((evidenceId) => evidenceIds.has(evidenceId)), `${reference.path} cites unknown evidence`);
    }
    const validation = validateDecisionBundle(bundle);
    assert.equal(validation.valid, true, validation.errors.join("; "));
  }
});

test("runs are synchronous, deterministic, and canonically exportable", () => {
  const input = {
    scenarioId: "oauth-phishing",
    question: "Contain cloud access or isolate the endpoint?",
    priorMemory: [{ id: "MEM-PRIOR", outcome: "contained" }],
  };
  const first = runArcScenario(input);
  const second = runDeterministicPipeline(input);
  assert.deepEqual(second, first);
  assert.equal(exportDecisionBundle(first), exportDecisionBundle(second));
  assert.match(first.run.id, /^RUN-[0-9a-f]{8}$/);
  assert.equal(first.run.generatedAt, "2026-07-18T08:50:00.000Z");

  const changedQuestion = runArcScenario({ ...input, question: "A different decision question" });
  assert.notEqual(changedQuestion.run.id, first.run.id);
});

test("graph path enumeration and published action formula drive the counterfactual flip", () => {
  const base = runArcScenario({ scenarioId: "oauth-phishing" });
  const malware = runArcScenario({ scenarioId: "oauth-phishing-endpoint-malware" });

  assert.equal(base.graph.pathCount, 3);
  assert.equal(malware.graph.pathCount, 7);
  assert.deepEqual(base.graph.paths.map((path) => path.id), ["P-001", "P-002", "P-003"]);
  assert.deepEqual(malware.graph.paths.map((path) => path.id), ["P-001", "P-002", "P-003", "P-004", "P-005", "P-006", "P-007"]);
  assert.equal(base.recommendation.id, "A-IDENTITY-CONTAIN");
  assert.equal(malware.recommendation.id, "A-COMBINED-CONTAIN");
  assert.equal(base.recommendation.score, 96.55);
  assert.equal(malware.recommendation.score, 81.98);
  assert.notEqual(base.recommendation.id, malware.recommendation.id);

  const baseEndpointRank = base.actions.find((action) => action.id === "A-ENDPOINT-ISOLATE").rank;
  const malwareEndpointRank = malware.actions.find((action) => action.id === "A-ENDPOINT-ISOLATE").rank;
  assert.ok(malwareEndpointRank < baseEndpointRank, "confirmed malware should raise endpoint isolation in the ranking");
  for (const action of [...base.actions, ...malware.actions]) {
    const expectedScore = Object.values(action.weighted).reduce((sum, value) => sum + value, 0);
    assert.equal(action.score, Math.round((expectedScore + Number.EPSILON) * 100) / 100);
  }
});

test("simulated approval and action update execution memory without claiming a production change", () => {
  const bundle = runArcScenario({ scenarioId: "oauth-phishing" });
  const simulated = applySimulatedAction({
    bundle,
    actionId: bundle.recommendation.id,
    approvedBy: "Test incident commander",
    note: "Unit-test simulation",
  });
  assert.equal(bundle.actions[0].status, "proposed", "input bundle must not be mutated");
  assert.equal(simulated.actions[0].status, "simulated");
  assert.equal(simulated.approval.state, "approved-and-simulated");
  assert.equal(simulated.approval.approvedBy, "Test incident commander");
  assert.equal(simulated.memory.record.selectedActionId, "A-IDENTITY-CONTAIN");
  assert.equal(simulated.memory.record.outcome.type, "simulated");
  assert.equal(simulated.memory.record.outcome.mode, "SIMULATED");
  assert.equal(simulated.memory.record.outcome.liveSystemsChanged, false);
  assert.equal(simulated.memory.record.status, "recorded");
  assert.deepEqual(
    simulated.graph.paths.filter((path) => path.state === "blocked").map((path) => path.id),
    simulated.actions[0].coveredPathIds,
  );
  assert.equal(simulated.graph.simulation.before.openPathCount, bundle.graph.pathCount);
  assert.equal(simulated.graph.simulation.mode, "SIMULATED");
  assert.equal(simulated.graph.simulation.liveSystemsChanged, false);
  assert.equal(simulated.graph.simulation.after.blockedPathCount, simulated.actions[0].coveredPathIds.length);
  assert.equal(simulated.layers.decisionGraph, simulated.graph);
  assert.equal(simulated.recommendation.status, "simulated");
  assert.deepEqual(simulated.recommendation.simulation, simulated.actions[0].simulation);
  assert.equal(validateDecisionBundle(simulated).valid, true);
});

test("simulated actions are canonical, byte-idempotent, and single-winner", () => {
  const bundle = runArcScenario({ scenarioId: "oauth-phishing" });
  assert.ok(bundle.graph.paths.every((path) => path.state === "open"));
  assert.equal(bundle.graph.simulation, null);

  const first = applySimulatedAction({
    bundle,
    actionId: bundle.recommendation.id,
    approvedBy: "First approver",
    note: "First note",
  });
  const second = applySimulatedAction({
    bundle: first,
    actionId: bundle.recommendation.id,
    approvedBy: "Ignored second approver",
    note: "Ignored second note",
  });
  assert.deepEqual(second, first);
  assert.equal(exportDecisionBundle(second), exportDecisionBundle(first));
  assert.equal(new Set(second.approval.events.map((event) => event.id)).size, second.approval.events.length);
  assert.equal(new Set(second.memory.trace.map((entry) => entry.id)).size, second.memory.trace.length);
  assert.equal(second.actions.filter((action) => action.status === "simulated").length, 1);

  const alternate = bundle.actions.find((action) => action.id !== bundle.recommendation.id);
  assert.throws(
    () => applySimulatedAction(first, alternate.id),
    /ARES action conflict: .* is already simulated; cannot simulate/,
  );
});

test("every scenario recommendation produces a valid, byte-idempotent simulation receipt", () => {
  for (const { id } of listScenarios()) {
    const bundle = runArcScenario({ scenarioId: id });
    const simulated = applySimulatedAction({
      bundle,
      actionId: bundle.recommendation.id,
      approvedBy: "Portfolio test approver",
      note: "Catalog-wide simulation contract",
    });
    const repeated = applySimulatedAction({
      bundle: simulated,
      actionId: bundle.recommendation.id,
      approvedBy: "Ignored repeated approver",
      note: "Ignored repeated note",
    });

    assert.equal(validateDecisionBundle(simulated).valid, true, `${id}: simulated bundle must validate`);
    assert.deepEqual(
      simulated.graph.paths.filter((path) => path.state === "blocked").map((path) => path.id),
      simulated.recommendation.coveredPathIds,
      `${id}: simulated graph must match deterministic path coverage`,
    );
    assert.equal(exportDecisionBundle(repeated), exportDecisionBundle(simulated), `${id}: repeated simulation must be byte-idempotent`);
  }
});

test("non-approval actions use the canonical not-required simulation path", () => {
  const bundle = runArcScenario({ scenarioId: "oauth-phishing" });
  const monitor = bundle.actions.find((action) => action.id === "A-MONITOR");
  const simulated = applySimulatedAction(bundle, monitor.id);
  assert.equal(simulated.approval.state, "not-required-simulated");
  assert.equal(simulated.approval.approvedBy, null);
  assert.deepEqual(simulated.approval.events.map((event) => event.type), [
    "approval-not-required",
    "action-simulated",
  ]);
  assert.equal(simulated.graph.simulation.after.blockedPathCount, 0);
  assert.equal(validateDecisionBundle(simulated).valid, true);
});

test("validator rejects state-machine, graph, scenario, and confidence tampering", () => {
  const pending = runArcScenario({ scenarioId: "oauth-phishing" });
  const simulated = applySimulatedAction(pending, pending.recommendation.id);

  const multipleActions = structuredClone(simulated);
  multipleActions.actions[1].status = "simulated";
  multipleActions.actions[1].simulation.result = "success";
  multipleActions.actions[1].simulation.synthetic = true;
  multipleActions.actions[1].simulation.executedAt = multipleActions.run.generatedAt;
  multipleActions.layers.ranking.actions = multipleActions.actions;
  assert.equal(validateDecisionBundle(multipleActions).valid, false);

  const duplicateEvent = structuredClone(simulated);
  duplicateEvent.approval.events.push(structuredClone(duplicateEvent.approval.events.at(-1)));
  duplicateEvent.layers.executionMemory.approval = duplicateEvent.approval;
  const duplicateEventValidation = validateDecisionBundle(duplicateEvent);
  assert.equal(duplicateEventValidation.valid, false);
  assert.ok(duplicateEventValidation.errors.some((error) => error.includes("duplicate approval event id")));

  const memoryMismatch = structuredClone(simulated);
  memoryMismatch.memory.record.selectedActionId = pending.actions[1].id;
  memoryMismatch.layers.executionMemory.memory = memoryMismatch.memory;
  assert.equal(validateDecisionBundle(memoryMismatch).valid, false);

  const approvalMismatch = structuredClone(simulated);
  approvalMismatch.approval.actionId = pending.actions[1].id;
  approvalMismatch.layers.executionMemory.approval = approvalMismatch.approval;
  assert.equal(validateDecisionBundle(approvalMismatch).valid, false);

  const duplicateTrace = structuredClone(simulated);
  duplicateTrace.memory.trace[1].id = duplicateTrace.memory.trace[0].id;
  duplicateTrace.layers.executionMemory.memory = duplicateTrace.memory;
  const duplicateTraceValidation = validateDecisionBundle(duplicateTrace);
  assert.equal(duplicateTraceValidation.valid, false);
  assert.ok(duplicateTraceValidation.errors.some((error) => error.includes("duplicate memory trace id")));

  const graphMismatch = structuredClone(simulated);
  graphMismatch.graph.simulation.after.blockedPathCount = 0;
  graphMismatch.layers.decisionGraph = graphMismatch.graph;
  const graphValidation = validateDecisionBundle(graphMismatch);
  assert.equal(graphValidation.valid, false);
  assert.ok(graphValidation.errors.some((error) => error.includes("graph.simulation")));

  const recommendationMismatch = structuredClone(simulated);
  recommendationMismatch.recommendation.status = "proposed";
  assert.equal(validateDecisionBundle(recommendationMismatch).valid, false);

  const foreignScenario = structuredClone(pending);
  foreignScenario.scenario.id = "foreign-scenario";
  foreignScenario.run.scenarioId = "foreign-scenario";
  foreignScenario.memory.record.scenarioId = "foreign-scenario";
  assert.equal(validateDecisionBundle(foreignScenario).valid, false);

  const runMismatch = structuredClone(pending);
  runMismatch.run.scenarioId = "oauth-phishing-endpoint-malware";
  assert.equal(validateDecisionBundle(runMismatch).valid, false);

  const staleConfidence = structuredClone(pending);
  staleConfidence.evidence[0].freshnessMinutes = 120;
  staleConfidence.layers.evidence.items[0].freshnessMinutes = 120;
  const staleValidation = validateDecisionBundle(staleConfidence);
  assert.equal(staleValidation.valid, false);
  assert.ok(staleValidation.errors.some((error) => error.includes("confidence freshness")));

  const unreliableConfidence = structuredClone(pending);
  unreliableConfidence.evidence[0].reliability = 0;
  unreliableConfidence.layers.evidence.items[0].reliability = 0;
  const unreliableValidation = validateDecisionBundle(unreliableConfidence);
  assert.equal(unreliableValidation.valid, false);
  assert.ok(unreliableValidation.errors.some((error) => error.includes("confidence reliability")));
});

test("unknown scenarios and actions are rejected", () => {
  assert.throws(() => runArcScenario({ scenarioId: "unknown" }), /Unknown ARES scenario/);
  assert.throws(() => runArcScenario({}), /scenarioId must be a non-empty string/);
  const bundle = runArcScenario({ scenarioId: "oauth-phishing" });
  assert.throws(() => applySimulatedAction(bundle, "A-DOES-NOT-EXIST"), /Unknown ARES action/);
});

test("optional GPT-5.6 host analysis is isolated and citation-validated", () => {
  const bundle = runArcScenario({ scenarioId: "oauth-phishing" });
  const enriched = structuredClone(bundle);
  enriched.hostAnalysis = makeHostAnalysis(bundle);
  assert.equal(validateDecisionBundle(enriched).valid, true);
  assert.match(exportDecisionBundle(enriched), /"hostAnalysis"/);

  const numericOverride = structuredClone(enriched);
  numericOverride.hostAnalysis.specialists[0].score = 99;
  const numericValidation = validateDecisionBundle(numericOverride);
  assert.equal(numericValidation.valid, false);
  assert.ok(numericValidation.errors.some((error) => error.includes("must not contain numeric values")));

  const badCitation = structuredClone(enriched);
  badCitation.hostAnalysis.specialists[0].claims[0].evidenceIds = ["E-DOES-NOT-EXIST"];
  assert.equal(validateDecisionBundle(badCitation).valid, false);

  const deterministicMutation = structuredClone(enriched);
  deterministicMutation.actions[0].score = 100;
  assert.equal(validateDecisionBundle(deterministicMutation).valid, false);
});
