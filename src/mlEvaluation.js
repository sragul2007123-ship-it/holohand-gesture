
import { GESTURES, KNNClassifier } from './knnClassifier.js';

export { GESTURES };

/**
 * Convention for edge-case divisions:
 * - If (TP + FP) == 0, Precision is defined as 0.0 (no positive predictions made).
 * - If (TP + FN) == 0, Recall is defined as 0.0 (no ground-truth positives exist).
 * - If (Precision + Recall) == 0, F1-score is defined as 0.0.
 */

/**
 * Evaluate predictions against ground-truth labels.
 *
 * @param {string[]} actual - Array of ground-truth labels
 * @param {string[]} predicted - Array of predicted labels
 * @param {string[]} [labels=GESTURES] - Ordered class labels
 * @returns {Object} Comprehensive evaluation metrics
 */
export function evaluateClassifier(actual, predicted, labels = GESTURES) {
  if (!Array.isArray(actual) || !Array.isArray(predicted)) {
    throw new Error('Actual and predicted inputs must be arrays.');
  }

  if (actual.length !== predicted.length) {
    throw new Error('Actual and predicted label arrays must have equal lengths.');
  }

  if (actual.length === 0) {
    throw new Error('Evaluation data cannot be empty.');
  }

  // 5x5 Matrix: Rows = actual labels, Columns = predicted labels
  const matrix = labels.map(() => labels.map(() => 0));
  let correct = 0;

  for (let i = 0; i < actual.length; i++) {
    const actualIndex = labels.indexOf(actual[i]);
    const predictedIndex = labels.indexOf(predicted[i]);

    if (actualIndex < 0) {
      throw new Error(`Unknown actual gesture label "${actual[i]}".`);
    }
    if (predictedIndex < 0) {
      throw new Error(`Unknown predicted gesture label "${predicted[i]}".`);
    }

    matrix[actualIndex][predictedIndex]++;
    if (actualIndex === predictedIndex) correct++;
  }

  // Compute per-class TP, FP, FN, Precision, Recall, F1, Support
  const metrics = labels.map((label, i) => {
    const tp = matrix[i][i];
    // FP: sum of predicted column i excluding the diagonal
    const fp = matrix.reduce((sum, row, r) => sum + (r !== i ? row[i] : 0), 0);
    // FN: sum of actual row i excluding the diagonal
    const fn = matrix[i].reduce((sum, count, c) => sum + (c !== i ? count : 0), 0);
    const support = tp + fn;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    return { label, tp, fp, fn, precision, recall, f1, support };
  });

  // Macro metrics: unweighted average across all classes
  const macroPrecision =
    metrics.reduce((sum, m) => sum + m.precision, 0) / labels.length;
  const macroRecall =
    metrics.reduce((sum, m) => sum + m.recall, 0) / labels.length;
  const macroF1 = metrics.reduce((sum, m) => sum + m.f1, 0) / labels.length;
  const accuracy = correct / actual.length;

  // Validation sanity checks
  const matrixSum = matrix.reduce(
    (s, row) => s + row.reduce((rs, val) => rs + val, 0),
    0
  );
  const diagonalSum = matrix.reduce((s, row, idx) => s + row[idx], 0);

  if (matrixSum !== actual.length) {
    throw new Error(
      `Integrity error: Confusion matrix sum (${matrixSum}) does not match sample count (${actual.length}).`
    );
  }
  if (diagonalSum !== correct) {
    throw new Error(
      `Integrity error: Confusion matrix diagonal sum (${diagonalSum}) does not match correct count (${correct}).`
    );
  }

  return {
    labels: [...labels],
    matrix,
    total: actual.length,
    correct,
    accuracy,
    macroPrecision,
    macroRecall,
    macroF1,
    metrics,
    matrixSum,
    diagonalSum,
    isMatrixValid: true
  };
}

/**
 * Execute Leave-One-Out Cross-Validation (LOOCV) on an array of samples.
 *
 * For each sample:
 * 1. Exclude that sample from training.
 * 2. Create an isolated KNN classifier using k.
 * 3. Add the remaining samples to the fold classifier.
 * 4. Predict the held-out sample's label.
 * 5. Record actual vs. predicted labels.
 *
 * @param {Array<{features: number[], label: string}>} samples
 * @param {number} [k=5]
 * @param {typeof KNNClassifier} [ClassifierClass=KNNClassifier]
 * @returns {Object} Complete LOOCV evaluation report
 */
export function runLeaveOneOutCV(
  samples,
  k = 5,
  ClassifierClass = KNNClassifier
) {
  if (!Array.isArray(samples)) {
    throw new Error('Samples must be an array.');
  }

  if (samples.length < k + 1) {
    throw new Error(
      `Leave-One-Out Cross-Validation with k=${k} requires at least ${k + 1} samples (got ${samples.length}).`
    );
  }

  const actual = [];
  const predicted = [];
  const predictionDetails = [];

  for (let i = 0; i < samples.length; i++) {
    const testSample = samples[i];
    if (
      !testSample ||
      !Array.isArray(testSample.features) ||
      !testSample.label
    ) {
      throw new Error(
        `Sample at index ${i} is invalid or missing required properties.`
      );
    }

    // Step 1: Create an isolated KNN classifier for this fold
    const foldClassifier = new ClassifierClass(k);

    // Step 2: Add all samples EXCEPT the held-out test sample
    let trainCount = 0;
    for (let j = 0; j < samples.length; j++) {
      if (j === i) continue; // EXCLUDE test sample
      const added = foldClassifier.addSample(
        samples[j].features,
        samples[j].label
      );
      if (added) trainCount++;
    }

    if (trainCount < k) {
      throw new Error(
        `Fold ${i}: Insufficient valid training samples (${trainCount}) for k=${k}.`
      );
    }

    // Step 3: Predict the held-out sample
    const predResult = foldClassifier.predict(testSample.features);
    if (!predResult || !predResult.label) {
      throw new Error(`Fold ${i}: Classifier failed to return a prediction.`);
    }

    actual.push(testSample.label);
    predicted.push(predResult.label);

    predictionDetails.push({
      index: i,
      actual: testSample.label,
      predicted: predResult.label,
      isCorrect: predResult.label === testSample.label,
      score: predResult.score,
      votes: predResult.votes
    });
  }

  // Calculate confusion matrix and metrics from held-out predictions
  const evalResult = evaluateClassifier(actual, predicted, GESTURES);

  return {
    ...evalResult,
    method: 'Leave-One-Out Cross-Validation (LOOCV)',
    k,
    datasetSize: samples.length,
    evaluatedAt: new Date().toISOString(),
    predictionDetails
  };
}
