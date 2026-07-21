"use client";

import { KeyboardEvent, useId, useMemo } from "react";

export type AttackPathGraphNode = {
  id: string;
  label?: string;
  type?: string;
  role?: string;
  evidenceIds?: readonly string[];
  [key: string]: unknown;
};

export type AttackPathGraphEdge = {
  id: string;
  from: string;
  to: string;
  type?: string;
  claimClass?: string;
  evidenceIds?: readonly string[];
  [key: string]: unknown;
};

export type AttackPathGraphPath = {
  id: string;
  label?: string;
  nodeIds?: readonly string[];
  edgeIds?: readonly string[];
  classification?: string;
  state?: "open" | "blocked";
  [key: string]: unknown;
};

export type AttackPathVariantMode = "base" | "malware" | "generic";

type PathIdCollection = ReadonlySet<string> | readonly string[];

export type AttackPathGraphProps = {
  nodes: readonly AttackPathGraphNode[];
  edges: readonly AttackPathGraphEdge[];
  paths: readonly AttackPathGraphPath[];
  selectedPathId: string;
  previewClosedPathIds?: PathIdCollection;
  simulatedBlockedPathIds?: PathIdCollection;
  onSelectPath: (pathId: string) => void;
  variantMode: AttackPathVariantMode;
  className?: string;
  ariaLabel?: string;
  cinematic?: boolean;
};

type Lane = "base" | "malware";
type NodeSemantic = "attacker" | "controlled" | "foothold" | "pivot" | "asset" | "clean";
type NodeBloom = "attacker" | "impact" | "session";
type PathState = "open" | "preview" | "blocked";

type PositionedNode = {
  node: AttackPathGraphNode;
  x: number;
  y: number;
  layer: number;
  lane: Lane;
  semantic: NodeSemantic;
};

type DrawnEdge = {
  edge: AttackPathGraphEdge;
  d: string;
  labelX: number;
  labelY: number;
  pathIds: readonly string[];
};

type GraphGeometry = {
  nodeWidth: number;
  nodeHeight: number;
  columnGap: number;
  rowGap: number;
  leftGutter: number;
  rightGutter: number;
  laneLabelHeight: number;
  laneGap: number;
  minWidth: number;
  maxColumns?: number;
};

const FULL_GRAPH_GEOMETRY: GraphGeometry = {
  nodeWidth: 166,
  nodeHeight: 70,
  columnGap: 226,
  rowGap: 22,
  leftGutter: 58,
  rightGutter: 48,
  laneLabelHeight: 32,
  laneGap: 18,
  minWidth: 760,
};

// GRAPH GEOMETRY INVARIANT — do not tighten these back to nodeWidth 114 / columnGap 128.
// The cinematic SVG scales to fill the exposure panel, so edge labels (up to ~80px wide)
// sit in the GAP between columns = (columnGap - nodeWidth). That gap must stay >= ~85px
// or the edge labels ("Creates", "Accesses", "Authorizes", …) collide with and hide behind
// the node cards, and node titles truncate ("ATTACK TECHN…"). minWidth ~900 keeps the
// viewBox wide enough that the max-width:1180px cap on the <svg> prevents font ballooning
// on wide/ultrawide monitors. Verified clean from 1366px to 2560px. Keep gap >= 85, minWidth >= 900.
const COMPACT_GRAPH_GEOMETRY: GraphGeometry = {
  nodeWidth: 144,
  nodeHeight: 58,
  columnGap: 234, // gap = 234 - 144 = 90px (>= 85px required so edge labels clear the cards)
  rowGap: 24,
  leftGutter: 28,
  rightGutter: 22,
  laneLabelHeight: 24,
  laneGap: 12,
  minWidth: 900,
  maxColumns: 5,
};

