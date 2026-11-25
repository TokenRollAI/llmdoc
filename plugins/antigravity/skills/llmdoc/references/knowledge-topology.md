# Knowledge Topology and Context Floor

Use this reference when bootstrapping llmdoc, creating or moving a topic or document, repairing unmapped code, or judging whether the knowledge surface reaches the Context Floor. It expands the mandatory gates in the operating skills; it is not a checklist for routine retrieval.

## Design model

llmdoc is a task-oriented semantic routing graph, not a compressed copy of the repository. Its job is to make the right durable context reachable before broad source exploration while leaving live implementation facts in their canonical sources.

Five principles shape the model:

1. **Minimum sufficient graph.** Optimize for the smallest connected knowledge surface that supports correct work, not maximum prose, file coverage, or taxonomy completeness.
2. **Decisions over observations.** Stable documents preserve costly-to-recover decisions, rationale, boundaries, invariants, contracts, failure semantics, and risky workflows. Source, schema, tests, manifests, and CLI help remain authoritative for cheap live facts.
3. **Ownership over layout.** Knowledge follows stable responsibility and decision boundaries. A domain may cross packages, and one package may contain several domains.
4. **Progressive disclosure.** `tree` exposes the map, descriptions and search expose semantic candidates, `context --files` exposes change owners, relations add required closure, and `show` loads only selected bodies. Each layer must support a stop decision.
5. **Review coupling.** `code.paths` connects changes to the documents whose claims may become false. Mapping therefore follows semantic review obligation, not provenance alone or a coverage target.

These principles create a deliberate split of authority:

| Concern | Owner |
|---|---|
| Current implementation facts | Source, tests, schema, manifests, generated config |
| Durable engineering meaning | llmdoc document body |
| Concept and change routing | `description`, document path, `code.paths`, `relations` |
| Freshness and validity | Git-based llmdoc ledger and CLI |
| Investigation evidence | `.llmdoc-tmp/` |

An authoring choice is justified only when it improves retrieval, comprehension, or review coupling without duplicating a cheaper source of truth. This is why V3 has one topic level, no hand-maintained index pages, only three document kinds, and a small front matter surface.

## The two independent gates

Do not use one gate as a substitute for the other:

1. **Stable Knowledge Gate — prose value.** Preserve only durable decisions, rationale, boundaries, invariants, failure semantics, contracts, and risky workflows that source does not cheaply reconstruct.
2. **Routing Gate — owner reachability.** A representative concept query and a representative decision-bearing source file must reach the document that owns that knowledge.

Mapping a file does not require narrating the file in prose. Conversely, concise prose does not excuse a missing route. `validate` proves structural validity; it does not prove semantic ownership or Context Floor coverage.

## What the Context Floor means

The Context Floor is the smallest connected knowledge surface from which a new agent can:

- find the owner of each first-class subsystem using the vocabulary a developer would naturally query;
- route from a concrete change to the document whose claims need review;
- recover the decisions, boundaries, invariants, and failure model needed before reading implementation details;
- follow mandatory prerequisites across topics without loading unrelated documents.

It is not a target document count, token count, or percentage of files mapped. Generated files, barrels, trivial helpers, and code with no durable knowledge may intentionally remain unmapped.

A subsystem is usually first-class when at least one of these is true:

- it owns an external or cross-module contract;
- it has a distinct lifecycle, authority boundary, or failure model;
- changes to it require decisions that are not local implementation details;
- it contains a risky repeatable operational or maintenance workflow.

Package and directory boundaries are evidence, not automatic knowledge boundaries.

## Domain, topic, and document

Use three reasoning levels:

| Level | Question | llmdoc representation |
|---|---|---|
| Domain | What stable responsibility or decision boundary exists? | Analysis unit; it may span packages or split one package |
| Topic | What retrieval neighborhood should a caller enter? | One directory directly below `llmdoc/` |
| Document | What single owner answers one coherent class of questions? | One `.mdx` file with a kind and routing metadata |

### Domain boundary test

Keep concerns in the same domain when they share most of the following:

- the same conceptual owner or authority;
- the same invariants and failure model;
- the same change reasons and review questions;
- the same vocabulary in natural-language searches.

