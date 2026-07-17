# Semantic Recall planning

Project artifacts for the one-Agent Hybrid Recall experiment, synthesized using the Engineering RFC Knowledge Base at revision `43f8ed1581a86f718889ab60ce449f8eacbdec5f`.

## Artifacts

- [Business Case BC-0001](business-cases/BC-0001-semantic-recall.md)
- [Evidence Plan EP-0001](evidence/EP-0001-semantic-recall.md)
  - [Lexical baseline results](evidence/results/lexical-baseline.md)
- [Engineering RFC RFC-0001](rfcs/RFC-0001-hybrid-semantic-recall.md)
- [Scheduled Outcome Review OR-0001](outcomes/OR-0001-semantic-recall.md)
- [Primary-source infrastructure and repository research](../research/self-hosted-vector-memory-analysis.md)
- [Semantic Recall operations](../semantic-recall-operations.md)

## Published discussion

- [GitHub issue #1 — RFC: Hybrid Semantic Recall for Curated Memory](https://github.com/lenkard/pi-hermes-memory/issues/1)

## Implementation issues

1. [Establish the Retrieval Evaluation and lexical baseline](https://github.com/lenkard/pi-hermes-memory/issues/2)
2. [Give Curated Memory stable Memory IDs](https://github.com/lenkard/pi-hermes-memory/issues/3)
3. [Synchronize Curated Memory to the Derived Index](https://github.com/lenkard/pi-hermes-memory/issues/4)
4. [Serve safe Hybrid Recall through `memory_search`](https://github.com/lenkard/pi-hermes-memory/issues/5)
5. [Operate and repair Semantic Recall](https://github.com/lenkard/pi-hermes-memory/issues/6)
6. [Produce Hybrid Recall activation evidence](https://github.com/lenkard/pi-hermes-memory/issues/7)
7. [Activate Hybrid Recall for the Agent](https://github.com/lenkard/pi-hermes-memory/issues/8)
8. [Conduct the Semantic Recall Outcome Review](https://github.com/lenkard/pi-hermes-memory/issues/9)

GitHub sub-issues and native blocking dependencies are authoritative. Issues #2–#6 implement the evaluation baseline, stable IDs, Derived Index synchronization, Hybrid Recall, and operational controls.

## Status

Application implementation through operational controls is complete. Activation evidence, explicit owner activation, and the Outcome Review remain separately gated by EP-0001; Semantic Recall remains disabled by default.
