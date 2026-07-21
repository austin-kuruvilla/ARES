import assert from "node:assert/strict";
import test from "node:test";

import {
  getScenario,
  listScenarios,
  runArcScenario,
  validateDecisionBundle,
} from "../plugins/arc-cyber-decision-engine/runtime/engine.mjs";

function assertUniqueIds(items, label) {
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, `${label} contains a duplicate id`);
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0), `${label} contains an invalid id`);
}

function isPopulatedDetailValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

const specialistScenarioIds = [
  "salesforce-connected-app-exfiltration",
  "snowflake-key-exfiltration",
  "workday-payroll-routing-change",
  "kubernetes-service-account-abuse",
  "gcp-bigquery-key-leak",
  "slack-token-compromise",
];

test("catalog contains eleven deterministic, explicitly synthetic product scenarios", () => {
  const catalog = listScenarios();
  assert.ok(catalog.length >= 11, "the showcase must expose at least eleven scenarios");
  assert.equal(new Set(catalog.map((scenario) => scenario.id)).size, catalog.length);
  assert.ok(catalog.every((scenario) => scenario.synthetic === true));
  assert.ok(catalog.every((scenario) => scenario.products.length >= 4));
  assert.ok(catalog.every((scenario) => scenario.story.alertLabel.length > 0));
  assert.ok(catalog.every((scenario) => scenario.story.businessAsset.length > 0));
  assert.ok(catalog.every((scenario) => scenario.defaultQuestion.endsWith("?")));

  assert.ok(catalog.some((scenario) => scenario.products.includes("Okta")));
  assert.ok(catalog.some((scenario) => scenario.products.includes("GitHub Actions")));
  assert.ok(catalog.some((scenario) => scenario.products.includes("CrowdStrike Falcon")));
  assert.ok(catalog.some((scenario) => scenario.products.includes("Veeam Backup & Replication")));
  assert.ok(catalog.some((scenario) => scenario.products.includes("Salesforce Sales Cloud")));
  assert.ok(catalog.some((scenario) => scenario.products.includes("Snowflake")));
  assert.ok(catalog.some((scenario) => scenario.products.includes("Workday")));
  assert.ok(catalog.some((scenario) => scenario.products.includes("Amazon EKS")));
  assert.ok(catalog.some((scenario) => scenario.products.includes("Google BigQuery")));
  assert.ok(catalog.some((scenario) => scenario.products.includes("Slack Enterprise Grid")));
});

test("every catalog scenario runs end to end and matches its deterministic oracle", () => {
  for (const catalogEntry of listScenarios()) {
    const bundle = runArcScenario({ scenarioId: catalogEntry.id });
    const validation = validateDecisionBundle(bundle);

    assert.equal(validation.valid, true, `${catalogEntry.id}: ${validation.errors.join("; ")}`);
    assert.equal(bundle.graph.pathCount, catalogEntry.expectedPathCount, `${catalogEntry.id}: path-count drift`);
    assert.equal(bundle.recommendation.id, catalogEntry.recommendedActionId, `${catalogEntry.id}: recommendation drift`);
    assert.equal(bundle.actions[0].id, catalogEntry.recommendedActionId, `${catalogEntry.id}: rank-one drift`);
    assert.equal(bundle.run.scenarioId, catalogEntry.id);
    assert.equal(bundle.run.synthetic, true);
    assert.equal(bundle.layers.evidence.provenance.classification, "synthetic-fixture");
    assert.equal(bundle.layers.receipt.provenance.externalActions, false);
  }
});

test("scenario fixtures have unique graph and evidence identities with synthetic provenance", () => {
  for (const catalogEntry of listScenarios()) {
    const scenario = getScenario(catalogEntry.id);
    const bundle = runArcScenario({ scenarioId: catalogEntry.id });

    assertUniqueIds(scenario.evidence, `${scenario.id} evidence`);
    assertUniqueIds(scenario.claims, `${scenario.id} claims`);
    assertUniqueIds(scenario.ontologyNodes, `${scenario.id} ontology nodes`);
    assertUniqueIds(scenario.graphEdges, `${scenario.id} graph edges`);
    assertUniqueIds(scenario.actions, `${scenario.id} actions`);
    assertUniqueIds(bundle.graph.paths, `${scenario.id} paths`);
    assertUniqueIds(bundle.agents, `${scenario.id} agents`);

    assert.ok(scenario.evidence.every((item) => item.synthetic === true), `${scenario.id}: non-synthetic evidence`);
    assert.ok(scenario.evidence.every((item) => item.source.startsWith("Synthetic ")), `${scenario.id}: source is not labeled synthetic`);
    assert.ok(scenario.actions.every((action) => /simulat/i.test(action.simulation.summary)), `${scenario.id}: action is not labeled as simulation`);
    assert.ok(bundle.evidence.every((item) => item.synthetic === true), `${scenario.id}: bundle lost synthetic provenance`);
  }
});

