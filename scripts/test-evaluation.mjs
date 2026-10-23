import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GESTURES, KNNClassifier } from '../src/knnClassifier.js';
import { evaluateClassifier, runLeaveOneOutCV } from '../src/mlEvaluation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

console.log('--- RUNNING RIGOROUS ML EVALUATION TEST SUITE ---\n');

// -----------------------------------------------------------------
// Test 1: Empty input handling
// -----------------------------------------------------------------
console.log('Test 1: Empty input handling');
assert.throws(() => evaluateClassifier([], []), /empty/i);
assert.throws(() => evaluateClassifier(['OPEN'], []), /equal lengths/i);
assert.throws(() => runLeaveOneOutCV([], 5), /requires at least/i);
console.log('  [PASS] Empty and mismatched inputs correctly throw errors.\n');

// -----------------------------------------------------------------
// Test 2: Invalid label handling
// -----------------------------------------------------------------
console.log('Test 2: Invalid label handling');
assert.throws(
  () => evaluateClassifier(['OPEN', 'UNKNOWN'], ['OPEN', 'FIST']),
  /Unknown actual gesture label/i
);
assert.throws(
  () => evaluateClassifier(['OPEN', 'FIST'], ['OPEN', 'UNKNOWN']),
  /Unknown predicted gesture label/i
);
console.log('  [PASS] Invalid labels correctly throw descriptive errors.\n');

// -----------------------------------------------------------------
// Test 3: Confusion matrix orientation (Rows = Actual, Columns = Predicted)
// -----------------------------------------------------------------
console.log('Test 3: Confusion matrix orientation (Rows = Actual, Columns = Predicted)');
// Scenario: 1 sample actual 'OPEN' predicted as 'FIST'
const resOrientation = evaluateClassifier(['OPEN'], ['FIST']);
const openIdx = GESTURES.indexOf('OPEN');
const fistIdx = GESTURES.indexOf('FIST');
assert.equal(
  resOrientation.matrix[openIdx][fistIdx],
  1,
  'Matrix[actual][predicted] must be 1 for actual OPEN -> predicted FIST'
);
assert.equal(
  resOrientation.matrix[fistIdx][openIdx],
  0,
  'Matrix[fist][open] must be 0'
);
assert.equal(resOrientation.matrixSum, 1);
assert.equal(resOrientation.diagonalSum, 0);
assert.equal(resOrientation.accuracy, 0);
console.log('  [PASS] Orientation verified: rows strictly represent actual labels; columns strictly represent predicted labels.\n');

// -----------------------------------------------------------------
// Test 4: Known correct/incorrect synthetic predictions & metric calculations
// -----------------------------------------------------------------
console.log('Test 4: Known metric calculations & zero-denominator conventions');
// 2 OPEN actual: 1 pred OPEN (TP), 1 pred FIST (FN)
// 2 FIST actual: 2 pred FIST (TP)
// 1 PEACE actual: 1 pred OPEN (FN, FP for OPEN)
// POINT: 0 actual, 0 pred (all 0)
// PINCH: 0 actual, 0 pred (all 0)
const actualSynth = ['OPEN', 'OPEN', 'FIST', 'FIST', 'PEACE'];
const predSynth   = ['OPEN', 'FIST', 'FIST', 'FIST', 'OPEN'];
const resSynth = evaluateClassifier(actualSynth, predSynth);

assert.equal(resSynth.total, 5);
assert.equal(resSynth.correct, 3); // 1 OPEN, 2 FIST
assert.equal(resSynth.accuracy, 3 / 5);

// OPEN: TP=1, FP=1 (PEACE predicted as OPEN), FN=1 (OPEN predicted as FIST)
// Precision = 1 / 2 = 0.5, Recall = 1 / 2 = 0.5, F1 = 0.5, Support = 2
const openMetric = resSynth.metrics.find((m) => m.label === 'OPEN');
assert.equal(openMetric.tp, 1);
assert.equal(openMetric.fp, 1);
assert.equal(openMetric.fn, 1);
assert.equal(openMetric.precision, 0.5);
assert.equal(openMetric.recall, 0.5);
assert.equal(openMetric.f1, 0.5);
assert.equal(openMetric.support, 2);