const styles = `
  .arc-apg {
    width: 100%;
    min-width: 0;
    margin: 0;
    color: var(--ink, #e9eff6);
    font: inherit;
  }
  .arc-apg[data-cinematic="true"] {
    isolation: isolate;
  }
  .arc-apg__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 10px 0 12px;
  }
  .arc-apg__selection {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: 8px;
  }
  .arc-apg__selection > span {
    color: var(--muted, #95a8bc);
    font-size: 11px;
    font-weight: 760;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .arc-apg__selection strong {
    overflow: hidden;
    color: var(--ink, #e9eff6);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .arc-apg__lane-legend {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 11px;
    color: var(--muted, #95a8bc);
    font-size: 11px;
  }
  .arc-apg__lane-legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .arc-apg__lane-legend i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--primary, #49d3e4);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary, #49d3e4) 28%, transparent);
  }
  .arc-apg__lane-legend span:last-child i {
    background: var(--warning, #ffb547);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--warning, #ffb547) 30%, transparent);
  }
  .arc-apg__paths {
    display: flex;
    gap: 7px;
    padding: 0 0 10px;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .arc-apg__path-button {
    display: inline-flex;
    min-height: 30px;
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border: 1px solid var(--line, #253544);
    border-radius: 6px;
    background: var(--surface-raised, #16212c);
    color: var(--muted, #95a8bc);
    font-size: 11px;
    font-weight: 720;
    line-height: 1;
  }
  .arc-apg__path-button:hover {
    border-color: var(--line-strong, #3c5063);
    color: var(--ink, #e9eff6);
  }
  .arc-apg__path-button[aria-pressed="true"] {
    border-color: var(--primary, #49d3e4);
    background: var(--primary-soft, #12333d);
    color: var(--primary, #49d3e4);
  }
  .arc-apg__path-button[data-state="preview"]::after,
  .arc-apg__path-button[data-state="blocked"]::after {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--approve, #c3f53c);
  }
  .arc-apg__path-button[data-state="blocked"]::after { background: var(--approve, #c3f53c); }
  .arc-apg__viewport {
    width: 100%;
    overflow-x: auto;
    border: 1px solid var(--line, #253544);
    border-radius: 10px;
    background: var(--canvas, #0a1017);
    scrollbar-color: var(--line-strong, #3c5063) var(--surface, #111a24);
  }
  .arc-apg[data-cinematic="true"] .arc-apg__viewport {
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .arc-apg__viewport svg {
    display: block;
    width: 100%;
    min-width: 760px;
    height: auto;
    font-family: inherit;
  }
  .arc-apg[data-cinematic="true"] .arc-apg__viewport svg {
    width: 100%;
    min-width: 0;
    max-width: 1180px;
    margin-inline: auto;
  }
  .arc-apg__lane {
    fill: var(--surface, #111a24);
    stroke: var(--line, #253544);
    stroke-width: 1;
  }
  .arc-apg__lane--malware {
    fill: color-mix(in srgb, var(--warning, #ffb547) 4%, var(--surface, #111a24));
    stroke: color-mix(in srgb, var(--warning, #ffb547) 28%, var(--line, #253544));
  }
  .arc-apg__lane--dormant {
    fill: color-mix(in srgb, var(--success, #46d99a) 2%, var(--surface, #111a24));
    stroke: color-mix(in srgb, var(--success, #46d99a) 22%, var(--line, #253544));
    stroke-dasharray: 5 7;
  }
  .arc-apg__lane--active {
    animation: arc-apg-lane-arm 620ms cubic-bezier(.2, .78, .2, 1) both;
  }
  .arc-apg__lane-label {
    fill: var(--muted, #95a8bc);
    font-size: 11px;
    font-weight: 780;
    letter-spacing: .11em;
    text-transform: uppercase;
  }
  .arc-apg__lane-rule { stroke: var(--line, #253544); stroke-width: 1; }
  .arc-apg__lane-rule--malware { stroke: color-mix(in srgb, var(--warning, #ffb547) 24%, var(--line, #253544)); }
  .arc-apg__lane-rule--dormant {
    stroke: color-mix(in srgb, var(--success, #46d99a) 20%, var(--line, #253544));
    stroke-dasharray: 5 7;
  }
  .arc-apg__evidence-gate {
    outline: none;
    pointer-events: none;
  }
  .arc-apg__evidence-gate-halo {
    fill: color-mix(in srgb, var(--primary, #49d3e4) 8%, transparent);
    filter: blur(9px);
  }
  .arc-apg__evidence-gate-card {
    fill: color-mix(in srgb, var(--primary, #49d3e4) 6%, var(--canvas, #0a1017));
    stroke: var(--primary, #49d3e4);
    stroke-width: 1.4;
    stroke-dasharray: 6 6;
    vector-effect: non-scaling-stroke;
  }
  .arc-apg__evidence-gate-check {
    fill: color-mix(in srgb, var(--primary, #49d3e4) 12%, transparent);
    stroke: var(--primary, #49d3e4);
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }
  .arc-apg__evidence-gate-checkmark {
    fill: none;
    stroke: var(--primary, #49d3e4);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
    vector-effect: non-scaling-stroke;
  }
  .arc-apg__evidence-gate-kicker {
    fill: var(--primary, #49d3e4);
    font-size: 12px;
    font-weight: 820;
    letter-spacing: .08em;
  }
  .arc-apg__evidence-gate-label {
    fill: var(--ink, #e9eff6);
    font-size: 14px;
    font-weight: 760;
  }
  .arc-apg__evidence-gate-note {
    fill: var(--muted, #95a8bc);
    font-size: 12px;
    font-weight: 620;
  }
  .arc-apg__edge {
    cursor: pointer;
    outline: none;
  }
  .arc-apg__edge-hit {
    fill: none;
    stroke: transparent;
    stroke-width: 20;
    pointer-events: stroke;
  }
  .arc-apg__edge-line {
    fill: none;
    stroke: var(--faint, #607488);
    stroke-width: 1.6;
    opacity: .66;
    pointer-events: none;
    vector-effect: non-scaling-stroke;
  }
  .arc-apg__edge:hover .arc-apg__edge-line,
  .arc-apg__edge:focus-visible .arc-apg__edge-line {
    stroke: var(--muted, #95a8bc);
    opacity: 1;
    stroke-width: 2.4;
  }
  .arc-apg__edge--selected .arc-apg__edge-line {
    stroke: var(--primary, #49d3e4);
    opacity: 1;
    stroke-width: 2.8;
  }
  .arc-apg__edge--preview .arc-apg__edge-line {
    stroke: var(--approve, #c3f53c);
    opacity: 1;
    stroke-width: 2.5;
    stroke-dasharray: 7 5;
    stroke-dashoffset: 0;
    animation: none;
  }
  .arc-apg__edge--blocked .arc-apg__edge-line {
    stroke: var(--approve, #c3f53c);
    opacity: .92;
    stroke-width: 2.7;
    stroke-dasharray: none;
    stroke-dashoffset: 0;
    animation: none;
  }
  .arc-apg__edge--traffic .arc-apg__edge-line {
    stroke: var(--danger, #ff5d6c);
    stroke-width: 3;
    stroke-dasharray: 9 10;
    opacity: 1;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--danger, #ff5d6c) 58%, transparent));
    animation: arc-apg-open-traffic 920ms linear infinite;
  }
  .arc-apg__edge--traffic.arc-apg__edge--hypothesis .arc-apg__edge-line {
    stroke: var(--warning, #ffb547);
    stroke-width: 2.2;
    stroke-dasharray: 3 12;
    opacity: .78;
  }
  .arc-apg__edge--malware-enter {
    animation: arc-apg-malware-enter 560ms cubic-bezier(.2, .78, .2, 1) both;
    transform-box: fill-box;
    transform-origin: center;
  }
  .arc-apg__edge-label-bg {
    fill: var(--canvas, #0a1017);
    stroke: var(--line, #253544);
    stroke-width: .8;
    opacity: .96;
    pointer-events: none;
  }
  .arc-apg__edge-label {
    fill: var(--muted, #95a8bc);
    font-size: 11px;
    font-weight: 670;
    letter-spacing: .015em;
    pointer-events: none;
    text-anchor: middle;
  }
  .arc-apg__edge--selected .arc-apg__edge-label { fill: var(--primary, #49d3e4); }
  .arc-apg__edge--traffic .arc-apg__edge-label { fill: var(--danger, #ff5d6c); }
  .arc-apg__edge--preview .arc-apg__edge-label { fill: var(--approve, #c3f53c); }
  .arc-apg__edge--blocked .arc-apg__edge-label { fill: var(--approve, #c3f53c); }
  .arc-apg__node {
    cursor: default;
    outline: none;
  }
  .arc-apg__node[role="button"] { cursor: pointer; }
  .arc-apg__node-card {
    fill: var(--surface-raised, #16212c);
    stroke: var(--line-strong, #3c5063);
    stroke-width: 1.2;
    transition: stroke 140ms ease, fill 140ms ease;
    vector-effect: non-scaling-stroke;
  }
  .arc-apg__node--malware-enter {
    animation: arc-apg-malware-enter 620ms cubic-bezier(.2, .78, .2, 1) both;
    transform-box: fill-box;
    transform-origin: center;
  }
  .arc-apg__node-bloom {
    opacity: .18;
    pointer-events: none;
    transform-box: fill-box;
    transform-origin: center;
    animation: arc-apg-bloom 3.8s ease-in-out infinite;
  }
  .arc-apg__node-bloom--attacker {
    fill: var(--danger, #ff5d6c);
    filter: blur(10px);
  }
  .arc-apg__node-bloom--impact {
    fill: var(--warning, #ffb547);
    filter: blur(12px);
    animation-delay: -1.2s;
  }
  .arc-apg__node-bloom--session {
    fill: var(--primary, #49d3e4);
    filter: blur(9px);
    animation-delay: -2.1s;
  }
  .arc-apg__node:hover .arc-apg__node-card,
  .arc-apg__node:focus-visible .arc-apg__node-card {
    fill: var(--surface-tint, #1a2733);
    stroke: var(--muted, #95a8bc);
    stroke-width: 2;
  }
  .arc-apg__node--selected .arc-apg__node-card {
    stroke: var(--primary, #49d3e4);
    stroke-width: 2.2;
    filter: drop-shadow(0 0 8px color-mix(in srgb, var(--primary, #49d3e4) 20%, transparent));
  }
  .arc-apg__node-accent { fill: var(--faint, #607488); }
  .arc-apg__node--attacker .arc-apg__node-card { fill: var(--danger-soft, #3d2028); stroke: var(--danger, #ff5d6c); }
  .arc-apg__node--attacker .arc-apg__node-accent { fill: var(--danger, #ff5d6c); }
  .arc-apg__node--controlled .arc-apg__node-card {
    fill: var(--danger-soft, #3d2028);
    stroke: var(--danger, #ff5d6c);
    filter: drop-shadow(0 0 7px color-mix(in srgb, var(--danger, #ff5d6c) 34%, transparent));
  }
  .arc-apg__node--controlled .arc-apg__node-accent { fill: var(--danger, #ff5d6c); }
  .arc-apg__node--foothold .arc-apg__node-card { fill: var(--warning-soft, #3a2c17); stroke: var(--warning, #ffb547); }
  .arc-apg__node--foothold .arc-apg__node-accent { fill: var(--warning, #ffb547); }
  .arc-apg__node--pivot .arc-apg__node-card {
    fill: var(--primary-soft, #12333d);
    stroke: var(--primary, #49d3e4);
    filter: drop-shadow(0 0 5px color-mix(in srgb, var(--primary, #49d3e4) 28%, transparent));
    animation: arc-apg-pivot-pulse 2.6s ease-in-out infinite;
  }
  .arc-apg__node--pivot .arc-apg__node-accent { fill: var(--primary, #49d3e4); }
  .arc-apg__node--asset .arc-apg__node-card { fill: var(--surface-tint, #1a2733); stroke: var(--muted, #95a8bc); }
  .arc-apg__node--asset .arc-apg__node-accent { fill: var(--muted, #95a8bc); }
  .arc-apg__node--clean .arc-apg__node-card { fill: var(--success-soft, #15372c); stroke: var(--success, #46d99a); }
  .arc-apg__node--clean .arc-apg__node-accent { fill: var(--success, #46d99a); }
  .arc-apg__node-type {
    fill: var(--muted, #95a8bc);
    font-size: 11px;
    font-weight: 760;
    letter-spacing: .075em;
    text-transform: uppercase;
  }
  .arc-apg__node-label {
    fill: var(--ink, #e9eff6);
    font-size: 12px;
    font-weight: 720;
  }
  .arc-apg__node-id {
    fill: var(--faint, #607488);
    font-size: 11px;
    font-weight: 640;
    letter-spacing: .04em;
  }
  .arc-apg[data-cinematic="true"] .arc-apg__lane-label {
    font-size: 11px;
    letter-spacing: .14em;
  }
  .arc-apg[data-cinematic="true"] .arc-apg__edge-label {
    font-size: 10px;
    font-weight: 640;
  }
  .arc-apg[data-cinematic="true"] .arc-apg__node-type {
    font-size: 11px;
    letter-spacing: .06em;
  }
  .arc-apg[data-cinematic="true"] .arc-apg__node-label {
    font-size: 13px;
    font-weight: 700;
  }
  .arc-apg[data-cinematic="true"] .arc-apg__node-id {
    display: none;
  }
  .arc-apg[data-cinematic="true"] .arc-apg__evidence-gate-kicker {
    font-size: 13px;
  }
  .arc-apg[data-cinematic="true"] .arc-apg__evidence-gate-label {
    font-size: 15px;
  }
  .arc-apg[data-cinematic="true"] .arc-apg__evidence-gate-note {
    font-size: 12px;
  }
  .arc-apg__empty {
    display: grid;
    min-height: 180px;
    place-items: center;
    border: 1px dashed var(--line-strong, #3c5063);
    border-radius: 10px;
    background: var(--canvas, #0a1017);
    color: var(--muted, #95a8bc);
    text-align: center;
  }
  .arc-apg__sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @keyframes arc-apg-open-traffic {
    from { stroke-dashoffset: 19; }
    to { stroke-dashoffset: 0; }
  }
  @keyframes arc-apg-malware-enter {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes arc-apg-lane-arm {
    0% { opacity: .45; stroke-dasharray: 4 8; }
    100% { opacity: 1; stroke-dasharray: 0; }
  }
  @keyframes arc-apg-pivot-pulse {
    0%, 100% { stroke-width: 1.2; filter: drop-shadow(0 0 4px color-mix(in srgb, var(--primary, #49d3e4) 22%, transparent)); }
    50% { stroke-width: 1.8; filter: drop-shadow(0 0 10px color-mix(in srgb, var(--primary, #49d3e4) 52%, transparent)); }
  }
  @keyframes arc-apg-bloom {
    0%, 100% { opacity: .11; transform: scale(.96); }
    50% { opacity: .22; transform: scale(1.04); }
  }
  @media (max-width: 720px) {
    .arc-apg__toolbar { align-items: flex-start; flex-direction: column; }
    .arc-apg__lane-legend { flex-wrap: wrap; }
    .arc-apg__viewport svg { min-width: 700px; }
  }
`;

