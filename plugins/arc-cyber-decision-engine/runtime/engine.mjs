import { scenarios } from "../scenarios/index.mjs";

export const ENGINE_VERSION = "0.2.0";
export const SCHEMA_VERSION = "arc.decision-bundle.v1";

const LAYER_NAMES = [
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

const AGENT_NAMES = ["Attack", "Identity", "Cloud", "Network", "GRC", "Threat", "Business", "Compliance"];

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}

function stableStringify(value, spacing = 0) {
  return JSON.stringify(sortKeys(value), null, spacing);
}

function stableHash(value) {
  const input = typeof value === "string" ? value : stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function unique(values) {
  return [...new Set(values)];
}

function scoreBand(score) {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "moderate";
  return "low";
}

function confidenceBand(score) {
  if (score >= 90) return "very-high";
  if (score >= 75) return "high";
  if (score >= 55) return "moderate";
  return "low";
}

function getScenarioRecord(scenarioId) {
  return scenarios.find((scenario) => scenario.id === scenarioId) ?? null;
}

function scenarioStory(scenario) {
  if (scenario.story && typeof scenario.story === "object" && !Array.isArray(scenario.story)) {
    return deepClone(scenario.story);
  }
  return {
    alertLabel: scenario.title,
    businessAsset: "Business operations",
    pivotalFact: scenario.summary,
    family: "Synthetic cyber incident",
  };
}

export function listScenarios() {
  return scenarios.map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    summary: scenario.summary,
    asOf: scenario.asOf,
    variantOf: scenario.variantOf,
    synthetic: scenario.synthetic,
    expectedPathCount: scenario.expectedPathCount,
    recommendedActionId: scenario.recommendedActionId,
    tags: [...scenario.tags],
    products: [...(scenario.products ?? [])],
    story: scenarioStory(scenario),
    defaultQuestion: scenario.defaultQuestion,
  }));
}

export function getScenario(scenarioId) {
  const scenario = getScenarioRecord(scenarioId);
  return scenario ? deepClone(scenario) : null;
}

function buildIntent(scenario, question) {
  const endpointConfirmed = scenario.id.includes("endpoint-malware");
  const supplied = scenario.intent ?? {};
  return {
    id: `INTENT-${stableHash({ scenarioId: scenario.id, question })}`,
    question,
    type: supplied.type ?? "containment-decision",
    objectives: deepClone(supplied.objectives ?? [
      "Interrupt confirmed attacker-to-business paths",
      "Minimize avoidable business disruption",
      "Preserve a reversible, approval-gated response",
    ]),
    constraints: deepClone(supplied.constraints ?? [
      "Use only evidence present in the synthetic fixture",
      "Treat action execution as simulation",
      "Do not infer endpoint compromise without endpoint evidence",
    ]),
    hypotheses: deepClone(supplied.hypotheses ?? (endpointConfirmed
      ? ["Cloud identity access is compromised", "Endpoint compromise creates a re-entry path"]
      : ["Cloud identity access is compromised", "Endpoint compromise is not established"])),
    requestedAudience: deepClone(supplied.requestedAudience ?? ["SOC", "CISO", "Executive"]),
  };
}

function buildPlan(scenario, intent) {
  return {
    id: `PLAN-${stableHash({ scenarioId: scenario.id, intentId: intent.id })}`,
    strategy: "evidence-first-deterministic-decision",
    steps: [
      "Normalize synthetic source observations",
      "Separate observed, derived, and hypothesis claims",
      "Build the typed security ontology",
      "Enumerate attacker-to-business graph paths",
      "Prepare eight specialist assessment packets",
      "Reduce the deterministic debate",
      "Rank approval-gated actions using the published formula",
      "Issue an evidence receipt and role-specific projections",
      "Prepare a simulated action and memory record",
    ],
    evidenceSourceTypes: unique(scenario.evidence.map((item) => item.type)).sort(),
    requiredClaimClasses: ["observed", "derived", "hypothesis"],
    agentNames: [...AGENT_NAMES],
    scoringPolicy: "ARES action score v1",
  };
}

function buildEvidenceLayer(scenario) {
  const items = deepClone(scenario.evidence);
  return {
    items,
    synthetic: true,
    sourceCount: unique(items.map((item) => item.source)).length,
    observedCount: items.filter((item) => item.status === "observed").length,
    negativeCount: items.filter((item) => item.status === "negative").length,
    provenance: {
      classification: "synthetic-fixture",
      customerData: false,
      networkCalls: false,
      note: "All values are deterministic hackathon demonstration data.",
    },
  };
}

function buildConfidence(scenario) {
  const freshness = scenario.evidence.reduce(
    (sum, evidence) => sum + clamp(1 - evidence.freshnessMinutes / 120),
    0,
  ) / scenario.evidence.length;
  const reliability = scenario.evidence.reduce((sum, evidence) => sum + evidence.reliability, 0) / scenario.evidence.length;
  const components = {
    completeness: round(scenario.confidenceInputs.completeness, 4),
    corroboration: round(scenario.confidenceInputs.corroboration, 4),
    freshness: round(freshness, 4),
    reliability: round(reliability, 4),
    conflictPenalty: round(scenario.confidenceInputs.conflictPenalty, 4),
  };
  const normalized =
    0.3 * components.completeness
    + 0.25 * components.corroboration
    + 0.2 * components.freshness
    + 0.25 * components.reliability
    - 0.15 * components.conflictPenalty;
  const score = round(clamp(normalized) * 100, 2);
  return {
    score,
    band: confidenceBand(score),
    formula: "100 × (0.30 completeness + 0.25 corroboration + 0.20 freshness + 0.25 reliability − 0.15 conflict penalty)",
    components,
    evidenceIds: scenario.evidence.map((item) => item.id),
  };
}

function buildContextFusion(scenario, confidence) {
  const claims = deepClone(scenario.claims);
  return {
    claims,
    claimCounts: {
      observed: claims.filter((claim) => claim.classification === "observed").length,
      derived: claims.filter((claim) => claim.classification === "derived").length,
      hypothesis: claims.filter((claim) => claim.classification === "hypothesis").length,
    },
    corroboratedClaimIds: claims.filter((claim) => claim.evidenceIds.length > 1).map((claim) => claim.id),
    conflicts: [],
    uncertainty: scenario.uncertainty ?? (scenario.id.includes("endpoint-malware")
      ? "Execution is confirmed; scope beyond the observed browser profile remains unknown."
      : "Cloud compromise is confirmed; endpoint compromise is not established by the available snapshot."),
    confidence,
  };
}

function buildOntology(scenario) {
  const nodes = deepClone(scenario.ontologyNodes);
  const relationships = scenario.graphEdges.map((edge) => ({
    id: `R-${edge.id.slice(2)}`,
    from: edge.from,
    to: edge.to,
    type: edge.type,
    classification: edge.claimClass,
    evidenceIds: [...edge.evidenceIds],
  }));
  return {
    schema: "arc.security-ontology.v1",
    types: unique(nodes.map((node) => node.type)).sort(),
    nodes,
    relationships,
  };
}

function enumerateGraphPaths(nodes, edges, sourceNodeIds, targetNodeIds) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const targets = new Set(targetNodeIds);
  const adjacency = new Map();
  for (const edge of edges) {
    const outgoing = adjacency.get(edge.from) ?? [];
    outgoing.push(edge);
    adjacency.set(edge.from, outgoing);
  }
  for (const outgoing of adjacency.values()) outgoing.sort((left, right) => left.id.localeCompare(right.id));

  const rawPaths = [];
  function visit(nodeId, nodeIds, edgeIds) {
    if (targets.has(nodeId)) {
      rawPaths.push({ nodeIds: [...nodeIds], edgeIds: [...edgeIds] });
      return;
    }
    for (const edge of adjacency.get(nodeId) ?? []) {
      if (nodeIds.includes(edge.to)) continue;
      visit(edge.to, [...nodeIds, edge.to], [...edgeIds, edge.id]);
    }
  }
  for (const sourceNodeId of sourceNodeIds) visit(sourceNodeId, [sourceNodeId], []);

  const edgeMap = new Map(edges.map((edge) => [edge.id, edge]));
  return rawPaths.map((path, index) => {
    const pathEdges = path.edgeIds.map((id) => edgeMap.get(id));
    const evidenceIds = unique([
      ...path.nodeIds.flatMap((id) => nodeMap.get(id)?.evidenceIds ?? []),
      ...pathEdges.flatMap((edge) => edge.evidenceIds),
    ]).sort();
    const classification = pathEdges.some((edge) => edge.claimClass === "hypothesis") ? "hypothesis" : "derived";
    return {
      id: `P-${String(index + 1).padStart(3, "0")}`,
      nodeIds: path.nodeIds,
      edgeIds: path.edgeIds,
      evidenceIds,
      classification,
      label: path.nodeIds.map((id) => nodeMap.get(id)?.label ?? id).join(" → "),
      state: "open",
    };
  });
}

