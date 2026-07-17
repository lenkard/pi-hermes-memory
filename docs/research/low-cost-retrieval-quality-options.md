# Low-cost options after the failed Hybrid Recall holdout

## Question

Can RFC-0001's retrieval design be improved without committing to another multi-day semantic redesign?

## Executive recommendation

Yes. Do **not** begin with a new embedding contract or larger vector model. Use this sequence:

1. Repair lexical query eligibility: remove low-information natural-language terms before broad OR fallback and require at least one meaningful term match.
2. Evaluate SQLite FTS5's `porter` tokenizer on English cases, without assuming it helps Portuguese.
3. Improve the Agent's `memory_search` guidance so it supplies compact content terms and synonyms rather than question scaffolding.
4. If real semantic misses remain, run a throwaway Qwen3-Reranker-0.6B prototype over the union of FTS and vector candidates. Use its relevance score as an abstention gate, not merely another ranking signal.
5. Create a new untouched holdout only if the cheap development experiment succeeds.

The first step is small and directly addresses the observed no-match failure. The reranker is a more credible semantic improvement than cutoff tuning, but should be prototyped before production integration.

## What the failed cases reveal

### The no-match failure is primarily lexical

The query `Ruby on Rails deployment` returned `Memory files are backed up daily on the server.` The current fallback turns every natural-language token except `and`, `or`, `not`, and `near` into OR terms. Therefore the low-information term `on` makes the unrelated memory eligible.

This is not fundamentally a vector-model problem. Raising or lowering the cosine cutoff cannot fix a lexical candidate that was admitted by an overly broad OR fallback.

### Rank fusion has no abstention semantics

Reciprocal Rank Fusion combines relative rank positions. It does not establish that any candidate is relevant in absolute terms. RFC-0001 added a semantic distance cutoff, but the lexical side still has no corresponding eligibility threshold.

The pgvector project recommends RRF or a cross-encoder for hybrid result combination, and separately documents distance filtering. This supports keeping RRF for candidate ordering while adding an explicit relevance/abstention decision before returning context.

### The embedding setup is already close to vendor guidance

Qwen's model card says queries should carry a one-sentence task instruction while documents need no instruction. The current contract already follows that format. Qwen reports that tailored instructions usually improve downstream retrieval by approximately 1%–5%. Instruction tuning is worth testing, but it is unlikely by itself to close a 15-point activation gap.

### ANN indexes cannot improve this quality result

pgvector performs exact nearest-neighbor search by default and describes it as providing perfect vector recall. HNSW and IVFFlat trade recall for speed. The corpus is small and latency passed, so adding ANN would add complexity without addressing relevance or abstention.

## Option A — lexical repair first

### Changes

- Expand query stopwords to cover question scaffolding and prepositions such as `what`, `which`, `is`, `are`, `can`, `the`, `a`, `an`, `on`, `in`, `of`, and `to`.
- Never run broad OR fallback when no meaningful content terms remain.
- Require at least one meaningful query term in the returned document.
- Test FTS5 `porter unicode61` in an isolated development database. It can make words such as `correction`, `corrected`, and `correcting` match each other.
- Keep explicit operators, quoted phrases, paths, commands, model names, and error identifiers out of stopword/stemming transformations.
- In the tool guidance, ask the Agent to use compact content terms plus one or two synonyms, for example `communication response answer style concise preference`.

### Why it is supported

SQLite documents that FTS5 uses implicit AND, supports OR fallback and BM25/rank ordering, and offers a built-in Porter wrapper tokenizer. SQLite also warns that Porter stemming is designed for English, so bilingual Portuguese/English behavior must be measured rather than assumed.

### Expected cost

About 1–3 focused engineering hours, or roughly 10k–30k coding-agent tokens, including tests. This can improve SQLite-only behavior even if Semantic Recall remains permanently disabled.

## Option B — candidate reranking with abstention

### Design

