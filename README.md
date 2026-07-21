# ARES Cyber Decision Engine

I built ARES to make cyber incident decisions easier to explain and review.

Security teams usually have plenty of alerts. The harder problem is deciding what to do next, showing which evidence supports that decision, and understanding what the response could disrupt. ARES takes a synthetic incident, builds the possible attack paths, ranks the available response options, and produces a receipt that can be checked later.

ARES does not connect to a real company environment. The included incidents are fictional and every action is simulated.

## What ARES does

ARES follows the same process for every incident.

1. Load an allowlisted scenario.
2. Normalize the evidence and keep its source information.
3. Separate observations, derived conclusions, and hypotheses.
4. Build a typed graph of identities, systems, data, and business impact.
5. Find every path from the initial access point to a business target.
6. Calculate risk, evidence confidence, and response scores.
7. Rank the response options.
8. Require approval before applying a simulated action.
9. Record the paths before and after the simulation.
10. Produce views for security engineers, CISOs, and executives.

The same input produces the same result. The model can add qualitative analysis, but it cannot change evidence, formulas, scores, graph relationships, or rankings.

## Why I built it this way

I wanted the important parts of the decision to be reproducible. A useful incident response system should show more than a recommendation. It should also show what is known, what is uncertain, which paths are covered, what may remain open, and what business tradeoff comes with the action.

The deterministic engine owns those facts. Model output is kept in a separate optional field and must cite evidence that already exists in the result.

## Main parts

### Decision engine

The engine is in `plugins/arc-cyber-decision-engine/runtime/engine.mjs`. It handles evidence, claims, graph construction, path enumeration, scoring, validation, simulation, and stable JSON export.

### Web application

The application provides a security engineer view and a CISO view. It includes the attack path graph, evidence details, response ranking, approval controls, audience summaries, and an audit trace.

### Codex plugin

The plugin exposes the engine through a local MCP server. Codex can review the bounded specialist packets and add cited qualitative analysis. The plugin does not send requests to a model API and does not need a model API key.

### Persistence

The hosted application can use Cloudflare D1 for runs, action attempts, audit events, and decision memory. Local development falls back to process memory when D1 is not available.

## How I used Codex and GPT-5.6

I used Codex throughout Build Week. It helped me shape the decision contract, build the deterministic engine, create the synthetic incident scenarios, write tests, troubleshoot the graph layout, and improve the guided walkthrough.

I made the final product and engineering decisions. I also made sure the parts that need to be trusted stay in deterministic code. That includes the evidence, graph, scores, rankings, approval flow, and simulation receipts.

GPT-5.6 runs the specialist reasoning layer inside Codex. ARES gives it structured evidence packets for eight different security perspectives. It can compare those perspectives, question the recommended response, keep disagreements visible, and explain the result for security engineers, CISOs, and executives.

The boundary is important to me. GPT-5.6 can explain and challenge a decision, but it cannot add evidence, make up citation IDs, change the graph or scores, choose the final ranking, approve a response, or edit the receipt. Every specialist claim has to cite evidence that is already in the validated DecisionBundle.

## Scoring

ARES calculates the risk score from four normalized inputs.

```text
Risk = 30 x likelihood
     + 30 x reachability
     + 25 x asset criticality
     + 15 x control weakness
```

Evidence confidence uses completeness, corroboration, freshness, reliability, and conflict penalties.

```text
Confidence = 100 x (
    0.30 x completeness
  + 0.25 x corroboration
  + 0.20 x freshness
  + 0.25 x reliability
  - 0.15 x conflict penalty
)
```

Response options are ranked with path coverage, disruption, urgency, reversibility, and evidence strength.

```text
Action score = 40 x path coverage
             + 25 x inverse disruption
             + 15 x urgency
             + 10 x reversibility
             + 10 x evidence strength
```

The validator recalculates these values before a result can be stored, imported, exported, or simulated.

## Decision result

Each run returns one DecisionBundle. It contains the incident, evidence, claims, graph, paths, risk score, confidence score, ranked actions, approval state, audience views, and audit trace.

The bundle is rejected if references do not resolve or calculated values do not match the source data. A completed bundle can contain only one selected simulated action. Repeating the same action is idempotent, while trying a different action on the same completed run is rejected.

## Included scenarios

The repository contains synthetic scenarios for identity attacks, cloud credential theft, source control abuse, SaaS token compromise, ransomware, payroll fraud, and data platform exposure.

All names, accounts, events, addresses, and impact values in these scenarios are fixtures. They are not customer records or live credentials.

## Local setup

Use Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The development server prints the local address when it starts.

Deployment configuration is intentionally kept outside version control. The application defaults to a D1 binding named `DB`. A different binding can be selected with `ARES_D1_BINDING`. R2 is disabled unless `ARES_R2_BINDING` is set.

## Tests

Run all checks with these commands.

```bash
npm run typecheck
npm run lint
npm test
```

The tests cover scoring, graph paths, scenario contracts, validation, safe export behavior, persistence, action idempotency, authentication boundaries, and rendered application output.

## Project layout

`app` contains the web application and server routes.

`db` and `drizzle` contain the D1 schema and migrations.

`lib` contains persistence logic.

`plugins/arc-cyber-decision-engine` contains the deterministic engine, scenarios, local MCP server, and plugin files.

`tests` contains the engine, security, persistence, contract, and rendering tests.

`worker` contains the Cloudflare Worker entry point.

## Security boundaries

ARES uses synthetic data and simulated actions. It does not authenticate to security products or make changes to live systems.

Mutation routes require the platform supplied user identity. Inputs are bounded and scenario IDs are allowlisted. Exported files are restricted to one configured directory and existing files are protected from accidental replacement.

No credentials, deployment identifiers, personal account details, or private runbooks belong in this repository.

## Limitations

ARES is a decision prototype, not an autonomous response tool. Its scenarios and formulas are examples and should not be treated as a replacement for an organization's own incident response policy, risk model, or authorization process.

The local memory fallback is not durable. A deployed environment should use D1 if run history must survive restarts.