function buildDecisionGraph(scenario, ontology) {
  const nodes = deepClone(ontology.nodes);
  const edges = deepClone(scenario.graphEdges);
  const paths = enumerateGraphPaths(nodes, edges, scenario.sourceNodeIds, scenario.targetNodeIds);
  return {
    schema: "arc.decision-graph.v1",
    nodes,
    edges,
    sourceNodeIds: [...scenario.sourceNodeIds],
    targetNodeIds: [...scenario.targetNodeIds],
    paths,
    pathCount: paths.length,
    simulation: null,
    enumeration: {
      algorithm: "deterministic-depth-first-simple-paths",
      direction: "source-to-target",
      cyclePolicy: "reject-repeated-node",
      sortedBy: "edge-id",
    },
  };
}

function buildRisk(scenario) {
  const weights = { likelihood: 30, reachability: 30, criticality: 25, controlWeakness: 15 };
  const components = Object.fromEntries(
    Object.entries(weights).map(([name, weight]) => {
      const input = scenario.riskInputs[name];
      return [name, {
        value: round(input.value, 4),
        points: round(input.value * weight, 2),
        evidenceIds: [...input.evidenceIds],
      }];
    }),
  );
  const score = round(Object.values(components).reduce((sum, component) => sum + component.points, 0), 2);
  return {
    score,
    band: scoreBand(score),
    formula: "30 likelihood + 30 reachability + 25 criticality + 15 control weakness",
    components,
  };
}

function evidenceStrength(action, evidenceById) {
  if (action.evidenceIds.length === 0) return 0;
  const total = action.evidenceIds.reduce((sum, id) => {
    const evidence = evidenceById.get(id);
    if (!evidence) return sum;
    const polarityFactor = evidence.status === "negative" ? 0.35 : 1;
    return sum + evidence.reliability * polarityFactor;
  }, 0);
  return round(clamp(total / action.evidenceIds.length), 4);
}

function rankActions(scenario, graph) {
  const evidenceById = new Map(scenario.evidence.map((evidence) => [evidence.id, evidence]));
  const scored = scenario.actions.map((action) => {
    const coveredPaths = graph.paths.filter((path) =>
      action.mitigatesNodeIds.some((nodeId) => path.nodeIds.includes(nodeId)),
    );
    const components = {
      pathCoverage: graph.pathCount === 0 ? 0 : round(coveredPaths.length / graph.pathCount, 4),
      inverseDisruption: round(1 - action.disruption, 4),
      urgency: round(action.urgency, 4),
      reversibility: round(action.reversibility, 4),
      evidenceStrength: evidenceStrength(action, evidenceById),
    };
    const weighted = {
      pathCoverage: round(components.pathCoverage * 40, 2),
      inverseDisruption: round(components.inverseDisruption * 25, 2),
      urgency: round(components.urgency * 15, 2),
      reversibility: round(components.reversibility * 10, 2),
      evidenceStrength: round(components.evidenceStrength * 10, 2),
    };
    const score = round(Object.values(weighted).reduce((sum, value) => sum + value, 0), 2);
    return {
      id: action.id,
      title: action.title,
      description: action.description,
      category: action.category,
      score,
      rank: 0,
      decision: "defer",
      status: "proposed",
      requiresApproval: action.requiresApproval,
      approvalRole: action.approvalRole,
      components,
      weighted,
      coveredPathIds: coveredPaths.map((path) => path.id),
      mitigatesNodeIds: [...action.mitigatesNodeIds],
      evidenceIds: [...action.evidenceIds],
      tradeoffs: [...action.tradeoffs],
      simulation: deepClone(action.simulation),
    };
  });
  scored.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return scored.map((action, index) => ({
    ...action,
    rank: index + 1,
    decision: index === 0 ? "recommend" : index === 1 ? "alternate" : "defer",
  }));
}

function claimIdsFor(scenario, classification) {
  return scenario.claims.filter((claim) => claim.classification === classification).map((claim) => claim.id);
}

function makeFinding(id, text, evidenceIds, claimIds) {
  return { id, text, evidenceIds, claimIds };
}

function buildAgents(scenario, risk, confidence, graph) {
  const malware = scenario.id.includes("endpoint-malware");
  const observedClaims = claimIdsFor(scenario, "observed");
  const derivedClaims = claimIdsFor(scenario, "derived");
  const hypothesisClaims = claimIdsFor(scenario, "hypothesis");
  const preferredActionId = scenario.recommendedActionId;
  const definitions = scenario.agentPackets ?? [
    {
      name: "Attack",
      role: "Enumerate attacker goals, pivots, and choke points",
      evidenceIds: malware ? ["E-001", "E-002", "E-003", "E-101", "E-102"] : ["E-001", "E-002", "E-003", "E-004"],
      headline: malware ? "Cloud and endpoint paths converge on the active session" : "The malicious grant is the common choke point",
      finding: `${graph.pathCount} deterministic attacker-to-business paths are enumerated.`,
      vote: preferredActionId,
    },
    {
      name: "Identity",
      role: "Assess identities, grants, sessions, and privilege",
      evidenceIds: ["E-002", "E-003", "E-007"],
      headline: "Delegated access is active even without an administrator role",
      finding: "The grant and session establish an identity control-plane containment point.",
      vote: preferredActionId,
    },
    {
      name: "Cloud",
      role: "Assess SaaS resources, data access, and cloud controls",
      evidenceIds: ["E-003", "E-004", "E-005"],
      headline: "Mail and finance files are inside the reachable cloud scope",
      finding: "Observed mailbox and SharePoint activity corroborate cloud resource exposure.",
      vote: malware ? "A-IDENTITY-CONTAIN" : preferredActionId,
    },
    {
      name: "Network",
      role: "Assess network telemetry and isolation value",
      evidenceIds: malware ? ["E-101", "E-102", "E-104"] : ["E-006"],
      headline: malware ? "Command traffic makes endpoint isolation evidence-supported" : "Current network evidence does not justify endpoint isolation",
      finding: malware ? "Endpoint egress and cookie access create a distinct containment path." : "Contain the confirmed cloud access and continue endpoint validation without isolating the workstation on negative evidence alone.",
      vote: malware ? "A-ENDPOINT-ISOLATE" : preferredActionId,
    },
    {
      name: "GRC",
      role: "Map control obligations, approvals, and auditability",
      evidenceIds: malware ? ["E-002", "E-004", "E-101"] : ["E-002", "E-004", "E-006"],
      headline: "Containment must be approval-gated and receipt-backed",
      finding: "The evidence supports a reversible simulated action with an explicit approver role.",
      vote: preferredActionId,
    },
    {
      name: "Threat",
      role: "Interpret adversary technique and likely next move",
      evidenceIds: malware ? ["E-001", "E-002", "E-101", "E-102", "E-103"] : ["E-001", "E-002", "E-004"],
      headline: malware ? "Credential theft can recreate cloud access after token revocation" : "OAuth persistence favors rapid grant revocation",
      finding: malware ? "Browser-cookie access supplies a re-entry mechanism." : "Offline access and mail forwarding extend cloud persistence.",
      vote: preferredActionId,
    },
    {
      name: "Business",
      role: "Balance cyber risk against operational disruption",
      evidenceIds: malware ? ["E-005", "E-008", "E-101"] : ["E-005", "E-006", "E-008"],
      headline: malware ? "Combined containment is justified despite payroll disruption" : "Identity containment preserves the clean workstation for recovery",
      finding: malware ? "The endpoint is both a threat path and a payroll dependency." : "Avoidable endpoint isolation would interrupt same-day payroll work.",
      vote: preferredActionId,
    },
    {
      name: "Compliance",
      role: "Assess data exposure and evidence preservation",
      evidenceIds: malware ? ["E-004", "E-005", "E-101", "E-102"] : ["E-004", "E-005", "E-007"],
      headline: "Finance mail and files require preserved audit evidence",
      finding: "The observed finance-data access supports retaining identity, mail, cloud, and endpoint records.",
      vote: preferredActionId,
    },
  ];

  return definitions.map((definition, index) => ({
    id: `AGENT-${definition.name.toUpperCase()}`,
    name: definition.name,
    role: definition.role,
    status: "structured-input-ready",
    assessment: {
      headline: definition.headline,
      severity: risk.band,
      confidence: confidence.score,
      evidenceIds: [...definition.evidenceIds],
      claimIds: unique([...observedClaims.slice(0, 2), ...derivedClaims.slice(0, 1), ...hypothesisClaims.slice(0, 1)]),
      findings: [
        makeFinding(
          `F-${String(index + 1).padStart(2, "0")}`,
          definition.finding,
          [...definition.evidenceIds],
          unique([...derivedClaims.slice(0, 1), ...hypothesisClaims.slice(0, 1)]),
        ),
      ],
      recommendation: {
        text: `Support ${definition.vote} based on this specialist scope.`,
        actionIds: [definition.vote],
        evidenceIds: [...definition.evidenceIds],
      },
    },
    vote: {
      actionId: definition.vote,
      weight: definition.weight ?? (definition.name === "Business" || definition.name === "Attack" ? 1.25 : 1),
      evidenceIds: [...definition.evidenceIds],
    },
    hostNarrative: {
      status: "not-generated",
      hostGenerated: false,
      requiredModel: "GPT-5.6",
      instruction: "The Codex host may turn this cited packet into narrative; it must not change deterministic facts or scores.",
      text: null,
    },
  }));
}

