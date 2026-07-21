# Safety and evidence policy

## System boundary

- Treat every bundled connector record as synthetic demo data.
- Treat every action as a reversible simulation inside the bundle.
- Never contact, scan, authenticate to, modify, or claim control over a real security system.
- Do not request secrets, API keys, tokens, tenant identifiers, or production exports.
- Do not convert a simulated result into operational instructions without a separate user request and appropriate authorization.

## Fact boundary

Use deterministic ARES output as the sole source for:

- evidence IDs, timestamps, sources, entities, and observations;
- ontology nodes and decision-graph edges;
- path counts, risk values, option scores, ranks, confidence values, and formula inputs;
- action status and counterfactual deltas.

Use host-model reasoning only for:

- intent classification and investigation planning;
- role-specific interpretations of existing facts;
- explicit assumptions and missing-evidence questions;
- evidence-cited tradeoffs, dissent reduction, and executive explanation.

Never invent a numeric fact. Never recompute a score mentally. Never cite a source, node, edge, action, control, or scenario ID absent from the bundle.

## Citation validation

For every model-authored claim:

1. Extract each citation ID.
2. Verify the ID exists in the bundle.
3. Verify the cited record supports the exact claim.
4. Downgrade or remove claims that overreach the evidence.
5. Preserve conflicts and unknowns explicitly.

Treat a valid ID with an unsupported interpretation as a failed citation. Prefer “unknown” over inference when the evidence is incomplete.

## Explanation boundary

Return auditable conclusions, cited claims, assumptions, formula outputs already present in the receipt, and short rationales. Do not expose private internal reasoning or hidden chain-of-thought.