Split domains when the owner, authority, failure model, or common questions remain distinct even if the code is colocated. Join code from different packages into one domain when it implements one contract or execution model.

Avoid domains named after temporary projects, release phases, teams, or generic layers such as `utils`. Prefer stable responsibility names such as identity delegation, request execution, or release integrity.

### Topic boundary test

A topic is the physical retrieval partition for one stable domain or a coherent subdomain. Create a new topic only when it gives callers a durable vocabulary and keeps unrelated searches or file routes from loading each other.

Use the same topic when documents share a bounded responsibility and are commonly needed together. Split a topic when it contains independent owners or failure models and callers usually need only one side. A one-document topic is valid only when the boundary is genuinely distinct and expected to persist.

Root-level singleton documents are reserved for contracts that are truly cross-topic, such as the repository-wide execution model. Do not use a generic root architecture document as the only owner for otherwise independent subsystems.

### Document boundary and kind

Choose the kind from the question the document answers:

- `architecture`: Why is this responsibility shaped this way? Who owns what? What flow, invariants, tradeoffs, and failure semantics constrain changes?
- `guide`: When and how is a risky or non-obvious workflow performed? What are its branches, safety checks, verification, recovery, and stopping conditions?
- `reference`: What stable vocabulary, contract, compatibility rule, default, or decision table must be looked up precisely?

Split when a document has more than one conceptual owner, more than one independently invoked workflow, or unrelated query vocabularies. Keep it intact when a split would break one execution model or invariant chain merely to satisfy a line target.

## What to write

Use these skeletons selectively. Omit empty sections rather than filling them with source inventory.

### Architecture

1. Scope and ownership boundary
2. Execution or data flow
3. Decisions and rationale, including rejected alternatives when they affect future choices
4. Invariants, authority boundaries, and non-obvious failure semantics
5. Cross-topic contracts and change consequences
6. A few canonical source anchors

### Guide

1. Trigger and when not to use the workflow
2. Preconditions and safety boundary
3. Steps with meaningful decision branches
4. Verification and success signals
5. Failure handling, rollback, and escalation conditions

### Reference

1. Scope and source of authority
2. Stable terms, fields, states, defaults, or compatibility rules
3. Decision table or lookup structure
4. Exceptions and relationships to owner documents

Do not preserve current file lists, line counts, release snapshots, copied CLI help, investigation narratives, or facts that a canonical manifest or schema answers in minutes. Source anchors support durable claims; they do not replace those claims.

## Front matter as retrieval design

### `description`

Write a compact retrieval promise, not an abstract summary. Include the distinctive responsibility, contract terms, and questions a developer is likely to search. Avoid descriptions that could apply to several documents, such as “architecture overview” or “core behavior.”

### `code.paths`

Map semantic ownership rather than directory membership. Useful anchors include:

- canonical contract, schema, or protocol definitions;
- entrypoints and orchestrators that establish the execution model;
- boundary adapters whose behavior changes the documented contract;
- persistence or configuration surfaces that encode documented invariants;
- tests only when they are the clearest owner of a non-obvious contract.

Apply both tests:

- **Recall:** every first-class decision-bearing surface has a route to its owner document.
- **Precision:** every matched file is relevant enough that changing it should trigger review of that document.

Do not add a broad package glob merely to raise coverage. If an unrelated sibling file matches, narrow the glob or add exact patterns. Do not map generated, vendored, barrel, or incidental helper files unless they genuinely own part of the contract.

### `relations`

Use `requires` only when a caller must read the prerequisite to apply this document safely. Use `related` for useful neighbors. Relations connect owner documents; they do not compensate for missing `code.paths` or recreate a manual index tree.

## Bootstrap procedure

Before drafting, keep a scratch domain/owner matrix in `.llmdoc-tmp/`:

| Domain or subsystem | Natural queries | Declared implementation boundaries | Entry/contract probes | Leaf/boundary probes | Expected owner doc | Status and evidence |
|---|---|---|---|---|---|---|

Allowed statuses are `documented`, `intentionally reconstructable`, and `gap`. A first-class subsystem left unclassified or at `gap` makes init incomplete; do not silently defer it while reporting success.

List every distinct package, adapter, runtime, authority, or external boundary that participates in a domain. A cross-package contract is not covered merely because two probes from the same package pass.

