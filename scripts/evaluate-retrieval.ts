import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../src/store/db.js';
import { addMemory, searchMemories } from '../src/store/sqlite-memory-store.js';
import {
  buildFallbackFts5Query,
  isFts5QueryError,
  normalizeFts5Query,
} from '../src/store/fts-query.js';
import {
  RETRIEVAL_EVALUATION_CASES,
  RETRIEVAL_FIXTURE_MEMORIES,
  fixtureMemoryByContent,
} from '../src/evaluation/retrieval-cases.js';
import {
  runRetrievalEvaluation,
  type RetrievalEvaluationCase,
  type RetrievalEvaluationResult,
} from '../src/evaluation/retrieval-evaluation.js';
import type { MemoryCategory } from '../src/types.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-hermes-retrieval-evaluation-'));
const dbManager = new DatabaseManager(root);
const contentToId = fixtureMemoryByContent();

function parseSplit(): 'development' | 'holdout' | undefined {
  const splitArg = process.argv.find((arg) => arg.startsWith('--split='));
  if (!splitArg) return undefined;
  const split = splitArg.slice('--split='.length);
  if (split !== 'development' && split !== 'holdout') {
    throw new Error(`Unsupported split: ${split}. Use development or holdout.`);
  }
  return split;
}

function seedFixture(): void {
  for (const [index, memory] of RETRIEVAL_FIXTURE_MEMORIES.entries()) {
    const date = `2026-01-${String(index + 1).padStart(2, '0')}`;
    addMemory(
      dbManager,
      memory.content,
      memory.target,
      memory.project ?? null,
      memory.category as MemoryCategory | undefined,
      null,
      null,
      null,
      date,
      date,
    );
  }
}

function searchFixture(evaluationCase: RetrievalEvaluationCase): readonly string[] {
  const results = searchMemories(dbManager, evaluationCase.query, {
    project: evaluationCase.searchOptions?.project,
    target: evaluationCase.searchOptions?.target,
    category: evaluationCase.searchOptions?.category as MemoryCategory | undefined,
    limit: 20,
  });

  return results.flatMap((result) => {
    const id = contentToId.get(result.content);
    return id ? [id] : [];
  });
}

/**
 * Reproduce the pre-evaluation lexical ordering so the report has an
 * independent comparator for the change from recency-first to bm25-first.
 */
function searchLegacyFixture(evaluationCase: RetrievalEvaluationCase): readonly string[] {
  const query = evaluationCase.query.trim();
  if (!query) return [];

  const normalizedQuery = normalizeFts5Query(query);
  if (!normalizedQuery) return [];

  const execute = (matchQuery: string): string[] => {
    const params: unknown[] = [matchQuery];
    const conditions = ['m.id IN (SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?)'];
    const options = evaluationCase.searchOptions;

    if (options?.project !== undefined) {
      conditions.push('m.project = ?');
      params.push(options.project);
    }
    if (options?.target) {
      conditions.push('m.target = ?');
      params.push(options.target);
    }
    if (options?.category) {
      conditions.push('m.category = ?');
      params.push(options.category);
    }

    try {
      const rows = dbManager.getDb().prepare(`
        SELECT m.content
        FROM memories m
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.last_referenced DESC, m.id ASC
        LIMIT ?
      `).all(...params, 20) as Array<{ content: string }>;

      return rows.flatMap((row) => {
        const id = contentToId.get(row.content);
        return id ? [id] : [];
      });
    } catch (error) {
      if (isFts5QueryError(error)) return [];
      throw error;
    }
  };

  const exactResults = execute(normalizedQuery);
  if (exactResults.length > 0) return exactResults;

  const fallbackQuery = buildFallbackFts5Query(query);
  return fallbackQuery && fallbackQuery !== normalizedQuery
    ? execute(fallbackQuery)
    : exactResults;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderSummary(result: RetrievalEvaluationResult, lines: string[]): void {
  lines.push('| Metric | Value |', '|---|---:|');
  lines.push(
    `| Cases | ${result.totals.cases} |`,
    `| Top-5 hits | ${result.totals.topFiveHits} |`,
    `| No-match cases | ${result.totals.noMatchCases} |`,
    `| No-match false positives | ${result.totals.noMatchFalsePositives} |`,
    `| Forbidden-result cases | ${result.totals.forbiddenHits} |`,
    '',
    '### By split',
    '',
    '| Split | Cases | Recall@5 | No-match false-positive rate | Forbidden-result cases |',
    '|---|---:|---:|---:|---:|',
  );

  for (const [name, summary] of Object.entries(result.bySplit)) {
    lines.push(`| ${name} | ${summary.cases} | ${percent(summary.recallAt5)} | ${percent(summary.noMatchFalsePositiveRate)} | ${summary.forbiddenHits} |`);
  }

  lines.push('', '### By kind', '', '| Kind | Cases | Recall@5 | No-match false-positive rate | Forbidden-result cases |', '|---|---:|---:|---:|---:|');
  for (const [name, summary] of Object.entries(result.byKind)) {
    if (!summary) continue;
    lines.push(`| ${name} | ${summary.cases} | ${percent(summary.recallAt5)} | ${percent(summary.noMatchFalsePositiveRate)} | ${summary.forbiddenHits} |`);
  }
}

function renderMarkdown(
  legacy: RetrievalEvaluationResult,
  relevanceRanked: RetrievalEvaluationResult,
  split: string,
): string {
  const lines = [
    `# Lexical Retrieval Evaluation (${split})`,
    '',
    'The legacy section reproduces the pre-change recency-first ordering. The relevance-ranked section is the current FTS5 baseline used before semantic retrieval.',
    '',
    '## Legacy recency-first comparator',
    '',
  ];
  renderSummary(legacy, lines);
  lines.push('', '## Relevance-ranked FTS5 baseline', '');
  renderSummary(relevanceRanked, lines);
  return `${lines.join('\n')}\n`;
}

try {
  const split = parseSplit();
  const cases = split
    ? RETRIEVAL_EVALUATION_CASES.filter((evaluationCase) => evaluationCase.split === split)
    : RETRIEVAL_EVALUATION_CASES;

  seedFixture();
  const legacy = runRetrievalEvaluation(cases, searchLegacyFixture);
  const relevanceRanked = runRetrievalEvaluation(cases, searchFixture);
  const report = { legacy, relevanceRanked };
  const format = process.argv.includes('--format=markdown') ? 'markdown' : 'json';
  process.stdout.write(format === 'markdown'
    ? renderMarkdown(legacy, relevanceRanked, split ?? 'all')
    : `${JSON.stringify(report, null, 2)}\n`);
} finally {
  dbManager.close();
  fs.rmSync(root, { recursive: true, force: true });
}
