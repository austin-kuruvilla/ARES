export type ClaimClassification = "observed" | "derived" | "hypothesis";
export type ActionDecision = "recommend" | "alternate" | "defer";
export type ActionStatus = "proposed" | "simulated";

export interface ScenarioStory {
  alertLabel: string;
  businessAsset: string;
  pivotalFact: string;
  family: string;
}

export interface ScenarioSummary {
  id: string;
  title: string;
  summary: string;
  asOf: string;
  variantOf: string | null;
  synthetic: true;
  expectedPathCount: number;
  recommendedActionId: string;
  tags: string[];
  products: string[];
  story: ScenarioStory;
  defaultQuestion: string;
}

export interface EvidenceItem {
  id: string;
  type: string;
  source: string;
  summary: string;
  observedAt: string;
  collectedAt: string;
  freshnessMinutes: number;
  reliability: number;
  status: "observed" | "negative";
  synthetic: true;
}

export interface Claim {
  id: string;
  classification: ClaimClassification;
  text: string;
  evidenceIds: string[];
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  role: "source" | "target" | "transit" | "control-plane" | "context";
  evidenceIds: string[];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  claimClass: ClaimClassification;
  evidenceIds: string[];
}

export interface GraphPath {
  id: string;
  nodeIds: string[];
  edgeIds: string[];
  evidenceIds: string[];
  classification: "derived" | "hypothesis";
  label: string;
  state: "open" | "blocked";
}

export interface GraphPathState {
  openPathIds: string[];
  blockedPathIds: string[];
  openPathCount: number;
  blockedPathCount: number;
}

export interface GraphSimulationReceipt {
  id: string;
  actionId: string;
  mode: "SIMULATED";
  liveSystemsChanged: false;
  synthetic: true;
  result: "success";
  simulatedAt: string;
  before: GraphPathState;
  blockedPathIds: string[];
  after: GraphPathState;
}

export interface DecisionGraph {
  schema: "arc.decision-graph.v1";
  nodes: GraphNode[];
  edges: GraphEdge[];
  sourceNodeIds: string[];
  targetNodeIds: string[];
  paths: GraphPath[];
  pathCount: number;
  simulation: GraphSimulationReceipt | null;
  enumeration: {
    algorithm: string;
    direction: string;
    cyclePolicy: string;
    sortedBy: string;
  };
}

export interface RiskComponent {
  value: number;
  points: number;
  evidenceIds: string[];
}

export interface RiskScore {
  score: number;
  band: "critical" | "high" | "moderate" | "low";
  formula: string;
  components: {
    likelihood: RiskComponent;
    reachability: RiskComponent;
    criticality: RiskComponent;
    controlWeakness: RiskComponent;
  };
}

export interface ConfidenceScore {
  score: number;
  band: "very-high" | "high" | "moderate" | "low";
  formula: string;
  components: {
    completeness: number;
    corroboration: number;
    freshness: number;
    reliability: number;
    conflictPenalty: number;
  };
  evidenceIds: string[];
}

export interface ActionScoreComponents {
  pathCoverage: number;
  inverseDisruption: number;
  urgency: number;
  reversibility: number;
  evidenceStrength: number;
}

export interface DecisionAction {
  id: string;
  title: string;
  description: string;
  category: string;
  score: number;
  rank: number;
  decision: ActionDecision;
  status: ActionStatus;
  requiresApproval: boolean;
  approvalRole: string;
  components: ActionScoreComponents;
  weighted: ActionScoreComponents;
  coveredPathIds: string[];
  mitigatesNodeIds: string[];
  evidenceIds: string[];
  tradeoffs: string[];
  simulation: {
    summary: string;
    expectedSignals: string[];
    mode?: "SIMULATED";
    liveSystemsChanged?: false;
    result?: "success";
    executedAt?: string;
    synthetic?: true;
  };
}

export interface Recommendation extends DecisionAction {
  rationale: string;
}

export interface AgentFinding {
  id: string;
  text: string;
  evidenceIds: string[];
  claimIds: string[];
}

export interface AgentArtifact {
  id: string;
  name: "Attack" | "Identity" | "Cloud" | "Network" | "GRC" | "Threat" | "Business" | "Compliance";
  role: string;
  status: "structured-input-ready";
  assessment: {
    headline: string;
    severity: string;
    confidence: number;
    evidenceIds: string[];
    claimIds: string[];
    findings: AgentFinding[];
    recommendation: { text: string; actionIds: string[]; evidenceIds: string[] };
  };
  vote: { actionId: string; weight: number; evidenceIds: string[] };
  hostNarrative: {
    status: "not-generated";
    hostGenerated: false;
    requiredModel: "GPT-5.6";
    instruction: string;
    text: null;
  };
}

export interface ProjectionAction {
  id: string;
  text: string;
  actionId: string;
  priority: string;
  evidenceIds: string[];
}

