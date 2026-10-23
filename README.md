# HoloHand (holohand-gesture)
**Created by [Ragul S](https://github.com/sragul2007123-ship-it)**

Control exploded 3D models with your bare hands. Your webcam is the background, a hand skeleton and a gold ring follow your hand,
and each model is a glowing point cloud that pulls apart into labelled parts so you can see what is inside.

Everything runs in the browser: MediaPipe Hand Landmarker + Three.js. No backend, no API keys, nothing is uploaded.

## Run

Needs Node.js 18+ and Chrome or Edge.

```bash
git clone https://github.com/sragul2007123-ship-it/holohand-gesture.git
cd holohand-gesture
npm install
npm run dev
```

Open the URL Vite prints (normally http://localhost:5173) and click **Start camera**. Camera only works on `http://localhost` or `https`.
`npm install` copies the MediaPipe WASM and downloads the hand model into `public/`. If that download is blocked, the app fetches both from a CDN at runtime.

## Models

Turbofan Jet Engine (fan, guide vanes, compressors, combustor, turbines, shaft, nozzle) ·
Radial Aircraft Engine (crankcase, 9 cylinders, pistons, rods, crankshaft, exhaust ring, supercharger) ·
Sports Car (body panels, chassis, engine, drivetrain, seats, wheels, brakes) ·
Human Brain (4 lobes, cerebellum, brainstem, corpus callosum, thalamus, hippocampus, amygdala, hypothalamus)

## Gestures

| Gesture | Effect |
|---|---|
| Open hand slowly | Explode the model. The white arc on the gold ring shows how far. |
| Close your hand / fist | Pull it back together |
| Move or twist your hand | Rotate and tilt the model |
| Point (index finger) | Highlight the part under your fingertip. Hold still to lock it. |
| Pinch while over a part | Grab it, drag it out, release to snap it back |
| Two hands | Move them apart or together to zoom |
| Peace sign (hold ~0.3 s) | Jump to the next model |

## Machine Learning Lab & Evaluation

HoloHand includes an in-browser Machine Learning Lab and offline evaluation pipeline:
- **KNN Classifier (`k=5`)**: Scale-normalized 63-dimensional landmark feature extraction with Euclidean distance and streak debouncing.
- **ML Lab**: Collect live hand-landmark samples, export datasets as JSON, and retrain the classifier dynamically in-browser.
- **ML Evaluation (LOOCV)**: Built-in Leave-One-Out Cross-Validation evaluating folds with isolated models, confusion matrix visualization, accuracy, macro-averaged Precision, Recall, and F1 scores.
- **Mode Persistence**: Remembers your preferred control mode (Camera or Mouse) in `localStorage` so refreshing the page resumes seamlessly without blocking dialogs. Switch modes anytime from the top-right toolbar or tracking badge.

## Testing

Run the automated ML evaluation and integrity test suite:

```bash
npm test
```

Tests cover input validation, confusion matrix orientation, zero-denominator edge cases, strict test-sample isolation during cross-validation, and dataset duplicate checks.

## Mouse and keyboard

Drag = rotate · scroll = zoom · click a part = inspect it · `Space` = explode / assemble · `←` `→` or `1`–`4` = switch model · `R` = reset view.
Sliders in the left panel control the explosion and its intensity. The top-right buttons toggle input mode, camera background, hand skeleton, labels, and fullscreen.

## Tips

- Even light and a plain background help. Keep your hand 40–80 cm from the camera, palm facing it.
- Open and close your hand slowly. The peace sign needs a short hold so it does not trigger by accident.

## Files

```
src/main.js                 app loop, hand overlay, gesture -> action, labels, UI, ML integration
src/knnClassifier.js        KNN gesture classifier & 63D landmark feature extraction
src/mlEvaluation.js         cross-validation (LOOCV), confusion matrix & per-class metrics
src/handTracking.js         MediaPipe wrapper (2 hands, local files then CDN, GPU then CPU)
src/gestureEngine.js        landmarks -> gesture, openness, smoothed palm / fingertip / pinch, wrist roll
src/scene.js                Three.js point-cloud renderer: explode, scatter transition, picking, part dragging
src/models/                 shapes.js (point sampling) + jet / radial / car / brain definitions
scripts/test-evaluation.mjs automated evaluation & integrity test suite
public/                     gesture dataset JSON, models, and wasm runtime
```

To add a model: write a `build()` returning parts (`P(name, description, color, [I(cloud, explodeDirection)])`) and register it in `src/models/index.js`.
