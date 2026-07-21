"use client";

import {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import AttackPathGraph from "./attack-path-graph";
import {
  applySimulatedAction,
  exportDecisionBundle,
  listScenarios,
  runArcScenario,
  validateDecisionBundle,
} from "../plugins/arc-cyber-decision-engine/runtime/engine.mjs";
import type { DecisionBundle } from "../plugins/arc-cyber-decision-engine/runtime/engine.mjs";

type JsonRecord = Record<string, unknown>;
type ViewMode = "soc" | "ciso" | "executive";
type ToastTone = "success" | "info" | "error";
type ThemeMode = "dark" | "light";
type WarOverlay = "evidence" | "council" | "audiences" | "trace" | null;
type WarBeat = "reveal" | "ready" | "flip" | "contained";

const DEMO_STEPS = [
  { id: "ingest", label: "Ingest", title: "Collect source evidence", description: "Synthetic identity, mail, file, endpoint, and asset telemetry enters one provenance-preserving evidence contract." },
  { id: "evidence", label: "Evidence", title: "Inspect the source records", description: "Open the evidence receipt to see source fields, freshness, reliability, timestamps, and stable citation IDs." },
  { id: "normalize", label: "Claims", title: "Separate facts from uncertainty", description: "ARES keeps observed facts, derived conclusions, and hypotheses distinct so missing evidence remains visible." },
  { id: "exposure", label: "Map", title: "Build the causal exposure model", description: "Typed entities and evidence-linked relationships become enumerated paths to business impact." },
  { id: "rank", label: "Rank", title: "Compare every response option", description: "ARES ranks coverage against disruption, urgency, reversibility, and evidence strength—showing why endpoint isolation covers zero active cloud paths." },
  { id: "council", label: "OpenAI", title: "GPT-5.6 challenges the recommendation", description: "Eight evidence-bounded specialist perspectives run in the Codex host, cite known records, expose assumptions, and retain dissent. ARES rejects unknown citations and model-authored numeric fields." },
  { id: "govern", label: "Approve", title: "Cross the human approval gate", description: "The incident commander reviews coverage, evidence, disruption, and reversibility before simulation is allowed." },
  { id: "simulate", label: "Outcome", title: "Record the modeled outcome", description: "ARES blocks covered paths on a cloned graph and validates the before, blocked, and residual states." },
  { id: "explain", label: "Views", title: "Project one truth for every audience", description: "SOC, CISO, and Executive views are derived from the same canonical decision receipt." },
  { id: "audit", label: "Audit", title: "Export the complete decision trace", description: "All twelve layers remain linked, validated, and available as a machine-verifiable receipt." },
  { id: "complete", label: "Finish", title: "A defensible decision is ready", description: "The evidence, recommendation, human approval, simulated outcome, and audit trail now form one validated investigation record." },
] as const;

type CatalogScenario = {
  id: string;
  title: string;
  summary: string;
  asOf: string;
  variantOf?: string | null;
  synthetic: true;
  expectedPathCount: number;
  recommendedActionId: string;
  defaultQuestion?: string;
  tags?: string[];
  products?: string[];
  story?: {
    alertLabel?: string;
    businessAsset?: string;
    pivotalFact?: string;
    family?: string;
  };
};

type ArcEvidence = JsonRecord & {
  id: string;
  type?: string;
  source?: string;
  summary?: string;
  observedAt?: string;
  collectedAt?: string;
  freshnessMinutes?: number;
  reliability?: number;
  status?: string;
  synthetic?: boolean;
};

type ArcGraphNode = JsonRecord & {
  id: string;
  label?: string;
  type?: string;
  role?: string;
  evidenceIds?: string[];
};

type ArcGraphEdge = JsonRecord & {
  id: string;
  from: string;
  to: string;
  type?: string;
  claimClass?: string;
  evidenceIds?: string[];
};

type ArcGraphPath = JsonRecord & {
  id: string;
  label?: string;
  nodeIds?: string[];
  edgeIds?: string[];
  evidenceIds?: string[];
  classification?: string;
  state?: "open" | "blocked";
};

type ArcAction = JsonRecord & {
  id: string;
  title: string;
  description?: string;
  category?: string;
  score: number;
  rank: number;
  decision?: string;
  status?: string;
  requiresApproval?: boolean;
  approvalRole?: string;
  components?: {
    pathCoverage?: number;
    inverseDisruption?: number;
    urgency?: number;
    reversibility?: number;
    evidenceStrength?: number;
  };
  weighted?: JsonRecord;
  coveredPathIds?: string[];
  mitigatesNodeIds?: string[];
  evidenceIds?: string[];
  tradeoffs?: string[];
  simulation?: JsonRecord;
  rationale?: string;
};

type ArcAgent = JsonRecord & {
  id?: string;
  name?: string;
  role?: string;
  status?: string;
  assessment?: {
    headline?: string;
    severity?: string;
    confidence?: number;
    evidenceIds?: string[];
    claimIds?: string[];
    findings?: Array<JsonRecord & { text?: string }>;
    recommendation?: JsonRecord;
  };
  vote?: { actionId?: string; weight?: number; evidenceIds?: string[] };
};

type ArcTrace = JsonRecord & {
  index?: number;
  layer?: string;
  status?: string;
  summary?: string;
};

type HostSpecialist = {
  agentId: string;
  disposition: "support" | "challenge" | "abstain";
  claims: Array<{ text: string; evidenceIds: string[]; nodeOrEdgeIds?: string[] }>;
  actionId: string;
  assumptions: string[];
  missingEvidence: string[];
  confidenceLabel: "low" | "moderate" | "high" | "very-high";
};

type HostAnalysis = {
  model: "GPT-5.6";
  surface: "Codex host";
  generatedAt: string;
  specialists: HostSpecialist[];
  debate: { summary: string; dissent: string[]; evidenceIds: string[] };
  audienceSummaries?: Partial<Record<ViewMode, { summary: string; evidenceIds: string[] }>>;
};

type ArcBundle = JsonRecord & {
  schemaVersion: string;
  run: {
    id: string;
    engineVersion?: string;
    generatedAt?: string;
    scenarioId: string;
    question: string;
    mode?: string;
    synthetic?: boolean;
  };
  scenario: CatalogScenario;
  risk: JsonRecord;
  confidence: JsonRecord;
  evidence: ArcEvidence[];
  claims: Array<JsonRecord & { id?: string; classification?: string; text?: string; evidenceIds?: string[] }>;
  graph: {
    nodes: ArcGraphNode[];
    edges: ArcGraphEdge[];
    paths: ArcGraphPath[];
    pathCount?: number;
    simulation?: JsonRecord;
  };
  agents: ArcAgent[];
  actions: ArcAction[];
  recommendation: ArcAction & { rationale?: string };
  debate: JsonRecord;
  projections: Partial<Record<ViewMode, JsonRecord>>;
  approval: JsonRecord;
  memory: JsonRecord;
  layers: Record<string, JsonRecord>;
  trace: ArcTrace[];
  hostAnalysis?: HostAnalysis;
};

type PersistenceState = {
  mode: "preview" | "d1" | "memory" | "browser";
  durable: boolean;
  label: string;
};

const CATALOG = listScenarios() as unknown as CatalogScenario[];
const INITIAL_SCENARIO_ID = CATALOG.some((item) => item.id === "oauth-phishing")
  ? "oauth-phishing"
  : CATALOG[0]?.id;

if (!INITIAL_SCENARIO_ID) throw new Error("ARES requires at least one synthetic scenario.");

const INITIAL_BUNDLE = runArcScenario({ scenarioId: INITIAL_SCENARIO_ID }) as unknown as ArcBundle;
const BASE_CAUSAL_BUNDLE = CATALOG.some((item) => item.id === "oauth-phishing")
  ? (runArcScenario({ scenarioId: "oauth-phishing" }) as unknown as ArcBundle)
  : null;
const ENDPOINT_CAUSAL_BUNDLE = CATALOG.some((item) => item.id === "oauth-phishing-endpoint-malware")
  ? (runArcScenario({ scenarioId: "oauth-phishing-endpoint-malware" }) as unknown as ArcBundle)
  : null;

const INITIAL_PERSISTENCE: PersistenceState = {
  mode: "preview",
  durable: false,
  label: "Available in this session",
};

function titleCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayBrand(value: string) {
  return value.replace(/\bARC\b/g, "ARES");
}

function toText(value: unknown, fallback = "—") {
  if (typeof value === "string" && value.trim()) return displayBrand(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    for (const key of ["summary", "text", "label", "value", "description"]) {
      if (typeof record[key] === "string" && String(record[key]).trim()) return displayBrand(String(record[key]));
    }
  }
  return displayBrand(fallback);
}

function numberFrom(record: JsonRecord | undefined, keys: string[], fallback = 0) {
  if (!record) return fallback;
  for (const key of keys) {
    if (typeof record[key] === "number" && Number.isFinite(record[key])) return Number(record[key]);
  }
  return fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function percent(value: number) {
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentOrNA(value: unknown) {
  const numeric = optionalNumber(value);
  return numeric === null ? "n/a" : percent(numeric);
}

function disruptionPercent(inverseDisruption: unknown) {
  const numeric = optionalNumber(inverseDisruption);
  if (numeric === null) return "n/a";
  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(Math.max(0, 100 - normalized))}%`;
}

function scoreOrNA(value: number | null) {
  return value === null ? "n/a" : value.toFixed(2);
}

function fixedTime(value?: string) {
  if (!value) return "Capture time unavailable";
  return value.replace("T", " ").replace(".000Z", " UTC");
}

function displaySource(value?: string) {
  return value?.replace(/^Synthetic\s+/i, "") ?? "ARES evidence record";
}

function evidenceDetailRows(evidence?: ArcEvidence) {
  const details = evidence?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  return Object.entries(details as JsonRecord).flatMap(([key, value]) => {
    const rendered = Array.isArray(value)
      ? value.filter((item) => ["string", "number", "boolean"].includes(typeof item)).join(", ")
      : ["string", "number", "boolean"].includes(typeof value)
        ? String(value)
        : "";
    return rendered ? [{ key, label: titleCase(key), value: rendered }] : [];
  }).slice(0, 8);
}

function productCopy(value: unknown, fallback = "—") {
  return toText(value, fallback)
    .replace(/\bsynthetic\b/gi, "replay")
    .replace(/\bfixture\b/gi, "scenario");
}

function scenarioProducts(scenario: CatalogScenario, evidence: ArcEvidence[] = []) {
  if (scenario.products?.length) return scenario.products;
  const tagged = (scenario.tags ?? [])
    .filter((tag) => !["identity", "endpoint", "malware", "finance", "cloud", "ransomware"].includes(tag))
    .slice(0, 3)
    .map(titleCase);
  if (tagged.length) return tagged;
  return [...new Set(evidence.map((item) => item.source).filter((item): item is string => Boolean(item)))].slice(0, 3);
}

function scenarioInitials(scenario: CatalogScenario) {
  const products = scenarioProducts(scenario);
  return (products[0] ?? scenario.title)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function persistenceFrom(value: unknown): PersistenceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return INITIAL_PERSISTENCE;
  const record = value as JsonRecord;
  const mode = record.mode === "d1" ? "d1" : "memory";
  return {
    mode,
    durable: record.durable === true,
    label: record.durable === true ? "Saved to case history" : "Available in this session",
  };
}

function AresMark() {
  return (
    <span className="arc-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function useDialogFocus(
  open: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  close: () => void,
  returnFocusRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const returnTarget = returnFocusRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(container?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    const timer = window.setTimeout(() => focusables()[0]?.focus(), 0);

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      (returnTarget ?? previous)?.focus();
    };
  }, [open, close, containerRef, returnFocusRef]);
}

export function AresCockpit({ initialView = "soc" }: { initialView?: ViewMode }) {
  const cisoMode = initialView === "ciso";
  const [scenarioId, setScenarioId] = useState(INITIAL_SCENARIO_ID);
  const [question, setQuestion] = useState(INITIAL_BUNDLE.run.question);
  const [bundle, setBundle] = useState<ArcBundle>(INITIAL_BUNDLE);
  const [persistence, setPersistence] = useState<PersistenceState>(INITIAL_PERSISTENCE);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<ViewMode>(initialView);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(INITIAL_BUNDLE.evidence[0]?.id ?? "");
  const [selectedPathId, setSelectedPathId] = useState(INITIAL_BUNDLE.graph.paths[0]?.id ?? "");
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);
  const [previewActionId, setPreviewActionId] = useState("");
  const [showAllPaths, setShowAllPaths] = useState(false);
  const [pendingAction, setPendingAction] = useState<ArcAction | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<WarOverlay>(null);
  const [warBeat, setWarBeat] = useState<WarBeat>("reveal");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const approvalDialogRef = useRef<HTMLElement>(null);
  const importDialogRef = useRef<HTMLElement>(null);
  const warOverlayRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement>(null);
  const warActionRowsRef = useRef(new Map<string, HTMLElement>());
  const previousActionRectsRef = useRef(new Map<string, DOMRect>());

  const closeApproval = useCallback(() => setPendingAction(null), []);
  const closeImport = useCallback(() => setImportOpen(false), []);
  const closeWarOverlay = useCallback(() => setActiveOverlay(null), []);
  useDialogFocus(Boolean(pendingAction), approvalDialogRef, closeApproval, returnFocusRef);
  useDialogFocus(importOpen, importDialogRef, closeImport, returnFocusRef);
  useDialogFocus(Boolean(activeOverlay), warOverlayRef, closeWarOverlay, returnFocusRef);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const stored = window.localStorage.getItem("arc-theme");
    const resolved: ThemeMode = stored === "light" || stored === "dark" ? stored : media.matches ? "light" : "dark";
    document.documentElement.dataset.theme = resolved;
    const frame = window.requestAnimationFrame(() => setTheme(resolved));
    const followSystemTheme = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem("arc-theme")) return;
      const next: ThemeMode = event.matches ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    media.addEventListener("change", followSystemTheme);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", followSystemTheme);
    };
  }, []);

  useEffect(() => {
    if (warBeat === "ready" || warBeat === "contained") return;
    const timer = window.setTimeout(() => setWarBeat("ready"), warBeat === "reveal" ? 1_650 : 900);
    return () => window.clearTimeout(timer);
  }, [warBeat]);

  useLayoutEffect(() => {
    if (!previousActionRectsRef.current.size) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [actionId, previous] of previousActionRectsRef.current) {
      const row = warActionRowsRef.current.get(actionId);
      if (!row) continue;
      const current = row.getBoundingClientRect();
      const deltaY = previous.top - current.top;
      if (!reduceMotion && Math.abs(deltaY) > 1) {
        row.animate(
          [
            { transform: `translateY(${deltaY}px)`, opacity: 0.72 },
            { transform: "translateY(0)", opacity: 1 },
          ],
          { duration: 560, easing: "cubic-bezier(.2,.82,.2,1)" },
        );
      }
    }
    previousActionRectsRef.current.clear();
  }, [scenarioId]);

  const scenario = CATALOG.find((item) => item.id === scenarioId) ?? bundle.scenario;
  const evidence = bundle.evidence ?? [];
  const paths = bundle.graph?.paths ?? [];
  const nodesById = new Map((bundle.graph?.nodes ?? []).map((node) => [node.id, node]));
  const edgesById = new Map((bundle.graph?.edges ?? []).map((edge) => [edge.id, edge]));
  const actions = [...(bundle.actions ?? [])].sort((left, right) => left.rank - right.rank);
  const recommendation = bundle.recommendation ?? actions[0];
  const previewAction = actions.find((action) => action.id === previewActionId) ?? recommendation;
  const selectedEvidence = evidence.find((item) => item.id === selectedEvidenceId) ?? evidence[0];
  const selectedEvidenceDetails = evidenceDetailRows(selectedEvidence);
  const selectedPath = paths.find((path) => path.id === selectedPathId) ?? paths[0];
  const selectedAgent = bundle.agents?.[selectedAgentIndex] ?? bundle.agents?.[0];
  const simulation = bundle.graph?.simulation;
  const simulationAfter = simulation?.after as JsonRecord | undefined;
  const blockedPathIds = new Set([
    ...strings(simulation?.blockedPathIds),
    ...strings(simulation?.closedPathIds),
    ...strings(simulationAfter?.blockedPathIds),
    ...paths.filter((path) => path.state === "blocked").map((path) => path.id),
  ]);
  const simulationState = String(bundle.approval?.state ?? "");
  const simulatedAction = actions.find((action) => action.status === "simulated");
  const simulated = simulationState.includes("simulated") || Boolean(simulatedAction);
  const currentOpenPaths = simulated ? paths.filter((path) => !blockedPathIds.has(path.id)).length : paths.length;
  const projectedClosedPathIds = new Set(previewAction?.coveredPathIds ?? []);
  const previewClosedPathIds = new Set(previewActionId ? previewAction?.coveredPathIds ?? [] : []);
  const projectedOpenPaths = Math.max(0, paths.length - projectedClosedPathIds.size);
  const riskScore = optionalNumber(bundle.risk?.score);
  const confidenceScore = optionalNumber(bundle.confidence?.score);
  const selectedProducts = scenarioProducts(scenario, evidence);
  const projection = (bundle.projections?.[view] ?? {}) as JsonRecord;
  const cisoProjection = (bundle.projections?.ciso ?? {}) as JsonRecord;
  const memoryRecord = bundle.memory?.record as JsonRecord | undefined;
  const memoryOutcome = memoryRecord?.outcome as JsonRecord | undefined;
  const variantMode = scenarioId === "oauth-phishing-endpoint-malware" ? "malware" : scenarioId === "oauth-phishing" ? "base" : "generic";
  const causalScenario = variantMode !== "generic";
  const counterfactualBundle = variantMode === "malware" ? BASE_CAUSAL_BUNDLE : variantMode === "base" ? ENDPOINT_CAUSAL_BUNDLE : null;
  const counterfactualPathCount = counterfactualBundle?.graph.paths.length ?? null;
  const counterfactualRecommendation = counterfactualBundle?.recommendation.title ?? null;
  const receiptResidualPaths = simulated
    ? numberFrom(simulationAfter, ["openPathCount"], currentOpenPaths)
    : projectedOpenPaths;
  const currentDecisionAction = simulatedAction ?? previewAction;
  const overlayTitle = activeOverlay === "evidence"
    ? "Evidence receipt"
    : activeOverlay === "council"
      ? "Specialist council"
      : activeOverlay === "audiences"
        ? "Stakeholder lenses"
        : "Twelve-layer decision trace";
  const specialistDispositions = bundle.agents.map((agent) => {
    const host = bundle.hostAnalysis?.specialists.find((item) => item.agentId === agent.id);
    return host?.disposition ?? (agent.vote?.actionId === recommendation.id ? "support" : "challenge");
  });
  const dispositionTally = specialistDispositions.reduce((tally, disposition) => {
    if (disposition === "support") tally.support += 1;
    else if (disposition === "challenge") tally.challenge += 1;
    else tally.abstain += 1;
    return tally;
  }, { support: 0, challenge: 0, abstain: 0 });
  const observedClaims = bundle.claims.filter((claim) => claim.classification === "observed");
  const oauthFeaturedClaims = ["C-002", "C-004", "C-005"].flatMap((claimId) => {
    const claim = observedClaims.find((candidate) => candidate.id === claimId);
    return claim ? [claim] : [];
  });
  const isBaseOauthScenario = variantMode === "base";
  const observedBriefClaims = (isBaseOauthScenario && oauthFeaturedClaims.length === 3
    ? oauthFeaturedClaims
    : observedClaims
  ).slice(0, 3);
  const contextFusion = bundle.layers?.contextFusion as JsonRecord | undefined;
  const decisionUncertainty = toText(
    contextFusion?.uncertainty,
    toText(bundle.claims.find((claim) => claim.classification === "hypothesis")?.text, "No uncertainty statement is available."),
  );
  const evidenceBoundary = isBaseOauthScenario
    ? "Confirmed: active cloud-identity compromise. Not established: endpoint execution or persistence. No matching Defender detection exists in the current snapshot; this is not proof the host is clean."
    : decisionUncertainty;
  const businessTargets = (bundle.graph?.nodes ?? []).filter((node) => node.role === "target");
  const derivedPathCount = paths.filter((path) => path.classification === "derived").length;
  const hypothesisPathCount = paths.filter((path) => path.classification === "hypothesis").length;
  const decisionSimulation = currentDecisionAction.simulation as JsonRecord | undefined;
  const expectedSignals = strings(decisionSimulation?.expectedSignals);
  const runnerUp = actions.find((action) => action.rank === 2) ?? actions[1];
  const recommendedDisruption = disruptionPercent(recommendation.components?.inverseDisruption);
  const currentActionDisruption = disruptionPercent(currentDecisionAction.components?.inverseDisruption);
  const runnerUpDisruption = disruptionPercent(runnerUp?.components?.inverseDisruption);
  const debatePositions = records(bundle.debate?.positions);
  const challengePosition = debatePositions.find((position) => position.stance === "challenge");
  const challengeAgent = bundle.agents.find((agent) => agent.id === challengePosition?.agentId);
  const challengeAction = actions.find((action) => action.id === challengePosition?.actionId);
  const actionIsRecommendation = currentDecisionAction.id === recommendation.id;
  const incidentSummary = isBaseOauthScenario
    ? "An active Microsoft 365 session is using a malicious OAuth grant with mail, file, and offline-access permissions. An external forwarding rule is present, and the session accessed Finance/Payments files."
    : scenario.summary;
  const decisionQuestion = isBaseOauthScenario
    ? "Contain the cloud access now, or add endpoint isolation?"
    : bundle.run.question;
  const decisionTitle = currentDecisionAction.id === "A-IDENTITY-CONTAIN"
    ? "Revoke active sessions and remove the malicious OAuth grant"
    : currentDecisionAction.title;
  const decisionDescription = currentDecisionAction.id === "A-IDENTITY-CONTAIN"
    ? "Revoke active Microsoft 365 sessions, remove DocuSync Pro’s delegated grant, and delete the external forwarding rule."
    : currentDecisionAction.description ?? currentDecisionAction.rationale;
  const decisionWhy = actionIsRecommendation && runnerUp
    ? `This interrupts ${currentDecisionAction.coveredPathIds?.length ?? 0}/${paths.length} modeled paths at their common control point. ${runnerUp.title} interrupts ${runnerUp.coveredPathIds?.length ?? 0}/${paths.length}, but raises modeled disruption from ${currentActionDisruption} to ${runnerUpDisruption}.`
    : currentDecisionAction.rationale;
  const decisionOwner = titleCase(
    currentDecisionAction.approvalRole ?? toText(bundle.approval?.role, "Incident commander"),
  );
  const visibleIncidentSummary = cisoMode
    ? toText(cisoProjection.summary, incidentSummary)
    : incidentSummary;
  const visibleDecisionQuestion = cisoMode
    ? `Approve the recommended containment now, or accept continued exposure while the team gathers more evidence?`
    : decisionQuestion;
  const visibleDecisionWhy = cisoMode && actionIsRecommendation && runnerUp
    ? `Approval reduces modeled exposure by ${currentDecisionAction.coveredPathIds?.length ?? 0} of ${paths.length} paths with ${currentActionDisruption} modeled business disruption. The next option raises disruption to ${runnerUpDisruption}.`
    : decisionWhy;
  const confidencePercent = confidenceScore === null ? "n/a" : `${Math.round(confidenceScore)}%`;
  const confidenceBand = titleCase(toText(bundle.confidence?.band, "computed"));
  const decisionProjectionLabel = simulated
    ? "Validated simulation receipt"
    : previewActionId
      ? "Selected-option projection · not applied"
      : "Projected residual exposure";
  const currentDemoStep = DEMO_STEPS[demoStep] ?? DEMO_STEPS[0];
  const demoMetric = currentDemoStep.id === "ingest"
    ? `${selectedProducts.length} sources · ${evidence.length} records`
    : currentDemoStep.id === "evidence"
      ? `${evidence.length} cited records · source fields retained`
    : currentDemoStep.id === "normalize"
      ? `${bundle.claims.length} classified claims`
      : currentDemoStep.id === "exposure"
        ? `${bundle.graph.nodes.length} entities · ${paths.length} paths`
        : currentDemoStep.id === "rank"
          ? `${actions.length} options · ${recommendation.score.toFixed(2)} top score`
          : currentDemoStep.id === "council"
            ? `${bundle.agents.length} specialists · dissent retained`
          : currentDemoStep.id === "govern"
            ? `${recommendation.coveredPathIds?.length ?? 0}/${paths.length} paths require approval`
            : currentDemoStep.id === "simulate"
              ? `${paths.length} → ${receiptResidualPaths} residual paths`
              : currentDemoStep.id === "explain"
                ? "3 operating lenses · 1 canonical result"
                : currentDemoStep.id === "audit"
                  ? `${bundle.trace.length} validated layers`
                  : "Evidence-backed · human-governed · auditable";

  useEffect(() => {
    if (!demoActive) return;
    if (currentDemoStep.id === "evidence") setActiveOverlay("evidence");
    else if (currentDemoStep.id === "rank") {
      setActiveOverlay(null);
      setOptionsOpen(true);
    } else if (currentDemoStep.id === "council") {
      setOptionsOpen(false);
      setActiveOverlay("council");
    } else if (currentDemoStep.id === "explain") {
      setOptionsOpen(false);
      setActiveOverlay("audiences");
    } else if (currentDemoStep.id === "audit") setActiveOverlay("trace");
    else setActiveOverlay(null);
  }, [demoActive, currentDemoStep.id]);

  useEffect(() => {
    if (!demoActive || !demoPlaying) return;
    if (currentDemoStep.id === "govern" || currentDemoStep.id === "complete") {
      setDemoPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setDemoStep((step) => Math.min(step + 1, DEMO_STEPS.length - 1)), 4_800);
    return () => window.clearTimeout(timer);
  }, [demoActive, demoPlaying, demoStep, currentDemoStep.id]);

  function resetSelection(next: ArcBundle) {
    setSelectedEvidenceId(next.evidence[0]?.id ?? "");
    setSelectedPathId(next.graph.paths[0]?.id ?? "");
    setSelectedAgentIndex(0);
    setPreviewActionId("");
    setShowAllPaths(false);
  }

  function toggleTheme() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("arc-theme", next);
  }

  function startDemo() {
    const replay = runArcScenario({ scenarioId: INITIAL_SCENARIO_ID }) as unknown as ArcBundle;
    setScenarioId(INITIAL_SCENARIO_ID);
    setQuestion(replay.run.question);
    setBundle(replay);
    setPersistence(INITIAL_PERSISTENCE);
    resetSelection(replay);
    setPendingAction(null);
    setActiveOverlay(null);
    setOptionsOpen(false);
    setWarBeat("reveal");
    setDemoStep(0);
    setDemoActive(true);
    setDemoPlaying(true);
  }

  function stopDemo() {
    setDemoActive(false);
    setDemoPlaying(false);
    setPendingAction(null);
    setActiveOverlay(null);
    setOptionsOpen(false);
  }

  function advanceDemo() {
    if (currentDemoStep.id === "govern" && !simulated) {
      setDemoPlaying(false);
      setPendingAction(recommendation);
      return;
    }
    setDemoStep((step) => Math.min(step + 1, DEMO_STEPS.length - 1));
  }

  function toggleCausalVariant() {
    if (!causalScenario) return;
    captureActionPositions();
    chooseScenario(variantMode === "malware" ? "oauth-phishing" : "oauth-phishing-endpoint-malware", "flip");
  }

  function chooseScenario(nextId: string, beat: WarBeat = "reveal") {
    const replay = runArcScenario({ scenarioId: nextId }) as unknown as ArcBundle;
    setScenarioId(nextId);
    setQuestion(replay.run.question);
    setBundle(replay);
    setPersistence(INITIAL_PERSISTENCE);
    setWarBeat(beat);
    resetSelection(replay);
    setToast({ message: `${replay.scenario.title} is ready for review`, tone: "info" });
  }

  function captureActionPositions() {
    previousActionRectsRef.current = new Map(
      [...warActionRowsRef.current.entries()].map(([actionId, row]) => [actionId, row.getBoundingClientRect()]),
    );
  }

  function openWarOverlay(next: Exclude<WarOverlay, null>, trigger: HTMLElement) {
    returnFocusRef.current = trigger;
    setActiveOverlay(next);
  }

  async function runAnalysis(event?: FormEvent) {
    event?.preventDefault();
    if (!question.trim() || running) return;
    setRunning(true);
    setImportError("");
    try {
      const response = await fetch("/api/arc/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId, question: question.trim() }),
      });
      if (!response.ok) throw new Error(`Run service returned ${response.status}`);
      const payload = (await response.json()) as JsonRecord;
      const next = (payload.bundle ?? payload.decisionBundle ?? payload) as ArcBundle;
      const validation = validateDecisionBundle(next);
      if (!validation.valid) throw new Error(validation.errors.join("; "));
      setBundle(next);
      setPersistence(persistenceFrom(payload.persistence));
      resetSelection(next);
      setToast({ message: `Verified ${next.evidence.length} evidence records and ${next.graph.paths.length} graph paths`, tone: "success" });
    } catch {
      const fallback = runArcScenario({ scenarioId, question: question.trim() }) as unknown as ArcBundle;
      setBundle(fallback);
      setPersistence({ mode: "browser", durable: false, label: "Available in this session; saving unavailable" });
      resetSelection(fallback);
      setToast({ message: "Deterministic replay completed locally; durable memory is unavailable", tone: "info" });
    } finally {
      setRunning(false);
    }
  }

  function openApproval(action: ArcAction, trigger: HTMLElement) {
    if (simulated) return;
    returnFocusRef.current = trigger;
    setPendingAction(action);
  }

  async function confirmSimulation() {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    let next: ArcBundle;
    try {
      const response = await fetch("/api/arc/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: bundle.run.id,
          actionId: action.id,
          idempotencyKey: `${bundle.run.id}:${action.id}`,
        }),
      });
      if (!response.ok) throw new Error(`Action service returned ${response.status}`);
      const payload = (await response.json()) as JsonRecord;
      next = (payload.bundle ?? payload.decisionBundle ?? payload) as ArcBundle;
      setPersistence(persistenceFrom(payload.persistence));
    } catch {
      next = applySimulatedAction({
        bundle: bundle as unknown as DecisionBundle,
        actionId: action.id,
        approvedBy: "ARES operator",
      }) as unknown as ArcBundle;
      setPersistence({ mode: "browser", durable: false, label: "Available in this session; saving unavailable" });
    }
    const validation = validateDecisionBundle(next);
    if (!validation.valid) {
      setToast({ message: "Simulation receipt failed validation and was not accepted", tone: "error" });
      return;
    }
    setBundle(next);
    setWarBeat("contained");
    if (demoActive) {
      setDemoStep(DEMO_STEPS.findIndex((step) => step.id === "simulate"));
      setDemoPlaying(true);
    }
    const effect = next.graph.simulation;
    const afterState = effect?.after as JsonRecord | undefined;
    const after = numberFrom(afterState, ["openPathCount"], Math.max(0, paths.length - (action.coveredPathIds?.length ?? 0)));
    setToast({ message: `${action.title} simulated: ${paths.length} → ${after} residual modeled paths`, tone: "success" });
  }

  function exportBundle() {
    const json = exportDecisionBundle(bundle as unknown as DecisionBundle);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ares-${bundle.scenario.id}-${bundle.run.id}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setToast({ message: "Investigation receipt downloaded", tone: "success" });
  }

  function acceptImportedBundle(parsed: unknown) {
    const validation = validateDecisionBundle(parsed);
    if (!validation.valid) throw new Error(validation.errors.join("; "));
    const next = parsed as ArcBundle;
    if (!CATALOG.some((item) => item.id === next.scenario.id)) throw new Error("This receipt references an unsupported incident type.");
    setBundle(next);
    setScenarioId(next.scenario.id);
    setQuestion(next.run.question);
    setPersistence({ mode: "browser", durable: false, label: "Imported receipt · available in this session" });
    resetSelection(next);
    setImportError("");
    setImportText("");
    setImportOpen(false);
    setToast({
      message: next.hostAnalysis ? "Cited analysis and investigation receipt verified" : "Investigation receipt verified",
      tone: "success",
    });
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      acceptImportedBundle(JSON.parse(await file.text()));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "This is not a valid ARES investigation receipt.");
      setImportOpen(true);
    }
  }

  function importPastedBundle() {
    try {
      acceptImportedBundle(JSON.parse(importText));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Paste a valid ARES investigation receipt.");
    }
  }

  function openImport(trigger: HTMLElement) {
    returnFocusRef.current = trigger;
    setImportOpen(true);
  }

  const pathRows = showAllPaths ? paths : paths.slice(0, 6);
  const selectedPathEdges = (selectedPath?.edgeIds ?? []).map((id) => edgesById.get(id)).filter(Boolean) as ArcGraphEdge[];
  const selectedPathEvidence = new Set([
    ...(selectedPath?.evidenceIds ?? []),
    ...selectedPathEdges.flatMap((edge) => edge.evidenceIds ?? []),
  ]);
  const receipt = bundle.layers?.receipt as JsonRecord | undefined;
  const receiptProvenance = receipt?.provenance as JsonRecord | undefined;

  return (
    <main className={`app-shell ${cisoMode ? "ciso-mode" : "engineer-mode"}`}>
      <section
        className={`war-room beat-${warBeat} ${simulated ? "is-contained" : ""} ${demoActive ? "demo-active" : ""}`.trim()}
        data-demo-step={demoActive ? currentDemoStep.id : undefined}
        data-testid="war-room-first-screen"
        aria-label="Incident decision war room"
      >
      <section id="ares-cockpit" className="ares-one-screen" data-testid="ares-one-screen" data-layout="fixed-viewport" data-view={cisoMode ? "ciso" : "security-engineer"} aria-label={cisoMode ? "ARES CISO decision cockpit" : "ARES security decision cockpit"}>
      <header className="topbar war-top-rail">
        <a className="brand" href="#ares-cockpit" aria-label="ARES workspace">
          <AresMark />
          <span><strong>ARES</strong><small>{cisoMode ? "CISO Decision Cockpit" : "Cyber Decision Engine"}</small></span>
        </a>
        <label className="command-scenario" htmlFor="command-scenario">
          <span>{cisoMode ? "Decision case" : "Active incident"}</span>
          <select id="command-scenario" data-testid="scenario-selector" data-primary-control="true" value={scenarioId} onChange={(event) => chooseScenario(event.target.value)}>
            {CATALOG.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.expectedPathCount} paths</option>)}
          </select>
        </label>
        <nav className="role-switcher" aria-label="Select operating view">
          <Link className={cisoMode ? "" : "active"} href="/" aria-current={cisoMode ? undefined : "page"}>Security Engineer</Link>
          <Link className={cisoMode ? "active" : ""} href="/ciso" aria-current={cisoMode ? "page" : undefined}>CISO</Link>
        </nav>
        <div className="top-actions">
          <button className={demoActive ? "button demo-trigger active" : "button demo-trigger"} type="button" onClick={demoActive ? stopDemo : startDemo}>{demoActive ? "Exit demo" : "▶ Demo mode"}</button>
          <button className="theme-toggle" data-testid="theme-toggle" type="button" aria-label={`Use ${theme === "dark" ? "analyst daylight" : "dark console"} theme`} aria-pressed={theme === "light"} onClick={toggleTheme}><span aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span>{theme === "dark" ? "Daylight" : "Dark"}</button>
          <button className="button quiet" onClick={(event) => openImport(event.currentTarget)}>Open investigation</button>
          <button className="button primary" onClick={exportBundle}>Export receipt</button>
          <input ref={fileInputRef} hidden type="file" accept="application/json,.json" onChange={importFile} />
        </div>
      </header>

      <div className="environment-bar war-trust-strip" role="note">
        <span className="environment-mode"><i /> Simulation mode</span>
        <p>Scenario replay · no production controls connected</p>
        <span className={bundle.hostAnalysis ? "environment-ai attached" : "environment-ai"}>{bundle.hostAnalysis ? "GPT-5.6 review attached" : "GPT-5.6 packets ready"}</span>
        <span className="environment-evidence">Evidence as of {fixedTime(scenario.asOf)} · {evidence.length} cited records · Decision record validated</span>
        <span className={persistence.durable ? "environment-memory durable" : "environment-memory"}>{persistence.durable ? "Decision memory connected" : "Local session"}</span>
      </div>

        <div className="war-map-ambient" aria-hidden="true" />
        <div className="decision-workspace" data-testid="security-decision-brief">
          <section className="brief-region brief-situation-region" data-testid="situation-region" aria-label="Incident situation and evidence">
          <section className="brief-situation" data-testid="brief-situation" aria-labelledby="situation-title">
            <header className="brief-incident">
              <div className="brief-card-heading">
                <span className="eyebrow">01 · {cisoMode ? "DECISION CONTEXT" : "SITUATION"}</span>
                <div className="brief-status-line">
                  <span className="brief-risk">{cisoMode ? "Business risk" : titleCase(toText(bundle.risk?.band, "Computed"))} · {scoreOrNA(riskScore)}</span>
                  <span>{cisoMode ? `Owner · ${decisionOwner}` : scenario.story?.family ?? "Security incident"}</span>
                  <span>{fixedTime(scenario.asOf)}</span>
                </div>
              </div>
              <h1 id="situation-title">{scenario.title}</h1>
              <p>{visibleIncidentSummary}</p>
              <div className="brief-decision-question" data-testid="decision-question">
                <small>{cisoMode ? "Approval decision" : "Decision to resolve"}</small>
                <strong>{visibleDecisionQuestion}</strong>
              </div>
            </header>

            <div className="brief-confirmed" data-testid="confirmed-evidence">
              <div className="brief-section-label"><span>{cisoMode ? "Decision basis" : "Confirmed facts"}</span><small>{evidence.length} cited records</small></div>
              <ul>
                {observedBriefClaims.map((claim) => (
                  <li key={claim.id}><i /><span>{claim.text}<small>{claim.id} · {(claim.evidenceIds ?? []).join(" · ")}</small></span></li>
                ))}
              </ul>
            </div>

            <aside className="brief-uncertainty" data-testid="unconfirmed-evidence" aria-label="Current uncertainty">
              <div className="brief-section-label"><span>{cisoMode ? "Decision sensitivity" : "Open uncertainty"}</span><small>Evidence boundary</small></div>
              <p>{evidenceBoundary}</p>
              <button type="button" onClick={(event) => openWarOverlay("evidence", event.currentTarget)}>Review cited facts</button>
            </aside>

            <div className="brief-arc-value" role="note" aria-label="ARES decision trace summary">
              <strong>{cisoMode ? "Governed decision trace" : "Decision trace"}</strong>
              <p><b>{evidence.length}</b> cited records <i>→</i> <b>{paths.length}</b> classified exposure paths <i>→</i> <b>{actions.length}</b> ranked responses <i>→</i> approval-ready receipt</p>
            </div>
          </section>
          </section>

          <section className="brief-region brief-exposure-region" data-testid="exposure-region" aria-label="Exposure and business reach">
          <section className="brief-exposure" data-testid="modeled-exposure" aria-labelledby="exposure-title">
            <header className="brief-panel-heading">
              <div>
                <span className="eyebrow">02 · {cisoMode ? "BUSINESS EXPOSURE" : "EXPOSURE MODEL"}</span>
                <h2 id="exposure-title">{cisoMode ? "Business assets within modeled reach" : `Modeled reach to ${scenario.story?.businessAsset ?? "business operations"}`}</h2>
                <p>{cisoMode ? "Evidence-linked business exposure—not a confirmed loss forecast." : "Evidence-linked reachability from this replay receipt—not a live network map."}</p>
              </div>
              <dl className="brief-exposure-metrics">
                <div><dt>{cisoMode ? "Exposure paths" : "Modeled paths"}</dt><dd>{paths.length}</dd><small>{derivedPathCount} evidence-derived · {hypothesisPathCount} hypothetical impact {hypothesisPathCount === 1 ? "path" : "paths"}</small></div>
                <div><dt>{cisoMode ? "Risk posture" : "Policy risk"}</dt><dd>{scoreOrNA(riskScore)}</dd><small>{titleCase(toText(bundle.risk?.band, "computed"))}</small></div>
                <div><dt>{cisoMode ? "Evidence quality" : "Evidence confidence"}</dt><dd>{confidencePercent}</dd><small>{confidenceBand} evidence</small></div>
              </dl>
            </header>

            <div className="brief-targets" data-testid="business-target"><span>{cisoMode ? "Business assets in scope" : "Within modeled reach"}</span>{businessTargets.map((node) => <strong key={node.id}>{isBaseOauthScenario ? `${node.id === "N-SHAREPOINT" ? "Observed access" : "Hypothesized impact"} — ` : ""}{node.label ?? node.id}</strong>)}</div>

            <div className="war-map-stage">
              <div className="war-map-toolbar">
                <div className="exposure-legend" aria-label="Exposure model legend">
                  <span><i className="derived" />Evidence-supported relationship</span>
                  <span><i className="hypothesis" />Hypothesized impact</span>
                  <span><i className="modeled-closure" />Modeled interruption</span>
                </div>
                <span
                  className="telemetry-counter"
                  id="counterfactual-path-count"
                  data-testid="counterfactual-path-count"
                  data-path-count={paths.length}
                  key={`${scenarioId}-${paths.length}`}
                >
                  <strong>{simulated ? receiptResidualPaths : paths.length}</strong>
                  <small>{simulated ? "residual modeled paths" : "modeled paths"}</small>
                </span>
              </div>

              <AttackPathGraph
                key={`${scenarioId}-${simulated ? "contained" : "open"}`}
                cinematic
                nodes={bundle.graph.nodes}
                edges={bundle.graph.edges}
                paths={paths}
                selectedPathId={selectedPath?.id ?? ""}
                previewClosedPathIds={previewClosedPathIds}
                simulatedBlockedPathIds={blockedPathIds}
                onSelectPath={setSelectedPathId}
                variantMode={variantMode}
                ariaLabel={`Evidence-linked exposure model for ${scenario.title}`}
              />
              {selectedPath && <p className="selected-path-summary"><strong>{selectedPath.label ?? selectedPath.id}</strong><span>{titleCase(selectedPath.classification ?? "derived")} path · {selectedPath.state === "blocked" ? "interrupted in simulation" : "modeled reachable"}</span></p>}
            </div>

            {causalScenario && counterfactualBundle ? (
              <button
                className="brief-counterfactual"
                type="button"
                data-testid="counterfactual-toggle"
                aria-label="Test the paired endpoint-evidence scenario"
                aria-pressed={variantMode === "malware"}
                aria-controls="counterfactual-path-count"
                aria-describedby="counterfactual-impact"
                onClick={toggleCausalVariant}
              >
                <span><i className={variantMode === "malware" ? "confirmed" : ""} /> Decision sensitivity</span>
                <strong>{variantMode === "malware" ? "Current evidence: endpoint malware confirmed" : "Current evidence: endpoint compromise not confirmed"}</strong>
                <small id="counterfactual-impact" aria-live="polite">Confirming endpoint execution expands reach to {counterfactualPathCount ?? "n/a"} paths and changes the top response to {counterfactualRecommendation ?? "n/a"}.</small>
              </button>
            ) : (
              <div className="brief-counterfactual unavailable"><span>Decision sensitivity</span><strong>No paired evidence scenario is available.</strong></div>
            )}
          </section>
          </section>

          <aside className="brief-resolution" aria-label="Decision and modeled outcome">
            <section className="brief-region brief-decision-region" data-testid="decision-region" aria-label="Recommended response decision">
            <article className="brief-decision-card" data-testid="policy-recommendation" key={`${scenarioId}-${currentDecisionAction.id}-${simulated ? "simulated" : "preview"}`} aria-labelledby="decision-title">
              <header><span className="eyebrow">03 · {cisoMode ? "APPROVAL DECISION" : actionIsRecommendation ? "RECOMMENDED RESPONSE" : "ALTERNATIVE PREVIEW"}</span><small>{cisoMode ? `Owner · ${decisionOwner}` : <>{titleCase(toText(bundle.approval?.state, "pending"))}<span className="ares-sr-only"> · {titleCase(currentDecisionAction.approvalRole ?? "approval not required")}</span></>}</small></header>
              <h2 id="decision-title">{decisionTitle}</h2>
              <p>{decisionDescription}</p>
              <div className="brief-why"><small>{cisoMode ? "Decision rationale" : actionIsRecommendation ? "Why this response" : "Why this option"}</small><strong>{visibleDecisionWhy}</strong></div>
              <dl className="brief-decision-metrics" data-testid="modeled-coverage">
                <div><dt>{cisoMode ? "Exposure interrupted" : "Paths interrupted"}</dt><dd>{currentDecisionAction.coveredPathIds?.length ?? 0}/{paths.length}</dd></div>
                <div><dt>{cisoMode ? "Modeled business disruption" : "Modeled disruption"}</dt><dd>{currentActionDisruption}</dd></div>
                <div><dt>{cisoMode ? "Recovery flexibility" : "Reversibility input"}</dt><dd>{percentOrNA(currentDecisionAction.components?.reversibility)}</dd></div>
              </dl>

              <div className="war-decision-actions">
                <button className={simulated ? "button approve completed" : "button approve"} disabled={simulated} onClick={(event) => openApproval(currentDecisionAction, event.currentTarget)}>{simulated ? "✓ Simulation receipt issued" : cisoMode ? "Review approval decision" : "Review simulation and approval"}</button>
                <button className="war-text-button" onClick={(event) => openWarOverlay("council", event.currentTarget)}>{cisoMode ? "Review OpenAI evidence and dissent" : "Open OpenAI specialist review"}</button>
              </div>

              <section className="brief-cost" data-testid="operational-costs" aria-labelledby="cost-title">
                <h3 id="cost-title">{cisoMode ? "Business tradeoff" : "Operational impact"}</h3>
                <ul>{(currentDecisionAction.tradeoffs ?? []).map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}</ul>
              </section>

              {runnerUp && (
                <section className="brief-comparison" data-testid="runner-up-comparison" aria-labelledby="comparison-title">
                  <h3 id="comparison-title">{cisoMode ? "Alternative tradeoff" : "Runner-up tradeoff"}</h3>
                  <div><span><b>Next option</b><strong>{runnerUp.title}</strong></span><small>{runnerUp.coveredPathIds?.length ?? 0}/{paths.length} paths · modeled disruption {runnerUpDisruption} versus {recommendedDisruption}</small></div>
                </section>
              )}

              {challengePosition && <div className="brief-dissent"><small>Material dissent retained</small><p><strong>{challengeAgent?.name ?? titleCase(toText(challengePosition.agentId, "Specialist"))}:</strong> {toText(challengePosition.argument)}{challengeAction ? ` Prefers “${challengeAction.title}.”` : ""}</p></div>}
            </article>
            </section>

            <section className="brief-region brief-outcome-region" data-testid="outcome-region" aria-label="Modeled outcome and verification projection">
            <article className="brief-outcome-card" aria-labelledby="outcome-title">
              <header><span className="eyebrow">04 · {cisoMode ? "PROJECTED BUSINESS OUTCOME" : "PROJECTED RESIDUAL EXPOSURE"}</span><small>{simulated ? "SIMULATED · NO LIVE CHANGES" : "PROJECTION ONLY"}</small></header>
              <h2 id="outcome-title">{cisoMode ? simulated ? "Simulation outcome recorded" : "Exposure after approval" : decisionProjectionLabel}</h2>
              <div className="brief-outcome-count"><span><small>{cisoMode ? "Open exposure paths" : "Modeled paths"}</small><strong>{paths.length} → {receiptResidualPaths}</strong></span><p>{simulated ? "Simulation receipt values" : cisoMode ? "Expected if the shown response is approved" : "Projected from the response shown above"}</p></div>
              <div className="brief-signals"><h3>{cisoMode ? "Verification for decision owner" : "Verify after action"}</h3><ul>{expectedSignals.slice(0, 3).map((signal) => <li key={signal}>{signal}</li>)}</ul></div>
              <details className="war-option-stack" aria-label="Ranked response options" open={optionsOpen} onToggle={(event) => setOptionsOpen(event.currentTarget.open)}>
                <summary className="war-option-stack-head"><span>{cisoMode ? "Compare response tradeoffs" : "Compare all response options"}</span><small>{cisoMode ? "Exposure reduction versus disruption" : "Preview coverage versus disruption"}</small></summary>
                {actions.map((action) => (
                  <button
                    ref={(row) => {
                      if (row) warActionRowsRef.current.set(action.id, row);
                      else warActionRowsRef.current.delete(action.id);
                    }}
                    className={`war-option-row ${action.id === recommendation.id ? "recommended" : ""} ${action.id === currentDecisionAction.id ? "selected" : ""}`.trim()}
                    key={action.id}
                    type="button"
                    aria-pressed={action.id === currentDecisionAction.id}
                    disabled={simulated && action.status !== "simulated"}
                    onClick={() => setPreviewActionId(action.id)}
                  >
                    <span className="rank">{String(action.rank).padStart(2, "0")}</span>
                    <span><strong>{action.title}</strong><small>{action.coveredPathIds?.length ?? 0}/{paths.length} modeled · disruption {disruptionPercent(action.components?.inverseDisruption)}</small></span>
                    <span className="war-option-score"><i><b style={{ width: `${Math.max(0, Math.min(100, action.score))}%` }} /></i><strong>{action.score.toFixed(2)}</strong></span>
                  </button>
                ))}
              </details>
              <p className="brief-boundary" data-testid="approval-simulation-boundary">Projection only. ARES is not connected to live identity, endpoint, cloud, network, code, or backup controls.</p>
            </article>
            </section>
          </aside>
        </div>

        <nav className="war-overlay-launcher" data-testid="detail-overlay-launcher" aria-label="Open investigation and decision detail overlays">
          <button type="button" aria-haspopup="dialog" aria-controls="evidence-overlay" aria-expanded={activeOverlay === "evidence"} onClick={(event) => openWarOverlay("evidence", event.currentTarget)}><span>01</span> Evidence</button>
          <button type="button" data-testid="open-council-overlay" aria-label="Open GPT-5.6 specialist council" aria-haspopup="dialog" aria-controls="council-overlay" aria-expanded={activeOverlay === "council"} onClick={(event) => openWarOverlay("council", event.currentTarget)}><span>08</span> OpenAI council</button>
          <button type="button" data-testid="open-audiences-overlay" aria-label="Open stakeholder operating lenses" aria-haspopup="dialog" aria-controls="audiences-overlay" aria-expanded={activeOverlay === "audiences"} onClick={(event) => openWarOverlay("audiences", event.currentTarget)}><span>03</span> Audiences</button>
          <button type="button" data-testid="open-trace-overlay" aria-label="Open decision trace and audit receipt" aria-haspopup="dialog" aria-controls="trace-overlay" aria-expanded={activeOverlay === "trace"} onClick={(event) => openWarOverlay("trace", event.currentTarget)}><span>12</span> Trace</button>
        </nav>
      </section>
      </section>

      {demoActive && (
        <aside className="demo-director" role="region" aria-label="Guided product demonstration" aria-live="polite">
          <div className="demo-director-head">
            <span><i /> Guided demo</span>
            <strong>{String(demoStep + 1).padStart(2, "0")} / {String(DEMO_STEPS.length).padStart(2, "0")}</strong>
          </div>
          <div className="demo-progress" aria-label="Demo progress">
            {DEMO_STEPS.map((step, index) => <button key={step.id} className={index === demoStep ? "current" : index < demoStep ? "complete" : ""} aria-label={`Go to ${step.label}`} onClick={() => { setDemoStep(index); setDemoPlaying(false); }}><i /><span>{step.label}</span></button>)}
          </div>
          <div className="demo-director-copy">
            <div key={currentDemoStep.id}><small>{currentDemoStep.label}</small><h2>{currentDemoStep.title}</h2><p>{currentDemoStep.description}</p></div>
            <strong key={`${currentDemoStep.id}-metric`}>{demoMetric}</strong>
          </div>
          {currentDemoStep.id === "ingest" && <div className="demo-sources">{selectedProducts.map((product) => <span key={product}>{product}</span>)}</div>}
          <div className="demo-director-actions">
            <button type="button" onClick={() => setDemoStep((step) => Math.max(0, step - 1))} disabled={demoStep === 0}>Back</button>
            <button type="button" onClick={() => setDemoPlaying((playing) => !playing)} disabled={currentDemoStep.id === "govern" || currentDemoStep.id === "complete"}>{demoPlaying ? "Pause" : "Play"}</button>
            <button className="primary" type="button" onClick={advanceDemo} disabled={currentDemoStep.id === "complete"}>{currentDemoStep.id === "govern" && !simulated ? "Open approval screen" : "Next screen"}</button>
          </div>
        </aside>
      )}

      {activeOverlay && (
        <div className="war-overlay-backdrop" role="presentation" onMouseDown={closeWarOverlay}>
          <section
            ref={warOverlayRef}
            className="war-overlay-panel"
            id={`${activeOverlay}-overlay`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="war-overlay-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="war-overlay-head">
              <div><span className="eyebrow">ARES INVESTIGATION</span><h2 id="war-overlay-title">{overlayTitle}</h2></div>
              <button type="button" onClick={closeWarOverlay} aria-label={`Close ${overlayTitle}`}>×</button>
            </header>

            <div className="war-overlay-body">
              {activeOverlay === "evidence" && (
                <div className="war-overlay-evidence">
                  <div className="evidence-list">
                    {evidence.map((item) => <button key={item.id} className={selectedEvidence?.id === item.id ? "selected" : ""} onClick={() => setSelectedEvidenceId(item.id)}><i /><span><strong>{titleCase(item.type ?? item.id)}</strong><small>{displaySource(item.source)}</small></span><b>{item.id}</b></button>)}
                  </div>
                  {selectedEvidence && <div className="evidence-detail"><div><span>{titleCase(selectedEvidence.status ?? "observed")}</span><b>{selectedEvidence.id}</b></div><strong>{selectedEvidence.summary}</strong>{selectedEvidenceDetails.length > 0 && <dl className="evidence-telemetry" aria-label="Source event fields">{selectedEvidenceDetails.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>}<dl className="evidence-quality"><div><dt>Reliability</dt><dd>{percentOrNA(selectedEvidence.reliability)}</dd></div><div><dt>Freshness</dt><dd>{optionalNumber(selectedEvidence.freshnessMinutes) === null ? "n/a" : `${selectedEvidence.freshnessMinutes} min`}</dd></div></dl><small>{fixedTime(selectedEvidence.observedAt)} · source provenance retained</small></div>}
                </div>
              )}

              {activeOverlay === "council" && (
                <div className="war-overlay-council">
                  <section className="openai-reasoning-boundary" aria-label="OpenAI and deterministic responsibility boundary">
                    <header><span>OPENAI REASONING LAYER</span><strong>{bundle.hostAnalysis ? "GPT-5.6 specialist review attached and validated" : "GPT-5.6 specialist packets prepared for the Codex host"}</strong></header>
                    <div>
                      <article><small>GPT-5.6 · Codex host</small><b>Interpret · challenge · explain</b><p>Produces qualitative, evidence-cited specialist judgments and audience narratives.</p></article>
                      <i aria-hidden="true">CITED IDS ONLY</i>
                      <article><small>ARES · deterministic engine</small><b>Graph · score · validate</b><p>Owns every fact, path, number, rank, approval transition, and receipt invariant.</p></article>
                    </div>
                    <footer><span>✓ Unknown citations rejected</span><span>✓ Numeric model fields rejected</span><span>✓ Dissent retained</span><span>✓ No OpenAI API key</span></footer>
                  </section>
                  <div className="overlay-summary-line"><span>{dispositionTally.support} support</span><span>{dispositionTally.challenge} dissent</span>{dispositionTally.abstain > 0 && <span>{dispositionTally.abstain} abstain</span>}</div>
                  <div className="agent-tabs">
                    {bundle.agents.map((agent, index) => {
                      const host = bundle.hostAnalysis?.specialists.find((item) => item.agentId === agent.id);
                      const disposition = specialistDispositions[index] ?? "abstain";
                      return <button key={agent.id ?? index} className={selectedAgentIndex === index ? "selected" : ""} onClick={() => setSelectedAgentIndex(index)} aria-pressed={selectedAgentIndex === index}><span className={`agent-avatar disposition-${disposition}`}>{(agent.name ?? "A")[0]}</span><span><strong>{agent.name}</strong><small>{disposition === "challenge" ? "dissent" : disposition}{host ? " · cited" : " · packet"}</small></span></button>;
                    })}
                  </div>
                  {selectedAgent && (() => {
                    const host = bundle.hostAnalysis?.specialists.find((item) => item.agentId === selectedAgent.id);
                    const disposition = specialistDispositions[selectedAgentIndex] ?? "abstain";
                    return <div className="agent-result"><div><span className={`agent-avatar large disposition-${disposition}`}>{(selectedAgent.name ?? "A")[0]}</span><span><small>{selectedAgent.role}</small><strong>{disposition === "challenge" ? "Dissenting assessment" : disposition === "abstain" ? "Abstaining assessment" : "Supporting assessment"}</strong></span></div><p>{host?.claims[0]?.text ?? selectedAgent.assessment?.headline ?? "Assessment is bounded to cited evidence."}</p><div><span>{host ? new Set(host.claims.flatMap((claim) => claim.evidenceIds)).size : selectedAgent.assessment?.evidenceIds?.length ?? 0} evidence IDs</span><span>{disposition === "challenge" ? "Challenges" : disposition === "abstain" ? "No vote on" : "Supports"} {host?.actionId ?? selectedAgent.vote?.actionId ?? recommendation.id}</span><span>Source linked</span></div></div>;
                  })()}
                  <div className="debate-line"><span><small>Decision synthesis</small><strong>{toText((bundle.debate.consensus as JsonRecord | undefined)?.rule, "Published action score remains authoritative.")}</strong></span><p>{bundle.hostAnalysis?.debate.summary ?? toText((bundle.debate.conflict as JsonRecord | undefined)?.summary, "No material dissent in the specialist review.")}</p></div>
                </div>
              )}

              {activeOverlay === "audiences" && (
                <div className="war-overlay-audiences">
                  <div className="war-overlay-tabs" role="tablist" aria-label="Audience lens">
                    {(["soc", "ciso", "executive"] as ViewMode[]).map((mode) => <button id={`war-audience-tab-${mode}`} aria-controls="war-audience-panel" role="tab" aria-selected={view === mode} className={view === mode ? "selected" : ""} key={mode} onClick={() => setView(mode)}>{mode === "soc" ? "SOC" : mode === "ciso" ? "CISO" : titleCase(mode)}</button>)}
                  </div>
                  <div className="audience-content" id="war-audience-panel" role="tabpanel" aria-labelledby={`war-audience-tab-${view}`}><div><span className="audience-label">{toText(projection.audience, view.toUpperCase())} BRIEF</span><h3>{toText(projection.headline, recommendation.title)}</h3><p>{bundle.hostAnalysis?.audienceSummaries?.[view]?.summary ?? toText(projection.summary, recommendation.rationale)}</p></div><div className="projection-metrics">{records(projection.metrics).map((metric, index) => <div key={`${toText(metric.label)}-${index}`}><span>{toText(metric.label)}</span><strong>{toText(metric.value)}</strong></div>)}</div><ol>{records(projection.actions).map((action, index) => <li key={toText(action.id, String(index))}><span>{String(index + 1).padStart(2, "0")}</span><p><strong>{toText(action.text)}</strong><small>{titleCase(toText(action.priority, "next"))} · {strings(action.evidenceIds).length} cited records</small></p></li>)}</ol></div>
                </div>
              )}

              {activeOverlay === "trace" && (
                <div className="war-overlay-trace">
                  <div className="layer-grid">{bundle.trace.map((step, index) => <div key={step.layer ?? index}><span>{String(step.index ?? index + 1).padStart(2, "0")}</span><p><strong>{titleCase(step.layer ?? `Layer ${index + 1}`)}</strong><small>{productCopy(step.summary, "Trace step completed.")}</small></p><i>✓</i></div>)}</div>
                  <dl className="receipt-facts"><div><dt>Receipt</dt><dd>{toText(receipt?.id, bundle.run.id)}</dd></div><div><dt>Policy computation</dt><dd>{receiptProvenance?.modelCalls === false ? "Deterministic" : "Not declared"}</dd></div><div><dt>External actions</dt><dd>{receiptProvenance?.externalActions === false ? "None" : "Not declared"}</dd></div><div><dt>OpenAI review</dt><dd>{bundle.hostAnalysis ? "GPT-5.6 analysis attached and validated" : "GPT-5.6 packets prepared for Codex"}</dd></div></dl>
                  <button className="button primary" type="button" onClick={exportBundle}>Download machine-verifiable receipt</button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      <section className="flow-shell war-details-flow" id="workspace" data-testid="cockpit-first-viewport">
        <div className="flow-main">
          {cisoMode && (
            <section className="ciso-overview panel" id="overview">
              <div className="ciso-overview-head">
                <div><span className="eyebrow">EXECUTIVE DECISION OVERVIEW</span><h1>{scenario.story?.businessAsset ?? "Business operations"} is within modeled reach</h1><p>{toText(cisoProjection.summary, bundle.scenario.summary)}</p></div>
                <span className="risk-badge"><small>Risk index</small><strong>{scoreOrNA(riskScore)}</strong><em>{titleCase(toText(bundle.risk.band, "priority"))}</em></span>
              </div>
              <div className="ciso-kpi-grid">
                <article><span>Modeled reachable paths</span><strong>{currentOpenPaths}</strong><small>{simulated ? `${paths.length - currentOpenPaths} interrupted in simulation` : `${paths.length} require a decision`}</small></article>
                <article><span>Decision confidence</span><strong>{scoreOrNA(confidenceScore)}</strong><small>{titleCase(toText(bundle.confidence.band, "computed"))} evidence confidence</small></article>
                <article><span>Recommended action</span><strong>{recommendation.score.toFixed(2)}</strong><small>{recommendation.title}</small></article>
                <article><span>Approval state</span><strong>{simulated ? "Simulation receipted" : "Pending"}</strong><small>{toText(recommendation.approvalRole, "Human approval required")}</small></article>
              </div>
              <div className="ciso-decision-line"><span><small>Decision required</small><strong>{toText(cisoProjection.headline, recommendation.title)}</strong></span><p>{recommendation.rationale}</p></div>
            </section>
          )}

          <section className="decision-panel" id="decision">
            <div className="decision-summary">
              <div className="decision-kicker"><span><i /> {previewAction.id === recommendation.id ? "Recommended response" : "Response preview"}</span><b>Risk {scoreOrNA(riskScore)}</b></div>
              <span className="eyebrow">THE DECISION</span>
              <h1>{previewAction.title}</h1>
              <p>{previewAction.rationale ?? previewAction.description ?? recommendation.rationale}</p>
              <div className="decision-metrics">
                <div><small>Decision score</small><strong>{previewAction.score.toFixed(2)}</strong><span>Governed policy</span></div>
                <div><small>Modeled path coverage</small><strong>{previewClosedPathIds.size}/{paths.length}</strong><span>{percentOrNA(previewAction.components?.pathCoverage)} policy input</span></div>
                <div><small>Continuity score</small><strong>{percentOrNA(previewAction.components?.inverseDisruption)}</strong><span>Inverse-disruption input</span></div>
              </div>
              <div className="decision-cta">
                <button className={simulated ? "button approve completed" : "button approve"} disabled={simulated} onClick={(event) => openApproval(previewAction, event.currentTarget)}>{simulated ? "✓ Simulation receipt issued" : `Review ${previewAction.id === recommendation.id ? "recommended" : "previewed"} response simulation`}</button>
                <a href="#proof">Inspect causal evidence</a>
              </div>
              <small className="safety-copy">RESPONSE PREVIEW · connected products remain unchanged</small>
            </div>
            <aside className="live-receipt" aria-label="Decision projection receipt">
              <div className="live-receipt-head"><span className="eyebrow">DECISION PROJECTION</span><span><i /> recomputed</span></div>
              <div className="receipt-risk-row">
                <div className={`risk-dial ${riskScore === null ? "n-a" : ""}`} style={{ "--risk-angle": `${Math.max(0, Math.min(100, riskScore ?? 0)) * 3.6}deg` } as CSSProperties}>
                  <span><strong>{scoreOrNA(riskScore)}</strong><small>risk</small></span>
                </div>
                <dl>
                  <div><dt>Confidence</dt><dd>{scoreOrNA(confidenceScore)}</dd></div>
                  <div><dt>Open → residual</dt><dd>{paths.length} → {projectedOpenPaths}</dd></div>
                  <div><dt>Evidence</dt><dd>{evidence.length} records</dd></div>
                </dl>
              </div>
              {causalScenario ? (
                <button className="evidence-flip" type="button" aria-pressed={variantMode === "malware"} onClick={toggleCausalVariant}>
                  <span><i className={variantMode === "malware" ? "confirmed" : ""} /><small>Endpoint evidence</small><strong>{variantMode === "malware" ? "Malware confirmed" : "No endpoint malware detected"}</strong></span>
                  <b>{paths.length} modeled paths · {recommendation.title}</b>
                  <em>Flip counterfactual ↔</em>
                </button>
              ) : (
                <div className="evidence-flip unavailable"><span><small>Counterfactual</small><strong>No paired variant</strong></span><b>Current evidence set is canonical</b></div>
              )}
              <div className="receipt-boundary"><span>AI explains evidence</span><span>Policy owns score</span><span>Human approves</span></div>
            </aside>
          </section>

          <form className="analysis-runner" onSubmit={runAnalysis}>
            <div className="scenario-context">
              <div className="scenario-title"><span className="scenario-icon large">{scenarioInitials(scenario)}</span><div><span className="eyebrow">ACTIVE INCIDENT</span>{cisoMode ? <h2>{bundle.scenario.title}</h2> : <h2>{bundle.scenario.title}</h2>}<p>{bundle.scenario.summary}</p></div></div>
              <div className="product-tags">{selectedProducts.map((product) => <span key={product}>{product}</span>)}</div>
            </div>
            <label htmlFor="decision-question">Decision objective</label>
            <div className="question-row">
              <textarea id="decision-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={600} rows={2} />
              <button className="button primary run" type="submit" disabled={running || !question.trim()}>{running ? <><i /> Correlating…</> : <>Re-run analysis <span>→</span></>}</button>
            </div>
            <div className="stage-rail" aria-label="End-to-end flow">
              <span className="complete"><b>1</b><small>Ingest</small><em>{evidence.length} records</em></span>
              <i />
              <span className="complete"><b>2</b><small>Correlate</small><em>{paths.length} paths</em></span>
              <i />
              <span className="complete"><b>3</b><small>Decide</small><em>{actions.length} options</em></span>
              <i />
              <span className={simulated ? "complete" : "active"}><b>4</b><small>Govern</small><em>{simulated ? "approved" : "human gate"}</em></span>
              <i />
              <span className={simulated ? "complete" : "locked"}><b>5</b><small>Verify</small><em>{simulated ? `${currentOpenPaths} open` : "after action"}</em></span>
            </div>
          </form>

          <section className="proof-grid" id="proof">
            <article className="graph-panel panel">
              <div className="panel-heading"><div><span className="eyebrow">02 · CORRELATE · LAYER 6</span><h2>Exact attack-path explorer</h2></div><div className="heading-stats"><span><b>{bundle.graph.nodes.length}</b> nodes</span><span><b>{bundle.graph.edges.length}</b> edges</span><span><b>{paths.length}</b> paths</span></div></div>
              <p className="panel-intro">This SVG is drawn from the receipt&apos;s real <code>from</code>/<code>to</code> topology. Select a path or preview a response to see exactly which routes close and which remain.</p>
              <AttackPathGraph
                nodes={bundle.graph.nodes}
                edges={bundle.graph.edges}
                paths={paths}
                selectedPathId={selectedPath?.id ?? ""}
                previewClosedPathIds={previewClosedPathIds}
                simulatedBlockedPathIds={blockedPathIds}
                onSelectPath={setSelectedPathId}
                variantMode={variantMode}
                ariaLabel={`Attack path topology for ${scenario.title}`}
              />
              <div className="graph-drilldown">
                <div className="path-tabs" aria-label="Enumerated attack paths">
                  {pathRows.map((path) => {
                    const blocked = blockedPathIds.has(path.id);
                    const previewedClosed = previewClosedPathIds.has(path.id);
                    return <button key={path.id} className={`${selectedPath?.id === path.id ? "selected" : ""} ${blocked ? "blocked" : ""} ${previewedClosed ? "preview-closed" : ""}`} onClick={() => setSelectedPathId(path.id)} aria-pressed={selectedPath?.id === path.id}><span>{path.id}</span><strong>{blocked ? "Verified closed" : previewedClosed ? "Closes in preview" : "Open"}</strong></button>;
                  })}
                  {paths.length > 6 && <button className="show-paths" onClick={() => setShowAllPaths((value) => !value)}>{showAllPaths ? "Show fewer" : `+${paths.length - 6} paths`}</button>}
                </div>
                <div className="path-inspector">
                  <div className="path-detail-head"><span><b>{selectedPath?.id}</b>{titleCase(selectedPath?.classification ?? "derived")} path</span><strong className={selectedPath && (blockedPathIds.has(selectedPath.id) || previewClosedPathIds.has(selectedPath.id)) ? "blocked-label" : "open-label"}>{selectedPath && blockedPathIds.has(selectedPath.id) ? "Verified closed" : selectedPath && previewClosedPathIds.has(selectedPath.id) ? "Closes in preview" : "Residual open"}</strong></div>
                  <strong>{selectedPath?.label}</strong>
                  <div className="path-node-strip">{(selectedPath?.nodeIds ?? []).map((nodeId, index) => <span key={nodeId}><b>{nodesById.get(nodeId)?.label ?? nodeId}</b><small>{nodeId}</small>{index < (selectedPath?.nodeIds?.length ?? 0) - 1 && <i aria-hidden="true">→</i>}</span>)}</div>
                  <div className="path-citations"><span>{selectedPathEvidence.size} evidence records · {(selectedPath?.edgeIds ?? []).length} causal edges</span><div>{[...selectedPathEvidence].map((id) => <button key={id} onClick={() => setSelectedEvidenceId(id)}>{id}</button>)}</div></div>
                </div>
              </div>
            </article>

            <aside className="evidence-panel panel">
              <div className="panel-heading"><div><span className="eyebrow">01 · INGEST · LAYERS 3–5</span><h2>Evidence receipt</h2></div><span className="grade">A</span></div>
              <div className="evidence-list">
                {evidence.map((item) => <button key={item.id} className={selectedEvidence?.id === item.id ? "selected" : ""} onClick={() => setSelectedEvidenceId(item.id)}><i /><span><strong>{titleCase(item.type ?? item.id)}</strong><small>{displaySource(item.source)}</small></span><b>{item.id}</b></button>)}
              </div>
              {selectedEvidence && <div className="evidence-detail"><div><span>{titleCase(selectedEvidence.status ?? "observed")}</span><b>{selectedEvidence.id}</b></div><strong>{selectedEvidence.summary}</strong><dl><div><dt>Reliability</dt><dd>{percentOrNA(selectedEvidence.reliability)}</dd></div><div><dt>Freshness</dt><dd>{optionalNumber(selectedEvidence.freshnessMinutes) === null ? "n/a" : `${selectedEvidence.freshnessMinutes} min`}</dd></div></dl><small>{fixedTime(selectedEvidence.observedAt)} · source provenance retained</small></div>}
            </aside>
          </section>

          <section className="council-panel panel">
            <div className="panel-heading"><div><span className="eyebrow">OPENAI SPECIALIST COUNCIL</span><h2>Eight GPT-5.6 perspectives in the Codex host, one governed score</h2></div><div className="council-state"><span className={bundle.hostAnalysis ? "host-badge attached" : "host-badge"}>{bundle.hostAnalysis ? "GPT-5.6 review attached" : "GPT-5.6 packets ready"}</span><span data-testid="disposition-tally" className="disposition-tally">{dispositionTally.support} support · {dispositionTally.challenge} dissent{dispositionTally.abstain ? ` · ${dispositionTally.abstain} abstain` : ""}</span></div></div>
            <p className="panel-intro">Eight GPT-5.6 specialist roles in the Codex host—identity, cloud, endpoint, network, business, and governance—assess the same bounded evidence. GPT-5.6 may interpret, challenge, and explain, but ARES keeps every computed fact, score, and rank locked.</p>
            <div className="agent-tabs">
              {bundle.agents.map((agent, index) => {
                const host = bundle.hostAnalysis?.specialists.find((item) => item.agentId === agent.id);
                const disposition = specialistDispositions[index] ?? "abstain";
                return <button key={agent.id ?? index} className={selectedAgentIndex === index ? "selected" : ""} onClick={() => setSelectedAgentIndex(index)} aria-pressed={selectedAgentIndex === index}><span className={`agent-avatar disposition-${disposition}`}>{(agent.name ?? "A")[0]}</span><span><strong>{agent.name}</strong><small>{disposition === "challenge" ? "dissent" : disposition}{host ? " · cited" : " · packet"}</small></span></button>;
              })}
            </div>
            {selectedAgent && (() => {
              const host = bundle.hostAnalysis?.specialists.find((item) => item.agentId === selectedAgent.id);
              const disposition = specialistDispositions[selectedAgentIndex] ?? "abstain";
              return <div className="agent-result"><div><span className={`agent-avatar large disposition-${disposition}`}>{(selectedAgent.name ?? "A")[0]}</span><span><small>{selectedAgent.role}</small><strong>{disposition === "challenge" ? "Dissenting assessment" : disposition === "abstain" ? "Abstaining assessment" : "Supporting assessment"}</strong></span></div><p>{host?.claims[0]?.text ?? selectedAgent.assessment?.headline ?? "Assessment is bounded to cited evidence."}</p><div><span>{host ? new Set(host.claims.flatMap((claim) => claim.evidenceIds)).size : selectedAgent.assessment?.evidenceIds?.length ?? 0} evidence IDs</span><span>{disposition === "challenge" ? "Challenges" : disposition === "abstain" ? "No vote on" : "Supports"} {host?.actionId ?? selectedAgent.vote?.actionId ?? recommendation.id}</span><span>Source linked</span></div></div>;
            })()}
            <div className="debate-line"><span><small>Decision synthesis</small><strong>{toText((bundle.debate.consensus as JsonRecord | undefined)?.rule, "Published action score remains authoritative.")}</strong></span><p>{bundle.hostAnalysis?.debate.summary ?? toText((bundle.debate.conflict as JsonRecord | undefined)?.summary, "No material dissent in the specialist review.")}</p></div>
          </section>

          <section className="ranking-panel panel" id="responses">
            <div className="panel-heading"><div><span className="eyebrow">03 · DECIDE · LAYER 9</span><h2>Response ranking</h2></div><span className="formula-chip">40 coverage · 25 continuity · 15 urgency · 10 reversible · 10 evidence</span></div>
            <p className="panel-intro">Preview any option to project path closure in the receipt and graph. Flip the endpoint fact above to watch the ranking recompute.</p>
            <div className="action-table">
              <div className="action-head"><span>Rank</span><span>Action / governed score</span><span>Coverage</span><span>Continuity</span><span>Gate</span></div>
              {actions.map((action) => (
                <article key={action.id} className={`${action.id === recommendation.id ? "recommended" : ""} ${action.id === previewAction.id ? "previewing" : ""} ${action.status === "simulated" ? "simulated" : ""}`}>
                  <span className="rank">{String(action.rank).padStart(2, "0")}</span>
                  <div className="action-copy"><span><strong>{action.title}</strong>{action.id === recommendation.id && <em>Recommended</em>}</span><small>{action.description}</small><div className="action-score-line"><div data-testid="response-score-bar" role="progressbar" aria-label={`${action.title} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={action.score}><i style={{ width: `${Math.max(0, Math.min(100, action.score))}%` }} /></div><b>{action.score.toFixed(2)}</b></div></div>
                  <b>{percentOrNA(action.components?.pathCoverage)}</b>
                  <b>{percentOrNA(action.components?.inverseDisruption)}</b>
                  <div className="action-buttons"><button className="preview-button" onClick={() => setPreviewActionId(action.id)} aria-pressed={action.id === previewAction.id}>Preview</button><button disabled={simulated} onClick={(event) => openApproval(action, event.currentTarget)} aria-label={`Review ${action.title}`}>{action.status === "simulated" ? "✓" : "Review"}</button></div>
                </article>
              ))}
            </div>
          </section>

          {BASE_CAUSAL_BUNDLE && ENDPOINT_CAUSAL_BUNDLE ? (
            <section className="decision-shift-panel panel" aria-label="Decision sensitivity">
              <div className="decision-shift-copy"><span className="eyebrow">DECISION SENSITIVITY</span><h2>New evidence changes the action—not the policy.</h2><p>ARES recomputes the attack graph and response ranking when endpoint evidence confirms malware.</p></div>
              <div className="causal-comparison">
                <article><span>No endpoint malware detected</span><strong>{BASE_CAUSAL_BUNDLE.recommendation.title}</strong><small>{BASE_CAUSAL_BUNDLE.graph.paths.length} modeled paths · score {BASE_CAUSAL_BUNDLE.recommendation.score.toFixed(2)}</small></article>
                <i aria-hidden="true">malware confirmed →</i>
                <article className="changed"><span>Endpoint compromised</span><strong>{ENDPOINT_CAUSAL_BUNDLE.recommendation.title}</strong><small>{ENDPOINT_CAUSAL_BUNDLE.graph.paths.length} paths · score {ENDPOINT_CAUSAL_BUNDLE.recommendation.score.toFixed(2)}</small></article>
              </div>
            </section>
          ) : null}

          <section className="audience-panel panel">
            <div className="panel-heading"><div><span className="eyebrow">LAYER 11</span><h2>One receipt, three operating lenses</h2></div><div className="view-tabs" role="tablist" aria-label="Audience lens">{(["soc", "ciso", "executive"] as ViewMode[]).map((mode) => <button id={`audience-tab-${mode}`} aria-controls="audience-panel" role="tab" aria-selected={view === mode} className={view === mode ? "selected" : ""} key={mode} onClick={() => setView(mode)}>{mode === "soc" ? "SOC" : mode === "ciso" ? "CISO" : titleCase(mode)}</button>)}</div></div>
            <div className="audience-content" id="audience-panel" role="tabpanel" aria-labelledby={`audience-tab-${view}`}><div><span className="audience-label">{toText(projection.audience, view.toUpperCase())} BRIEF</span><h3>{toText(projection.headline, recommendation.title)}</h3><p>{bundle.hostAnalysis?.audienceSummaries?.[view]?.summary ?? toText(projection.summary, recommendation.rationale)}</p></div><div className="projection-metrics">{records(projection.metrics).map((metric, index) => <div key={`${toText(metric.label)}-${index}`}><span>{toText(metric.label)}</span><strong>{toText(metric.value)}</strong></div>)}</div><ol>{records(projection.actions).map((action, index) => <li key={toText(action.id, String(index))}><span>{String(index + 1).padStart(2, "0")}</span><p><strong>{toText(action.text)}</strong><small>{titleCase(toText(action.priority, "next"))} · {strings(action.evidenceIds).length} cited records</small></p></li>)}</ol></div>
          </section>

          <section className="verification-panel" id="audit">
            <article className="simulation-proof panel">
              <div className="panel-heading"><div><span className="eyebrow">04–05 · GOVERN &amp; VERIFY</span><h2>{simulated ? "Action receipt verified" : "Human approval required"}</h2></div><span className={simulated ? "state-chip complete" : "state-chip pending"}>{titleCase(simulationState || "pending")}</span></div>
              <div className="before-after"><div><small>Modeled paths before</small><strong>{paths.length}</strong><span>Canonical graph snapshot</span></div><i>→</i><div className={simulated ? "after" : "projected"}><small>{simulated ? "Residual modeled paths" : "Projected after top action"}</small><strong>{simulated ? currentOpenPaths : projectedOpenPaths}</strong><span>{simulated ? "Simulation receipt state" : "Not applied yet"}</span></div></div>
              <div className="approval-events">{records(bundle.approval?.events).map((event, index) => <div key={toText(event.id, String(index))}><i /><span><strong>{titleCase(toText(event.type, "event"))}</strong><small>{toText(event.actor, "ARES deterministic engine")} · {fixedTime(toText(event.at, bundle.run.generatedAt))}</small></span></div>)}</div>
              {!simulated && <button className="button approve" onClick={(event) => openApproval(recommendation, event.currentTarget)}>Open human approval gate</button>}
            </article>
            <article className="receipt-panel panel">
              <div className="panel-heading"><div><span className="eyebrow">DECISION TRACE</span><h2>Machine-verifiable receipt</h2></div><button className="button quiet" onClick={exportBundle}>Download receipt</button></div>
              <div className="layer-grid">{bundle.trace.map((step, index) => <div key={step.layer ?? index}><span>{String(step.index ?? index + 1).padStart(2, "0")}</span><p><strong>{titleCase(step.layer ?? `Layer ${index + 1}`)}</strong><small>{productCopy(step.summary, "Trace step completed.")}</small></p><i>✓</i></div>)}</div>
              <dl className="receipt-facts"><div><dt>Receipt</dt><dd>{toText(receipt?.id, bundle.run.id)}</dd></div><div><dt>Policy computation</dt><dd>{receiptProvenance?.modelCalls === false ? "Deterministic" : "Not declared"}</dd></div><div><dt>External actions</dt><dd>{receiptProvenance?.externalActions === false ? "None" : "Not declared"}</dd></div><div><dt>Specialist review</dt><dd>{bundle.hostAnalysis ? "Attached and validated" : "Not attached"}</dd></div></dl>
            </article>
            <article className="memory-panel panel">
              <span className="eyebrow">CASE HISTORY</span>
              <div><h2>{memoryOutcome ? "Outcome recorded" : "Record prepared"}</h2><span className={persistence.durable ? "memory-mode durable" : "memory-mode"}>{persistence.durable ? "Saved" : "Session only"}</span></div>
              <p>{memoryOutcome ? toText(memoryOutcome.summary, "The modeled outcome is retained in this investigation receipt.") : "ARES has prepared the case record and will mark it saved only after decision memory confirms the write."}</p>
              <dl><div><dt>Prior records cited</dt><dd>{Array.isArray(bundle.memory?.priorRecordsUsed) ? bundle.memory.priorRecordsUsed.length : 0}</dd></div><div><dt>Selected action</dt><dd>{toText(memoryRecord?.selectedActionId, "Pending")}</dd></div><div><dt>Availability</dt><dd>{persistence.durable ? "Saved to decision memory" : "Available in this session"}</dd></div></dl>
            </article>
          </section>

          <section className="architecture-panel panel">
            <div><span className="eyebrow">PLATFORM CONTROLS</span><h2>AI judgment where it helps. Determinism where trust demands it.</h2><p>The reasoning layer supplies cited specialist analysis. ARES owns evidence normalization, topology, policy scores, governed state transitions, validation, and export.</p></div>
            <div className="architecture-flow"><article><span>Reasoning layer</span><strong>Specialist analysis</strong><small>Interpret · challenge · explain</small></article><i>↔</i><article><span>Policy layer</span><strong>ARES engine</strong><small>Graph · score · validate</small></article><i>→</i><article><span>Operator layer</span><strong>Investigation receipt</strong><small>Inspect · approve · export</small></article></div>
            <div className="architecture-guardrails"><span>✓ Evidence-linked claims</span><span>✓ No live product credentials</span><span>✓ Human approval required</span><span>✓ Every transition receipted</span></div>
          </section>
        </div>
      </section>

      {pendingAction && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeApproval}>
          <section ref={approvalDialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="approval-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={closeApproval} aria-label="Close approval dialog">×</button>
            <span className="dialog-icon">✓</span>
            <span className="eyebrow">HUMAN APPROVAL · SIMULATION ONLY</span>
            <h2 id="approval-title">Run the “{pendingAction.title}” response simulation?</h2>
            <p>ARES will model this response, recompute residual attack paths, and append an audit receipt. No connected product will be contacted or changed.</p>
            <dl><div><dt>Paths affected</dt><dd>{pendingAction.coveredPathIds?.length ?? 0} / {paths.length}</dd></div><div><dt>Approval role</dt><dd>{pendingAction.approvalRole ?? "Not required"}</dd></div><div><dt>Reversibility</dt><dd>{percentOrNA(pendingAction.components?.reversibility)}</dd></div><div><dt>Evidence</dt><dd>{pendingAction.evidenceIds?.length ?? 0} cited records</dd></div></dl>
            <div className="dialog-warning"><strong>RESPONSE PREVIEW</strong><span>No tenant, endpoint, code repository, cloud account, network, or backup system will be touched.</span></div>
            <div className="dialog-actions"><button className="button secondary" onClick={closeApproval}>Cancel</button><button className="button approve" onClick={confirmSimulation}>Approve and run simulation</button></div>
          </section>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeImport}>
          <section ref={importDialogRef} className="dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={closeImport} aria-label="Close import dialog">×</button>
            <span className="eyebrow">VALIDATED HANDOFF</span>
            <h2 id="import-title">Open a saved investigation</h2>
            <p>Upload or paste an ARES investigation receipt. Its incident identity, evidence citations, attack paths, response scores, approval state, and specialist review are validated before display.</p>
            <button className="file-drop" onClick={() => fileInputRef.current?.click()}><span>↑</span><strong>Choose a receipt file</strong><small>ARES investigation · validated locally</small></button>
            <label htmlFor="bundle-json">Or paste receipt data</label>
            <textarea id="bundle-json" value={importText} onChange={(event) => { setImportText(event.target.value); setImportError(""); }} placeholder="{ &quot;schemaVersion&quot;: &quot;arc.decision-bundle.v1&quot;, … }" rows={8} onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") importPastedBundle(); }} />
            {importError && <p className="import-error" role="alert"><strong>Bundle rejected.</strong> {importError}</p>}
            <div className="dialog-actions"><button className="button secondary" onClick={closeImport}>Cancel</button><button className="button primary" disabled={!importText.trim()} onClick={importPastedBundle}>Validate &amp; import</button></div>
          </section>
        </div>
      )}

      {toast && <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}><span aria-hidden="true">{toast.tone === "success" ? "✓" : toast.tone === "error" ? "!" : "i"}</span><p>{toast.message}</p><button onClick={() => setToast(null)} aria-label="Dismiss notification">×</button></div>}
    </main>
  );
}

export default function Home() {
  return <AresCockpit />;
}
