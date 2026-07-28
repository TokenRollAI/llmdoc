# Compaction Prompt With llmdoc Re-entry State

Create a concise, self-contained continuation summary of the conversation. Preserve the user's active request, developer and repository constraints, decisions, completed work, changed files, tool results, validation status, unresolved risks, and the exact next action. Omit noisy logs and superseded exploration.

When llmdoc is active, include this compact block:

```yaml
LLMDOC_STATE:
  version: 1
  bootstrap_fingerprint: <latest startup-pack fingerprint, if known>
  active_goal: <one sentence>
  loaded_docs:
    - path: <path>
      relevance: <short reason>
  invariants: [<only task-critical rules>]
  decisions: [<decision and short reason>]
  changed_files: [<path and status>]
  validation: [<command and result>]
  next_action: <one concrete action>
  unresolved: [<risk, blocker, or open question>]
```

Store paths and distilled task-critical facts, not full llmdoc document bodies. State that a compact event alone must not trigger reloading the llmdoc skill, index, startup pack, or already-loaded task documents. A later model should re-read only the smallest relevant document set when the state is missing required facts, the fingerprint is stale, a relevant file changed, work enters a new subsystem, or evidence conflicts.