export interface AudienceProjection {
  audience: "SOC" | "CISO" | "Executive";
  headline: string;
  summary: string;
  evidenceIds: string[];
  actions: ProjectionAction[];
  metrics: Array<{ label: string; value: string }>;
}

export interface ApprovalState {
  state: "pending" | "not-required" | "approved-and-simulated" | "not-required-simulated";
  required: boolean;
  actionId: string;
  role: string;
  approvedBy: string | null;
  note: string | null;
  events: Array<{
    id: string;
    type: string;
    at: string;
    actionId: string;
    actor: string;
    synthetic: true;
  }>;
}

export interface MemoryState {
  priorRecordsUsed: string[];
  record: {
    id: string;
    runId: string;
    scenarioId: string;
    recommendedActionId: string;
    selectedActionId: string | null;
    outcome: null | {
      type: "simulated";
      mode: "SIMULATED";
      liveSystemsChanged: false;
      result: "success";
      summary: string;
      expectedSignals: string[];
      evidenceIds: string[];
    };
    status: "proposed" | "recorded";
    createdAt: string;
    evidenceIds: string[];
  };
  trace: Array<Record<string, unknown>>;
}

export interface TraceStep {
  index: number;
  layer: "intent" | "plan" | "evidence" | "contextFusion" | "ontology" | "decisionGraph" | "agents" | "debate" | "ranking" | "receipt" | "projections" | "executionMemory";
  status: "completed";
  inputRefs: string[];
  outputRefs: string[];
  summary: string;
}

export interface HostAnalysisClaim {
  text: string;
  evidenceIds: string[];
  nodeOrEdgeIds?: string[];
}

export interface HostSpecialistAnalysis {
  agentId: AgentArtifact["id"];
  disposition: "support" | "challenge" | "abstain";
  claims: HostAnalysisClaim[];
  actionId: string;
  assumptions: string[];
  missingEvidence: string[];
  confidenceLabel: "low" | "moderate" | "high" | "very-high";
}

export interface HostAnalysis {
  model: "GPT-5.6";
  surface: "Codex host";
  generatedAt: string;
  specialists: HostSpecialistAnalysis[];
  debate: { summary: string; dissent: string[]; evidenceIds: string[] };
  audienceSummaries?: Partial<Record<"soc" | "ciso" | "executive", { summary: string; evidenceIds: string[] }>>;
}

export interface DecisionBundle {
  schemaVersion: "arc.decision-bundle.v1";
  run: {
    id: string;
    engineVersion: string;
    generatedAt: string;
    scenarioId: string;
    question: string;
    mode: "deterministic";
    synthetic: true;
  };
  scenario: ScenarioSummary;
  risk: RiskScore;
  confidence: ConfidenceScore;
  evidence: EvidenceItem[];
  claims: Claim[];
  graph: DecisionGraph;
  agents: AgentArtifact[];
  actions: DecisionAction[];
  recommendation: Recommendation;
  debate: Record<string, unknown>;
  projections: { soc: AudienceProjection; ciso: AudienceProjection; executive: AudienceProjection };
  approval: ApprovalState;
  memory: MemoryState;
  layers: {
    intent: Record<string, unknown>;
    plan: Record<string, unknown>;
    evidence: Record<string, unknown>;
    contextFusion: Record<string, unknown>;
    ontology: Record<string, unknown>;
    decisionGraph: DecisionGraph;
    agents: AgentArtifact[];
    debate: Record<string, unknown>;
    ranking: { formula: string; tieBreaker: string; recommendationId: string; actions: DecisionAction[] };
    receipt: Record<string, unknown>;
    projections: DecisionBundle["projections"];
    executionMemory: { approval: ApprovalState; memory: MemoryState };
  };
  trace: TraceStep[];
  hostAnalysis?: HostAnalysis;
}

export interface RunArcInput {
  scenarioId: string;
  question?: string;
  priorMemory?: unknown;
  overrides?: { question?: string; priorMemory?: unknown };
}

export interface ApplySimulatedActionInput {
  bundle: DecisionBundle;
  actionId: string;
  approvedBy?: string;
  note?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const ENGINE_VERSION: string;
export const SCHEMA_VERSION: "arc.decision-bundle.v1";
export function listScenarios(): ScenarioSummary[];
export function getScenario(scenarioId: string): Record<string, unknown> | null;
export function runArcScenario(input: RunArcInput): DecisionBundle;
export function runDeterministicPipeline(input: RunArcInput): DecisionBundle;
export function validateDecisionBundle(bundle: unknown): ValidationResult;
export function applySimulatedAction(bundle: DecisionBundle, actionId: string): DecisionBundle;
export function applySimulatedAction(input: ApplySimulatedActionInput): DecisionBundle;
export function exportDecisionBundle(bundle: DecisionBundle): string;