function toIdSet(values: PathIdCollection | undefined) {
  return values instanceof Set ? new Set(values) : new Set(values ?? []);
}

function readable(value: string | undefined, fallback: string) {
  if (!value?.trim()) return fallback;
  return value
    .replace(/SaaS/g, "Saas")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compact(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, Math.max(1, length - 1)).trim()}…`;
}

function labelLines(label: string, maxCharacters = 23) {
  if (label.length <= maxCharacters) return [label];
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && current) lines.push(current);
  if (lines.length === 1 && words.join(" ") !== lines[0]) {
    const remaining = words.slice(lines[0].split(/\s+/).length).join(" ");
    if (remaining) lines.push(remaining);
  }
  return lines.slice(0, 2).map((line, index, all) =>
    index === all.length - 1 && label.length > all.join(" ").length
      ? compact(line, Math.max(4, maxCharacters - 1))
      : compact(line, maxCharacters),
  );
}

function layerNodes(nodes: readonly AttackPathGraphNode[], edges: readonly AttackPathGraphEdge[]) {
  const ids = [...new Set(nodes.map((node) => node.id))].sort();
  const idSet = new Set(ids);
  const outgoing = new Map(ids.map((id) => [id, [] as AttackPathGraphEdge[]]));
  const indegree = new Map(ids.map((id) => [id, 0]));
  const layers = new Map(ids.map((id) => [id, 0]));

  for (const edge of [...edges].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to) || edge.from === edge.to) continue;
    outgoing.get(edge.from)?.push(edge);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = ids.filter((id) => indegree.get(id) === 0).sort();
  const processed = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    processed.add(id);
    const orderedEdges = [...(outgoing.get(id) ?? [])].sort((a, b) =>
      a.to.localeCompare(b.to) || a.id.localeCompare(b.id),
    );
    for (const edge of orderedEdges) {
      layers.set(edge.to, Math.max(layers.get(edge.to) ?? 0, (layers.get(id) ?? 0) + 1));
      indegree.set(edge.to, (indegree.get(edge.to) ?? 1) - 1);
      if (indegree.get(edge.to) === 0) {
        queue.push(edge.to);
        queue.sort();
      }
    }
  }

  // A directed cycle cannot be topologically layered. Keep cyclic remnants
  // deterministic and adjacent to the acyclic graph without inventing edges.
  const cycleStart = Math.max(0, ...layers.values()) + (processed.size ? 1 : 0);
  ids.filter((id) => !processed.has(id)).forEach((id, index) => layers.set(id, cycleStart + index));
  return layers;
}

function isEndpointLaneNode(node: AttackPathGraphNode) {
  const signal = `${node.type ?? ""} ${node.role ?? ""} ${node.label ?? ""}`.toLowerCase();
  return /malware|endpoint|workstation|host\b|browser|credentialartifact|process|binary|device/.test(signal);
}

function semanticForNode(
  node: AttackPathGraphNode,
  lane: Lane,
  variantMode: AttackPathVariantMode,
  indegree: number,
  outdegree: number,
): NodeSemantic {
  const signal = `${node.type ?? ""} ${node.role ?? ""} ${node.label ?? ""}`.toLowerCase();
  if (node.role === "source" || /threatactor|attacker|adversary|operator/.test(signal)) return "attacker";
  if (
    lane === "malware" &&
    variantMode === "malware" &&
    /endpoint|workstation|host\b|browser|device/.test(signal)
  ) return "controlled";
  if (node.role === "target" || /businessimpact|businessprocess|dataasset/.test(signal)) return "asset";
  if (
    lane === "malware" &&
    /endpoint|workstation|host\b|device/.test(signal) &&
    (variantMode === "base" || indegree + outdegree === 0)
  ) return "clean";
  if (/malware|attacktechnique|phish|binary|exploit/.test(signal)) return "foothold";
  if (outdegree > 1 || /session|grant|credential|identity|controlplane|lateral|artifact/.test(signal)) return "pivot";
  if (lane === "malware") return "foothold";
  return outdegree > 0 ? "pivot" : "asset";
}

function bloomForNode(node: AttackPathGraphNode, semantic: NodeSemantic): NodeBloom | undefined {
  const signal = `${node.type ?? ""} ${node.role ?? ""} ${node.label ?? ""}`.toLowerCase();
  if (semantic === "attacker" || semantic === "controlled") return "attacker";
  if (node.role === "target" || /businessimpact|business impact|impact|crown jewel|critical asset/.test(signal)) {
    return "impact";
  }
  if (/session|grant|credential|token|cookie|controlplane|control plane/.test(signal)) return "session";
  return undefined;
}

function edgeIdsForPath(path: AttackPathGraphPath, edges: readonly AttackPathGraphEdge[]) {
  if (path.edgeIds?.length) return path.edgeIds.filter((id) => edges.some((edge) => edge.id === id));
  const nodeIds = path.nodeIds ?? [];
  const derived: string[] = [];
  for (let index = 1; index < nodeIds.length; index += 1) {
    const match = edges
      .filter((edge) => edge.from === nodeIds[index - 1] && edge.to === nodeIds[index])
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (match) derived.push(match.id);
  }
  return derived;
}

function keyboardSelect(event: KeyboardEvent<SVGGElement>, callback: (() => void) | undefined) {
  if (!callback || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  callback();
}

function bezierMidpoint(
  start: { x: number; y: number },
  first: { x: number; y: number },
  second: { x: number; y: number },
  end: { x: number; y: number },
) {
  return {
    x: (start.x + 3 * first.x + 3 * second.x + end.x) / 8,
    y: (start.y + 3 * first.y + 3 * second.y + end.y) / 8,
  };
}

function bezierPoint(
  start: { x: number; y: number },
  first: { x: number; y: number },
  second: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * start.x + b * first.x + c * second.x + d * end.x,
    y: a * start.y + b * first.y + c * second.y + d * end.y,
  };
}

function edgeGeometry(
  from: PositionedNode,
  to: PositionedNode,
  parallelOffset: number,
  geometry: GraphGeometry,
) {
  const { nodeWidth, nodeHeight } = geometry;
  if (from.node.id === to.node.id) {
    const start = { x: from.x + nodeWidth * 0.7, y: from.y };
    const end = { x: from.x + nodeWidth, y: from.y + nodeHeight * 0.42 };
    const first = { x: start.x + 58, y: start.y - 48 - parallelOffset };
    const second = { x: end.x + 58, y: end.y - 48 - parallelOffset };
    return {
      d: `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${end.x} ${end.y}`,
      ...bezierMidpoint(start, first, second, end),
    };
  }

  const forward = to.x > from.x + nodeWidth;
  if (forward) {
    const start = { x: from.x + nodeWidth, y: from.y + nodeHeight / 2 };
    const end = { x: to.x, y: to.y + nodeHeight / 2 };
    const distance = Math.max(54, end.x - start.x);
    const first = { x: start.x + distance * 0.44, y: start.y + parallelOffset };
    const second = { x: end.x - distance * 0.44, y: end.y + parallelOffset };
    const diverging = Math.abs(end.y - start.y) > 4;
    const labelT = geometry.maxColumns && diverging ? 0.62 : 0.5;
    return {
      d: `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${end.x} ${end.y}`,
      ...bezierPoint(start, first, second, end, labelT),
    };
  }

  const fromAbove = from.y <= to.y;
  const start = {
    x: from.x + nodeWidth / 2,
    y: fromAbove ? from.y + nodeHeight : from.y,
  };
  const end = {
    x: to.x + nodeWidth / 2,
    y: fromAbove ? to.y : to.y + nodeHeight,
  };
  const bendX = Math.max(from.x, to.x) + nodeWidth + (geometry.maxColumns ? 62 : 46) + Math.abs(parallelOffset);
  const first = { x: bendX, y: start.y };
  const second = { x: bendX, y: end.y };
  return {
    d: `M ${start.x} ${start.y} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${end.x} ${end.y}`,
    ...bezierMidpoint(start, first, second, end),
  };
}

function pathState(
  path: AttackPathGraphPath,
  previews: ReadonlySet<string>,
  blocked: ReadonlySet<string>,
): PathState {
  if (blocked.has(path.id) || path.state === "blocked") return "blocked";
  if (previews.has(path.id)) return "preview";
  return "open";
}

export default function AttackPathGraph({
  nodes,
  edges,
  paths,
  selectedPathId,
  previewClosedPathIds,
  simulatedBlockedPathIds,
  onSelectPath,
  variantMode,
  className = "",
  ariaLabel = "Attack path topology",
  cinematic = false,
}: AttackPathGraphProps) {
  const reactId = useId();
  const markerPrefix = `arc-apg-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const titleId = `${markerPrefix}-title`;
  const descriptionId = `${markerPrefix}-description`;
  const previewIds = useMemo(() => toIdSet(previewClosedPathIds), [previewClosedPathIds]);
  const blockedIds = useMemo(() => toIdSet(simulatedBlockedPathIds), [simulatedBlockedPathIds]);
  const geometry = cinematic ? COMPACT_GRAPH_GEOMETRY : FULL_GRAPH_GEOMETRY;

  const graph = useMemo(() => {
    const uniqueNodes = [...new Map(nodes.map((node) => [node.id, node])).values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const nodeIds = new Set(uniqueNodes.map((node) => node.id));
    const validEdges = [...new Map(edges.map((edge) => [edge.id, edge])).values()]
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .sort((a, b) => a.id.localeCompare(b.id));
    const orderedPaths = [...new Map(paths.map((path) => [path.id, path])).values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const selectedPath = orderedPaths.find((path) => path.id === selectedPathId) ?? orderedPaths[0];
    const selectedEdgeIds = new Set(selectedPath ? edgeIdsForPath(selectedPath, validEdges) : []);
    const selectedNodeIds = new Set(
      selectedPath?.nodeIds?.length
        ? selectedPath.nodeIds
        : [...selectedEdgeIds].flatMap((edgeId) => {
            const edge = validEdges.find((candidate) => candidate.id === edgeId);
            return edge ? [edge.from, edge.to] : [];
          }),
    );
    const edgePathIds = new Map(validEdges.map((edge) => [edge.id, [] as string[]]));
    const nodePathIds = new Map(uniqueNodes.map((node) => [node.id, [] as string[]]));

    for (const path of orderedPaths) {
      const pathEdgeIds = edgeIdsForPath(path, validEdges);
      for (const edgeId of pathEdgeIds) edgePathIds.get(edgeId)?.push(path.id);
      const pathNodeIds = path.nodeIds?.length
        ? path.nodeIds
        : pathEdgeIds.flatMap((edgeId) => {
            const edge = validEdges.find((candidate) => candidate.id === edgeId);
            return edge ? [edge.from, edge.to] : [];
          });
      for (const nodeId of new Set(pathNodeIds)) nodePathIds.get(nodeId)?.push(path.id);
    }

    const rawLayers = layerNodes(uniqueNodes, validEdges);
    const rawMaxLayer = Math.max(0, ...rawLayers.values());
    const compactMaxLayer = Math.min(rawMaxLayer, (geometry.maxColumns ?? (rawMaxLayer + 1)) - 1);
    const layers = new Map(
      [...rawLayers.entries()].map(([nodeId, layer]) => [
        nodeId,
        rawMaxLayer > compactMaxLayer && compactMaxLayer > 0
          ? Math.round((layer / rawMaxLayer) * compactMaxLayer)
          : layer,
      ]),
    );
    const indegrees = new Map(uniqueNodes.map((node) => [node.id, 0]));
    const outdegrees = new Map(uniqueNodes.map((node) => [node.id, 0]));
    for (const edge of validEdges) {
      indegrees.set(edge.to, (indegrees.get(edge.to) ?? 0) + 1);
      outdegrees.set(edge.from, (outdegrees.get(edge.from) ?? 0) + 1);
    }

    const malwareTopologyActive = variantMode === "malware" ||
      (variantMode === "generic" && uniqueNodes.some(isEndpointLaneNode));
    const showMalwareLane = !cinematic && (variantMode === "base" || variantMode === "malware" || malwareTopologyActive);
    const laneOf = new Map<string, Lane>(
      uniqueNodes.map((node) => [node.id, !cinematic && malwareTopologyActive && isEndpointLaneNode(node) ? "malware" : "base"]),
    );
    const maxLayer = Math.max(0, ...layers.values());
    const grouped = new Map<string, AttackPathGraphNode[]>();
    for (const node of uniqueNodes) {
      const key = `${laneOf.get(node.id)}:${layers.get(node.id) ?? 0}`;
      const group = grouped.get(key) ?? [];
      group.push(node);
      group.sort((a, b) => a.id.localeCompare(b.id));
      grouped.set(key, group);
    }

    const maxRows = (lane: Lane) => Math.max(
      1,
      ...[...grouped.entries()]
        .filter(([key]) => key.startsWith(`${lane}:`))
        .map(([, group]) => group.length),
    );
    const baseHeight = geometry.laneLabelHeight + maxRows("base") * geometry.nodeHeight + Math.max(0, maxRows("base") - 1) * geometry.rowGap + (cinematic ? 20 : 30);
    const malwareHeight = showMalwareLane
      ? geometry.laneLabelHeight + maxRows("malware") * geometry.nodeHeight + Math.max(0, maxRows("malware") - 1) * geometry.rowGap + (cinematic ? 20 : 30)
      : 0;
    const baseTop = 18;
    const malwareTop = baseTop + baseHeight + geometry.laneGap;
    const width = Math.max(geometry.minWidth, geometry.leftGutter + maxLayer * geometry.columnGap + geometry.nodeWidth + geometry.rightGutter);
    const height = baseTop + baseHeight + (showMalwareLane ? geometry.laneGap + malwareHeight : 0) + (cinematic ? 14 : 18);

    const positioned = new Map<string, PositionedNode>();
    for (const node of uniqueNodes) {
      const layer = layers.get(node.id) ?? 0;
      const lane = laneOf.get(node.id) ?? "base";
      const group = grouped.get(`${lane}:${layer}`) ?? [node];
      const index = group.findIndex((candidate) => candidate.id === node.id);
      const laneTop = lane === "base" ? baseTop : malwareTop;
      positioned.set(node.id, {
        node,
        x: geometry.leftGutter + layer * geometry.columnGap,
        y: laneTop + geometry.laneLabelHeight + (cinematic ? 8 : 12) + index * (geometry.nodeHeight + geometry.rowGap),
        layer,
        lane,
        semantic: semanticForNode(
          node,
          lane,
          variantMode,
          indegrees.get(node.id) ?? 0,
          outdegrees.get(node.id) ?? 0,
        ),
      });
    }

    const parallelGroups = new Map<string, AttackPathGraphEdge[]>();
    for (const edge of validEdges) {
      const key = `${edge.from}->${edge.to}`;
      const group = parallelGroups.get(key) ?? [];
      group.push(edge);
      parallelGroups.set(key, group);
    }
    const drawnEdges: DrawnEdge[] = validEdges.map((edge) => {
      const from = positioned.get(edge.from)!;
      const to = positioned.get(edge.to)!;
      const siblings = parallelGroups.get(`${edge.from}->${edge.to}`) ?? [edge];
      const siblingIndex = siblings.findIndex((candidate) => candidate.id === edge.id);
      const offset = (siblingIndex - (siblings.length - 1) / 2) * 14;
      const edgePath = edgeGeometry(from, to, offset, geometry);
      return {
        edge,
        d: edgePath.d,
        labelX: edgePath.x,
        labelY: edgePath.y,
        pathIds: edgePathIds.get(edge.id) ?? [],
      };
    }).sort((a, b) => Number(selectedEdgeIds.has(a.edge.id)) - Number(selectedEdgeIds.has(b.edge.id)));

    return {
      uniqueNodes,
      validEdges,
      orderedPaths,
      selectedPath,
      selectedEdgeIds,
      selectedNodeIds,
      edgePathIds,
      nodePathIds,
      positioned,
      drawnEdges,
      hasMalwareLane: showMalwareLane,
      malwareTopologyActive,
      width,
      height,
      baseTop,
      baseHeight,
      malwareTop,
      malwareHeight,
      geometry,
    };
  }, [nodes, edges, paths, selectedPathId, variantMode, cinematic, geometry]);

  if (!graph.uniqueNodes.length) {
    return (
      <figure
        className={`arc-apg ${className}`.trim()}
        data-cinematic={cinematic ? "true" : undefined}
        data-variant={variantMode}
        aria-label={ariaLabel}
      >
        <style>{styles}</style>
        <div className="arc-apg__empty">No attack-path topology is available for this incident.</div>
      </figure>
    );
  }

  const selectedState = graph.selectedPath
    ? pathState(graph.selectedPath, previewIds, blockedIds)
    : "open";
  const laneInset = cinematic ? 0.5 : 12;
  const laneRuleInset = cinematic ? 14 : 24;
  const laneRadius = cinematic ? 0 : 9;
  const evidenceGateWidth = cinematic ? 252 : 268;
  const evidenceGateHeight = cinematic ? 64 : 74;
  const evidenceGateX = Math.max(graph.geometry.leftGutter, graph.width - graph.geometry.rightGutter - evidenceGateWidth);
  const evidenceGateY = graph.malwareTop + graph.geometry.laneLabelHeight + (cinematic ? 8 : 12);

  const selectCandidate = (pathIds: readonly string[]) => {
    if (!pathIds.length) return undefined;
    return pathIds.includes(graph.selectedPath?.id ?? "") ? graph.selectedPath?.id : [...pathIds].sort()[0];
  };

  const edgePresentation = (item: DrawnEdge) => {
    const isSelected = graph.selectedEdgeIds.has(item.edge.id);
    const memberStates = item.pathIds.flatMap((id) => {
      const path = graph.orderedPaths.find((candidate) => candidate.id === id);
      return path ? [pathState(path, previewIds, blockedIds)] : [];
    });
    const hasOpen = memberStates.some((state) => state === "open");
    const allBlocked = memberStates.length > 0 && memberStates.every((state) => state === "blocked");
    const allContained = memberStates.length > 0 && memberStates.every((state) => state !== "open");
    const aggregateState: PathState = allBlocked ? "blocked" : allContained ? "preview" : "open";
    const state: PathState = cinematic
      ? aggregateState
      : isSelected
        ? selectedState
        : aggregateState;
    const isTraffic = state === "open" && (cinematic ? hasOpen : isSelected);
    const marker = state === "blocked"
      ? `${markerPrefix}-arrow-blocked`
      : state === "preview"
        ? `${markerPrefix}-arrow-preview`
        : isTraffic
          ? `${markerPrefix}-arrow-traffic`
          : `${markerPrefix}-arrow`;
    const claimClass = item.edge.claimClass ?? "derived";
    return { isSelected, isTraffic, state, marker, claimClass };
  };

  const selectedDescription = graph.selectedPath
    ? `${graph.selectedPath.id}, ${readable(graph.selectedPath.classification, "derived")} path, ${selectedState}.`
    : "No enumerated path is selected.";

  return (
    <figure
      className={`arc-apg ${className}`.trim()}
      data-cinematic={cinematic ? "true" : undefined}
      data-variant={variantMode}
      aria-labelledby={titleId}
    >
      <style>{styles}</style>
      {cinematic ? (
        <figcaption className="arc-apg__sr-only" id={titleId}>
          Attack-path topology: {graph.selectedPath?.label ?? graph.selectedPath?.id ?? "unselected path"}
        </figcaption>
      ) : (
        <figcaption className="arc-apg__toolbar">
          <div className="arc-apg__selection">
            <span id={titleId}>Topology view</span>
            <strong>{graph.selectedPath?.label ?? graph.selectedPath?.id ?? "Unselected"}</strong>
          </div>
          {graph.hasMalwareLane && (
            <div className="arc-apg__lane-legend" aria-label="Graph lane legend">
              <span><i />Base path</span>
              <span><i />+ Malware / endpoint</span>
            </div>
          )}
        </figcaption>
      )}

      {!cinematic && graph.orderedPaths.length > 0 && (
        <div className="arc-apg__paths" role="group" aria-label="Select an enumerated attack path">
          {graph.orderedPaths.map((path) => {
            const state = pathState(path, previewIds, blockedIds);
            return (
              <button
                className="arc-apg__path-button"
                data-state={state}
                key={path.id}
                type="button"
                aria-pressed={graph.selectedPath?.id === path.id}
                aria-label={`${path.id}: ${path.label ?? readable(path.classification, "derived path")}; ${state}`}
                title={path.label ?? path.id}
                onClick={() => onSelectPath(path.id)}
              >
                {path.id}
              </button>
            );
          })}
        </div>
      )}

      <p className="arc-apg__sr-only" id={descriptionId}>
        {ariaLabel}. {graph.uniqueNodes.length} nodes, {graph.validEdges.length} directed relationships, and {graph.orderedPaths.length} enumerated paths. {selectedDescription}
        {variantMode === "base" ? " The current endpoint snapshot has no malware detection; this bounded negative finding is shown as non-topological evidence with no causal edge." : ""}
      </p>

      <div className="arc-apg__viewport" tabIndex={0} aria-label="Scrollable attack-path graph">
        <svg
          data-testid="attack-graph"
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          role={cinematic ? "group" : "img"}
          aria-label={`Attack path graph: ${ariaLabel}`}
          aria-describedby={descriptionId}
          preserveAspectRatio={cinematic ? "xMidYMid meet" : "xMinYMin meet"}
        >
          <defs>
            <marker id={`${markerPrefix}-arrow`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--faint, #607488)" />
            </marker>
            <marker id={`${markerPrefix}-arrow-traffic`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--danger, #ff5d6c)" />
            </marker>
            <marker id={`${markerPrefix}-arrow-preview`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--approve, #c3f53c)" />
            </marker>
            <marker id={`${markerPrefix}-arrow-blocked`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--approve, #c3f53c)" />
            </marker>
          </defs>

          <rect
            className="arc-apg__lane arc-apg__lane--base"
            x={laneInset}
            y={graph.baseTop}
            width={graph.width - laneInset * 2}
            height={graph.baseHeight}
            rx={laneRadius}
          />
          <text className="arc-apg__lane-label" x={cinematic ? 18 : 30} y={graph.baseTop + (cinematic ? 16 : 21)}>{cinematic ? "Modeled attack surface" : "Base attack surface"}</text>
          <line
            className="arc-apg__lane-rule"
            x1={laneRuleInset}
            x2={graph.width - laneRuleInset}
            y1={graph.baseTop + graph.geometry.laneLabelHeight}
            y2={graph.baseTop + graph.geometry.laneLabelHeight}
          />
          {graph.hasMalwareLane && (
            <>
              <rect
                className={`arc-apg__lane arc-apg__lane--malware ${graph.malwareTopologyActive ? "arc-apg__lane--active" : "arc-apg__lane--dormant"}`}
                x={laneInset}
                y={graph.malwareTop}
                width={graph.width - laneInset * 2}
                height={graph.malwareHeight}
                rx={laneRadius}
              />
              <text className="arc-apg__lane-label" x={cinematic ? 18 : 30} y={graph.malwareTop + (cinematic ? 16 : 21)}>Endpoint / malware causal lane</text>
              <line
                className={`arc-apg__lane-rule arc-apg__lane-rule--malware ${graph.malwareTopologyActive ? "" : "arc-apg__lane-rule--dormant"}`.trim()}
                x1={laneRuleInset}
                x2={graph.width - laneRuleInset}
                y1={graph.malwareTop + graph.geometry.laneLabelHeight}
                y2={graph.malwareTop + graph.geometry.laneLabelHeight}
              />
            </>
          )}

          {variantMode === "base" && graph.hasMalwareLane && (
            <g
              className="arc-apg__evidence-gate"
              role="img"
              aria-label="No endpoint malware detected in the current snapshot. Supporting evidence only; this is not an attack-graph node or relationship."
            >
              <title>No endpoint malware detected in current snapshot</title>
              <desc>This bounded negative finding is non-topological evidence and has no connected graph edge.</desc>
              <rect
                className="arc-apg__evidence-gate-halo"
                x={evidenceGateX - 6}
                y={evidenceGateY - 6}
                width={evidenceGateWidth + 12}
                height={evidenceGateHeight + 12}
                rx="14"
                aria-hidden="true"
              />
              <rect
                className="arc-apg__evidence-gate-card"
                x={evidenceGateX}
                y={evidenceGateY}
                width={evidenceGateWidth}
                height={evidenceGateHeight}
                rx="9"
                aria-hidden="true"
              />
              <circle
                className="arc-apg__evidence-gate-check"
                cx={evidenceGateX + (cinematic ? 18 : 23)}
                cy={evidenceGateY + (cinematic ? 32 : 35)}
                r={cinematic ? 8 : 10}
                aria-hidden="true"
              />
              <path
                className="arc-apg__evidence-gate-checkmark"
                d={`M ${evidenceGateX + (cinematic ? 14 : 18.5)} ${evidenceGateY + (cinematic ? 32 : 35)} h ${cinematic ? 8 : 9}`}
                aria-hidden="true"
              />
              <text className="arc-apg__evidence-gate-kicker" x={evidenceGateX + (cinematic ? 34 : 42)} y={evidenceGateY + (cinematic ? 16 : 19)}>{cinematic ? "BOUNDED NEGATIVE EVIDENCE" : "EVIDENCE ONLY · NOT TOPOLOGY"}</text>
              <text className="arc-apg__evidence-gate-label" x={evidenceGateX + (cinematic ? 34 : 42)} y={evidenceGateY + (cinematic ? 36 : 41)}>{cinematic ? "No endpoint execution" : "No endpoint malware detected"}</text>
              <text className="arc-apg__evidence-gate-note" x={evidenceGateX + (cinematic ? 34 : 42)} y={evidenceGateY + (cinematic ? 54 : 60)}>{cinematic ? "Snapshot only · not clean-state proof" : "Current snapshot · not proof of clean state"}</text>
            </g>
          )}

          <g aria-label="Directed attack relationships">
            {graph.drawnEdges.map((item) => {
              const candidate = selectCandidate(item.pathIds);
              const presentation = edgePresentation(item);
              const touchesMalwareLane = graph.positioned.get(item.edge.from)?.lane === "malware" ||
                graph.positioned.get(item.edge.to)?.lane === "malware";
              const edgeLabel = readable(item.edge.type, "Reaches");
              const displayLabel = compact(edgeLabel, cinematic ? 14 : 18);
              const labelWidth = Math.max(cinematic ? 34 : 42, Math.min(cinematic ? 80 : 116, displayLabel.length * (cinematic ? 5.3 : 5.8) + (cinematic ? 11 : 14)));
              return (
                <g
                  key={item.edge.id}
                  className={`arc-apg__edge arc-apg__edge--${presentation.claimClass} ${presentation.isSelected ? "arc-apg__edge--selected" : ""} ${presentation.isTraffic ? "arc-apg__edge--traffic" : ""} ${presentation.state !== "open" ? `arc-apg__edge--${presentation.state}` : ""} ${graph.malwareTopologyActive && touchesMalwareLane ? "arc-apg__edge--malware-enter" : ""}`.trim()}
                  role={candidate ? "button" : "img"}
                  tabIndex={candidate ? 0 : undefined}
                  aria-label={`${item.edge.id}: ${edgeLabel}, ${readable(presentation.claimClass, "derived")} relationship, from ${graph.positioned.get(item.edge.from)?.node.label ?? item.edge.from} to ${graph.positioned.get(item.edge.to)?.node.label ?? item.edge.to}; ${presentation.isTraffic ? "modeled reachable path" : presentation.state}${candidate ? "; select its path" : ""}`}
                  onClick={candidate ? () => onSelectPath(candidate) : undefined}
                  onKeyDown={(event) => keyboardSelect(event, candidate ? () => onSelectPath(candidate) : undefined)}
                >
                  <title>{`${item.edge.id}: ${edgeLabel}`}</title>
                  <path className="arc-apg__edge-hit" d={item.d} />
                  <path className="arc-apg__edge-line" d={item.d} markerEnd={`url(#${presentation.marker})`} />
                  <rect
                    className="arc-apg__edge-label-bg"
                    x={item.labelX - labelWidth / 2}
                    y={item.labelY - 9}
                    width={labelWidth}
                    height="18"
                    rx="5"
                  />
                  <text className="arc-apg__edge-label" x={item.labelX} y={item.labelY + 3}>{displayLabel}</text>
                </g>
              );
            })}
          </g>

          <g aria-label="Attack path entities">
            {[...graph.positioned.values()]
              .sort((a, b) => a.layer - b.layer || a.lane.localeCompare(b.lane) || a.node.id.localeCompare(b.node.id))
              .map((positionedNode) => {
                const { node, x, y, lane, semantic } = positionedNode;
                const pathIds = graph.nodePathIds.get(node.id) ?? [];
                const candidate = selectCandidate(pathIds);
                const selected = graph.selectedNodeIds.has(node.id);
                const lines = labelLines(node.label ?? node.id, cinematic ? 16 : 23);
                const nodeType = compact(readable(node.type, "Entity"), cinematic ? 18 : 22);
                const bloom = bloomForNode(node, semantic);
                const malwareEntering = graph.malwareTopologyActive && lane === "malware";
                return (
                  <g
                    key={node.id}
                    className={`arc-apg__node arc-apg__node--${semantic} ${selected ? "arc-apg__node--selected" : ""} ${malwareEntering ? "arc-apg__node--malware-enter" : ""}`.trim()}
                    role={candidate ? "button" : "img"}
                    tabIndex={candidate ? 0 : undefined}
                    aria-label={`${node.label ?? node.id}, ${readable(node.type, "entity")}, ${semantic}, ${lane} causal lane${candidate ? "; select a path through this node" : ""}`}
                    onClick={candidate ? () => onSelectPath(candidate) : undefined}
                    onKeyDown={(event) => keyboardSelect(event, candidate ? () => onSelectPath(candidate) : undefined)}
                  >
                    <title>{`${node.label ?? node.id} · ${readable(node.type, "Entity")} · ${node.id}`}</title>
                    {bloom && (
                      <rect
                        className={`arc-apg__node-bloom arc-apg__node-bloom--${bloom}`}
                        x={x - (cinematic ? 6 : 8)}
                        y={y - (cinematic ? 6 : 8)}
                        width={graph.geometry.nodeWidth + (cinematic ? 12 : 16)}
                        height={graph.geometry.nodeHeight + (cinematic ? 12 : 16)}
                        rx="14"
                        aria-hidden="true"
                      />
                    )}
                    <rect className="arc-apg__node-card" x={x} y={y} width={graph.geometry.nodeWidth} height={graph.geometry.nodeHeight} rx={cinematic ? 8 : 8} />
                    <rect className="arc-apg__node-accent" x={x} y={y} width="4" height={graph.geometry.nodeHeight} rx="2" />
                    <text className="arc-apg__node-type" x={x + (cinematic ? 12 : 14)} y={y + (cinematic ? 16 : 17)}>{nodeType}</text>
                    <text className="arc-apg__node-label" x={x + (cinematic ? 12 : 14)} y={y + (cinematic ? 32 : 36)}>
                      {lines.map((line, index) => (
                        <tspan key={`${node.id}-line-${index}`} x={x + (cinematic ? 12 : 14)} dy={index === 0 ? 0 : cinematic ? 13 : 14}>{line}</tspan>
                      ))}
                    </text>
                    {!cinematic && <text className="arc-apg__node-id" x={x + graph.geometry.nodeWidth - 10} y={y + graph.geometry.nodeHeight - 9} textAnchor="end">{node.id}</text>}
                  </g>
                );
              })}
          </g>
        </svg>
      </div>
    </figure>
  );
}