test("new product scenarios provide generic intent, uncertainty, and eight cited agent packets", () => {
  const ids = [
    "okta-aws-session-hijack",
    "github-actions-secret-theft",
    "ransomware-backup-threat",
    ...specialistScenarioIds,
  ];
  const expectedAgents = new Set(["Attack", "Identity", "Cloud", "Network", "GRC", "Threat", "Business", "Compliance"]);

  for (const id of ids) {
    const scenario = getScenario(id);
    const evidenceIds = new Set(scenario.evidence.map((item) => item.id));
    const actionIds = new Set(scenario.actions.map((action) => action.id));

    assert.ok(scenario.intent.objectives.length >= 3);
    assert.ok(scenario.intent.constraints.some((constraint) => /synthetic/i.test(constraint)));
    assert.ok(scenario.uncertainty.length > 0);
    assert.equal(scenario.agentPackets.length, 8);
    assert.deepEqual(new Set(scenario.agentPackets.map((packet) => packet.name)), expectedAgents);
    for (const packet of scenario.agentPackets) {
      assert.ok(packet.evidenceIds.length > 0);
      assert.ok(packet.evidenceIds.every((evidenceId) => evidenceIds.has(evidenceId)));
      assert.ok(actionIds.has(packet.vote));
    }
  }
});

test("every showcase scenario contains substantive, realistic-looking synthetic telemetry", () => {
  for (const catalogEntry of listScenarios()) {
    const scenario = getScenario(catalogEntry.id);

    assert.ok(scenario.evidence.length >= 8, `${scenario.id}: expected at least eight evidence records`);
    assert.ok(
      new Set(scenario.evidence.map((item) => item.source)).size >= 4,
      `${scenario.id}: expected diverse product evidence`,
    );
    for (const evidence of scenario.evidence) {
      assert.equal(evidence.synthetic, true, `${scenario.id}/${evidence.id}: evidence must remain synthetic`);
      assert.ok(
        evidence.source.startsWith("Synthetic "),
        `${scenario.id}/${evidence.id}: source must be explicitly labeled synthetic`,
      );
      assert.ok(
        evidence.details && typeof evidence.details === "object" && !Array.isArray(evidence.details),
        `${scenario.id}/${evidence.id}: details must be a non-array object`,
      );
      assert.ok(
        Object.values(evidence.details).filter(isPopulatedDetailValue).length >= 4,
        `${scenario.id}/${evidence.id}: details must contain at least four populated entries`,
      );
      assert.ok(
        Object.keys(evidence.details).length <= 12,
        `${scenario.id}/${evidence.id}: details must stay display-bounded`,
      );
      const freshness = (Date.parse(evidence.collectedAt) - Date.parse(evidence.observedAt)) / 60_000;
      assert.ok(Number.isFinite(freshness), `${scenario.id}/${evidence.id}: evidence timestamps must be valid`);
      assert.ok(
        Math.abs(freshness - evidence.freshnessMinutes) <= 0.051,
        `${scenario.id}/${evidence.id}: freshness must agree with collection time`,
      );
    }
  }
});

