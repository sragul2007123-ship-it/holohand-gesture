# HoloHand Universal 3D Explorer
**Created by [Ragul S](https://github.com/sragu official repository: [holohand-gesture](https://github.com/sragul2007123-ship-it/holohand-gesture.git))**

HoloHand transforms 3D interaction into an embodied, holographic exploration experience. Control exploded 3D models with your bare hands or mouse. Discover real 3D assets across science, engineering, anatomy, nature, space, and history through the **Universal 3D Explorer** powered by the **Sketchfab Data API v3**, inspect individual components, explode internal assemblies, and learn with an AI Educational Assistant.

---

## Key Features

1. **Universal 3D Discovery (Sketchfab API v3)**:
   - Search across millions of real 3D models using natural language (e.g. *Human heart*, *Turbofan engine*, *Robot arm*, *Dinosaur skeleton*, *DNA molecule*).
   - Real-time model cards with author attribution, thumbnails, face counts, and license information.
   - Filter by **⚡ Downloadable 3D** (renders directly in the local Three.js holographic engine) or **👁️ Official Embed** (rendered via Sketchfab's official 3D viewer).
   - Personal library with persistent Favorites (⭐) and Recently Viewed models (🕒).

2. **HoloHand Particle Hologram Engine (Three.js)**:
   - Dynamic GLTF/GLB models are sampled into holographic point-cloud particle meshes rendered with custom GLSL shaders.
   - Models are automatically centered, bounding-box normalized, and framed to optimal camera distance.
   - Radial explosion vectors calculate part offsets outward from the model's centroid.
   - Supports **Case A/B** (multi-mesh assemblies with selectable parts and exploded views) and **Case C** (single-mesh models where explosion is cleanly disabled while rotation, zoom, and surface inspection remain active).

3. **AI Educational Assistant**:
   - Structured knowledge engine explaining what the object is, its primary purpose, operational mechanics, key components, and real-world applications.
   - Interactive component breakdown and follow-up exploration suggestions with 1-click search.
   - Verified metadata is distinguished from generalized scientific principles.

4. **Natural Hand Gesture Control (MediaPipe + KNN Classifier)**:
   - **Open hand**: Explode the model progressively; see inside.
   - **Fist**: Pull the model back together.
   - **Move / Twist**: Rotate and tilt the model in 3D space.
   - **Point**: Highlight and inspect a component.
   - **Pinch**: Drag a selected component in screen-space.
   - **Two hands**: Zoom in or out by moving hands apart or together.
   - **Peace sign**: Cycle to the next model or next search result.

5. **Machine Learning Lab & Offline Evaluation**:
   - **KNN Classifier (`k=5`)**: Scale-normalized 63D hand-landmark feature extraction.
   - **ML Lab**: Record custom gesture samples and export/import datasets.
   - **LOOCV Evaluation**: Offline Leave-One-Out Cross-Validation with confusion matrix and macro Precision/Recall/F1 metrics.

---

## Quick Start

### 1. Requirements
- Node.js 18+ (tested on Node v20/v24)
- Modern web browser (Chrome, Edge, Firefox) with WebGL support

### 2. Configuration & API Token Security
The application securely isolates your Sketchfab API token in a backend server. **Your private token is NEVER exposed to browser bundles or public repositories.**

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and add your Sketchfab API token:
   ```env
   SKETCHFAB_API_TOKEN=your_sketchfab_api_token_here
   PORT=3001
   ```
   *(Note: `.env` is listed in `.gitignore` and is strictly excluded from Git commits).*

### 3. Running Locally
Run both the secure backend proxy server and the Vite frontend:

```bash
# Terminal 1: Start the secure API proxy server
npm run server

# Terminal 2: Start the Vite frontend dev server
npm run dev
```

Open your browser at `http://localhost:5173`.
- Press `/` or click **Search Universal 3D Models…** to open the Universal 3D Explorer.
- Click **Start camera** for hand gesture control, or click **Use mouse instead**.

---

## Gestures & Controls

| Gesture | Action |
|---|---|
| ✋ **Open hand slowly** | Explode multi-part assemblies (white arc indicates explosion percentage) |
| ✊ **Close hand / Fist** | Assemble model back to its original state |
| 👋 **Move or twist hand** | Rotate and tilt model in 3D |
| ☝️ **Point index finger** | Highlight and select component under fingertip |
| 🤏 **Pinch over part** | Pull part out, drag in 3D, release to snap back |
| 🙌 **Two hands** | Adjust distance between hands to zoom |
| ✌️ **Peace sign** | Cycle to next model / next search result |

### Mouse & Keyboard Shortcuts
- **Drag**: Rotate model · **Scroll**: Zoom in/out · **Click part**: Inspect details
- **`/`**: Open Universal 3D Explorer
- **`Space`**: Toggle explode / assemble
- **`←` / `→`**: Previous / next built-in model
- **`R`**: Reset view and part positions
- **`Esc`**: Close any active modal

---

## Automated Test Suites

Run both automated test suites:

```bash
# 1. Run ML evaluation and classifier integrity tests
npm test

# 2. Run Universal 3D Explorer & Sketchfab API integration tests
npm run test:explorer
```

The explorer test suite verifies:
- Search query normalization and edge cases.
- Token security and confidentiality (token is never leaked).
- Live Sketchfab Search API responses with real model IDs, creators, and thumbnails.
- Downloadable vs preview-only classification.
- AI Educational Assistant structured knowledge generation.
- Single-mesh (Case C) vs multi-mesh (Case A/B) geometry handling.

---

## Project Structure

```
server/
  index.js                  Secure Node.js HTTP proxy for Sketchfab API v3 & AI Explainer
src/
  main.js                   Main application loop, gestures, UI wiring, and modals
  scene.js                  Three.js point-cloud renderer with dynamic model support
  services/
    modelSearch.js          Query normalization, categories, and localStorage library
    modelLoader.js          GLTF/GLB loader, centering, adaptive sampling & part extraction
  providers/
    sketchfabProvider.js    Client API interface for search, metadata, and asset endpoints
  models/                   Procedural built-in models (Turbofan, Radial, Car, Brain)
  knnClassifier.js          KNN classifier and 63D landmark feature extraction
  mlEvaluation.js           LOOCV cross-validation, confusion matrix & metrics
scripts/
  test-evaluation.mjs       ML evaluation test suite
  test-universal-explorer.mjs Universal Explorer and Sketchfab integration test suite
```

---

## License & Attribution
- Built with Three.js and Google MediaPipe.
- 3D models retrieved via the Sketchfab Data API remain subject to their respective creators' creative commons and platform licenses. Attribution is automatically displayed on every model card and preview.

