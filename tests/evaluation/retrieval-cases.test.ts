import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETRIEVAL_EVALUATION_CASES,
  RETRIEVAL_FIXTURE_MEMORIES,
} from '../../src/evaluation/retrieval-cases.js';

describe('retrieval evaluation corpus', () => {
  it('keeps memory IDs, case IDs, and expected references unique and resolvable', () => {
    const memoryIds = new Set(RETRIEVAL_FIXTURE_MEMORIES.map((memory) => memory.id));
    const caseIds = new Set<string>();

    assert.strictEqual(memoryIds.size, RETRIEVAL_FIXTURE_MEMORIES.length);

    for (const evaluationCase of RETRIEVAL_EVALUATION_CASES) {
      assert.ok(!caseIds.has(evaluationCase.id), `duplicate case: ${evaluationCase.id}`);
      caseIds.add(evaluationCase.id);

      for (const id of [...evaluationCase.expectedIds, ...(evaluationCase.forbiddenIds ?? [])]) {
        assert.ok(memoryIds.has(id), `${evaluationCase.id} references unknown memory: ${id}`);
      }

      if (evaluationCase.kind === 'no-match') {
        assert.deepStrictEqual(evaluationCase.expectedIds, []);
      }
    }

    assert.deepStrictEqual(
      new Set(RETRIEVAL_EVALUATION_CASES.map((evaluationCase) => evaluationCase.split)),
      new Set(['development', 'holdout']),
    );
    assert.ok(RETRIEVAL_EVALUATION_CASES.some((evaluationCase) => evaluationCase.kind === 'adversarial'));
    assert.ok(RETRIEVAL_EVALUATION_CASES.some((evaluationCase) => evaluationCase.kind === 'scope'));
  });
});