function buildDebate(scenario, agents, actions) {
  const voteTotals = new Map(actions.map((action) => [action.id, 0]));
  for (const agent of agents) voteTotals.set(agent.vote.actionId, (voteTotals.get(agent.vote.actionId) ?? 0) + agent.vote.weight);
  const tally = [...voteTotals.entries()]
    .map(([actionId, weight]) => ({ actionId, weight: round(weight, 2) }))
    .sort((left, right) => right.weight - left.weight || left.actionId.localeCompare(right.actionId));
  const topRankedActionId = actions[0].id;
  const reducerActionId = tally[0].actionId;
  const finalActionId = topRankedActionId;
  const supportingAgents = agents.filter((agent) => agent.vote.actionId === finalActionId);
  const opposingAgents = agents.filter((agent) => agent.vote.actionId !== finalActionId);
  return {
    method: "weighted-specialist-vote-then-deterministic-score-guardrail",
    positions: agents.map((agent) => ({
      agentId: agent.id,
      actionId: agent.vote.actionId,
      stance: agent.vote.actionId === finalActionId ? "support" : "challenge",
      argument: agent.assessment.headline,
      weight: agent.vote.weight,
      evidenceIds: [...agent.vote.evidenceIds],
    })),
    tally,
    conflict: opposingAgents.length === 0
      ? null
      : {
          summary: `${opposingAgents.map((agent) => agent.name).join(" and ")} preferred a narrower alternative.`,
          agentIds: opposingAgents.map((agent) => agent.id),
          evidenceIds: unique(opposingAgents.flatMap((agent) => agent.vote.evidenceIds)).sort(),
        },
    consensus: {
      actionId: finalActionId,
      reducerActionId,
      supportingAgentIds: supportingAgents.map((agent) => agent.id),
      evidenceIds: unique(supportingAgents.flatMap((agent) => agent.vote.evidenceIds)).sort(),
      rule: "The published deterministic action score is authoritative if the vote and score differ.",
    },
    hostNarrative: {
      status: "not-generated",
      hostGenerated: false,
      requiredModel: "GPT-5.6",
      inputs: { scenarioId: scenario.id, agentPacketIds: agents.map((agent) => agent.id) },
      text: null,
    },
  };
}

function recommendationRationale(action, graph) {
  const coverage = `${action.coveredPathIds.length}/${graph.pathCount}`;
  return `${action.title} ranks first at ${action.score}/100 because it interrupts ${coverage} enumerated paths while accounting for disruption, urgency, reversibility, and evidence strength.`;
}

function buildProjections(scenario, risk, confidence, graph, recommendation) {
  const commonEvidenceIds = unique(recommendation.evidenceIds).sort();
  const context = scenario.projectionContext ?? {};
  const targetLabels = graph.nodes
    .filter((node) => graph.targetNodeIds.includes(node.id))
    .map((node) => node.label);
  const allEvidenceIds = scenario.evidence.map((item) => item.id);
  return {
    soc: {
      audience: "SOC",
      headline: recommendation.title,
      summary: context.socSummary ?? `Simulate ${recommendation.category} after ${graph.pathCount} paths were deterministically enumerated.`,
      evidenceIds: commonEvidenceIds,
      actions: [
        { id: "SOC-1", text: "Request the required approval.", actionId: recommendation.id, priority: "now", evidenceIds: commonEvidenceIds },
        { id: "SOC-2", text: context.preservationText ?? "Preserve the cited source telemetry and decision receipt.", actionId: recommendation.id, priority: "now", evidenceIds: allEvidenceIds },
        { id: "SOC-3", text: "Verify expected signals after the simulated action.", actionId: recommendation.id, priority: "next", evidenceIds: commonEvidenceIds },
      ],
      metrics: [
        { label: "Path coverage", value: `${recommendation.coveredPathIds.length}/${graph.pathCount}` },
        { label: "Decision confidence", value: `${confidence.score}%` },
      ],
    },
    ciso: {
      audience: "CISO",
      headline: `${risk.band} risk; ${recommendation.category} recommended`,
      summary: context.cisoSummary ?? scenario.summary,
      evidenceIds: deepClone(context.cisoEvidenceIds ?? commonEvidenceIds),
      actions: [
        { id: "CISO-1", text: `Authorize ${recommendation.title.toLowerCase()}.`, actionId: recommendation.id, priority: "now", evidenceIds: commonEvidenceIds },
      ],
      metrics: [
        { label: "Risk", value: `${risk.score}/100` },
        { label: "Action score", value: `${recommendation.score}/100` },
      ],
    },
    executive: {
      audience: "Executive",
      headline: context.executiveHeadline ?? "Evidence-backed containment decision ready",
      summary: context.executiveSummary ?? "ARES recommends a reversible, approval-gated response; all evidence is synthetic and no production action has run.",
      evidenceIds: deepClone(context.executiveEvidenceIds ?? commonEvidenceIds),
      actions: [
        { id: "EXEC-1", text: context.executiveActionText ?? "Track simulated containment verification and business continuity.", actionId: recommendation.id, priority: "next", evidenceIds: commonEvidenceIds },
      ],
      metrics: [
        { label: "Business assets at risk", value: context.businessProcesses ?? targetLabels.join(", ") },
        { label: "Production changes", value: "None — simulation only" },
      ],
    },
  };
}

function normalizePriorMemory(priorMemory) {
  if (!priorMemory) return [];
  if (Array.isArray(priorMemory)) return deepClone(priorMemory);
  if (Array.isArray(priorMemory.records)) return deepClone(priorMemory.records);
  return [deepClone(priorMemory)];
}

function buildApproval(recommendation, at) {
  return {
    state: recommendation.requiresApproval ? "pending" : "not-required",
    required: recommendation.requiresApproval,
    actionId: recommendation.id,
    role: recommendation.approvalRole,
    approvedBy: null,
    note: null,
    events: [
      {
        id: `APPROVAL-REQUEST-${recommendation.id}`,
        type: recommendation.requiresApproval ? "approval-requested" : "approval-not-required",
        at,
        actionId: recommendation.id,
        actor: "ARES deterministic engine",
        synthetic: true,
      },
    ],
  };
}

function buildMemory(scenario, runId, recommendation, priorMemory) {
  return {
    priorRecordsUsed: priorMemory.map((record, index) => record.id ?? `prior-${index + 1}`),
    record: {
      id: `MEM-${stableHash({ runId, recommendationId: recommendation.id })}`,
      runId,
      scenarioId: scenario.id,
      recommendedActionId: recommendation.id,
      selectedActionId: null,
      outcome: null,
      status: "proposed",
      createdAt: scenario.asOf,
      evidenceIds: [...recommendation.evidenceIds],
    },
    trace: [
      {
        id: `MEMORY-PROPOSE-${runId}`,
        type: "record-proposed",
        at: scenario.asOf,
        synthetic: true,
      },
    ],
  };
}

function buildReceipt(scenario, run, risk, confidence, graph, actions, claims) {
  const payload = {
    runId: run.id,
    scenarioId: scenario.id,
    evidenceIds: scenario.evidence.map((item) => item.id),
    claimIds: claims.map((claim) => claim.id),
    actionScores: actions.map((action) => [action.id, action.score]),
    pathIds: graph.paths.map((path) => path.id),
  };
  return {
    id: `RECEIPT-${stableHash(payload)}`,
    engine: { name: "ARES deterministic engine", version: ENGINE_VERSION },
    generatedAt: run.generatedAt,
    runId: run.id,
    scenarioId: scenario.id,
    checksum: stableHash(payload),
    evidenceIds: payload.evidenceIds,
    claimIds: payload.claimIds,
    actionIds: actions.map((action) => action.id),
    graphPathIds: payload.pathIds,
    formulas: {
      risk: "30 likelihood + 30 reachability + 25 criticality + 15 control weakness",
      confidence: "100 × (0.30 completeness + 0.25 corroboration + 0.20 freshness + 0.25 reliability − 0.15 conflict penalty)",
      action: "40 path coverage + 25 inverse disruption + 15 urgency + 10 reversibility + 10 evidence strength",
    },
    provenance: {
      classification: "synthetic-fixture",
      modelCalls: false,
      hostNarrativesGenerated: false,
      externalActions: false,
      note: "The deterministic engine prepares cited GPT-5.6 host inputs but does not call a model.",
    },
  };
}

