---
name: arc-cyber-decision-engine
description: Orchestrate auditable cyber incident decisions in Codex with ARES's local deterministic evidence, graph, scoring, validation, simulation, and export tools plus host-model specialist reasoning. Use for synthetic incident investigation, containment-option comparison, counterfactual analysis, DecisionBundle creation, validation, and simulation. Requires no OpenAI API key and never performs live security actions.
---

# ARES

Use GPT-5.6 selected in the host Codex session for qualitative judgment and the ARES MCP tools for every numeric fact, evidence record, graph relation, ranking, validation result, and simulated action. Do not call the OpenAI API or request an API key.

## Establish the boundary

1. State that bundled evidence is synthetic and actions are simulations.
2. State that GPT reasoning runs in the user's Codex session while deterministic code computes the receipt.
3. Never imply access to a live tenant, endpoint, identity provider, SIEM, or response control.
4. Read [safety-and-evidence.md](references/safety-and-evidence.md) before analyzing evidence.
5. Read [decision-bundle.md](references/decision-bundle.md) before assembling or modifying a bundle.

## Preserve the 12-layer trace

Keep every completed investigation visibly traceable through: (1) intent, (2) plan, (3) evidence, (4) context fusion, (5) ontology, (6) decision graph, (7) eight specialist perspectives, (8) debate reduction, (9) deterministic ranking, (10) evidence receipt, (11) SOC/CISO/executive views, and (12) approval, outcome, and decision memory. If no prior memory is supplied, say that the prior-memory input is empty; the runtime may still prepare the current run's proposed record. Claim durable persistence only when the persistence layer confirms it.

## Run an investigation

1. Classify the user's intent as investigate, compare, counterfactual, validate, simulate, or export.
2. Call `arc_list_scenarios` when no exact scenario ID is supplied. Briefly explain the selected scenario and any assumption. Treat its Microsoft, Okta, AWS, GitHub, CrowdStrike, Active Directory, Veeam, and related product names as synthetic fixture provenance, never as live connector access.
3. Call `arc_run_deterministic_pipeline` once for the selected scenario. Treat its evidence, graph, formulas, scores, and ranks as immutable computed facts.
4. Summarize the deterministic result before adding model judgment: observed facts, unknowns, top-ranked option, score drivers, and the decision boundary.
5. Read [agent-roles.md](references/agent-roles.md), then run all eight specialist perspectives independently.

Prefer eight Codex subagents when available. Run two waves of four when capacity allows; otherwise size waves to the available slots or evaluate the eight perspectives sequentially. Give each perspective the shared deterministic facts, its assigned `agents[]` packet, and the citation rules; omit the other agent packets, deterministic debate, projections, and any prior `hostAnalysis`. Do not let one perspective see another's conclusion before it reports.

Require each perspective to return only:

- its exact agent ID from the deterministic packet;
- a disposition: support, challenge, or abstain;
- up to three concise claims with existing `evidenceIds` and optional `nodeOrEdgeIds`;
- one existing action ID it affects;
- assumptions or missing evidence;
- `low`, `moderate`, `high`, or `very-high` confidence derived from evidence quality, never an invented percentage.

6. Reduce the eight reports into a concise debate record. Preserve material dissent; do not manufacture consensus. Resolve narrative conflicts by evidence strength and freshness, not by vote count.
7. Create separate SOC, CISO, and executive summaries from the same cited result. Keep the SOC view operational, the CISO view risk-and-governance focused, and the executive view outcome-and-tradeoff focused.
8. Add specialist reports, the debate record, and audience summaries under the optional top-level `hostAnalysis` contract. Set `model` to `GPT-5.6` and `surface` to `Codex host` only when GPT-5.6 is selected in the visible host session. The validator enforces this declaration's contract shape; it is not model attestation. If the selected host model cannot be established, omit `hostAnalysis` and state the limitation. Do not put any numeric value under `hostAnalysis` or change deterministic scores, ranks, formulas, evidence, graph topology, graph simulation state, or reserved `hostNarrative` fields.
9. Call `arc_validate_bundle`. Repair citation or contract defects and validate again. If a defect requires changing deterministic data, rerun the pipeline instead.
10. Present the primary decision, runner-up, tradeoff, dissent, unknowns, counterfactual, and evidence receipt. Give conclusions and short rationales; never reveal hidden chain-of-thought.

## Handle counterfactuals

Run the named counterfactual as a separate deterministic scenario or variant. Compare receipts field by field and explain only changes supported by computed outputs. Never estimate how a score would move.

## Simulate an action

Call `arc_apply_simulated_action` only after the user selects an action. When the user asks to simulate the recommendation, top action, or selected response without naming an ID and no different option was previously chosen, use rank 1 and state that interpretation. If a prior selection exists or the wording could refer to another option, ask which action ID to use. Reapplying that same action is idempotent; after one action is selected, do not attempt a different action on the same bundle. Use the returned graph `before`, `blocked`, and `after` receipt as the sole source for path effects. Keep `mode: SIMULATED` and `liveSystemsChanged: false` adjacent to any result or expected signal. Never describe it as executed, contained, revoked, isolated, blocked, or remediated in a real environment.

## Export a bundle

Call `arc_export_bundle` only when the user explicitly asks to export or save. If the user asks to save a file but gives no filename, use `arc-<scenario-id>-<run-id>.json` directly inside the configured export root and report the resolved path. If the user asks only to show, serialize, or export in conversation, omit the path so no file is written. For a file, use a filename directly inside `ARC_EXPORT_DIR` (or the default plugin `arc-exports` directory), or an absolute path whose parent is that exact directory. Do not request a subdirectory, traversal, or destination outside the export root. Before replacing an existing regular file, obtain explicit approval and set `overwrite: true` only after approval. Symlinks are never valid export destinations.
