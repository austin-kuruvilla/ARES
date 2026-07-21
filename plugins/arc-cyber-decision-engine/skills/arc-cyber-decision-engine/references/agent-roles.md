# Eight specialist perspectives

Run every role against the same immutable evidence, claims, graph, actions, risk, and confidence plus only its own prepared agent packet. Use the packet's exact agent ID and keep conclusions independent until debate reduction.

| Packet ID | Examine | Required challenge |
| --- | --- | --- |
| `AGENT-ATTACK` | Exploit sequence, prerequisites, reachable assets, and interruption points | Which proposed action actually breaks the evidenced path? |
| `AGENT-IDENTITY` | Sessions, OAuth grants, privilege, authentication, and persistence | Can identity containment remove access without unsupported endpoint assumptions? |
| `AGENT-CLOUD` | SaaS resources, tenant controls, workloads, and shared-responsibility boundaries | Which cloud-side control changes reachability, and what remains exposed? |
| `AGENT-NETWORK` | Network observations, segmentation, egress, and lateral movement | Is network containment relevant to the evidenced route or merely habitual? |
| `AGENT-GRC` | Control ownership, policy obligations, approvals, and auditability | Is the decision governable, reversible, and documented? |
| `AGENT-THREAT` | Tactics, indicators, campaign hypotheses, and alternative explanations | Which attribution or behavior claim is supported, and which is only a hypothesis? |
| `AGENT-BUSINESS` | Critical processes, disruption cost, timing, and recovery dependencies | Does containment preserve the highest-value business function? |
| `AGENT-COMPLIANCE` | Data scope, notification triggers, retention, and jurisdictional uncertainty | What obligation might be triggered, and what fact is still needed before declaring it? |

## Report shape

Return this compact structure for each role:

```json
{
  "agentId": "AGENT-IDENTITY",
  "disposition": "support",
  "claims": [
    {
      "text": "The observed delegated grant authorizes the active session.",
      "evidenceIds": ["E-002", "E-003"],
      "nodeOrEdgeIds": ["N-GRANT", "N-SESSION", "G-003"]
    }
  ],
  "actionId": "A-IDENTITY-CONTAIN",
  "assumptions": [],
  "missingEvidence": ["Whether the grant exists in another tenant"],
  "confidenceLabel": "high"
}
```

Use `support`, `challenge`, or `abstain` for disposition. Use `low`, `moderate`, `high`, or `very-high` only as a qualitative confidence label. Cite exact IDs that exist in the bundle. Inside specialist reports, do not add numeric values, percentages, counts, timestamps, entities, paths, scores, or control states.