function makeTrace(layers) {
  const summaries = {
    intent: "Decision question and constraints classified.",
    plan: "Evidence-first execution plan produced.",
    evidence: `${layers.evidence.items.length} synthetic evidence items normalized.`,
    contextFusion: `${layers.contextFusion.claims.length} cited claims fused without silent fact promotion.`,
    ontology: `${layers.ontology.nodes.length} typed entities and ${layers.ontology.relationships.length} relationships created.`,
    decisionGraph: `${layers.decisionGraph.pathCount} source-to-target paths enumerated.`,
    agents: `${layers.agents.length} distinct specialist packets prepared for optional GPT-5.6 host narrative.`,
    debate: `Debate reducer selected ${layers.debate.consensus.actionId}.`,
    ranking: `${layers.ranking.actions.length} actions ranked with the published deterministic formula.`,
    receipt: `Evidence receipt ${layers.receipt.id} issued.`,
    projections: "SOC, CISO, and Executive views projected from one decision bundle.",
    executionMemory: `Approval is ${layers.executionMemory.approval.state}; a synthetic memory record is prepared.`,
  };
  return LAYER_NAMES.map((layer, index) => ({
    index: index + 1,
    layer,
    status: "completed",
    inputRefs: index === 0 ? ["scenario"] : [LAYER_NAMES[index - 1]],
    outputRefs: [layer],
    summary: summaries[layer],
  }));
}

export function runArcScenario({ scenarioId, question, priorMemory } = {}) {
  if (typeof scenarioId !== "string" || scenarioId.length === 0) {
    throw new TypeError("scenarioId must be a non-empty string");
  }
  const scenario = getScenarioRecord(scenarioId);
  if (!scenario) throw new RangeError(`Unknown ARES scenario: ${scenarioId}`);
  const decisionQuestion = typeof question === "string" && question.trim() ? question.trim() : scenario.defaultQuestion;
  const normalizedMemory = normalizePriorMemory(priorMemory);
  const runId = `RUN-${stableHash({ scenarioId, question: decisionQuestion, priorMemory: normalizedMemory })}`;
  const run = {
    id: runId,
    engineVersion: ENGINE_VERSION,
    generatedAt: scenario.asOf,
    scenarioId: scenario.id,
    question: decisionQuestion,
    mode: "deterministic",
    synthetic: true,
  };

  const intent = buildIntent(scenario, decisionQuestion);
  const plan = buildPlan(scenario, intent);
  const evidenceLayer = buildEvidenceLayer(scenario);
  const confidence = buildConfidence(scenario);
  const contextFusion = buildContextFusion(scenario, confidence);
  const ontology = buildOntology(scenario);
  const decisionGraph = buildDecisionGraph(scenario, ontology);
  if (decisionGraph.pathCount !== scenario.expectedPathCount) {
    throw new Error(`Scenario ${scenario.id} expected ${scenario.expectedPathCount} paths but enumerated ${decisionGraph.pathCount}`);
  }
  const risk = buildRisk(scenario);
  const actions = rankActions(scenario, decisionGraph);
  const agents = buildAgents(scenario, risk, confidence, decisionGraph);
  const debate = buildDebate(scenario, agents, actions);
  const recommendation = {
    ...deepClone(actions[0]),
    rationale: recommendationRationale(actions[0], decisionGraph),
  };
  const projections = buildProjections(scenario, risk, confidence, decisionGraph, recommendation);
  const approval = buildApproval(recommendation, scenario.asOf);
  const memory = buildMemory(scenario, runId, recommendation, normalizedMemory);
  const receipt = buildReceipt(scenario, run, risk, confidence, decisionGraph, actions, contextFusion.claims);
  const ranking = {
    formula: "40 path coverage + 25 inverse disruption + 15 urgency + 10 reversibility + 10 evidence strength",
    tieBreaker: "lexicographic action id",
    recommendationId: recommendation.id,
    actions,
  };
  const executionMemory = { approval, memory };
  const layers = {
    intent,
    plan,
    evidence: evidenceLayer,
    contextFusion,
    ontology,
    decisionGraph,
    agents,
    debate,
    ranking,
    receipt,
    projections,
    executionMemory,
  };
  const trace = makeTrace(layers);

  const bundle = {
    schemaVersion: SCHEMA_VERSION,
    run,
    scenario: {
      id: scenario.id,
      title: scenario.title,
      summary: scenario.summary,
      story: scenarioStory(scenario),
      asOf: scenario.asOf,
      variantOf: scenario.variantOf,
      synthetic: scenario.synthetic,
      expectedPathCount: scenario.expectedPathCount,
      recommendedActionId: scenario.recommendedActionId,
      defaultQuestion: scenario.defaultQuestion,
      tags: [...scenario.tags],
      products: [...(scenario.products ?? [])],
    },
    risk,
    confidence,
    evidence: evidenceLayer.items,
    claims: contextFusion.claims,
    graph: decisionGraph,
    agents,
    actions,
    recommendation,
    debate,
    projections,
    approval,
    memory,
    layers,
    trace,
  };
  const validation = validateDecisionBundle(bundle);
  if (!validation.valid) throw new Error(`ARES produced an invalid decision bundle: ${validation.errors.join("; ")}`);
  return bundle;
}

export function runDeterministicPipeline(input = {}) {
  const overrides = input.overrides && typeof input.overrides === "object" ? input.overrides : {};
  return runArcScenario({
    scenarioId: input.scenarioId,
    question: input.question ?? overrides.question,
    priorMemory: input.priorMemory ?? overrides.priorMemory,
  });
}