An `intentionally reconstructable` row must name its canonical recovery source, estimate that recovery takes only a few minutes, state why no durable decision or failure model is hidden there, and include a representative file expected to remain unmapped. Missing or conflicting evidence makes it a `gap`, not a no-doc decision.

Then:

1. Inventory first-class domains from manifests, entrypoints, external contracts, tests, release/config surfaces, and failure boundaries.
2. Group them into topics using ownership, invariants, failure model, change reasons, and query vocabulary.
3. Assign one canonical owner document for every durable decision cluster or risky workflow.
4. Draft only claims that pass the Stable Knowledge Gate.
5. Add precise routes from representative decision-bearing files to those owners.
6. Add `requires` only for mandatory reading order.
7. Run the Context Floor acceptance checks below.

Keep the executable evidence in a scratch probe table rather than stable prose:

| Domain and boundary | Query or file | Expected owner/result | Actual owner/rank/result | Pass or repair reason |
|---|---|---|---|---|

“A few high-value docs” means the smallest sufficient owner set. It never means leaving a first-class subsystem without an explicit owner or an intentional no-doc decision.

## Context Floor acceptance

Run these checks after `validate` during init, and for the affected scope during update or topology changes.

### 1. Concept route

For each first-class subsystem, run two or three natural queries, including one term that does not simply repeat the document title:

```sh
npx -y @tokenroll/llmdoc search "<natural concept or failure question>"
```

The intended owner should be the first relevant result from its description and content. If it is not first, record the actual rank and why earlier results do not make routing ambiguous; otherwise repair the description or boundary. If only a generic root document appears, the subsystem is not adequately owned.

### 2. File route

Test at least one canonical entry or contract file and one representative leaf or boundary file per documented subsystem, plus at least one owner file from every declared implementation boundary. Invoke once per file because `unmappedFiles` is attributed per input while owner documents remain a union:

```sh
npx -y @tokenroll/llmdoc context --files <entry-path>
npx -y @tokenroll/llmdoc context --files <leaf-path>
```

The intended owner must appear, along with genuinely required prerequisites. Zero results or only a generic cross-topic document is a routing gap.

### 3. Precision probe

Treat every `code.paths` pattern containing glob metacharacters such as `*`, `?`, `[]`, or `{}` as a wildcard mapping. For each wildcard—especially recursive or package-level patterns—probe an unrelated sibling inside the matched tree. If that file routes to the document even though its change would not require reviewing the document, narrow the mapping. Exact paths are exempt.

### 4. Connected floor

Use `tree --docs` to confirm that a cold reader can name the repository-wide contract and enter every first-class topic. Then use `index --topic <topic>` to inspect declared relations and per-file `context --files` to verify the actual `requires` closure. The chain must work without a catch-all document; `tree` alone does not expose relations.

### 5. Explicit gaps

Record intentional no-doc decisions and unresolved gaps in the init/update report. An unresolved first-class gap prevents init success. Do not create filler prose to make the matrix look complete.

The floor passes when every first-class subsystem has a useful concept route, every documented decision-bearing surface has a precise file route, prerequisites are connected, and all omissions are intentional. Structural `validate` success alone is insufficient.

## Update triage

When `delta` reports an unmapped or newly moved file, classify it before writing:

1. **Missing mapping:** an existing document already owns the durable knowledge; repair `code.paths` and run scoped routing checks.
2. **Missing owner:** the change exposes a stable domain, decision cluster, or workflow with no suitable document; decide the topic and create or split the owner.
3. **Intentional no-doc:** the file is reconstructable implementation detail and owns no durable knowledge; leave it unmapped and state that decision in the report when material.

When boundaries, names, or source locations change, rerun concept, file, and precision checks for the affected topics even if the prose remains semantically true.

## Failure patterns

- Treating package folders as topics without testing ownership or query vocabulary
- Using one repository architecture doc as a catch-all owner
- Mapping a whole source tree to one doc to manufacture coverage
- Writing detailed file inventories while omitting rationale, invariants, or failure semantics
- Splitting by document size while breaking a coherent execution model
- Assuming `validate` proves retrieval quality
- Declaring sparse output healthy solely because every sentence passes the Stable Knowledge Gate