1. Generate a bounded union of FTS5 and exact-vector candidates, for example at most 8–12 unique memories.
2. Send query/document pairs to Qwen3-Reranker-0.6B.
3. Return only candidates above a development-calibrated relevance probability.
4. Rank accepted candidates by reranker score, using lexical/vector ranks only for deterministic ties.
5. On reranker timeout or outage, return the safe lexical path.

### Why it may work better

Qwen publishes a dedicated 0.6B cross-encoder reranker that outputs raw scores or sigmoid probabilities for query/document relevance. Its intended interface directly answers the missing question: “does this document meet the query?” The official llama.cpp server provides `/rerank`, `/v1/rerank`, and `/v1/reranking` endpoints and accepts a query plus a document array.

A relevance probability is better suited to no-match abstention than RRF rank or cosine distance alone. It may also distinguish `The owner prefers concise answers` from merely technical memories for `What communication style is preferred?`.

### Risks

- It requires a reranker model and likely another process/container or a model router.
- The two-core host may miss the 750 ms p95 target when scoring many pairs.
- A reranker sees plaintext candidate text during inference, although the service remains self-hosted.
- A threshold still requires development calibration and a new holdout.

### Expected cost

A throwaway latency/quality prototype should take roughly half a day and 30k–60k coding-agent tokens. Production hardening should happen only if that prototype clearly improves the burned diagnostic cases and stays within latency limits.

## Option C — embedding/model changes

Qwen supports custom task instructions, dimensions from 32 to 1024, and larger 4B/8B embedding models. These are valid later experiments, but they are not the smallest response:

- The current query format already follows Qwen guidance.
- Lower dimensions primarily change storage/performance, not the identified lexical false positive.
- Larger models increase CPU latency and memory pressure.
- A new embedding contract requires rebuilding every Derived Index row and generating new evidence.

Do not select this option unless lexical repair and a bounded reranker prototype fail on representative real misses.

## Public coding datasets for a cheap diagnostic

The CoIR benchmark is a useful secondary check, but its tasks are not equally aligned with Curated Memory:

- **CoIR CodeSearchNet:** in the Hugging Face representation inspected here, JavaScript queries are source-code functions and corpus rows are natural-language docstrings. This tests code-to-description retrieval. The full dataset contains about 3.0 million rows and 371 MB of Parquet files. The JavaScript subset alone has 64,854 corpus rows, 65,201 query rows, and about 25 MB of files. It is useful for code embedding capability, but not the closest match to a natural-language `memory_search` request.
- **CoIR CosQA:** natural-language coding queries retrieve Python code. It is only about 3.6 MB, with 20,604 corpus rows, 500 validation labels, and 500 test labels. This is a better small code-semantic diagnostic.
- **CoIR StackOverflowQA:** programming questions retrieve explanatory answers. It is about 27.8 MB with 19,931 question/answer pairs and 1,994 test labels. This is the closest public analogue to asking an Agent to recall a prior technical lesson or solution.

Recommended public benchmark mix: a small SciFact slice for passage retrieval plus StackOverflowQA for technical-memory-like retrieval. Add CosQA only if source-code retrieval is an actual product requirement. Do not download or embed all CodeSearchNet rows on the two-core host.

Sources:

- CoIR CodeSearchNet dataset and server-reported sizes: https://huggingface.co/datasets/CoIR-Retrieval/CodeSearchNet
- CoIR CosQA dataset: https://huggingface.co/datasets/CoIR-Retrieval/cosqa
- CoIR StackOverflowQA dataset: https://huggingface.co/datasets/CoIR-Retrieval/stackoverflow-qa
- CoIR project and MTEB task definitions: https://github.com/CoIR-team/coir

## CodeSearchNet JavaScript diagnostic result

A bounded diagnostic was run against the deployed Qwen3-Embedding-0.6B Q8_0 service using CoIR CodeSearchNet revision `25e0292562b7bee26dd9b2d83a03981795862c77`.