function collectEvidenceIdProblems(value, validEvidenceIds, errors, path = "bundle") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectEvidenceIdProblems(item, validEvidenceIds, errors, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${key}`;
    if (key === "evidenceIds") {
      if (!Array.isArray(item) || item.length === 0) {
        errors.push(`${itemPath} must be a non-empty array`);
      } else {
        for (const evidenceId of item) {
          if (!validEvidenceIds.has(evidenceId)) errors.push(`${itemPath} references unknown evidence ${evidenceId}`);
        }
      }
    } else {
      collectEvidenceIdProblems(item, validEvidenceIds, errors, itemPath);
    }
  }
}

function collectNumericHostFields(value, errors, path = "bundle.hostAnalysis") {
  if (typeof value === "number") {
    errors.push(`${path} must not contain numeric values; deterministic scores and path counts belong outside hostAnalysis`);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectNumericHostFields(item, errors, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) collectNumericHostFields(item, errors, `${path}.${key}`);
}

function validateHostAnalysis(hostAnalysis, bundle, evidenceIds, errors) {
  if (!hostAnalysis || typeof hostAnalysis !== "object" || Array.isArray(hostAnalysis)) {
    errors.push("hostAnalysis must be an object when provided");
    return;
  }
  if (hostAnalysis.model !== "GPT-5.6") errors.push("hostAnalysis.model must equal GPT-5.6");
  if (hostAnalysis.surface !== "Codex host") errors.push("hostAnalysis.surface must equal Codex host");
  if (typeof hostAnalysis.generatedAt !== "string" || !hostAnalysis.generatedAt) {
    errors.push("hostAnalysis.generatedAt must be a non-empty string");
  }
  collectNumericHostFields(hostAnalysis, errors);

  const expectedAgentIds = new Set(AGENT_NAMES.map((name) => `AGENT-${name.toUpperCase()}`));
  const specialists = Array.isArray(hostAnalysis.specialists) ? hostAnalysis.specialists : [];
  if (specialists.length !== AGENT_NAMES.length) errors.push(`hostAnalysis.specialists must contain exactly ${AGENT_NAMES.length} entries`);
  const seenAgentIds = new Set();
  const actionIds = new Set((bundle.actions ?? []).map((action) => action.id));
  const graphIds = new Set([
    ...(bundle.graph?.nodes ?? []).map((node) => node.id),
    ...(bundle.graph?.edges ?? []).map((edge) => edge.id),
  ]);
  const allowedDispositions = new Set(["support", "challenge", "abstain"]);
  const allowedConfidenceLabels = new Set(["low", "moderate", "high", "very-high"]);
  for (const specialist of specialists) {
    if (!expectedAgentIds.has(specialist?.agentId)) errors.push(`hostAnalysis contains unknown agentId ${specialist?.agentId ?? "<missing>"}`);
    if (seenAgentIds.has(specialist?.agentId)) errors.push(`hostAnalysis contains duplicate agentId ${specialist.agentId}`);
    seenAgentIds.add(specialist?.agentId);
    if (!allowedDispositions.has(specialist?.disposition)) errors.push(`hostAnalysis specialist ${specialist?.agentId ?? "<missing>"} has invalid disposition`);
    if (!actionIds.has(specialist?.actionId)) errors.push(`hostAnalysis specialist ${specialist?.agentId ?? "<missing>"} references unknown action ${specialist?.actionId ?? "<missing>"}`);
    if (!allowedConfidenceLabels.has(specialist?.confidenceLabel)) errors.push(`hostAnalysis specialist ${specialist?.agentId ?? "<missing>"} has invalid confidenceLabel`);
    if (!Array.isArray(specialist?.assumptions) || !specialist.assumptions.every((item) => typeof item === "string")) {
      errors.push(`hostAnalysis specialist ${specialist?.agentId ?? "<missing>"} assumptions must be a string array`);
    }
    if (!Array.isArray(specialist?.missingEvidence) || !specialist.missingEvidence.every((item) => typeof item === "string")) {
      errors.push(`hostAnalysis specialist ${specialist?.agentId ?? "<missing>"} missingEvidence must be a string array`);
    }
    if (!Array.isArray(specialist?.claims) || specialist.claims.length === 0) {
      errors.push(`hostAnalysis specialist ${specialist?.agentId ?? "<missing>"} must include at least one cited claim`);
      continue;
    }
    for (const [claimIndex, claim] of specialist.claims.entries()) {
      if (typeof claim?.text !== "string" || !claim.text.trim()) {
        errors.push(`hostAnalysis specialist ${specialist.agentId} claim ${claimIndex} must include text`);
      }
      if (!Array.isArray(claim?.evidenceIds) || claim.evidenceIds.length === 0) {
        errors.push(`hostAnalysis specialist ${specialist.agentId} claim ${claimIndex} must cite evidence`);
      } else {
        for (const evidenceId of claim.evidenceIds) {
          if (!evidenceIds.has(evidenceId)) errors.push(`hostAnalysis specialist ${specialist.agentId} claim ${claimIndex} references unknown evidence ${evidenceId}`);
        }
      }
      if (claim?.nodeOrEdgeIds !== undefined) {
        if (!Array.isArray(claim.nodeOrEdgeIds)) {
          errors.push(`hostAnalysis specialist ${specialist.agentId} claim ${claimIndex} nodeOrEdgeIds must be an array`);
        } else {
          for (const graphId of claim.nodeOrEdgeIds) {
            if (!graphIds.has(graphId)) errors.push(`hostAnalysis specialist ${specialist.agentId} claim ${claimIndex} references unknown graph id ${graphId}`);
          }
        }
      }
    }
  }
  for (const expectedAgentId of expectedAgentIds) {
    if (!seenAgentIds.has(expectedAgentId)) errors.push(`hostAnalysis is missing ${expectedAgentId}`);
  }

  if (!hostAnalysis.debate || typeof hostAnalysis.debate !== "object") {
    errors.push("hostAnalysis.debate must be an object");
  } else {
    if (typeof hostAnalysis.debate.summary !== "string" || !hostAnalysis.debate.summary.trim()) errors.push("hostAnalysis.debate.summary must be a non-empty string");
    if (!Array.isArray(hostAnalysis.debate.dissent) || !hostAnalysis.debate.dissent.every((item) => typeof item === "string")) {
      errors.push("hostAnalysis.debate.dissent must be a string array");
    }
  }
  if (hostAnalysis.audienceSummaries !== undefined) {
    if (!hostAnalysis.audienceSummaries || typeof hostAnalysis.audienceSummaries !== "object" || Array.isArray(hostAnalysis.audienceSummaries)) {
      errors.push("hostAnalysis.audienceSummaries must be an object when provided");
    } else {
      const allowedAudiences = new Set(["soc", "ciso", "executive"]);
      for (const [audience, summary] of Object.entries(hostAnalysis.audienceSummaries)) {
        if (!allowedAudiences.has(audience)) errors.push(`hostAnalysis.audienceSummaries contains unknown audience ${audience}`);
        if (!summary || typeof summary !== "object" || typeof summary.summary !== "string" || !summary.summary.trim()) {
          errors.push(`hostAnalysis audience summary ${audience} must include summary text`);
        }
      }
    }
  }
}

function validateCanonicalScenario(bundle, errors) {
  const scenarioId = bundle.scenario?.id;
  const scenario = typeof scenarioId === "string" ? getScenarioRecord(scenarioId) : null;
  if (!scenario) {
    errors.push(`scenario.id must reference a known ARES scenario; received ${scenarioId ?? "<missing>"}`);
    return null;
  }
  if (bundle.run?.scenarioId !== scenario.id) errors.push("run.scenarioId must match scenario.id");
  const expectedMetadata = {
    id: scenario.id,
    title: scenario.title,
    summary: scenario.summary,
    story: scenarioStory(scenario),
    asOf: scenario.asOf,
    variantOf: scenario.variantOf,
    synthetic: scenario.synthetic,
    expectedPathCount: scenario.expectedPathCount,
    recommendedActionId: scenario.recommendedActionId,
    defaultQuestion: scenario.defaultQuestion,
    tags: [...scenario.tags],
    products: [...(scenario.products ?? [])],
  };
  for (const [key, expected] of Object.entries(expectedMetadata)) {
    if (stableStringify(bundle.scenario?.[key]) !== stableStringify(expected)) {
      errors.push(`scenario.${key} must match the canonical scenario catalog`);
    }
  }
  if (bundle.run?.generatedAt !== scenario.asOf) errors.push("run.generatedAt must match the canonical scenario timestamp");
  return scenario;
}

function expectedGraphSimulation(graph, action, at) {
  const allPathIds = graph.paths.map((path) => path.id);
  const blockedSet = new Set(Array.isArray(action.coveredPathIds) ? action.coveredPathIds : []);
  const blockedPathIds = allPathIds.filter((id) => blockedSet.has(id));
  const openPathIds = allPathIds.filter((id) => !blockedSet.has(id));
  return {
    id: `GRAPH-SIMULATION-${action.id}`,
    actionId: action.id,
    mode: "SIMULATED",
    liveSystemsChanged: false,
    synthetic: true,
    result: "success",
    simulatedAt: at,
    before: {
      openPathIds: allPathIds,
      blockedPathIds: [],
      openPathCount: allPathIds.length,
      blockedPathCount: 0,
    },
    blockedPathIds,
    after: {
      openPathIds,
      blockedPathIds,
      openPathCount: openPathIds.length,
      blockedPathCount: blockedPathIds.length,
    },
  };
}

function validateExecutionState(bundle, errors) {
  const actions = Array.isArray(bundle.actions) ? bundle.actions : [];
  const simulatedActions = actions.filter((action) => action.status === "simulated");
  const proposedActions = actions.filter((action) => action.status === "proposed");
  if (simulatedActions.length > 1) errors.push("exactly zero or one action may be simulated");
  if (simulatedActions.length + proposedActions.length !== actions.length) errors.push("every action status must be proposed or simulated");

  const events = Array.isArray(bundle.approval?.events) ? bundle.approval.events : [];
  const eventIds = new Set();
  for (const event of events) {
    if (typeof event?.id !== "string" || !event.id) errors.push("every approval event must have an id");
    else if (eventIds.has(event.id)) errors.push(`duplicate approval event id ${event.id}`);
    else eventIds.add(event.id);
    if (event?.synthetic !== true || event?.at !== bundle.run?.generatedAt) {
      errors.push(`approval event ${event?.id ?? "<missing>"} must be synthetic and use the canonical run timestamp`);
    }
    if (typeof event?.actor !== "string" || !event.actor.trim()) errors.push(`approval event ${event?.id ?? "<missing>"} must name an actor`);
  }
  const memoryTrace = Array.isArray(bundle.memory?.trace) ? bundle.memory.trace : [];
  const traceIds = new Set();
  for (const trace of memoryTrace) {
    if (typeof trace?.id !== "string" || !trace.id) errors.push("every memory trace entry must have an id");
    else if (traceIds.has(trace.id)) errors.push(`duplicate memory trace id ${trace.id}`);
    else traceIds.add(trace.id);
    if (trace?.synthetic !== true || trace?.at !== bundle.run?.generatedAt) {
      errors.push(`memory trace ${trace?.id ?? "<missing>"} must be synthetic and use the canonical run timestamp`);
    }
  }

  if (bundle.memory?.record?.runId !== bundle.run?.id) errors.push("memory.record.runId must match run.id");
  if (bundle.memory?.record?.scenarioId !== bundle.scenario?.id) errors.push("memory.record.scenarioId must match scenario.id");
  if (bundle.memory?.record?.recommendedActionId !== bundle.recommendation?.id) {
    errors.push("memory.record.recommendedActionId must match recommendation.id");
  }

  if (simulatedActions.length === 0) {
    const action = actions.find((item) => item.id === bundle.recommendation?.id);
    if (!action) return;
    const expectedState = action.requiresApproval ? "pending" : "not-required";
    const expectedEventType = action.requiresApproval ? "approval-requested" : "approval-not-required";
    if (bundle.approval?.state !== expectedState) errors.push(`pending bundle approval.state must equal ${expectedState}`);
    if (bundle.approval?.required !== action.requiresApproval) errors.push("approval.required must match the pending action");
    if (bundle.approval?.actionId !== action.id) errors.push("approval.actionId must match the pending recommended action");
    if (bundle.approval?.role !== action.approvalRole) errors.push("approval.role must match the pending action");
    if (bundle.approval?.approvedBy !== null) errors.push("pending approval.approvedBy must be null");
    if (bundle.approval?.note !== null) errors.push("pending approval.note must be null");
    if (events.length !== 1 || events[0]?.type !== expectedEventType || events[0]?.id !== `APPROVAL-REQUEST-${action.id}` || events[0]?.actionId !== action.id) {
      errors.push("pending approval events must contain exactly the canonical request event");
    }
    if (events[0]?.actor !== "ARES deterministic engine") errors.push("pending approval request actor must be the ARES deterministic engine");
    if (bundle.memory?.record?.selectedActionId !== null) errors.push("pending memory selectedActionId must be null");
    if (bundle.memory?.record?.outcome !== null) errors.push("pending memory outcome must be null");
    if (bundle.memory?.record?.status !== "proposed") errors.push("pending memory status must be proposed");
    if (memoryTrace.length !== 1 || memoryTrace[0]?.type !== "record-proposed" || memoryTrace[0]?.id !== `MEMORY-PROPOSE-${bundle.run?.id}`) {
      errors.push("pending memory trace must contain exactly the canonical proposal entry");
    }
    if (bundle.graph?.simulation !== null) errors.push("pending graph.simulation must be null");
    for (const path of Array.isArray(bundle.graph?.paths) ? bundle.graph.paths : []) {
      if (path.state !== "open") errors.push(`pending graph path ${path.id} must be open`);
    }
    for (const proposed of actions) {
      if (proposed.simulation?.result !== undefined || proposed.simulation?.executedAt !== undefined || proposed.simulation?.synthetic !== undefined
          || proposed.simulation?.mode !== undefined || proposed.simulation?.liveSystemsChanged !== undefined) {
        errors.push(`proposed action ${proposed.id} must not contain execution results`);
      }
    }
    return;
  }

  const action = simulatedActions[0];
  if (!action) return;
  const expectedState = action.requiresApproval ? "approved-and-simulated" : "not-required-simulated";
  if (bundle.approval?.state !== expectedState) errors.push(`simulated bundle approval.state must equal ${expectedState}`);
  if (bundle.approval?.required !== action.requiresApproval) errors.push("approval.required must match the simulated action");
  if (bundle.approval?.actionId !== action.id) errors.push("approval.actionId must match the simulated action");
  if (bundle.approval?.role !== action.approvalRole) errors.push("approval.role must match the simulated action");
  if (action.requiresApproval && (typeof bundle.approval?.approvedBy !== "string" || !bundle.approval.approvedBy.trim())) {
    errors.push("approval.approvedBy is required for an approval-gated simulated action");
  }
  if (!action.requiresApproval && bundle.approval?.approvedBy !== null) errors.push("approval.approvedBy must be null when approval is not required");
  if (typeof bundle.approval?.note !== "string" || !bundle.approval.note.trim()) errors.push("simulated approval.note must be non-empty");
  const expectedEventTypes = action.requiresApproval
    ? ["approval-requested", "approval-granted", "action-simulated"]
    : ["approval-not-required", "action-simulated"];
  const expectedEventIds = action.requiresApproval
    ? [`APPROVAL-REQUEST-${action.id}`, `APPROVAL-GRANTED-${action.id}`, `ACTION-SIMULATED-${action.id}`]
    : [`APPROVAL-REQUEST-${action.id}`, `ACTION-SIMULATED-${action.id}`];
  if (stableStringify(events.map((event) => event?.type)) !== stableStringify(expectedEventTypes)
      || stableStringify(events.map((event) => event?.id)) !== stableStringify(expectedEventIds)
      || events.some((event) => event?.actionId !== action.id)) {
    errors.push("simulated approval events must be the canonical ordered action history");
  }
  if (events[0]?.actor !== "ARES deterministic engine" || events.at(-1)?.actor !== "ARES deterministic engine") {
    errors.push("simulation request and action event actors must be the ARES deterministic engine");
  }
  if (action.requiresApproval && events[1]?.actor !== bundle.approval?.approvedBy) {
    errors.push("approval-granted actor must match approval.approvedBy");
  }
  if (bundle.memory?.record?.selectedActionId !== action.id) errors.push("memory selectedActionId must match the simulated action");
  if (bundle.memory?.record?.status !== "recorded") errors.push("simulated memory status must be recorded");
  const expectedOutcome = {
    type: "simulated",
    mode: "SIMULATED",
    liveSystemsChanged: false,
    result: "success",
    summary: action.simulation?.summary,
    expectedSignals: action.simulation?.expectedSignals,
    evidenceIds: action.evidenceIds,
  };
  if (stableStringify(bundle.memory?.record?.outcome) !== stableStringify(expectedOutcome)) {
    errors.push("memory outcome must match the simulated action receipt");
  }
  const expectedTraceIds = [`MEMORY-PROPOSE-${bundle.run?.id}`, `MEMORY-RECORDED-${action.id}`];
  const expectedTraceTypes = ["record-proposed", "simulated-outcome-recorded"];
  if (stableStringify(memoryTrace.map((trace) => trace?.id)) !== stableStringify(expectedTraceIds)
      || stableStringify(memoryTrace.map((trace) => trace?.type)) !== stableStringify(expectedTraceTypes)
      || memoryTrace[1]?.actionId !== action.id) {
    errors.push("simulated memory trace must be the canonical ordered outcome history");
  }
  if (action.simulation?.mode !== "SIMULATED" || action.simulation?.liveSystemsChanged !== false
      || action.simulation?.result !== "success" || action.simulation?.synthetic !== true
      || action.simulation?.executedAt !== bundle.run?.generatedAt) {
    errors.push("simulated action must contain a canonical non-live synthetic result");
  }
  for (const proposed of actions.filter((item) => item.id !== action.id)) {
    if (proposed.status !== "proposed") errors.push(`non-selected action ${proposed.id} must remain proposed`);
    if (proposed.simulation?.result !== undefined || proposed.simulation?.executedAt !== undefined || proposed.simulation?.synthetic !== undefined
        || proposed.simulation?.mode !== undefined || proposed.simulation?.liveSystemsChanged !== undefined) {
      errors.push(`non-selected action ${proposed.id} must not contain execution results`);
    }
  }
  if (!bundle.graph || !Array.isArray(bundle.graph.paths)) {
    errors.push("a simulated bundle must contain graph paths and a simulation receipt");
  } else {
    const expectedSimulation = expectedGraphSimulation(bundle.graph, action, bundle.run?.generatedAt);
    if (stableStringify(bundle.graph.simulation) !== stableStringify(expectedSimulation)) {
      errors.push("graph.simulation must match the selected action path transition");
    }
  }
  const blocked = new Set(Array.isArray(action.coveredPathIds) ? action.coveredPathIds : []);
  for (const path of Array.isArray(bundle.graph?.paths) ? bundle.graph.paths : []) {
    const expectedPathState = blocked.has(path.id) ? "blocked" : "open";
    if (path.state !== expectedPathState) errors.push(`graph path ${path.id} must be ${expectedPathState} after simulation`);
  }
}

export function validateDecisionBundle(bundle) {
  const errors = [];
  const warnings = [];
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    return { valid: false, errors: ["bundle must be an object"], warnings };
  }
  if (bundle.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must equal ${SCHEMA_VERSION}`);
  const canonicalScenario = validateCanonicalScenario(bundle, errors);
  if (!bundle.run || bundle.run.mode !== "deterministic" || bundle.run.synthetic !== true) {
    errors.push("run must declare deterministic synthetic mode");
  }
  const evidenceItems = Array.isArray(bundle.evidence) ? bundle.evidence : [];
  if (evidenceItems.length === 0) errors.push("evidence must be a non-empty array");
  const evidenceIds = new Set();
  for (const evidence of evidenceItems) {
    if (!evidence?.id) errors.push("every evidence item must have an id");
    else if (evidenceIds.has(evidence.id)) errors.push(`duplicate evidence id ${evidence.id}`);
    else evidenceIds.add(evidence.id);
    if (evidence?.synthetic !== true) errors.push(`evidence ${evidence?.id ?? "<unknown>"} must be marked synthetic`);
    if (!Number.isFinite(evidence?.freshnessMinutes) || evidence.freshnessMinutes < 0) {
      errors.push(`evidence ${evidence?.id ?? "<unknown>"} freshnessMinutes must be a non-negative number`);
    }
    if (!Number.isFinite(evidence?.reliability) || evidence.reliability < 0 || evidence.reliability > 1) {
      errors.push(`evidence ${evidence?.id ?? "<unknown>"} reliability must be between 0 and 1`);
    }
  }
  collectEvidenceIdProblems(bundle, evidenceIds, errors);

  const claims = Array.isArray(bundle.claims) ? bundle.claims : [];
  if (claims.length === 0) errors.push("claims must be a non-empty array");
  const claimClasses = new Set(claims.map((claim) => claim.classification));
  for (const expected of ["observed", "derived", "hypothesis"]) {
    if (!claimClasses.has(expected)) errors.push(`claims must include ${expected} classification`);
  }

  const graphNodes = Array.isArray(bundle.graph?.nodes) ? bundle.graph.nodes : [];
  const graphEdges = Array.isArray(bundle.graph?.edges) ? bundle.graph.edges : [];
  const graphPaths = Array.isArray(bundle.graph?.paths) ? bundle.graph.paths : [];
  const nodeIds = new Set(graphNodes.map((node) => node.id));
  const edgeIds = new Set(graphEdges.map((edge) => edge.id));
  if (nodeIds.size !== graphNodes.length) errors.push("graph nodes must have unique ids");
  if (edgeIds.size !== graphEdges.length) errors.push("graph edges must have unique ids");
  const pathIds = new Set();
  for (const edge of graphEdges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push(`graph edge ${edge.id} references an unknown node`);
  }
  for (const path of graphPaths) {
    if (pathIds.has(path.id)) errors.push(`duplicate graph path id ${path.id}`);
    pathIds.add(path.id);
    if (!Array.isArray(path.nodeIds) || !path.nodeIds.every((id) => nodeIds.has(id))) errors.push(`graph path ${path.id} references an unknown node`);
    if (!Array.isArray(path.edgeIds) || !path.edgeIds.every((id) => edgeIds.has(id))) errors.push(`graph path ${path.id} references an unknown edge`);
  }
  if (bundle.graph?.pathCount !== graphPaths.length) errors.push("graph.pathCount must match graph.paths length");
  if (bundle.graph?.pathCount !== bundle.scenario?.expectedPathCount) errors.push("graph.pathCount must match scenario.expectedPathCount");
  if (canonicalScenario && bundle.graph?.pathCount !== canonicalScenario.expectedPathCount) {
    errors.push("graph.pathCount must match the canonical scenario path count");
  }

  const agents = Array.isArray(bundle.agents) ? bundle.agents : [];
  const agentNames = agents.map((agent) => agent.name);
  if (agentNames.length !== AGENT_NAMES.length) errors.push(`agents must contain exactly ${AGENT_NAMES.length} artifacts`);
  for (const name of AGENT_NAMES) if (!agentNames.includes(name)) errors.push(`missing ${name} agent artifact`);
  if (agents.some((agent) => agent.hostNarrative?.hostGenerated !== false)) {
    errors.push("deterministic agent packets must not claim a generated host narrative");
  } else if (agents.length === AGENT_NAMES.length) {
    warnings.push("GPT-5.6 host narratives are intentionally not generated by the deterministic runtime");
  }

  if (!bundle.layers || LAYER_NAMES.some((layer) => !(layer in bundle.layers))) errors.push("layers must contain all 12 named stages");
  const trace = Array.isArray(bundle.trace) ? bundle.trace : [];
  const traceLayers = trace.map((entry) => entry.layer);
  if (stableStringify(traceLayers) !== stableStringify(LAYER_NAMES)) errors.push("trace must contain the 12 layers in canonical order");
  if (trace.some((entry) => entry.status !== "completed")) errors.push("every trace step must be completed");

  const actions = Array.isArray(bundle.actions) ? bundle.actions : [];
  const actionIds = new Set();
  for (const action of actions) {
    if (typeof action?.id !== "string" || !action.id) errors.push("every action must have an id");
    else if (actionIds.has(action.id)) errors.push(`duplicate action id ${action.id}`);
    else actionIds.add(action.id);
    const coveredPathIds = Array.isArray(action.coveredPathIds) ? action.coveredPathIds : [];
    if (!Array.isArray(action.coveredPathIds)) errors.push(`action ${action.id} coveredPathIds must be an array`);
    if (new Set(coveredPathIds).size !== coveredPathIds.length) {
      errors.push(`action ${action.id} contains duplicate covered path ids`);
    }
    if (coveredPathIds.some((id) => !pathIds.has(id))) errors.push(`action ${action.id} references an unknown covered path`);
    const expectedCoverage = bundle.graph?.pathCount ? round(coveredPathIds.length / bundle.graph.pathCount, 4) : 0;
    if (action.components?.pathCoverage !== expectedCoverage) errors.push(`action ${action.id} path coverage is inconsistent`);
    const expectedWeighted = {
      pathCoverage: round(action.components?.pathCoverage * 40, 2),
      inverseDisruption: round(action.components?.inverseDisruption * 25, 2),
      urgency: round(action.components?.urgency * 15, 2),
      reversibility: round(action.components?.reversibility * 10, 2),
      evidenceStrength: round(action.components?.evidenceStrength * 10, 2),
    };
    const expectedScore = round(Object.values(expectedWeighted).reduce((sum, value) => sum + value, 0), 2);
    if (stableStringify(action.weighted) !== stableStringify(expectedWeighted)) errors.push(`action ${action.id} weighted components are inconsistent`);
    if (action.score !== expectedScore) errors.push(`action ${action.id} score is inconsistent`);
  }
  const agentIds = new Set();
  for (const agent of agents) {
    if (agentIds.has(agent?.id)) errors.push(`duplicate agent id ${agent?.id ?? "<missing>"}`);
    else agentIds.add(agent?.id);
    if (!actionIds.has(agent?.vote?.actionId)) errors.push(`agent ${agent?.id ?? "<missing>"} votes for an unknown action`);
    for (const referencedActionId of agent?.assessment?.recommendation?.actionIds ?? []) {
      if (!actionIds.has(referencedActionId)) errors.push(`agent ${agent?.id ?? "<missing>"} recommends an unknown action ${referencedActionId}`);
    }
  }
  if (!actionIds.has(bundle.recommendation?.id)) errors.push("recommendation must reference a ranked action");
  if (actions[0]?.id !== bundle.recommendation?.id) errors.push("recommendation must equal the first-ranked action");
  if (canonicalScenario && actions[0]?.id !== canonicalScenario.recommendedActionId) {
    errors.push("the first-ranked action must match the canonical scenario recommendation");
  }
  const sortedActions = [...actions].sort((left, right) => right.score - left.score || String(left.id).localeCompare(String(right.id)));
  if (stableStringify(sortedActions.map((action) => action.id)) !== stableStringify(actions.map((action) => action.id))) {
    errors.push("actions must remain in descending deterministic score order");
  }
  const recommendedAction = actions.find((action) => action.id === bundle.recommendation?.id);
  if (recommendedAction) {
    for (const key of ["title", "description", "category", "score", "rank", "decision", "status", "requiresApproval", "approvalRole"]) {
      if (bundle.recommendation[key] !== recommendedAction[key]) errors.push(`recommendation.${key} must match the ranked action`);
    }
    for (const key of ["components", "weighted", "coveredPathIds", "mitigatesNodeIds", "evidenceIds", "tradeoffs", "simulation"]) {
      if (stableStringify(bundle.recommendation[key]) !== stableStringify(recommendedAction[key])) {
        errors.push(`recommendation.${key} must match the ranked action`);
      }
    }
    if (Array.isArray(recommendedAction.coveredPathIds) && bundle.graph && Array.isArray(bundle.graph.paths)
        && bundle.recommendation.rationale !== recommendationRationale(recommendedAction, bundle.graph)) {
      errors.push("recommendation.rationale must match the ranked action and graph");
    }
  }

  const riskWeights = { likelihood: 30, reachability: 30, criticality: 25, controlWeakness: 15 };
  for (const [componentName, weight] of Object.entries(riskWeights)) {
    const component = bundle.risk?.components?.[componentName];
    if (!component || component.points !== round(component.value * weight, 2)) {
      errors.push(`risk component ${componentName} points are inconsistent`);
    }
  }
  const riskComponents = bundle.risk?.components ? Object.values(bundle.risk.components) : [];
  const expectedRisk = round(riskComponents.reduce((sum, component) => sum + (component.points ?? 0), 0), 2);
  if (bundle.risk?.score !== expectedRisk) errors.push("risk score is inconsistent with component points");
  const confidenceComponents = bundle.confidence?.components;
  if (confidenceComponents) {
    for (const [name, value] of Object.entries(confidenceComponents)) {
      if (!Number.isFinite(value) || value < 0 || value > 1) errors.push(`confidence component ${name} must be between 0 and 1`);
    }
    const evidence = evidenceItems;
    const expectedFreshness = evidence.length === 0 ? 0 : round(
      evidence.reduce((sum, item) => sum + clamp(1 - Number(item?.freshnessMinutes) / 120), 0) / evidence.length,
      4,
    );
    const expectedReliability = evidence.length === 0 ? 0 : round(
      evidence.reduce((sum, item) => sum + Number(item?.reliability), 0) / evidence.length,
      4,
    );
    if (!Number.isFinite(expectedFreshness) || confidenceComponents.freshness !== expectedFreshness) {
      errors.push("confidence freshness must be recomputed from evidence freshnessMinutes");
    }
    if (!Number.isFinite(expectedReliability) || confidenceComponents.reliability !== expectedReliability) {
      errors.push("confidence reliability must be recomputed from evidence reliability");
    }
    const expectedConfidence = round(clamp(
      0.3 * confidenceComponents.completeness
      + 0.25 * confidenceComponents.corroboration
      + 0.2 * confidenceComponents.freshness
      + 0.25 * confidenceComponents.reliability
      - 0.15 * confidenceComponents.conflictPenalty,
    ) * 100, 2);
    if (bundle.confidence.score !== expectedConfidence) errors.push("confidence score is inconsistent with its components");
    if (bundle.confidence.band !== confidenceBand(expectedConfidence)) errors.push("confidence band is inconsistent with its score");
    if (stableStringify(bundle.confidence.evidenceIds) !== stableStringify(evidenceItems.map((item) => item.id))) {
      errors.push("confidence.evidenceIds must match the canonical evidence order");
    }
  } else {
    errors.push("confidence components are required");
  }
  if (bundle.layers?.receipt?.provenance?.modelCalls !== false) errors.push("receipt must state that the runtime made no model calls");
  if (bundle.layers?.receipt?.provenance?.externalActions !== false) errors.push("receipt must state that no external action was executed");
  const layerMirrors = [
    ["evidence", bundle.layers?.evidence?.items, bundle.evidence],
    ["contextFusion", bundle.layers?.contextFusion?.claims, bundle.claims],
    ["confidence", bundle.layers?.contextFusion?.confidence, bundle.confidence],
    ["decisionGraph", bundle.layers?.decisionGraph, bundle.graph],
    ["agents", bundle.layers?.agents, bundle.agents],
    ["debate", bundle.layers?.debate, bundle.debate],
    ["ranking", bundle.layers?.ranking?.actions, bundle.actions],
    ["projections", bundle.layers?.projections, bundle.projections],
    ["approval", bundle.layers?.executionMemory?.approval, bundle.approval],
    ["memory", bundle.layers?.executionMemory?.memory, bundle.memory],
  ];
  for (const [name, layerValue, topLevelValue] of layerMirrors) {
    if (stableStringify(layerValue) !== stableStringify(topLevelValue)) errors.push(`layers.${name} must mirror its canonical top-level value`);
  }
  validateExecutionState(bundle, errors);
  if (bundle.hostAnalysis !== undefined) validateHostAnalysis(bundle.hostAnalysis, bundle, evidenceIds, errors);

  return { valid: errors.length === 0, errors: unique(errors), warnings: unique(warnings) };
}

