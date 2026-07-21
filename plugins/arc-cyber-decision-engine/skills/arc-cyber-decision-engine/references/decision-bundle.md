# DecisionBundle contract

A DecisionBundle is one immutable deterministic receipt plus optional, clearly separated host analysis. Preserve field names and IDs from the pipeline output.

## Required deterministic sections

The pipeline must supply these logical sections. Exact nesting follows the returned bundle and must not be reshaped before validation.

| Section | Purpose | Mutation rule |
| --- | --- | --- |
| `schemaVersion`, `run`, `scenario` | Contract, run, and synthetic scenario identity | Never edit |
| `risk`, `confidence` | Published formulas, components, values, and evidence IDs | Never edit |
| `evidence`, `claims` | Synthetic source records and observed/derived/hypothesis claims | Never edit |
| `graph` | Typed nodes, edges, enumerated paths, path count, and optional simulation receipt | Change only through simulation tool |
| `agents`, `debate` | Eight deterministic specialist packets and reducer result | Never edit |
| `actions`, `recommendation` | Candidate actions, components, scores, ranks, and decision | Change only through simulation tool |
| `projections` | Deterministic SOC, CISO, and executive views | Never edit |
| `approval`, `memory` | Simulated approval and outcome-memory receipt | Change only through simulation tool |
| `layers`, `trace` | All 12 named stages in canonical order | Change only through simulation tool when it mirrors canonical graph/action/approval/memory state |

## Optional `hostAnalysis`

Add GPT-5.6 output only under this top-level contract:

```json
{
  "model": "GPT-5.6",
  "surface": "Codex host",
  "generatedAt": "ISO-8601 string",
  "specialists": [
    {
      "agentId": "AGENT-IDENTITY",
      "disposition": "support",
      "claims": [
        {
          "text": "Evidence-cited qualitative claim",
          "evidenceIds": ["E-002"],
          "nodeOrEdgeIds": ["G-003"]
        }
      ],
      "actionId": "A-IDENTITY-CONTAIN",
      "assumptions": [],
      "missingEvidence": [],
      "confidenceLabel": "high"
    }
  ],
  "debate": {
    "summary": "Concise evidence-grounded reduction",
    "dissent": ["Material challenge retained"],
    "evidenceIds": ["E-002"]
  },
  "audienceSummaries": {
    "soc": { "summary": "Operational view", "evidenceIds": ["E-002"] },
    "ciso": { "summary": "Risk and governance view", "evidenceIds": ["E-002"] },
    "executive": { "summary": "Outcome and tradeoff view", "evidenceIds": ["E-002"] }
  }
}
```

Include exactly one specialist object for each deterministic agent ID. Use only contract enums. Do not place model prose inside deterministic records or change `agents[].hostNarrative`; those fields prove the local runtime did not call a model. Do not put any numeric value under `hostAnalysis`. The validator checks specialist count, IDs, evidence citations, graph citations, action IDs, and the no-numeric invariant.

## Invariants

- Preserve exactly one `hostAnalysis.specialists` report for each of the eight deterministic agent IDs when host analysis is present.
- Preserve stable IDs across citations and counterfactual comparisons.
- Keep the recommended action consistent with rank 1.
- Keep score components and formula receipts consistent with the engine output.
- Mark all bundled evidence `synthetic` and every action transition `simulated`.
- Keep exactly zero or one simulated action. Reapplying the selected action must preserve a byte-identical bundle; selecting a different action after simulation is a conflict.
- Keep graph path states and the simulation `before`, `blocked`, and `after` sets consistent with the selected action's covered path IDs.
- Keep unknowns distinct from negative findings.
- Validate after adding commentary and before presenting or exporting.

The validator, not the model, decides whether a bundle satisfies the contract.