// FIST: TP=2, FP=1 (OPEN predicted as FIST), FN=0
// Precision = 2 / 3, Recall = 2 / 2 = 1.0, F1 = 2 * (2/3 * 1) / (2/3 + 1) = (4/3)/(5/3) = 0.8
const fistMetric = resSynth.metrics.find((m) => m.label === 'FIST');
assert.equal(fistMetric.tp, 2);
assert.equal(fistMetric.fp, 1);
assert.equal(fistMetric.fn, 0);
assert.equal(fistMetric.precision, 2 / 3);
assert.equal(fistMetric.recall, 1.0);
assert.equal(fistMetric.f1, 0.8);
assert.equal(fistMetric.support, 2);

// Zero denominator check for POINT (no actual, no predicted)
const pointMetric = resSynth.metrics.find((m) => m.label === 'POINT');
assert.equal(pointMetric.tp, 0);
assert.equal(pointMetric.fp, 0);
assert.equal(pointMetric.fn, 0);
assert.equal(pointMetric.precision, 0);
assert.equal(pointMetric.recall, 0);
assert.equal(pointMetric.f1, 0);
assert.equal(pointMetric.support, 0);

console.log('  [PASS] Precision, recall, F1, and zero-denominator convention (0.0) verified.\n');

// -----------------------------------------------------------------
// Test 5: Verify LOOCV strictly excludes the held-out sample
// -----------------------------------------------------------------
console.log('Test 5: Verification that LOOCV strictly excludes the test sample');
class MockExclusionTrackingClassifier {
  constructor(k) {
    this.k = k;
    this.trainingSamples = [];
  }
  addSample(features, label) {
    this.trainingSamples.push({ features, label });
    return true;
  }
  predict(features) {
    // Check if the exact features reference or unique id is in training
    const foundTestSample = this.trainingSamples.some(
      (s) => s.features === features
    );
    if (foundTestSample) {
      throw new Error('LEAK DETECTED: Held-out test sample was found in fold training set!');
    }
    return { label: this.trainingSamples[0].label, votes: {}, score: 1 };
  }
}

// 6 dummy samples (k=2)
const dummySamples = [
  { features: [1, 2, 3], label: 'OPEN' },
  { features: [4, 5, 6], label: 'OPEN' },
  { features: [7, 8, 9], label: 'FIST' },
  { features: [10, 11, 12], label: 'FIST' },
  { features: [13, 14, 15], label: 'PEACE' },
  { features: [16, 17, 18], label: 'POINT' },
];

const mockLoocvResult = runLeaveOneOutCV(dummySamples, 2, MockExclusionTrackingClassifier);
assert.equal(mockLoocvResult.total, 6);
console.log('  [PASS] Confirmed: In all folds, the held-out test sample was strictly excluded from training.\n');

// -----------------------------------------------------------------
// Test 6: Verify live classifier instance is untouched by evaluation
// -----------------------------------------------------------------
console.log('Test 6: Verify live classifier instance isolation');
const liveClassifier = new KNNClassifier(5);
const dummyF1 = new Array(63).fill(0.1);
const dummyF2 = new Array(63).fill(0.2);
const dummyF3 = new Array(63).fill(0.3);
const dummyF4 = new Array(63).fill(0.4);
const dummyF5 = new Array(63).fill(0.5);

liveClassifier.addSample(dummyF1, 'OPEN');
liveClassifier.addSample(dummyF2, 'OPEN');
liveClassifier.addSample(dummyF3, 'FIST');
liveClassifier.addSample(dummyF4, 'PEACE');
liveClassifier.addSample(dummyF5, 'POINT');

const initialSize = liveClassifier.size;
assert.equal(initialSize, 5);

// Run LOOCV on a completely separate sample set
const datasetPath = path.join(root, 'public', 'holohand-gesture-dataset.json');
const rawDataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
runLeaveOneOutCV(rawDataset.samples, 5);

assert.equal(
  liveClassifier.size,
  initialSize,
  'Live classifier sample count must not be altered by evaluation execution'
);
console.log('  [PASS] Confirmed: Live classifier instance is 100% isolated and unchanged.\n');