Design:

- Published direction: JavaScript code query → docstring.
- Fixed seed `20260717`.
- 30 train-label development cases and 30 official-test-label cases.
- 300 shared distractors plus the 60 judged-positive documents (360 candidates).
- Current memory instruction, task-specific instruction, and no instruction compared.
- Current cosine-distance cutoff `0.55` compared with development-only calibration.
- No-match proxy removes the judged positive and treats all remaining candidates as negatives. Since CodeSearchNet has incomplete relevance judgments, this proxy can overstate false positives.

Results:

| Query encoding | Raw test Recall@1 | Raw test Recall@5 | Recall@5 at 0.55 | No-match proxy at 0.55 |
|---|---:|---:|---:|---:|
| Current memory instruction | 90.0% | 100.0% | 96.7% | 96.7% |
| CodeSearchNet task instruction | 93.3% | 100.0% | 96.7% | 90.0% |
| No instruction | 90.0% | 100.0% | 100.0% | 96.7% |

A development-calibrated distance near `0.39` reduced the test no-match proxy to 6.7%, but reduced test Recall@5 to 76.7%. Adding a top-result distance margin did not improve the development tradeoff; calibration selected a zero margin and the same distance-only behavior.

The model therefore ranks a known relevant candidate very well, while absolute cosine distance cannot reliably decide that no candidate is relevant. Task-specific instruction slightly improved Recall@1 but did not solve abstention. This supports a bounded reranker/yes-no relevance gate rather than more cutoff tuning.

CPU capacity is also a constraint for raw source code. The initial 1,200-document run exceeded 20 minutes. For the 120 uncached mini-run query requests at concurrency eight, queue-inclusive request p50 was about 18.1 seconds and p95 about 35.8 seconds; total elapsed time was about 336 seconds. These figures are not representative of short Curated Memory entries, but they rule out indexing arbitrary long source functions on the current one-slot service.

Raw datasets, vectors, scripts, and detailed JSON remain under ignored `.scratch/coir-codesearchnet-eval/` and are not product activation evidence.

## Evaluation correction

The old holdout is now a diagnostic set and cannot be used again as activation evidence. It also contains only four paraphrase cases and one no-match case, so one result changes those rates by 25 or 100 percentage points.

Before any future activation decision:

- collect sanitized real `memory_search` misses;
- create larger development populations for paraphrase and no-match behavior;
- freeze implementation and thresholds;
- create a new untouched holdout;
- execute it once;
- retain the current scope, safety, exact-recall, latency, outage, and human-approval gates.

## Decision

The best value is **Option A now**. It is useful even without vectors and directly fixes the observed lexical pathology. Do not fund full semantic redesign yet.

If actual usage later demonstrates repeated meaning-based misses, prototype **Option B** as a disposable experiment. Its explicit relevance score is the strongest primary-source-supported improvement over the current RRF-plus-distance design.

## Primary sources

1. SQLite, “SQLite FTS5 Extension” — query syntax, implicit AND/OR behavior, BM25/rank, Porter tokenizer, Unicode tokenizer, and the English-only Porter warning: https://www.sqlite.org/fts5.html
2. pgvector, official README — exact search, cosine distance filtering, hybrid search, RRF/cross-encoder recommendation, and ANN recall tradeoffs: https://github.com/pgvector/pgvector
3. Qwen, `Qwen3-Embedding-0.6B` model card — query instructions, no document instruction, 1%–5% reported instruction benefit, dimensions, and multilingual support: https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
4. Qwen, `Qwen3-Reranker-0.6B` model card — cross-encoder usage, query/document relevance scores, sigmoid probabilities, and custom instructions: https://huggingface.co/Qwen/Qwen3-Reranker-0.6B
5. llama.cpp server documentation — supported reranking endpoint and query/document request shape: https://github.com/ggml-org/llama.cpp/tree/master/tools/server
