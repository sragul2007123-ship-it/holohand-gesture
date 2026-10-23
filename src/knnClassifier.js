
const GESTURES = ['OPEN', 'FIST', 'PEACE', 'POINT', 'PINCH'];

export { GESTURES };

/**
 * Convert 21 MediaPipe landmarks into scale-normalized features.
 * Each landmark contributes x, y and z: 63 numeric features.
 */
export function extractFeatures(landmarks) {
    if (!landmarks || landmarks.length !== 21) return null;

    const wrist = landmarks[0];
    const middleBase = landmarks[9];

    const scale = Math.hypot(
        middleBase.x - wrist.x,
        middleBase.y - wrist.y,
        middleBase.z - wrist.z
    );

    if (!Number.isFinite(scale) || scale < 1e-6) return null;

    return landmarks.flatMap((point) => [
        (point.x - wrist.x) / scale,
        (point.y - wrist.y) / scale,
        (point.z - wrist.z) / scale
    ]);
}

function distanceSquared(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const delta = a[i] - b[i];
        sum += delta * delta;
    }
    return sum;
}

/**
 * KNN classifier using Euclidean distance and majority voting.
 */
export class KNNClassifier {
    constructor(k = 5) {
        this.k = k;
        this.samples = [];
    }

    addSample(features, label) {
        if (
            !features ||
            features.length !== 63 ||
            !GESTURES.includes(label) ||
            !features.every(Number.isFinite)
        ) {
            return false;
        }

        this.samples.push({ features: [...features], label });
        return true;
    }

    clear() {
        this.samples = [];
    }

    get size() {
        return this.samples.length;
    }

    predict(features) {
        if (!features || this.samples.length < this.k) return null;

        const nearest = this.samples
            .map((sample) => ({
                label: sample.label,
                distance: distanceSquared(features, sample.features)
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, this.k);

        const votes = Object.fromEntries(
            GESTURES.map((gesture) => [gesture, 0])
        );

        for (const neighbor of nearest) {
            votes[neighbor.label]++;
        }

        const label = GESTURES
            .filter((gesture) => votes[gesture] > 0)
            .sort((a, b) => votes[b] - votes[a])[0];

        return {
            label,
            votes,
            score: votes[label] / this.k
        };
    }
}