export function applySimulatedAction(bundleOrInput, actionId) {
  const wrapped = bundleOrInput && typeof bundleOrInput === "object" && "bundle" in bundleOrInput;
  const input = wrapped ? bundleOrInput : {};
  const bundle = wrapped ? input.bundle : bundleOrInput;
  const selectedActionId = wrapped ? input.actionId : actionId;
  const validation = validateDecisionBundle(bundle);
  if (!validation.valid) throw new TypeError(`Cannot simulate an invalid decision bundle: ${validation.errors.join("; ")}`);
  if (typeof selectedActionId !== "string" || !selectedActionId) throw new TypeError("actionId must be a non-empty string");
  const existingAction = bundle.actions.find((action) => action.id === selectedActionId);
  if (!existingAction) throw new RangeError(`Unknown ARES action: ${selectedActionId}`);
  const priorSimulatedAction = bundle.actions.find((action) => action.status === "simulated");
  if (priorSimulatedAction?.id === selectedActionId) return deepClone(bundle);
  if (priorSimulatedAction) {
    throw new Error(`ARES action conflict: ${priorSimulatedAction.id} is already simulated; cannot simulate ${selectedActionId}`);
  }

  const updated = deepClone(bundle);
  for (const action of updated.actions) {
    action.status = "proposed";
    delete action.simulation.result;
    delete action.simulation.executedAt;
    delete action.simulation.synthetic;
    delete action.simulation.mode;
    delete action.simulation.liveSystemsChanged;
  }
  const selectedAction = updated.actions.find((action) => action.id === selectedActionId);
  const at = updated.run.generatedAt;
  const suppliedApprover = typeof input.approvedBy === "string" ? input.approvedBy.trim() : "";
  const approvedBy = selectedAction.requiresApproval ? (suppliedApprover || "ARES demo approver") : null;
  const suppliedNote = typeof input.note === "string" ? input.note.trim() : "";
  const note = suppliedNote || "Synthetic approval and action simulation only; no production system was changed.";
  selectedAction.status = "simulated";
  selectedAction.simulation = {
    ...selectedAction.simulation,
    mode: "SIMULATED",
    liveSystemsChanged: false,
    result: "success",
    executedAt: at,
    synthetic: true,
  };

  const blockedPathIds = new Set(selectedAction.coveredPathIds);
  updated.graph.paths = updated.graph.paths.map((path) => ({
    ...path,
    state: blockedPathIds.has(path.id) ? "blocked" : "open",
  }));
  updated.graph.simulation = expectedGraphSimulation(updated.graph, selectedAction, at);

  updated.approval = {
    ...updated.approval,
    state: selectedAction.requiresApproval ? "approved-and-simulated" : "not-required-simulated",
    required: selectedAction.requiresApproval,
    actionId: selectedAction.id,
    role: selectedAction.approvalRole,
    approvedBy,
    note,
    events: [
      {
        id: `APPROVAL-REQUEST-${selectedAction.id}`,
        type: selectedAction.requiresApproval ? "approval-requested" : "approval-not-required",
        at,
        actionId: selectedAction.id,
        actor: "ARES deterministic engine",
        synthetic: true,
      },
      ...(selectedAction.requiresApproval
        ? [{
            id: `APPROVAL-GRANTED-${selectedAction.id}`,
            type: "approval-granted",
            at,
            actionId: selectedAction.id,
            actor: approvedBy,
            synthetic: true,
          }]
        : []),
      {
        id: `ACTION-SIMULATED-${selectedAction.id}`,
        type: "action-simulated",
        at,
        actionId: selectedAction.id,
        actor: "ARES deterministic engine",
        synthetic: true,
      },
    ],
  };
  updated.memory = {
    ...updated.memory,
    record: {
      ...updated.memory.record,
      selectedActionId: selectedAction.id,
      outcome: {
        type: "simulated",
        mode: "SIMULATED",
        liveSystemsChanged: false,
        result: "success",
        summary: selectedAction.simulation.summary,
        expectedSignals: [...selectedAction.simulation.expectedSignals],
        evidenceIds: [...selectedAction.evidenceIds],
      },
      status: "recorded",
    },
    trace: [
      {
        id: `MEMORY-PROPOSE-${updated.run.id}`,
        type: "record-proposed",
        at,
        synthetic: true,
      },
      {
        id: `MEMORY-RECORDED-${selectedAction.id}`,
        type: "simulated-outcome-recorded",
        at,
        actionId: selectedAction.id,
        synthetic: true,
      },
    ],
  };
  const recommendedAction = updated.actions[0];
  updated.recommendation = {
    ...deepClone(recommendedAction),
    rationale: recommendationRationale(recommendedAction, updated.graph),
  };
  updated.layers.decisionGraph = updated.graph;
  updated.layers.ranking.actions = updated.actions;
  updated.layers.ranking.recommendationId = updated.recommendation.id;
  updated.layers.executionMemory = { approval: updated.approval, memory: updated.memory };
  updated.trace[11] = {
    ...updated.trace[11],
    outputRefs: ["approval", "memory", selectedAction.id],
    summary: `${selectedAction.title} was approved when required, simulated, and recorded without a production change.`,
  };
  const updatedValidation = validateDecisionBundle(updated);
  if (!updatedValidation.valid) throw new Error(`Simulated action produced an invalid bundle: ${updatedValidation.errors.join("; ")}`);
  return updated;
}

export function exportDecisionBundle(bundle) {
  const validation = validateDecisionBundle(bundle);
  if (!validation.valid) throw new TypeError(`Cannot export an invalid decision bundle: ${validation.errors.join("; ")}`);
  return stableStringify(bundle, 2);
}