test("every decision path and mitigation preserves graph continuity", () => {
  for (const catalogEntry of listScenarios()) {
    const scenario = getScenario(catalogEntry.id);
    const bundle = runArcScenario({ scenarioId: catalogEntry.id });
    const nodeIds = new Set(bundle.graph.nodes.map((node) => node.id));
    const edges = new Map(bundle.graph.edges.map((edge) => [edge.id, edge]));

    for (const path of bundle.graph.paths) {
      assert.ok(scenario.sourceNodeIds.includes(path.nodeIds[0]), `${scenario.id}/${path.id}: path must begin at a source`);
      assert.ok(scenario.targetNodeIds.includes(path.nodeIds.at(-1)), `${scenario.id}/${path.id}: path must end at a target`);
      assert.equal(path.edgeIds.length, path.nodeIds.length - 1, `${scenario.id}/${path.id}: edge/node mismatch`);
      path.edgeIds.forEach((edgeId, index) => {
        const edge = edges.get(edgeId);
        assert.ok(edge, `${scenario.id}/${path.id}: missing edge ${edgeId}`);
        assert.equal(edge.from, path.nodeIds[index], `${scenario.id}/${path.id}: discontinuous edge source`);
        assert.equal(edge.to, path.nodeIds[index + 1], `${scenario.id}/${path.id}: discontinuous edge target`);
      });
    }

    const reachedTargets = new Set(bundle.graph.paths.map((path) => path.nodeIds.at(-1)));
    assert.ok(scenario.targetNodeIds.every((id) => reachedTargets.has(id)), `${scenario.id}: every target must be reachable`);
    for (const action of scenario.actions) {
      if (action.mitigatesNodeIds.length === 0) {
        const rankedAction = bundle.actions.find((item) => item.id === action.id);
        assert.equal(rankedAction.coveredPathIds.length, 0, `${scenario.id}/${action.id}: empty mitigation must not claim path coverage`);
        assert.equal(action.category, "observe", `${scenario.id}/${action.id}: containment action needs a causal choke point`);
        continue;
      }
      assert.ok(action.mitigatesNodeIds.every((id) => nodeIds.has(id)), `${scenario.id}/${action.id}: unknown mitigation node`);
    }
  }
});

test("GRC and threat-intelligence connector records are substantive and cited", () => {
  const githubScenario = getScenario("github-actions-secret-theft");
  const grcEvidence = githubScenario.evidence.find((item) => item.id === "E-GH-010");
  const { details: grcDetails, ...grcEvidenceCore } = grcEvidence;
  assert.deepEqual(grcEvidenceCore, {
    id: "E-GH-010",
    type: "governance-release-control",
    source: "Synthetic GRC release-control register",
    summary: "The production release control requires protected-branch review for workflow changes and incident-commander authorization for emergency suspension of a release credential or workflow, with the decision retained in the change record.",
    observedAt: "2026-07-18T10:00:00.000Z",
    collectedAt: "2026-07-18T10:19:00.000Z",
    freshnessMinutes: 19,
    reliability: 0.97,
    status: "observed",
    synthetic: true,
  });
  assert.ok(Object.keys(grcDetails).length >= 4);
  assert.deepEqual(
    githubScenario.claims.find((claim) => claim.id === "C-GH-009")?.evidenceIds,
    ["E-GH-010"],
  );
  assert.ok(
    githubScenario.agentPackets.find((packet) => packet.name === "GRC")?.evidenceIds.includes("E-GH-010"),
  );

  const ransomwareScenario = getScenario("ransomware-backup-threat");
  const threatEvidence = ransomwareScenario.evidence.find((item) => item.id === "E-RW-011");
  const { details: threatDetails, ...threatEvidenceCore } = threatEvidence;
  assert.deepEqual(threatEvidenceCore, {
    id: "E-RW-011",
    type: "threat-intelligence-correlation",
    source: "Synthetic ransomware threat-intelligence feed",
    summary: "The prevented binary's behavior profile—credential dumping followed by backup administration—matches a tracked ransomware campaign that targets recovery systems before broader encryption.",
    observedAt: "2026-07-18T11:24:00.000Z",
    collectedAt: "2026-07-18T11:27:00.000Z",
    freshnessMinutes: 3,
    reliability: 0.94,
    status: "observed",
    synthetic: true,
  });
  assert.ok(Object.keys(threatDetails).length >= 4);
  assert.deepEqual(
    ransomwareScenario.claims.find((claim) => claim.id === "C-RW-010")?.evidenceIds,
    ["E-RW-002", "E-RW-006", "E-RW-011"],
  );
  assert.ok(
    ransomwareScenario.agentPackets.find((packet) => packet.name === "Threat")?.evidenceIds.includes("E-RW-011"),
  );
});
