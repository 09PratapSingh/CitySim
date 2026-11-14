import test from 'node:test';
import assert from 'node:assert';
import { PRNG } from '../src/prng.ts';

test('PRNG: Identical seeds produce bit-for-bit identical sequences (Determinism)', () => {
  const seed = 12345678;
  const rngA = new PRNG(seed);
  const rngB = new PRNG(seed);

  const seriesA: number[] = [];
  const seriesB: number[] = [];

  for (let i = 0; i < 50; i++) {
    seriesA.push(rngA.next());
    seriesB.push(rngB.next());
  }

  assert.deepStrictEqual(seriesA, seriesB);
});

test('PRNG: Different seeds produce distinct sequences', () => {
  const rngA = new PRNG(42);
  const rngB = new PRNG(999);

  let differences = 0;
  for (let i = 0; i < 20; i++) {
    if (rngA.next() !== rngB.next()) {
      differences++;
    }
  }

  assert.strictEqual(differences > 15, true);
});

test('PRNG: nextInt produces integers strictly within [min, max]', () => {
  const rng = new PRNG(888);
  const min = 3;
  const max = 7;

  for (let i = 0; i < 100; i++) {
    const val = rng.nextInt(min, max);
    assert.strictEqual(Number.isInteger(val), true);
    assert.strictEqual(val >= min, true);
    assert.strictEqual(val <= max, true);
  }
});

test('PRNG: nextExponential samples conform to expected mean (1 / lambda)', () => {
  const rng = new PRNG(777);
  const lambda = 0.5; // Expected mean inter-arrival time = 1 / 0.5 = 2.0 seconds
  const sampleCount = 5000;

  let sum = 0;
  for (let i = 0; i < sampleCount; i++) {
    sum += rng.nextExponential(lambda);
  }

  const sampleMean = sum / sampleCount;
  const expectedMean = 1 / lambda;

  // Law of Large Numbers: sample mean should be within 5% of theoretical mean
  const relativeError = Math.abs(sampleMean - expectedMean) / expectedMean;
  assert.strictEqual(relativeError < 0.05, true);
});

test('PRNG: Snapshot state and restore reproduces sequence exactly', () => {
  const rng = new PRNG(101);

  // Advance 25 steps
  for (let i = 0; i < 25; i++) {
    rng.next();
  }

  const savedState = rng.getState();

  // Generate 10 steps
  const branch1: number[] = [];
  for (let i = 0; i < 10; i++) {
    branch1.push(rng.next());
  }

  // Restore and generate 10 steps again
  rng.setState(savedState);
  const branch2: number[] = [];
  for (let i = 0; i < 10; i++) {
    branch2.push(rng.next());
  }

  assert.deepStrictEqual(branch1, branch2);
});
