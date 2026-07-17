import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { DatabaseManager } from '../src/store/db.js';
import { addMemory, getMemoryByMemoryId, searchMemories } from '../src/store/sqlite-memory-store.js';
import { scanContent } from '../src/store/content-scanner.js';
import { HttpEmbeddingClient } from '../src/semantic/embedding-client.js';
import { EMBEDDING_CONTRACT } from '../src/semantic/embedding-contract.js';
import { PostgresSemanticIndex } from '../src/semantic/postgres-semantic-index.js';
import {
  retrieveMemories,
  SEMANTIC_MAX_COSINE_DISTANCE,
  type MemoryRetrievalDependencies,
} from '../src/semantic/memory-retrieval.js';
import {
  RETRIEVAL_EVALUATION_CASES,
  RETRIEVAL_FIXTURE_MEMORIES,
} from '../src/evaluation/retrieval-cases.js';
import {
  runRetrievalEvaluation,
  type RetrievalEvaluationCase,
  type RetrievalEvaluationResult,
} from '../src/evaluation/retrieval-evaluation.js';
import type { MemoryCategory } from '../src/types.js';

interface CaseResult {
  id: string;
  returnedIds: string[];
  elapsedMs: number;
  fallback: boolean;
  diagnostics: unknown;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseSplit(): 'development' | 'holdout' | undefined {
  const argument = process.argv.find((value) => value.startsWith('--split='));
  const split = argument?.slice('--split='.length);
  if (split === undefined) return undefined;
  if (split !== 'development' && split !== 'holdout') throw new Error(`Unsupported split: ${split}`);
  return split;
}

function argumentValue(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

function parseWarmRuns(): number {
  const argument = process.argv.find((value) => value.startsWith('--warm-runs='));
  const parsed = Number.parseInt(argument?.slice('--warm-runs='.length) ?? '5', 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(20, parsed)) : 5;
}

function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function summarize(result: RetrievalEvaluationResult) {
  return {
    totals: result.totals,
    bySplit: result.bySplit,
    byKind: result.byKind,
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderMarkdown(report: ReturnType<typeof buildReport>): string {
  const lines = [
    `# Hybrid Retrieval Activation Evidence (${report.split})`,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Contract',
    '',
    `- Embedding Contract: \`${report.contract.version}\``,
    `- Model: \`${report.contract.model}\` (${report.contract.quantization}, ${report.contract.dimensions} dimensions, ${report.contract.pooling} pooling)`,
    `- Semantic cosine-distance cutoff: ${report.cutoff}`,
    `- Warm repetitions per case: ${report.warmRuns}`,
    `- Pre-existing Derived Index rows: ${report.preexistingDerivedRows}`,
    '',
    '## Quality',
    '',
    '| Metric | Lexical | Hybrid |',
    '|---|---:|---:|',
    `| Overall Recall@5 | ${percent(report.lexical.bySplit[report.split].recallAt5)} | ${percent(report.hybrid.bySplit[report.split].recallAt5)} |`,
    `| Paraphrase Recall@5 | ${percent(report.lexical.byKind.paraphrase?.recallAt5 ?? 0)} | ${percent(report.hybrid.byKind.paraphrase?.recallAt5 ?? 0)} |`,
    `| Exact Recall@5 | ${percent(report.lexical.byKind.exact?.recallAt5 ?? 0)} | ${percent(report.hybrid.byKind.exact?.recallAt5 ?? 0)} |`,
    `| No-match false-positive rate | ${percent(report.lexical.byKind['no-match']?.noMatchFalsePositiveRate ?? 0)} | ${percent(report.hybrid.byKind['no-match']?.noMatchFalsePositiveRate ?? 0)} |`,
    `| Forbidden-result cases | ${report.lexical.totals.forbiddenHits} | ${report.hybrid.totals.forbiddenHits} |`,
    '',
    '## Latency and outage fallback',
    '',
    `- Warm p50: ${report.latency.warmP50Ms.toFixed(1)} ms`,
    `- Warm p95: ${report.latency.warmP95Ms.toFixed(1)} ms`,
    `- Maximum warm latency: ${report.latency.warmMaxMs.toFixed(1)} ms`,
    `- Embedding outage: ${report.outages.embedding.valid}/${report.outages.embedding.cases} valid lexical fallbacks; maximum ${report.outages.embedding.maxMs.toFixed(1)} ms`,
    `- PostgreSQL outage: ${report.outages.postgres.valid}/${report.outages.postgres.cases} valid lexical fallbacks; maximum ${report.outages.postgres.maxMs.toFixed(1)} ms`,
    '',
    '## Ranked cases',
    '',
    '| Case | Returned IDs | Elapsed | Fallback |',
    '|---|---|---:|---:|',
    ...report.cases.map((entry) => `| ${entry.id} | ${entry.returnedIds.join(', ') || '—'} | ${entry.elapsedMs.toFixed(1)} ms | ${entry.fallback ? 'yes' : 'no'} |`),
    '',
    'Semantic retrieval remained disabled in Agent configuration during evidence collection.',
  ];
  return `${lines.join('\n')}\n`;
}

function buildReport(input: {
  split: 'development' | 'holdout';
  warmRuns: number;
  preexistingDerivedRows: number;
  lexical: RetrievalEvaluationResult;
  hybrid: RetrievalEvaluationResult;
  cases: CaseResult[];
  warmLatencies: number[];
  outages: { embedding: { cases: number; valid: number; maxMs: number }; postgres: { cases: number; valid: number; maxMs: number } };
}) {
  return {
    generatedAt: new Date().toISOString(),
    split: input.split,
    warmRuns: input.warmRuns,
    contract: EMBEDDING_CONTRACT,
    cutoff: SEMANTIC_MAX_COSINE_DISTANCE,
    preexistingDerivedRows: input.preexistingDerivedRows,
    lexical: summarize(input.lexical),
    hybrid: summarize(input.hybrid),
    latency: {
      samples: input.warmLatencies.length,
      warmP50Ms: percentile(input.warmLatencies, 0.5),
      warmP95Ms: percentile(input.warmLatencies, 0.95),
      warmMaxMs: Math.max(0, ...input.warmLatencies),
    },
    outages: input.outages,
    cases: input.cases,
    limitations: [
      'Synthetic fixture; owner-reviewed real Curated Memory remains limited.',
      'Fault injection replaces remote calls rather than stopping containers.',
      'One Agent and one self-hosted CPU embedding service.',
    ],
  };
}

const split = parseSplit();
if (!split) throw new Error('Use --split=development or --split=holdout; do not combine activation splits.');
const warmRuns = parseWarmRuns();
const postgresUrl = requiredEnvironment('PI_HERMES_MEMORY_POSTGRES_URL');
const embeddingEndpoint = requiredEnvironment('PI_HERMES_MEMORY_EMBEDDING_ENDPOINT');
const embeddingApiKey = requiredEnvironment('PI_HERMES_MEMORY_EMBEDDING_API_KEY');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-hermes-hybrid-evaluation-'));
const dbManager = new DatabaseManager(root);
const embedding = new HttpEmbeddingClient(embeddingEndpoint, embeddingApiKey);
const index = PostgresSemanticIndex.fromConnectionString(postgresUrl, {
  connectionTimeoutMillis: 2_000,
  query_timeout: 2_000,
  statement_timeout: 2_000,
});
const fixtureIdByMemoryId = new Map<string, string>();
const insertedMemoryIds: string[] = [];

try {
  await index.ensureSchema();
  const preexistingDerivedRows = await index.count();
  for (const fixture of RETRIEVAL_FIXTURE_MEMORIES) {
    const entry = addMemory(
      dbManager,
      fixture.content,
      fixture.target,
      fixture.project ?? null,
      fixture.category as MemoryCategory | undefined,
    );
    fixtureIdByMemoryId.set(entry.memoryId, fixture.id);
    insertedMemoryIds.push(entry.memoryId);
    const vector = await embedding.embedDocument(entry.content);
    await index.upsert({
      memoryId: entry.memoryId,
      operation: 'upsert',
      content: entry.content,
      project: entry.project,
      target: entry.target,
      category: entry.category,
      contentHash: hash(entry.content),
      contractVersion: EMBEDDING_CONTRACT.version,
      attempts: 0,
      nextAttemptAt: new Date(0).toISOString(),
      leaseToken: 'evaluation',
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, vector);
  }

  const cases = RETRIEVAL_EVALUATION_CASES.filter((testCase) => testCase.split === split);
  const resolveAuthority: MemoryRetrievalDependencies['authority'] = (memoryId) => {
    const entry = getMemoryByMemoryId(dbManager, memoryId);
    return entry ? {
      memoryId,
      content: entry.content,
      contentHash: hash(entry.content),
      project: entry.project,
      target: entry.target,
      category: entry.category,
      created: entry.created,
      lastReferenced: entry.lastReferenced,
    } : null;
  };
  const lexicalDependencies: MemoryRetrievalDependencies = {
    lexical: (query, options) => searchMemories(dbManager, query, options),
    authority: resolveAuthority,
    scan: scanContent,
    semanticEnabled: false,
  };
  const lexicalIds = new Map<string, string[]>();
  for (const testCase of cases) {
    const lexicalResult = await retrieveMemories(dbManager, testCase.query, {
      project: testCase.searchOptions?.project,
      target: testCase.searchOptions?.target,
      category: testCase.searchOptions?.category as MemoryCategory | undefined,
      limit: 5,
    }, lexicalDependencies);
    lexicalIds.set(testCase.id, lexicalResult.entries
      .map((entry) => fixtureIdByMemoryId.get(entry.memoryId)!)
      .filter(Boolean));
  }
  const lexical = runRetrievalEvaluation(cases, (testCase) => lexicalIds.get(testCase.id) ?? []);

  const dependencies = (): MemoryRetrievalDependencies => ({
    lexical: (query, options) => searchMemories(dbManager, query, options),
    embedQuery: (query, signal) => embedding.embedQuery(query, signal),
    semanticIndex: { search: (embedded, limit, filters) => index.search(embedded, limit, filters) },
    authority: resolveAuthority,
    scan: scanContent,
    semanticTimeoutMs: 2_000,
    semanticMaxDistance: SEMANTIC_MAX_COSINE_DISTANCE,
    semanticEnabled: true,
  });

  const caseResults: CaseResult[] = [];
  const hybridIds = new Map<string, string[]>();
  const warmLatencies: number[] = [];
  for (let run = 0; run < warmRuns; run++) {
    for (const testCase of cases) {
      const startedAt = performance.now();
      const result = await retrieveMemories(dbManager, testCase.query, {
        project: testCase.searchOptions?.project,
        target: testCase.searchOptions?.target,
        category: testCase.searchOptions?.category as MemoryCategory | undefined,
        limit: 5,
      }, dependencies());
      const elapsedMs = performance.now() - startedAt;
      warmLatencies.push(elapsedMs);
      const returnedIds = result.entries.map((entry) => fixtureIdByMemoryId.get(entry.memoryId)!).filter(Boolean);
      if (run === 0) {
        caseResults.push({ id: testCase.id, returnedIds, elapsedMs, fallback: result.fallback, diagnostics: result.diagnostics });
        hybridIds.set(testCase.id, returnedIds);
      }
    }
  }
  const hybrid = runRetrievalEvaluation(cases, (testCase) => hybridIds.get(testCase.id) ?? []);

  async function outage(kind: 'embedding' | 'postgres') {
    let valid = 0;
    let maxMs = 0;
    for (const testCase of cases) {
      const base = dependencies();
      if (kind === 'embedding') base.embedQuery = async () => { throw new Error('injected embedding outage'); };
      else base.semanticIndex = { async search() { throw new Error('injected database outage'); } };
      const startedAt = performance.now();
      const result = await retrieveMemories(dbManager, testCase.query, {
        project: testCase.searchOptions?.project,
        target: testCase.searchOptions?.target,
        category: testCase.searchOptions?.category as MemoryCategory | undefined,
        limit: 5,
      }, base);
      const elapsed = performance.now() - startedAt;
      maxMs = Math.max(maxMs, elapsed);
      const ids = result.entries.map((entry) => fixtureIdByMemoryId.get(entry.memoryId)!).filter(Boolean);
      if (result.fallback && JSON.stringify(ids) === JSON.stringify(lexicalIds.get(testCase.id) ?? []) && elapsed < 2_000) valid++;
    }
    return { cases: cases.length, valid, maxMs };
  }

  const report = buildReport({
    split,
    warmRuns,
    preexistingDerivedRows,
    lexical,
    hybrid,
    cases: caseResults,
    warmLatencies,
    outages: {
      embedding: await outage('embedding'),
      postgres: await outage('postgres'),
    },
  });

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderMarkdown(report);
  const jsonOutput = argumentValue('--output-json');
  const markdownOutput = argumentValue('--output-markdown');
  if (jsonOutput) fs.writeFileSync(jsonOutput, json);
  if (markdownOutput) fs.writeFileSync(markdownOutput, markdown);
  if (jsonOutput || markdownOutput) {
    process.stdout.write(`Wrote ${[jsonOutput, markdownOutput].filter(Boolean).join(' and ')}\n`);
  } else {
    process.stdout.write(process.argv.includes('--format=markdown') ? markdown : json);
  }
} finally {
  for (const memoryId of insertedMemoryIds) {
    try { await index.delete(memoryId); } catch {}
  }
  await index.close();
  dbManager.close();
  fs.rmSync(root, { recursive: true, force: true });
}
