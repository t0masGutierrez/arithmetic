import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  generateProblem,
  isDefaultSettings,
  sanitizeSettings,
} from '../src/lib/arithmetic.mjs';

class FakeRandom {
  constructor(choiceValue, randintValues) {
    this.choiceValue = choiceValue;
    this.randintValues = [...randintValues];
  }

  choice(values) {
    assert.ok(values.includes(this.choiceValue));
    return this.choiceValue;
  }

  randint(low, high) {
    const value = this.randintValues.shift();
    assert.notEqual(value, undefined, 'no randint values left');
    assert.ok(value >= low && value <= high, `${value} not in [${low}, ${high}]`);
    return value;
  }
}

test('generateProblem makes subtraction as addition in reverse', () => {
  const rng = new FakeRandom('-', [7, 9]);
  const problem = generateProblem({ ops: ['-'] }, rng);

  assert.equal(problem.num1, 16);
  assert.equal(problem.num2, 7);
  assert.equal(problem.solution, 9);
  assert.equal(problem.pretty_problem, '16 – 7');
});

test('generateProblem makes division as multiplication in reverse', () => {
  const rng = new FakeRandom('/', [4, 6]);
  const problem = generateProblem({ ops: ['/'] }, rng);

  assert.equal(problem.num1, 24);
  assert.equal(problem.num2, 4);
  assert.equal(problem.solution, 6);
  assert.equal(problem.pretty_problem, '24 ÷ 4');
});

test('isDefaultSettings ignores duration when ranges and operations are unchanged', () => {
  const settings = sanitizeSettings({
    ...DEFAULT_SETTINGS,
    duration: 30,
  });

  assert.equal(isDefaultSettings(settings), true);
});