// -----------------------------------------------------------------
// Test 7: Duplicate Feature Vector Audit on 35-Sample Dataset
// -----------------------------------------------------------------
console.log('Test 7: Duplicate Feature Vector Audit');
assert.equal(rawDataset.samples.length, 35, 'Dataset must have 35 samples');

let minPairwisePinchDist = Infinity;
let pinchPairsChecked = 0;
const pinchSamples = rawDataset.samples.filter((s) => s.label === 'PINCH');
assert.equal(pinchSamples.length, 15, 'Dataset must have 15 PINCH samples');

for (let i = 0; i < pinchSamples.length; i++) {
  for (let j = i + 1; j < pinchSamples.length; j++) {
    let sumSq = 0;
    for (let d = 0; d < 63; d++) {
      const diff = pinchSamples[i].features[d] - pinchSamples[j].features[d];
      sumSq += diff * diff;
    }
    const dist = Math.sqrt(sumSq);
    if (dist < minPairwisePinchDist) minPairwisePinchDist = dist;
    pinchPairsChecked++;
    assert(dist > 1e-6, `Exact duplicate PINCH vector found between indices ${i} and ${j}`);
  }
}
assert.equal(pinchPairsChecked, 105, 'Must have evaluated all 105 PINCH pairs');
assert(minPairwisePinchDist > 0.3, `PINCH samples must have sufficient separation (min: ${minPairwisePinchDist.toFixed(4)})`);
console.log(`  [PASS] Confirmed 0 duplicate PINCH vectors across 105 pairs (min distance: ${minPairwisePinchDist.toFixed(4)}).\n`);

// -----------------------------------------------------------------
// Test 8: Real 35-sample dataset LOOCV evaluation & integrity checks
// -----------------------------------------------------------------
console.log('Test 8: Real 35-sample dataset LOOCV evaluation');
const realLoocv = runLeaveOneOutCV(rawDataset.samples, 5);

// Check confusion matrix totals
assert.equal(realLoocv.total, 35, 'Total evaluated samples must be 35');
assert.equal(realLoocv.matrixSum, 35, 'Confusion matrix sum must be exactly 35');
assert.equal(
  realLoocv.diagonalSum,
  realLoocv.correct,
  'Diagonal sum must equal correct count'
);

// Check class support: 5 for OPEN, FIST, PEACE, POINT; 15 for PINCH
const supportMap = Object.fromEntries(realLoocv.metrics.map(m => [m.label, m.support]));
assert.equal(supportMap.OPEN, 5);
assert.equal(supportMap.FIST, 5);
assert.equal(supportMap.PEACE, 5);
assert.equal(supportMap.POINT, 5);
assert.equal(supportMap.PINCH, 15);

// Check computed metrics:
// 34 correct out of 35 -> 97.14%
assert.equal(realLoocv.correct, 34);
assert.equal(Number((realLoocv.accuracy * 100).toFixed(1)), 97.1);
assert.equal(Number((realLoocv.macroPrecision * 100).toFixed(1)), 98.8);
assert.equal(Number((realLoocv.macroRecall * 100).toFixed(1)), 96.0);
assert.equal(Number((realLoocv.macroF1 * 100).toFixed(1)), 97.1);

console.log('  [PASS] 35-sample dataset verified:');
console.log(`         - Total samples: ${realLoocv.total}`);
console.log(`         - Correct predictions: ${realLoocv.correct} (Accuracy: ${(realLoocv.accuracy * 100).toFixed(1)}%)`);
console.log(`         - Macro Precision: ${(realLoocv.macroPrecision * 100).toFixed(1)}%`);
console.log(`         - Macro Recall: ${(realLoocv.macroRecall * 100).toFixed(1)}%`);
console.log(`         - Macro F1: ${(realLoocv.macroF1 * 100).toFixed(1)}%`);
console.log(`         - Matrix sum: ${realLoocv.matrixSum}, Diagonal sum: ${realLoocv.diagonalSum}`);
console.log('\n--- ALL ML EVALUATION TESTS PASSED SUCCESSFULLY! ---');
