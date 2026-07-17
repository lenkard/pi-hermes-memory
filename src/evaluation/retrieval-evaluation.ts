export type RetrievalEvaluationSplit = 'development' | 'holdout';

export type RetrievalEvaluationKind =
  | 'paraphrase'
  | 'exact'
  | 'scope'
  | 'adversarial'
  | 'no-match';

export interface RetrievalEvaluationSearchOptions {
  project?: string;
  target?: string;
  category?: string;
}

export interface RetrievalEvaluationCase {
  id: string;
  split: RetrievalEvaluationSplit;
  kind: RetrievalEvaluationKind;
  query: string;
  expectedIds: string[];
  forbiddenIds?: string[];
  searchOptions?: RetrievalEvaluationSearchOptions;
}

export interface RetrievalEvaluationSummary {
  cases: number;
  topFiveHits: number;
  recallAt5: number;
  noMatchCases: number;
  noMatchFalsePositiveRate: number;
  forbiddenHits: number;
}

export interface RetrievalEvaluationTotals {
  cases: number;
  topFiveHits: number;
  noMatchCases: number;
  noMatchFalsePositives: number;
  forbiddenHits: number;
}

export interface RetrievalEvaluationResult {
  totals: RetrievalEvaluationTotals;
  bySplit: Record<RetrievalEvaluationSplit, RetrievalEvaluationSummary>;
  byKind: Partial<Record<RetrievalEvaluationKind, RetrievalEvaluationSummary>>;
}

export type RetrievalEvaluationSearch = (
  evaluationCase: RetrievalEvaluationCase,
) => readonly string[];

function emptySummary(): RetrievalEvaluationSummary {
  return {
    cases: 0,
    topFiveHits: 0,
    recallAt5: 0,
    noMatchCases: 0,
    noMatchFalsePositiveRate: 0,
    forbiddenHits: 0,
  };
}

function validateCases(cases: readonly RetrievalEvaluationCase[]): void {
  const ids = new Set<string>();

  for (const evaluationCase of cases) {
    if (!evaluationCase.id.trim()) {
      throw new Error('Evaluation case id cannot be empty');
    }
    if (ids.has(evaluationCase.id)) {
      throw new Error(`Duplicate evaluation case id: ${evaluationCase.id}`);
    }
    ids.add(evaluationCase.id);

    if (!evaluationCase.query.trim()) {
      throw new Error(`Evaluation case query cannot be empty: ${evaluationCase.id}`);
    }

    if (new Set(evaluationCase.expectedIds).size !== evaluationCase.expectedIds.length) {
      throw new Error(`Evaluation case has duplicate expected IDs: ${evaluationCase.id}`);
    }

    const forbiddenIds = evaluationCase.forbiddenIds ?? [];
    if (forbiddenIds.some((id) => evaluationCase.expectedIds.includes(id))) {
      throw new Error(`Evaluation case expected and forbidden IDs overlap: ${evaluationCase.id}`);
    }
  }
}

export function runRetrievalEvaluation(
  cases: readonly RetrievalEvaluationCase[],
  search: RetrievalEvaluationSearch,
): RetrievalEvaluationResult {
  validateCases(cases);

  const totals: RetrievalEvaluationTotals = {
    cases: cases.length,
    topFiveHits: 0,
    noMatchCases: 0,
    noMatchFalsePositives: 0,
    forbiddenHits: 0,
  };
  const bySplit: Record<RetrievalEvaluationSplit, RetrievalEvaluationSummary> = {
    development: emptySummary(),
    holdout: emptySummary(),
  };
  const byKind: Partial<Record<RetrievalEvaluationKind, RetrievalEvaluationSummary>> = {};

  for (const evaluationCase of cases) {
    const resultIds = [...new Set(search(evaluationCase))];
    const topFiveIds = new Set(resultIds.slice(0, 5));
    const hit = evaluationCase.expectedIds.some((id) => topFiveIds.has(id));
    const noMatch = evaluationCase.kind === 'no-match';
    const noMatchFalsePositive = noMatch && resultIds.length > 0;
    const forbiddenHit = (evaluationCase.forbiddenIds ?? []).some((id) => resultIds.includes(id));

    if (hit) totals.topFiveHits++;
    if (noMatch) {
      totals.noMatchCases++;
      if (noMatchFalsePositive) totals.noMatchFalsePositives++;
    }
    if (forbiddenHit) totals.forbiddenHits++;

    const summaries = [
      bySplit[evaluationCase.split],
      byKind[evaluationCase.kind] ?? (byKind[evaluationCase.kind] = emptySummary()),
    ];

    for (const summary of summaries) {
      summary.cases++;
      if (hit) summary.topFiveHits++;
      if (noMatch) {
        summary.noMatchCases++;
        if (noMatchFalsePositive) summary.noMatchFalsePositiveRate++;
      }
      if (forbiddenHit) summary.forbiddenHits++;
    }
  }

  for (const summary of Object.values(bySplit)) {
    summary.noMatchFalsePositiveRate = summary.noMatchCases === 0
      ? 0
      : summary.noMatchFalsePositiveRate / summary.noMatchCases;
    summary.recallAt5 = summary.cases === 0 ? 0 : summary.topFiveHits / summary.cases;
  }
  for (const summary of Object.values(byKind)) {
    if (!summary) continue;
    summary.noMatchFalsePositiveRate = summary.noMatchCases === 0
      ? 0
      : summary.noMatchFalsePositiveRate / summary.noMatchCases;
    summary.recallAt5 = summary.cases === 0 ? 0 : summary.topFiveHits / summary.cases;
  }

  return { totals, bySplit, byKind };
}
