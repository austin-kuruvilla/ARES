import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  listScenarios,
  runArcScenario,
} from "../plugins/arc-cyber-decision-engine/runtime/engine.mjs";

let renderId = 0;

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${renderId++}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function visibleText(html) {
  return html
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function openingTagsWithTestId(html, testId) {
  return [...html.matchAll(/<[a-z][^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => new RegExp(`\\bdata-testid="${testId}"`, "i").test(tag));
}

function elementWithTestId(html, testId) {
  const escaped = regexEscape(testId);
  return html.match(
    new RegExp(
      `<([a-z][\\w:-]*)\\b(?=[^>]*\\bdata-testid="${escaped}")[^>]*>[\\s\\S]*?<\\/\\1>`,
      "i",
    ),
  )?.[0];
}

function htmlBetweenTestIds(html, startTestId, endTestId) {
  const start = html.indexOf(`data-testid="${startTestId}"`);
  if (start < 0) return undefined;
  const end = html.indexOf(`data-testid="${endTestId}"`, start + 1);
  return end < 0 ? undefined : html.slice(start, end);
}

function tagName(tag) {
  return tag.match(/^<([a-z][\w:-]*)\b/i)?.[1]?.toLowerCase();
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1];
}

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function initialDecisionBundle() {
  const catalog = listScenarios();
  const scenarioId = catalog.some((scenario) => scenario.id === "oauth-phishing")
    ? "oauth-phishing"
    : catalog[0]?.id;
  assert.ok(scenarioId, "the scenario catalog must not be empty");
  return runArcScenario({ scenarioId });
}

function humanizeEnum(value) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function policyPercent(value) {
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function disruptionPercent(inverseDisruption) {
  const normalized = inverseDisruption <= 1 ? inverseDisruption * 100 : inverseDisruption;
  return `${Math.round(100 - normalized)}%`;
}

function assertNoPresentationLeaks(text, label) {
  assert.doesNotMatch(
    text,
    /\b(?:hackathon|judges?|build week|winning moment|synthetic|api[- ]?keys?)\b/i,
    `${label} must read like a product, not a competition, fixture, or implementation disclosure`,
  );

  // These were the old invented UI defaults. Match them only when presented with
  // their labels so legitimate, dynamically computed values elsewhere stay valid.
  assert.doesNotMatch(text, /\brisk(?: index| score)?\s*(?::|=|is)?\s*(?:72(?:\s*\/\s*80)?|80)\b/i);
  assert.doesNotMatch(text, /\bconfidence(?: score)?\s*(?::|=|is)?\s*0\.91\b/i);
  assert.doesNotMatch(text, /\bcontrol(?: coverage)?\s*(?::|=|is)?\s*0\.68\b/i);
}

test("server-renders the Security Engineer decision console and primary command controls", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const text = visibleText(html);
  assert.match(html, /<title>ARES — Cyber Decision Engine<\/title>/i);
  assert.match(text, /ARES Cyber Decision Engine/i);
  assert.doesNotMatch(text, /\bARC\b/, "the rendered product must use the ARES brand");
  assert.match(text, /Security Engineer/i);
  assert.doesNotMatch(text, /Executive decision overview/i);

  const [scenarioSelector] = openingTagsWithTestId(html, "scenario-selector");
  assert.ok(scenarioSelector, "the command bar must expose a stable scenario-selector hook");
  assert.equal(
    attribute(scenarioSelector, "data-primary-control"),
    "true",
    "scenario selection must be the command bar's primary control",
  );
  const scenarioLabel = attribute(scenarioSelector, "aria-label");
  const scenarioControlId = attribute(scenarioSelector, "id");
  const associatedLabel = scenarioControlId
    ? html.match(new RegExp(`<label\\b[^>]*\\bfor="${regexEscape(scenarioControlId)}"[^>]*>[\\s\\S]*?<\\/label>`, "i"))?.[0]
    : undefined;
  assert.ok(
    (scenarioLabel && /scenario|incident/i.test(scenarioLabel))
      || (associatedLabel && /scenario|incident/i.test(visibleText(associatedLabel))),
    "the scenario selector needs an accessible name",
  );

  const [themeToggle] = openingTagsWithTestId(html, "theme-toggle");
  assert.ok(themeToggle, "the command bar must expose a theme toggle");
  assert.match(
    attribute(themeToggle, "aria-label") ?? "",
    /(?:daylight|light).*theme|theme.*(?:daylight|light)/i,
    "the dark console must advertise its analyst-daylight theme",
  );

  const minimumProductCopy = [
    /\b(?:The decision|Recommended response)\b/i,
    /\bAttack[- ]paths?\b/i,
    /\bResponse (?:ranking|options?)\b/i,
    /\bSpecialist (?:council|review)\b/i,
    /\bHuman approval\b/i,
    /\b(?:Trust boundary|no live system changes|no production controls connected|not connected to live)\b/i,
  ];
  for (const copy of minimumProductCopy) {
    assert.match(text, copy, `missing minimum product copy: ${copy}`);
  }

  assert.match(html, /data-testid="ares-one-screen"/);
  assert.match(text, /Machine-verifiable receipt/i);
  assertNoPresentationLeaks(text, "Security Engineer view");
});

test("renders every deterministic scenario as a selectable incident", async () => {
  const response = await render();
  const html = await response.text();
  const selector = elementWithTestId(html, "scenario-selector");
  assert.ok(selector, "the incident selector must be server-rendered");

  for (const scenario of listScenarios()) {
    assert.match(
      selector,
      new RegExp(`<option\\b[^>]*\\bvalue="${regexEscape(scenario.id)}"[^>]*>`, "i"),
      `${scenario.id} must be available from the first screen`,
    );
  }
});

test("renders a professional fixed-viewport cockpit with distinct decision regions", async () => {
  const response = await render();
  const html = await response.text();

  const screens = openingTagsWithTestId(html, "ares-one-screen");
  assert.equal(screens.length, 1, "the operator view needs one stable one-screen root");
  const screen = screens[0];
  assert.match(
    attribute(screen, "class") ?? "",
    /(?:^|\s)ares-one-screen(?:\s|$)/,
    "the one-screen root needs a stable styling hook",
  );
  assert.equal(
    attribute(screen, "data-layout"),
    "fixed-viewport",
    "the root must declare the fixed-viewport layout contract without relying on pixel tests",
  );
  assert.match(
    attribute(screen, "aria-label") ?? "",
    /incident|security|decision|cockpit/i,
    "the fixed viewport needs an operator-facing accessible name",
  );

  const regions = [
    ["situation-region", /situation|incident/i],
    ["exposure-region", /exposure|business reach|attack path/i],
    ["decision-region", /decision|recommended response/i],
    ["outcome-region", /outcome|projection|verification/i],
  ];
  const regionPositions = [];

  for (const [testId, expectedName] of regions) {
    const tags = openingTagsWithTestId(html, testId);
    assert.equal(tags.length, 1, `${testId} must identify one distinct first-screen region`);
    const tag = tags[0];
    assert.match(
      tagName(tag) ?? "",
      /^(?:section|article|aside)$/,
      `${testId} must use a semantic region container`,
    );

    const label = attribute(tag, "aria-label");
    const labelledBy = attribute(tag, "aria-labelledby");
    assert.ok(label || labelledBy, `${testId} needs an accessible name`);
    if (label) assert.match(label, expectedName, `${testId} needs a useful accessible name`);
    if (labelledBy) {
      const heading = html.match(
        new RegExp(`<[^>]+\\bid="${regexEscape(labelledBy)}"[^>]*>[\\s\\S]*?<\\/[^>]+>`, "i"),
      )?.[0];
      assert.ok(heading, `${testId} must reference an existing heading`);
      assert.match(visibleText(heading), expectedName, `${testId}'s heading must explain the region`);
    }

    regionPositions.push(html.indexOf(`data-testid="${testId}"`));
  }

  assert.deepEqual(
    regionPositions,
    [...regionPositions].sort((left, right) => left - right),
    "the reading order must be Situation, Exposure, Decision, then Outcome",
  );
});

test("keeps the complete cockpit reachable on compact desktop viewports", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  const compactWidth = css.indexOf("@media (min-width: 1024px) and (max-width: 1388px)");
  assert.ok(compactWidth >= 0, "narrow desktop widths need an explicit cockpit layout override");
  const compactWidthRules = css.slice(compactWidth, compactWidth + 1_700);
  assert.match(compactWidthRules, /\.decision-workspace\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(compactWidthRules, /\.brief-panel-heading\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(compactWidthRules, /\.brief-targets\s*\{[\s\S]*?flex-wrap:\s*wrap/);

  const compactHeight = css.indexOf("@media (min-width: 1024px) and (max-height: 719px)");
  assert.ok(compactHeight >= 0, "short desktop heights need a reachable overflow strategy");
  const compactHeightRules = css.slice(compactHeight, compactHeight + 900);
  assert.match(compactHeightRules, /overflow-y:\s*auto/);
  assert.match(compactHeightRules, /\.ares-one-screen\s*\{[\s\S]*?height:\s*720px/);

  const contentFit = css.indexOf("/* Readable content-fit safeguards");
  assert.ok(contentFit >= 0, "dense cockpit copy needs an explicit content-fit contract");
  const contentFitRules = css.slice(contentFit);
  assert.match(contentFitRules, /\.brief-incident > p,[\s\S]*?display:\s*-webkit-box/);
  assert.match(contentFitRules, /\.brief-exposure-metrics dt,[\s\S]*?white-space:\s*normal/);
  assert.match(contentFitRules, /\.brief-targets > strong\s*\{[\s\S]*?white-space:\s*normal/);
  assert.match(contentFitRules, /@media \(min-width: 1024px\) and \(max-height: 819px\)/);
});

test("uses one desktop alignment and typography system across the cockpit", async () => {
  const response = await render();
  const html = await response.text();
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(
    html,
    /class="brief-card-heading"[\s\S]*?class="eyebrow"[\s\S]*?class="brief-status-line"/,
    "the Situation stage and risk state must share one heading row",
  );

  const alignment = css.indexOf("/* Uniform cockpit alignment");
  assert.ok(alignment >= 0, "the first screen needs an explicit shared alignment contract");
  const rules = css.slice(alignment);
  assert.match(rules, /--ares-card-pad-x:\s*12px/);
  assert.match(
    rules,
    /grid-template-columns:[\s\S]*?clamp\(280px,\s*22vw,\s*352px\)[\s\S]*?clamp\(340px,\s*28vw,\s*420px\)/,
    "desktop columns must resize continuously instead of jumping at a breakpoint",
  );
  assert.match(
    rules,
    /--ares-type-title:\s*19px[\s\S]*?\.brief-incident h1,[\s\S]*?\.brief-panel-heading h2,[\s\S]*?\.brief-decision-card h2,[\s\S]*?\.brief-outcome-card h2\s*\{[\s\S]*?font-size:\s*var\(--ares-type-title\)/,
    "all four decision stages must share a title scale and line box",
  );
  assert.match(rules, /\.brief-exposure-metrics > div\s*\{[\s\S]*?grid-template-rows:/);
  assert.match(rules, /\.brief-decision-metrics > div\s*\{[\s\S]*?grid-template-rows:/);
  assert.match(
    rules,
    /\.ares-one-screen > \.war-overlay-launcher\s*\{[\s\S]*?display:\s*grid/,
    "the detail controls must stay centered independently of their label",
  );
});

test("keeps secondary detail behind an accessible first-screen overlay launcher", async () => {
  const response = await render();
  const html = await response.text();

  const launchers = openingTagsWithTestId(html, "detail-overlay-launcher");
  assert.equal(launchers.length, 1, "the first screen needs one stable detail-overlay launcher");
  const launcherTag = launchers[0];
  assert.equal(tagName(launcherTag), "nav", "detail launchers belong in a navigation landmark");
  assert.match(
    attribute(launcherTag, "aria-label") ?? "",
    /detail|evidence|investigation|decision/i,
    "the overlay launcher needs an operator-facing accessible name",
  );

  const launcher = elementWithTestId(html, "detail-overlay-launcher");
  assert.ok(launcher, "the detail-overlay launcher must be server-rendered");
  const buttons = [...launcher.matchAll(/<button\b[^>]*>/gi)].map((match) => match[0]);
  assert.ok(buttons.length >= 3, "secondary evidence, review, and audit detail must stay reachable");
  for (const button of buttons) {
    assert.equal(attribute(button, "aria-haspopup"), "dialog");
    assert.match(attribute(button, "aria-controls") ?? "", /-overlay$/);
    assert.match(attribute(button, "aria-expanded") ?? "", /^(?:true|false)$/);
  }
});

test("server-renders a semantic first-screen war room with a data-backed counterfactual control", async () => {
  const response = await render();
  const html = await response.text();

  const [warRoom] = openingTagsWithTestId(html, "war-room-first-screen");
  assert.ok(warRoom, "the first operator screen needs a stable war-room marker");
  assert.match(
    attribute(warRoom, "aria-label") ?? "",
    /war room|incident decision/i,
    "the war-room landmark needs an operator-facing accessible name",
  );

  const toggleElement = elementWithTestId(html, "counterfactual-toggle");
  assert.ok(toggleElement, "the war room must expose a counterfactual toggle");
  const toggleTag = toggleElement.match(/^<[a-z][^>]*>/i)?.[0] ?? "";
  assert.equal(tagName(toggleTag), "button", "the counterfactual control must be a button");
  assert.match(attribute(toggleTag, "aria-pressed") ?? "", /^(?:true|false)$/);
  assert.equal(attribute(toggleTag, "aria-controls"), "counterfactual-path-count");
  assert.match(
    attribute(toggleTag, "aria-label") ?? visibleText(toggleElement),
    /counterfactual|endpoint fact|evidence/i,
    "the counterfactual toggle needs a meaningful accessible name",
  );

  const counterElement = elementWithTestId(html, "counterfactual-path-count");
  assert.ok(counterElement, "the counterfactual must expose its computed path count");
  const counterTag = counterElement.match(/^<[a-z][^>]*>/i)?.[0] ?? "";
  assert.equal(attribute(counterTag, "id"), "counterfactual-path-count");

  const expectedPathCount = initialDecisionBundle().graph.paths.length;
  assert.equal(
    attribute(counterTag, "data-path-count"),
    String(expectedPathCount),
    "the rendered counter must be sourced from the active scenario graph",
  );
  assert.match(
    visibleText(counterElement),
    new RegExp(`\\b${expectedPathCount}\\s+(?:open\\s+)?modeled\\s+paths?\\b`, "i"),
    "the visible counter must identify the active scenario count as modeled paths",
  );
});

test("renders a data-backed situation brief with confirmed facts kept separate from uncertainty", async () => {
  const response = await render();
  const html = await response.text();
  const bundle = initialDecisionBundle();

  assert.ok(
    openingTagsWithTestId(html, "security-decision-brief").length > 0,
    "the first screen must expose the senior-security decision brief",
  );

  const situation = elementWithTestId(html, "brief-situation");
  assert.ok(situation, "the decision brief needs a situation section");
  const situationText = visibleText(situation);
  assert.match(situationText, new RegExp(regexEscape(bundle.scenario.title), "i"));
  assert.match(
    situationText,
    /An active Microsoft 365 session is using a malicious OAuth grant with mail, file, and offline-access permissions\./i,
  );
  assert.match(situationText, /external forwarding rule is present/i);
  assert.match(situationText, /accessed Finance\/Payments files/i);

  const decisionQuestion = elementWithTestId(html, "decision-question");
  assert.ok(decisionQuestion, "the situation must state the decision being resolved");
  assert.match(
    visibleText(decisionQuestion),
    /Contain the cloud access now, or add endpoint isolation\?/i,
    "the visible decision question must frame the operator's containment choice",
  );

  const confirmed = htmlBetweenTestIds(html, "confirmed-evidence", "unconfirmed-evidence");
  assert.ok(confirmed, "the brief must identify confirmed evidence");
  const confirmedText = visibleText(confirmed);
  const expectedObservedClaims = ["C-002", "C-004", "C-005"]
    .map((claimId) => bundle.claims.find((claim) => claim.id === claimId))
    .filter(Boolean);
  assert.ok(expectedObservedClaims.length > 0, "the active scenario must contain observed claims");
  for (const claim of expectedObservedClaims) {
    assert.match(confirmedText, new RegExp(regexEscape(claim.text), "i"));
    assert.match(confirmedText, new RegExp(`\\b${regexEscape(claim.id)}\\b`, "i"));
    for (const evidenceId of claim.evidenceIds) {
      assert.match(confirmedText, new RegExp(`\\b${regexEscape(evidenceId)}\\b`, "i"));
    }
  }

  const unconfirmed = elementWithTestId(html, "unconfirmed-evidence");
  assert.ok(unconfirmed, "the brief must preserve what remains unconfirmed");
  const uncertaintyText = visibleText(unconfirmed);
  assert.match(uncertaintyText, /Confirmed: active cloud-identity compromise/i);
  assert.match(uncertaintyText, /Not established: endpoint execution or persistence/i);
  assert.match(uncertaintyText, /not proof the host is clean/i);
  for (const claim of bundle.claims.filter((item) => item.classification === "hypothesis")) {
    assert.doesNotMatch(
      confirmedText,
      new RegExp(regexEscape(claim.text), "i"),
      `hypothesis ${claim.id} must not be presented as confirmed evidence`,
    );
  }
});

test("renders modeled business reach with deterministic targets and path classifications", async () => {
  const response = await render();
  const html = await response.text();
  const bundle = initialDecisionBundle();

  const exposure = elementWithTestId(html, "modeled-exposure");
  assert.ok(exposure, "the decision brief needs a modeled-exposure section");
  const exposureText = visibleText(exposure);
  const derivedCount = bundle.graph.paths.filter((path) => path.classification === "derived").length;
  const hypothesisCount = bundle.graph.paths.filter((path) => path.classification === "hypothesis").length;
  assert.match(
    exposureText,
    new RegExp(`Modeled paths\\s*${bundle.graph.pathCount}\\b`, "i"),
    "the exposure summary must use the deterministic graph path count",
  );
  assert.match(exposureText, new RegExp(`\\b${derivedCount}\\s+evidence-derived\\b`, "i"));
  assert.match(exposureText, new RegExp(`\\b${hypothesisCount}\\s+hypothetical impact paths?\\b`, "i"));
  assert.match(exposureText, /not a live network map/i);

  const targets = elementWithTestId(html, "business-target");
  assert.ok(targets, "the exposure section must identify modeled business targets");
  const targetText = visibleText(targets);
  const expectedTargets = bundle.graph.nodes.filter((node) => bundle.graph.targetNodeIds.includes(node.id));
  assert.ok(expectedTargets.length > 0, "the active graph must contain business targets");
  for (const target of expectedTargets) {
    assert.match(
      targetText,
      new RegExp(regexEscape(target.label), "i"),
      `modeled business target ${target.id} must be named`,
    );
  }
});

test("explains the policy recommendation, modeled coverage, costs, runner-up, and simulation boundary", async () => {
  const response = await render();
  const html = await response.text();
  const bundle = initialDecisionBundle();
  const recommendation = bundle.recommendation;
  const runnerUp = [...bundle.actions].sort((left, right) => left.rank - right.rank)[1];
  assert.ok(runnerUp, "the active scenario must have a runner-up response");

  const recommendationElement = elementWithTestId(html, "policy-recommendation");
  assert.ok(recommendationElement, "the brief needs a policy-ranked recommendation");
  const recommendationText = visibleText(recommendationElement);
  assert.match(recommendationText, /recommended response/i);
  assert.match(recommendationText, /Revoke active sessions and remove the malicious OAuth grant/i);
  assert.match(recommendationText, /remove DocuSync Pro['’]s delegated grant/i);
  assert.match(recommendationText, /delete the external forwarding rule/i);
  assert.match(recommendationText, new RegExp(regexEscape(humanizeEnum(bundle.approval.state)), "i"));
  assert.match(recommendationText, new RegExp(regexEscape(humanizeEnum(bundle.approval.role)), "i"));

  const coverage = elementWithTestId(html, "modeled-coverage");
  assert.ok(coverage, "the recommendation must disclose modeled path coverage");
  const coverageText = visibleText(coverage);
  assert.match(coverageText, /paths interrupted/i);
  assert.match(
    coverageText,
    new RegExp(`${recommendation.coveredPathIds.length}\\s*\\/\\s*${bundle.graph.pathCount}\\b`),
  );
  assert.match(
    coverageText,
    new RegExp(regexEscape(disruptionPercent(recommendation.components.inverseDisruption)), "i"),
    "modeled disruption must be derived from the ranked action's inverse-disruption input",
  );
  assert.match(
    coverageText,
    new RegExp(regexEscape(policyPercent(recommendation.components.reversibility)), "i"),
    "the reversibility score must use the ranked action's deterministic scoring input",
  );

  const costs = elementWithTestId(html, "operational-costs");
  assert.ok(costs, "the recommendation must disclose operational costs");
  const costText = visibleText(costs);
  for (const tradeoff of recommendation.tradeoffs) {
    assert.match(costText, new RegExp(regexEscape(tradeoff), "i"));
  }

  const comparison = elementWithTestId(html, "runner-up-comparison");
  assert.ok(comparison, "the recommendation must compare the runner-up response");
  const comparisonText = visibleText(comparison);
  assert.match(comparisonText, /runner-up tradeoff/i);
  assert.match(comparisonText, new RegExp(regexEscape(runnerUp.title), "i"));
  assert.match(
    comparisonText,
    new RegExp(`${runnerUp.coveredPathIds.length}\\s*\\/\\s*${bundle.graph.pathCount}\\s+paths`, "i"),
    "runner-up coverage must come from the deterministic action ranking",
  );
  assert.match(
    comparisonText,
    new RegExp(regexEscape(disruptionPercent(runnerUp.components.inverseDisruption)), "i"),
    "runner-up disruption must come from its deterministic scoring input",
  );

  const boundary = elementWithTestId(html, "approval-simulation-boundary");
  assert.ok(boundary, "the modeled outcome must state the execution boundary");
  const boundaryText = visibleText(boundary);
  assert.match(boundaryText, /projection only/i);
  assert.match(boundaryText, /not connected to live/i);
  assert.equal(bundle.layers.receipt.provenance.externalActions, false);
  assert.equal(bundle.recommendation.status, "proposed");
});

test("keeps pre-simulation decision copy free of live-state and overclaiming language", async () => {
  const response = await render();
  const text = visibleText(await response.text());

  assert.doesNotMatch(text, /\bLIVE ATTACK TOPOLOGY\b/i);
  assert.doesNotMatch(text, /\bLIVE RECEIPT\b/i);
  assert.doesNotMatch(text, /\bEndpoint clean\b/i);
  assert.doesNotMatch(text, /endpoint telemetry (?:is|remains) clean/i);
  assert.doesNotMatch(text, /\bPaths closed\b/i);
});

test("server-renders accessible launchers for council, audience, and trace overlays", async () => {
  const response = await render();
  const html = await response.text();

  const launchers = [
    {
      testId: "open-council-overlay",
      controls: "council-overlay",
      label: /specialist|council/i,
    },
    {
      testId: "open-audiences-overlay",
      controls: "audiences-overlay",
      label: /audience|stakeholder|operating lenses/i,
    },
    {
      testId: "open-trace-overlay",
      controls: "trace-overlay",
      label: /trace|receipt|audit/i,
    },
  ];

  for (const launcher of launchers) {
    const element = elementWithTestId(html, launcher.testId);
    assert.ok(element, `${launcher.testId} must be present on the server-rendered war room`);
    const tag = element.match(/^<[a-z][^>]*>/i)?.[0] ?? "";
    assert.equal(tagName(tag), "button", `${launcher.testId} must be a button`);
    assert.equal(attribute(tag, "aria-haspopup"), "dialog");
    assert.equal(attribute(tag, "aria-controls"), launcher.controls);
    assert.match(attribute(tag, "aria-expanded") ?? "", /^(?:true|false)$/);
    assert.match(
      attribute(tag, "aria-label") ?? visibleText(element),
      launcher.label,
      `${launcher.testId} needs an operator-facing accessible name`,
    );
  }
});

test("renders an accessible SVG attack graph instead of a flat HTML strip", async () => {
  const response = await render();
  const html = await response.text();

  const graph = html.match(
    /<svg\b(?=[^>]*\bdata-testid="attack-graph")[^>]*>[\s\S]*?<\/svg>/i,
  )?.[0];
  assert.ok(graph, "attack-graph must be a real <svg> element");

  const svgTag = graph.match(/^<svg\b[^>]*>/i)?.[0] ?? "";
  assert.match(
    attribute(svgTag, "aria-label") ?? "",
    /attack[- ]path/i,
    "the attack graph needs a useful accessible label",
  );
  assert.match(graph, /<(?:path|line|polyline)\b/i, "the graph must render SVG edges");
  assert.match(graph, /<(?:g|circle|rect|ellipse|polygon)\b/i, "the graph must render SVG nodes");

  const viewBox = (attribute(svgTag, "viewBox") ?? "").split(/\s+/).map(Number);
  assert.equal(viewBox.length, 4, "the graph needs a complete numeric viewBox");
  assert.ok(
    viewBox[2] <= 660,
    `the one-screen graph must use compact topology geometry instead of shrinking a ${viewBox[2]}px-wide diagram`,
  );
  assert.ok(
    viewBox[3] <= 260,
    `the one-screen graph must keep labels legible instead of scaling a ${viewBox[3]}px-tall multi-lane diagram`,
  );
});

test("renders semantic response score bars and a dynamic council disposition tally", async () => {
  const response = await render();
  const html = await response.text();
  const text = visibleText(html);

  const scoreBars = openingTagsWithTestId(html, "response-score-bar");
  assert.ok(scoreBars.length >= 2, "response ranking must compare at least two score bars");
  for (const bar of scoreBars) {
    assert.equal(attribute(bar, "role"), "progressbar");
    assert.equal(attribute(bar, "aria-valuemin"), "0");
    assert.equal(attribute(bar, "aria-valuemax"), "100");
    assert.match(attribute(bar, "aria-valuenow") ?? "", /^\d+(?:\.\d+)?$/);
    assert.match(attribute(bar, "aria-label") ?? "", /score|response|action/i);
  }

  assert.ok(
    openingTagsWithTestId(html, "disposition-tally").length > 0,
    "specialist council must expose a disposition tally",
  );
  assert.match(text, /\b\d+\s+support\b/i, "tally must disclose support");
  assert.match(text, /\b\d+\s+dissent\b/i, "tally must preserve visible dissent");
});

test("server-renders a distinct CISO decision page", async () => {
  const [engineerResponse, cisoResponse] = await Promise.all([render(), render("/ciso")]);
  assert.equal(engineerResponse.status, 200);
  assert.equal(cisoResponse.status, 200);

  const engineerHtml = await engineerResponse.text();
  const cisoHtml = await cisoResponse.text();
  const engineerText = visibleText(engineerHtml);
  const cisoText = visibleText(cisoHtml);
  const engineerScreen = htmlBetweenTestIds(engineerHtml, "ares-one-screen", "detail-overlay-launcher");
  const cisoScreen = htmlBetweenTestIds(cisoHtml, "ares-one-screen", "detail-overlay-launcher");
  assert.ok(engineerScreen && cisoScreen, "both routes need a visible one-screen cockpit");
  const engineerScreenText = visibleText(engineerScreen);
  const cisoScreenText = visibleText(cisoScreen);

  assert.match(cisoHtml, /<title>ARES CISO — Cyber Decision Engine<\/title>/i);
  const [cisoRoot] = openingTagsWithTestId(cisoHtml, "ares-one-screen");
  assert.equal(attribute(cisoRoot, "data-view"), "ciso");
  assert.match(cisoScreenText, /CISO Decision Cockpit/i);
  assert.match(cisoScreenText, /Business exposure/i);
  assert.match(cisoScreenText, /Approval decision/i);
  assert.match(cisoScreenText, /Decision owner/i);
  assert.match(cisoScreenText, /Modeled business disruption/i);
  assert.match(cisoScreenText, /Business tradeoff/i);
  assert.match(cisoScreenText, /Projected business outcome/i);
  assert.match(cisoScreenText, /Review approval decision/i);
  assert.doesNotMatch(engineerScreenText, /CISO Decision Cockpit|Modeled business disruption|Review approval decision/i);
  assert.notEqual(cisoText, engineerText, "the CISO route must not duplicate the engineer page");
  assertNoPresentationLeaks(cisoText, "CISO view");
});

test("keeps both operator views free of hackathon and judge presentation copy", async () => {
  const [engineerResponse, cisoResponse] = await Promise.all([render(), render("/ciso")]);
  const views = [
    ["Security Engineer view", visibleText(await engineerResponse.text())],
    ["CISO view", visibleText(await cisoResponse.text())],
  ];

  for (const [label, text] of views) {
    assertNoPresentationLeaks(text, label);
    assert.doesNotMatch(
      text,
      /copy judge prompt|openai build week|hackathon demonstration|what the judges will see/i,
      `${label} must not expose competition presentation mechanics`,
    );
  }
});

test("ships product metadata without starter artifacts", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /<meta property="og:title" content="ARES — Cyber Decision Engine"\/>/i);
  assert.match(html, /Turn security evidence into a defensible, human-approved response/i);
  assert.match(
    html,
    /<meta property="og:image" content="http:\/\/localhost(?::3000)?\/og-ares-decision-brief\.png"\/>/i,
  );
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"\/>/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});
