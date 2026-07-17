import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runRetrievalEvaluation,
  type RetrievalEvaluationCase,
} from '../../src/evaluation/retrieval-evaluation.js';

describe('runRetrievalEvaluation', () => {
  it('reports top-five recall by case kind and split', () => {
    const cases: RetrievalEvaluationCase[] = [
      {
        id: 'development-paraphrase-hit',
        split: 'development',
        kind: 'paraphrase',
        query: 'package manager preference',
        expectedIds: ['pnpm'],
      },
      {
        id: 'development-paraphrase-miss',
        split: 'development',
        kind: 'paraphrase',
        query: 'response style',
        expectedIds: ['concise'],
      },
      {
        id: 'holdout-exact-hit',
        split: 'holdout',
        kind: 'exact',
        query: 'pnpm install',
        expectedIds: ['pnpm'],
      },
      {
        id: 'holdout-no-match',
        split: 'holdout',
        kind: 'no-match',
        query: 'unrelated database',
        expectedIds: [],
      },
      {
        id: 'holdout-scope-leak',
        split: 'holdout',
        kind: 'scope',
        query: 'project convention',
        expectedIds: ['project-a'],
        forbiddenIds: ['project-b'],
      },
      {
        id: 'holdout-unsafe',
        split: 'holdout',
        kind: 'adversarial',
        query: 'secret command',
        expectedIds: [],
        forbiddenIds: ['unsafe'],
      },
    ];

    const result = runRetrievalEvaluation(cases, (evaluationCase) => {
      const answers: Record<string, string[]> = {
        'development-paraphrase-hit': ['pnpm'],
        'development-paraphrase-miss': ['other'],
        'holdout-exact-hit': ['pnpm'],
        'holdout-no-match': [],
        'holdout-scope-leak': ['project-b', 'project-a'],
        'holdout-unsafe': ['unsafe'],
      };
      return answers[evaluationCase.id] ?? [];
    });

    assert.deepStrictEqual(result.totals, {
      cases: 6,
      topFiveHits: 3,
      noMatchCases: 1,
      noMatchFalsePositives: 0,
      forbiddenHits: 2,
    });
    assert.deepStrictEqual(result.bySplit.development, {
      cases: 2,
      topFiveHits: 1,
      recallAt5: 0.5,
      noMatchCases: 0,
      noMatchFalsePositiveRate: 0,
      forbiddenHits: 0,
    });
    assert.deepStrictEqual(result.bySplit.holdout, {
      cases: 4,
      topFiveHits: 2,
      recallAt5: 0.5,
      noMatchCases: 1,
      noMatchFalsePositiveRate: 0,
      forbiddenHits: 2,
    });
    assert.deepStrictEqual(result.byKind.paraphrase, {
      cases: 2,
      topFiveHits: 1,
      recallAt5: 0.5,
      noMatchCases: 0,
      noMatchFalsePositiveRate: 0,
      forbiddenHits: 0,
    });
    assert.deepStrictEqual(result.byKind.exact, {
      cases: 1,
      topFiveHits: 1,
      recallAt5: 1,
      noMatchCases: 0,
      noMatchFalsePositiveRate: 0,
      forbiddenHits: 0,
    });
    assert.deepStrictEqual(result.byKind['no-match'], {
      cases: 1,
      topFiveHits: 0,
      recallAt5: 0,
      noMatchCases: 1,
      noMatchFalsePositiveRate: 0,
      forbiddenHits: 0,
    });
    assert.deepStrictEqual(result.byKind.scope, {
      cases: 1,
      topFiveHits: 1,
      recallAt5: 1,
      noMatchCases: 0,
      noMatchFalsePositiveRate: 0,
      forbiddenHits: 1,
    });
    assert.deepStrictEqual(result.byKind.adversarial, {
      cases: 1,
      topFiveHits: 0,
      recallAt5: 0,
      noMatchCases: 0,
      noMatchFalsePositiveRate: 0,
      forbiddenHits: 1,
    });
  });

  it('rejects duplicate case identifiers before running searches', () => {
    const cases: RetrievalEvaluationCase[] = [
      {
        id: 'duplicate',
        split: 'development',
        kind: 'exact',
        query: 'one',
        expectedIds: [],
      },
      {
        id: 'duplicate',
        split: 'holdout',
        kind: 'exact',
        query: 'two',
        expectedIds: [],
      },
    ];

    assert.throws(
      () => runRetrievalEvaluation(cases, () => []),
      /duplicate evaluation case id/i,
    );
  });
});
