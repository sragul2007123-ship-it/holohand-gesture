import './styles.css';
import { HoloScene } from './scene.js';
import { MODELS } from './models/index.js';
import { HandTracker } from './handTracking.js';
import { GestureEngine, HAND_CONNECTIONS } from './gestureEngine.js';
import {
  extractFeatures,
  GESTURES,
  KNNClassifier
} from './knnClassifier.js';
import { runLeaveOneOutCV } from './mlEvaluation.js';
import { clamp } from './utils.js';
import { sketchfabProvider } from './providers/sketchfabProvider.js';
import { modelSearchService } from './services/modelSearch.js';
import { modelLoaderService } from './services/modelLoader.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const fxCanvas = $('fx');
const ctx = fxCanvas.getContext('2d');
const banner = $('banner');

let W = innerWidth, H = innerHeight, DPR = 1;
function sizeFx() {
  W = innerWidth;
  H = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, 2);
  fxCanvas.width = W * DPR;
  fxCanvas.height = H * DPR;
}
sizeFx();
addEventListener('resize', sizeFx);

function showBanner(msg, info = false) {
  banner.textContent = msg;
  banner.className = info ? 'info' : '';
  banner.style.display = msg ? 'block' : 'none';
}
let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

// ------------------------------------------------------------------ scene + UI
let scene;
try {
  scene = new HoloScene($('scene'), MODELS);
} catch (e) {
  console.error(e);
  showBanner('WebGL is not available. Use a current Chrome, Edge or Firefox with hardware acceleration on.');
  throw e;
}

const ui = { skeleton: true, labels: true, feed: false };
let trackingState = 'Off';

let currentModelMeta = {
  name: MODELS[0].name,
  subtitle: MODELS[0].subtitle,
  category: MODELS[0].category,
  description: MODELS[0].subtitle,
  uid: null,
  isExternal: false,
  isSingleMesh: false
};

// model chips grouped by category
const chips = $('chips');
for (const cat of [...new Set(MODELS.map((m) => m.category))]) {
  const grp = document.createElement('div');
  grp.className = 'grp';
  const gl = document.createElement('span');
  gl.className = 'gl';
  gl.textContent = cat;
  grp.appendChild(gl);
  MODELS.forEach((m, i) => {
    if (m.category !== cat) return;
    const b = document.createElement('button');
    b.textContent = m.name;
    b.dataset.i = i;
    b.onclick = () => scene.setModel(i);
    grp.appendChild(b);
  });
  chips.appendChild(grp);
}

scene.onModel = (i, def, g) => {
  $('m-name').textContent = def.name;
  $('m-sub').textContent = def.subtitle;
  $('m-cat').textContent = def.category;
  if (def.isSingleMesh) {
    $('m-count').textContent = '1 mesh (integrated)';
  } else {
    $('m-count').textContent = `${g.meta.length} parts`;
  }
  chips.querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.i === i));
  currentModelMeta = def;
  showPart(-1);
  toast(def.name);
};
// initial UI for model 0 (constructor loaded it before the callback existed)
scene.onModel(scene.index, MODELS[scene.index], scene.cache.get(scene.index));

function showPart(i) {
  const p = i >= 0 ? scene.parts[i] : null;
  $('pc-name').textContent = p ? p.name : 'No part selected';
  $('pc-desc').textContent = p ? p.desc : (
    scene.isSingleMesh
      ? 'Single integrated mesh. Exploded view is disabled; use rotation and zoom to inspect surfaces.'
      : 'Point at a part, or click one, to read what it does.'
  );
  $('pc-dot').style.background = p ? p.color : '#555a70';
  const pcAiBtn = $('pc-ai-btn');
  if (pcAiBtn) {
    pcAiBtn.style.display = p ? 'block' : 'none';
    if (p) {
      pcAiBtn.textContent = `🤖 Ask AI about "${p.name.slice(0, 18)}"`;
    }
  }
}

const rExplode = $('r-explode');
const rInt = $('r-int');
let draggingExplode = false;
rExplode.addEventListener('pointerdown', () => (draggingExplode = true));
addEventListener('pointerup', () => (draggingExplode = false));
rExplode.addEventListener('input', () => (scene.explodeTarget = rExplode.value / 100));
rInt.addEventListener('input', () => {
  scene.intensity = rInt.value / 100;
  $('v-int').textContent = rInt.value + '%';
});

$('b-explode').onclick = () => (scene.explodeTarget = scene.explodeTarget > 0.5 ? 0 : 1);
$('b-spin').onclick = () => {
  scene.autoSpin = !scene.autoSpin;
  $('b-spin').classList.toggle('on', scene.autoSpin);
};
$('b-reset').onclick = () => {
  scene.resetView();
  showPart(-1);
};
$('b-next').onclick = () => scene.next();

function toggle(id, key, after) {
  $(id).onclick = () => {
    ui[key] = !ui[key];
    $(id).classList.toggle('on', ui[key]);
    after?.();
  };
}
toggle('t-feed', 'feed', () => document.body.classList.toggle('feed', ui.feed && camOn));
toggle('t-skel', 'skeleton');
toggle('t-labels', 'labels');
$('t-full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());

// ------------------------------------------------------------------ camera + tracking
const tracker = new HandTracker();
const engine = new GestureEngine();

let latestHands = [];
let mlSamples = [];
const knn = new KNNClassifier(5);

const mlPredictionStates = new Map();
let datasetLoaded = false;
let datasetLoading = false;

const mlGesture = $('ml-gesture');
const mlCapture = $('ml-capture');
const mlExport = $('ml-export');
const mlClear = $('ml-clear');

function updateMLCount() {
  $('ml-count').textContent =
    `Total samples: ${mlSamples.length} | ` +
    GESTURES.map(g =>
      `${g}: ${mlSamples.filter(s => s.label === g).length}`
    ).join(' | ');
}

mlCapture.onclick = () => {
  if (!camOn || !tracker.ready) {
    $('ml-status').textContent = 'Start the camera and wait for hand tracking.';
    return;
  }

  if (!latestHands.length) {
    $('ml-status').textContent = 'No hand detected. Place one hand in view.';
    return;
  }

  const features = extractFeatures(latestHands[0].landmarks);

  if (!features) {
    $('ml-status').textContent = 'Could not extract hand features. Try again.';
    return;
  }

  mlSamples.push({
    features,
    label: mlGesture.value,
    capturedAt: new Date().toISOString()
  });
  knn.addSample(features, mlGesture.value);

  updateMLCount();
  $('ml-status').textContent =
    `Captured ${mlGesture.value} sample successfully.`;
};

mlExport.onclick = () => {
  if (!mlSamples.length) {
    $('ml-status').textContent = 'Capture samples before exporting.';
    return;
  }

  const blob = new Blob(
    [JSON.stringify({
      format: 'holohand-knn-v1',
      featureCount: 63,
      samples: mlSamples
    }, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'holohand-gesture-dataset.json';
  link.click();
  URL.revokeObjectURL(url);

  $('ml-status').textContent = 'Dataset export requested.';
};

mlClear.onclick = () => {
  if (!confirm('Clear all collected ML samples?')) return;

  mlSamples = [];
  knn.clear();
  mlPredictionStates.clear();
  datasetLoaded = false;
  updateMLCount();
  $('ml-status').textContent = 'Dataset cleared. 0 samples in classifier.';
  if (mlEvalOutput) {
    mlEvalOutput.innerHTML = `
      <div class="eval-state eval-empty">
        <p>Dataset cleared. No evaluation available.</p>
        <small>Capture or load training samples to evaluate.</small>
      </div>
    `;
  }
};

async function loadInitialDataset() {
  if (datasetLoading || datasetLoaded) return;
  datasetLoading = true;
  $('ml-status').textContent = 'Loading training dataset…';

  try {
    const res = await fetch('/holohand-gesture-dataset.json');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (!data || typeof data !== 'object') {
      throw new Error('Dataset is not a valid JSON object.');
    }
    if (data.format !== 'holohand-knn-v1') {
      throw new Error(`Unsupported dataset format: ${data.format}`);
    }
    if (data.featureCount !== 63) {
      throw new Error(`Unexpected featureCount: ${data.featureCount} (expected 63)`);
    }
    if (!Array.isArray(data.samples) || data.samples.length === 0) {
      throw new Error('Dataset contains no samples array.');
    }

    let validCount = 0;
    const classCounts = Object.fromEntries(GESTURES.map((g) => [g, 0]));

    for (const s of data.samples) {
      if (
        !s ||
        !Array.isArray(s.features) ||
        s.features.length !== 63 ||
        !GESTURES.includes(s.label) ||
        !s.features.every(Number.isFinite)
      ) {
        console.warn('[KNN] Skipping invalid sample:', s);
        continue;
      }

      const added = knn.addSample(s.features, s.label);
      if (added) {
        mlSamples.push({
          features: [...s.features],
          label: s.label,
          capturedAt: s.capturedAt || new Date().toISOString()
        });
        classCounts[s.label]++;
        validCount++;
      }
    }

    if (validCount === 0) {
      throw new Error('No valid samples could be loaded from dataset.');
    }

    datasetLoaded = true;
    updateMLCount();

    console.log('[KNN] Dataset loaded successfully');
    console.log(`[KNN] Samples loaded: ${validCount}`);
    for (const g of GESTURES) {
      console.log(`[KNN] ${g}: ${classCounts[g] || 0}`);
    }
    console.log('[KNN] ML ready');

    $('ml-status').textContent = `Dataset loaded. ML ready (${validCount} samples).`;
    runEvaluation();
  } catch (err) {
    console.error('[KNN] Error loading dataset:', err);
    $('ml-status').textContent = `Dataset load error: ${err.message}. Manual collection available.`;
  } finally {
    datasetLoading = false;
  }
}

// ------------------------------------------------------------------ ML Evaluation Dashboard
const mlEvalRun = $('ml-eval-run');
const mlEvalOutput = $('ml-eval-output');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEvaluationResults(res) {
  const pct = (num) => (num * 100).toFixed(1) + '%';
  const evalDate = new Date(res.evaluatedAt).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  // Confusion matrix HTML table
  const matrixHtml = `
    <div class="eval-table-title">Confusion Matrix (Rows: Actual, Cols: Pred)</div>
    <div class="eval-table-wrap">
      <table class="eval-table">
        <thead>
          <tr>
            <th class="th-left" title="Actual gesture">Act \\ Pred</th>
            ${res.labels.map((l) => `<th title="Predicted ${l}">${l.slice(0, 3)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${res.labels.map((actualLabel, r) => `
            <tr>
              <td class="td-left" style="font-weight:600">${actualLabel}</td>
              ${res.matrix[r].map((count, c) => {
                const isDiag = r === c;
                const cellClass = isDiag
                  ? (count > 0 ? 'matrix-diag' : 'matrix-zero')
                  : (count > 0 ? 'matrix-err' : 'matrix-zero');
                const titleText = `Actual: ${actualLabel}, Predicted: ${res.labels[c]} (${count})`;
                return `<td class="matrix-cell ${cellClass}" title="${titleText}">${count}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Per-Class Metrics Table
  const metricsTableHtml = `
    <div class="eval-table-title">Per-Gesture Performance</div>
    <div class="eval-table-wrap">
      <table class="eval-table">
        <thead>
          <tr>
            <th class="th-left">Gesture</th>
            <th title="Precision = TP / (TP + FP)">Prec</th>
            <th title="Recall = TP / (TP + FN)">Rec</th>
            <th title="F1-Score">F1</th>
            <th title="Support (Sample count)">N</th>
          </tr>
        </thead>
        <tbody>
          ${res.metrics.map((m) => `
            <tr>
              <td class="td-left">${m.label}</td>
              <td>${pct(m.precision)}</td>
              <td>${pct(m.recall)}</td>
              <td>${pct(m.f1)}</td>
              <td>${m.support}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td class="td-left">Macro Avg</td>
            <td>${pct(res.macroPrecision)}</td>
            <td>${pct(res.macroRecall)}</td>
            <td>${pct(res.macroF1)}</td>
            <td>${res.total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  mlEvalOutput.innerHTML = `
    <div class="eval-meta">
      <div><b>Method:</b> ${escapeHtml(res.method)} (k=${res.k})</div>
      <div><b>Dataset:</b> ${res.total} samples · <b>Time:</b> ${escapeHtml(evalDate)}</div>
    </div>

    <div class="eval-summary-grid">
      <div class="eval-card highlight">
        <span class="eval-card-label">Accuracy</span>
        <span class="eval-card-value">${pct(res.accuracy)}</span>
        <span class="eval-card-sub">(${res.correct}/${res.total})</span>
      </div>
      <div class="eval-card">
        <span class="eval-card-label">Macro F1</span>
        <span class="eval-card-value">${pct(res.macroF1)}</span>
      </div>
      <div class="eval-card">
        <span class="eval-card-label">Macro Precision</span>
        <span class="eval-card-value">${pct(res.macroPrecision)}</span>
      </div>
      <div class="eval-card">
        <span class="eval-card-label">Macro Recall</span>
        <span class="eval-card-value">${pct(res.macroRecall)}</span>
      </div>
    </div>

    ${matrixHtml}
    ${metricsTableHtml}

    <div class="eval-note">
      <b>Evaluation Limitations:</b>
      <p>Evaluation uses leave-one-out cross-validation on ${res.total} existing samples. Results are preliminary and may not represent performance on new users, recording sessions, camera angles, or lighting conditions. Independent testing data is needed to estimate generalization reliably.</p>
      <small>Note: LOOCV evaluates static landmark feature vectors under isolated neighbor voting. It does not evaluate temporal factors of the live webcam pipeline (confidence gating & streak debouncing).</small>
    </div>
  `;
}

function runEvaluation() {
  if (!mlEvalOutput || !mlEvalRun) return;

  if (mlSamples.length < 6) {
    mlEvalOutput.innerHTML = `
      <div class="eval-state eval-empty">
        <p>Insufficient samples for evaluation.</p>
        <small>At least 6 samples are required for k=5 LOOCV (currently: ${mlSamples.length}). Capture or load samples first.</small>
      </div>
    `;
    return;
  }

  mlEvalRun.disabled = true;
  mlEvalOutput.innerHTML = `
    <div class="eval-state eval-loading">
      <div class="eval-spinner"></div>
      <p>Running Leave-One-Out Cross-Validation...</p>
      <small>Evaluating ${mlSamples.length} folds with isolated models...</small>
    </div>
  `;

  setTimeout(() => {
    try {
      const results = runLeaveOneOutCV(mlSamples, 5);
      renderEvaluationResults(results);
    } catch (err) {
      console.error('[Eval] Evaluation failed:', err);
      mlEvalOutput.innerHTML = `
        <div class="eval-state eval-error">
          <b>Evaluation Failed</b>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    } finally {
      mlEvalRun.disabled = false;
    }
  }, 40);
}

if (mlEvalRun) {
  mlEvalRun.onclick = runEvaluation;
}

updateMLCount();
loadInitialDataset();

// ------------------------------------------------------------------ Universal 3D Explorer & Knowledge Assistant
let currentSearchResults = [];
let currentSearchTab = 'all';
let currentSearchQuery = '';

function updateFavCount() {
  const el = $('fav-count');
  if (el) el.textContent = String(modelSearchService.getFavorites().length);
}

function openExplorer(initialQuery = '') {
  const modal = $('explorer-modal');
  if (!modal) return;
  modal.classList.remove('gone');
  updateFavCount();
  if (initialQuery) {
    if ($('explorer-input')) $('explorer-input').value = initialQuery;
    executeSearch(initialQuery);
  } else if (!currentSearchResults.length && !$('explorer-input')?.value.trim()) {
    executeSearch('human heart');
  }
  setTimeout(() => $('explorer-input')?.focus(), 80);
}

function closeExplorer() {
  const modal = $('explorer-modal');
  if (modal) modal.classList.add('gone');
}

async function executeSearch(query) {
  query = (query ?? $('explorer-input')?.value ?? '').trim();
  if (!query) return;
  if ($('explorer-input')) $('explorer-input').value = query;
  $('explorer-clear')?.classList.toggle('gone', !query);
  currentSearchQuery = query;

  const loadingEl = $('explorer-loading');
  const errorEl = $('explorer-error');
  const emptyEl = $('explorer-empty');
  const gridEl = $('explorer-grid');

  loadingEl?.classList.remove('gone');
  errorEl?.classList.add('gone');
  emptyEl?.classList.add('gone');
  if (gridEl) gridEl.innerHTML = '';

  try {
    const searchData = await modelSearchService.search(query, {
      downloadable: currentSearchTab === 'downloadable' ? true : (currentSearchTab === 'embed' ? false : null)
    });
    const items = Array.isArray(searchData) ? searchData : (searchData?.results || []);
    currentSearchResults = items;
    loadingEl?.classList.add('gone');

    if (!items || items.length === 0) {
      emptyEl?.classList.remove('gone');
      return;
    }

    renderExplorerCards(items);
  } catch (err) {
    console.error('[Search] Failed to execute search:', err);
    loadingEl?.classList.add('gone');
    errorEl?.classList.remove('gone');
    if ($('explorer-error-desc')) {
      $('explorer-error-desc').textContent = err.message || 'Could not connect to Sketchfab API.';
    }
  }
}

function renderExplorerCards(items) {
  const gridEl = $('explorer-grid');
  if (!gridEl) return;
  gridEl.innerHTML = '';
  const list = Array.isArray(items) ? items : (items?.results || []);
  const favUids = new Set(modelSearchService.getFavorites().map((f) => f.id || f.uid));

  let filtered = list;
  if (currentSearchTab === 'downloadable') {
    filtered = list.filter((m) => m.isDownloadable);
  } else if (currentSearchTab === 'embed') {
    filtered = list.filter((m) => !m.isDownloadable);
  }

  if (!filtered || filtered.length === 0) {
    $('explorer-empty')?.classList.remove('gone');
    return;
  }
  $('explorer-empty')?.classList.add('gone');

  filtered.forEach((model) => {
    const card = document.createElement('div');
    card.className = 'model-card';

    const uid = model.id || model.uid;
    const thumbUrl = model.thumbnailUrl || model.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="%23111424"/><text x="50%" y="50%" fill="%23666" text-anchor="middle">3D Asset</text></svg>';
    const isFav = favUids.has(uid);
    const badgeHtml = model.isDownloadable
      ? `<span class="badge-type badge-downloadable">⚡ Downloadable 3D</span>`
      : `<span class="badge-type badge-embed">👁️ Embed View</span>`;

    const faces = model.stats?.faces || model.faceCount || 0;
    const faceText = faces > 0 ? (faces > 1000 ? Math.round(faces / 1000) + 'k' : faces) + ' faces' : '';

    card.innerHTML = `
      <div class="card-thumb-wrap">
        <img class="card-thumb" src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(model.title)}" loading="lazy" />
        ${badgeHtml}
        <button class="card-fav-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">⭐</button>
      </div>
      <div class="card-body">
        <div class="card-title" title="${escapeHtml(model.title)}">${escapeHtml(model.title)}</div>
        <div class="card-creator">By <b>${escapeHtml(model.creator?.name || 'Unknown')}</b></div>
        <div class="card-meta-line">
          <span class="badge-license">${escapeHtml(model.license?.label || 'Sketchfab CC')}</span>
          <span>${faceText}</span>
        </div>
        <div class="card-actions">
          ${model.isDownloadable ? `
            <button class="btn-pill primary btn-load-hologram" title="Download & explode in HoloHand 3D viewer">⚡ Load Hologram</button>
          ` : `
            <button class="btn-pill ghost btn-view-embed" title="Preview in official Sketchfab viewer">👁️ View Embed</button>
          `}
          <button class="btn-pill ai btn-card-ai" title="Ask AI about this model">🤖 AI</button>
        </div>
      </div>
    `;

    const favBtn = card.querySelector('.card-fav-btn');
    if (favBtn) {
      favBtn.onclick = (e) => {
        e.stopPropagation();
        const updated = modelSearchService.toggleFavorite(model);
        const nowFav = updated;
        favBtn.classList.toggle('active', nowFav);
        updateFavCount();
        toast(nowFav ? 'Added to favorites' : 'Removed from favorites');
        if (currentSearchTab === 'favorites') {
          renderExplorerCards(modelSearchService.getFavorites());
        }
      };
    }

    const loadBtn = card.querySelector('.btn-load-hologram');
    if (loadBtn) {
      loadBtn.onclick = () => loadModelIntoHologram(model);
    }

    const embedBtn = card.querySelector('.btn-view-embed');
    if (embedBtn) {
      embedBtn.onclick = () => openEmbedModal(model);
    }

    const aiBtn = card.querySelector('.btn-card-ai');
    if (aiBtn) {
      aiBtn.onclick = () => openAiModal(model.title, {
        description: model.description,
        creator: model.creator?.name,
        tags: model.tags,
        categories: model.categories
      });
    }

    gridEl.appendChild(card);
  });
}

async function loadModelIntoHologram(model) {
  closeExplorer();
  const overlay = $('asset-loader-overlay');
  const titleEl = $('loader-title');
  const subEl = $('loader-subtitle');
  const fillEl = $('loader-progress-fill');
  const pctEl = $('loader-percent');
  const detEl = $('loader-detail');

  overlay?.classList.remove('gone');
  if (titleEl) titleEl.textContent = `Downloading ${model.title}`;
  if (subEl) subEl.textContent = 'Requesting authorized download stream from Sketchfab API…';
  if (fillEl) fillEl.style.width = '10%';
  if (pctEl) pctEl.textContent = '10%';
  if (detEl) detEl.textContent = 'Authenticating…';

  try {
    const uid = model.id || model.uid;
    const assetUrl = await sketchfabProvider.getModelAssetUrl(uid);
    if (fillEl) fillEl.style.width = '30%';
    if (pctEl) pctEl.textContent = '30%';
    if (detEl) detEl.textContent = 'Streaming GLTF mesh data…';

    const entry = await modelLoaderService.loadGLB(assetUrl, (pct, loaded, total) => {
      const p = Math.max(30, Math.min(85, Math.round(30 + pct * 0.55)));
      if (fillEl) fillEl.style.width = `${p}%`;
      if (pctEl) pctEl.textContent = `${p}%`;
      const mb = (loaded / (1024 * 1024)).toFixed(1);
      const totalMb = total > 0 ? (total / (1024 * 1024)).toFixed(1) + ' MB' : '';
      if (detEl) detEl.textContent = `Downloaded ${mb} MB ${totalMb}`;
    });

    if (detEl) detEl.textContent = 'Sampling particle hologram geometry…';
    if (fillEl) fillEl.style.width = '95%';
    if (pctEl) pctEl.textContent = '95%';

    scene.loadExternalEntry(entry, {
      name: model.title,
      subtitle: `By ${model.creator?.name || 'Sketchfab Creator'}`,
      creator: model.creator?.name,
      category: 'Sketchfab 3D',
      license: model.license?.label || 'Public CC',
      uid: uid
    });

    modelSearchService.recordViewedModel(model);

    if (fillEl) fillEl.style.width = '100%';
    if (pctEl) pctEl.textContent = '100%';
    setTimeout(() => {
      overlay?.classList.add('gone');
      toast(`Loaded: ${model.title}`);
      if (entry.isSingleMesh) {
        showBanner('Single-mesh model: Exploded view disabled. Surface inspection, rotation and zoom are active.', true);
      } else {
        showBanner('');
      }
    }, 300);
  } catch (err) {
    console.error('[Loader] Failed to load model:', err);
    overlay?.classList.add('gone');
    showBanner(`Failed to load 3D model: ${err.message}`);
    toast('Loading failed');
  }
}

function openEmbedModal(model) {
  const modal = $('embed-modal');
  const iframe = $('sketchfab-iframe');
  const uid = model.id || model.uid;
  if ($('embed-model-title')) $('embed-model-title').textContent = model.title;
  if ($('embed-creator')) $('embed-creator').textContent = `Creator: ${model.creator?.name || 'Sketchfab Author'}`;
  if ($('embed-license')) $('embed-license').textContent = model.license?.label || 'Sketchfab View';
  if ($('embed-sketchfab-link')) $('embed-sketchfab-link').href = `https://sketchfab.com/3d-models/${uid}`;
  if (iframe) iframe.src = `https://sketchfab.com/models/${uid}/embed?autostart=1&camera=0&preload=1&ui_controls=1&ui_infos=0&ui_watermark=0`;
  modal?.classList.remove('gone');
}

function closeEmbedModal() {
  const modal = $('embed-modal');
  const iframe = $('sketchfab-iframe');
  modal?.classList.add('gone');
  if (iframe) iframe.src = 'about:blank';
}

async function openAiModal(subjectTitle, context = {}) {
  const modal = $('ai-modal');
  modal?.classList.remove('gone');
  if ($('ai-subject-title')) $('ai-subject-title').textContent = subjectTitle;
  const contentEl = $('ai-body-content');
  if (contentEl) {
    contentEl.innerHTML = `
      <div class="ai-loading">
        <div class="holo-spinner"></div>
        <p style="margin-top:12px;">Synthesizing educational knowledge for <b>${escapeHtml(subjectTitle)}</b>…</p>
        <small style="color:var(--muted);margin-top:4px;display:block;">Analyzing structural mechanics, functions, and real-world applications</small>
      </div>
    `;
  }

  try {
    const aiData = await sketchfabProvider.getAIExplanation(subjectTitle, context);
    renderAiExplanation(aiData, subjectTitle);
  } catch (err) {
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="ai-section">
          <h4>Analysis Unavailable</h4>
          <p>${escapeHtml(err.message || 'Could not retrieve AI analysis.')}</p>
        </div>
      `;
    }
  }
}

function renderAiExplanation(data, title) {
  const contentEl = $('ai-body-content');
  if (!contentEl) return;
  const components = Array.isArray(data.components) ? data.components : [];
  const followUps = Array.isArray(data.followUpExplorations) ? data.followUpExplorations : [];

  contentEl.innerHTML = `
    <div class="ai-section">
      <h4>🔍 What is this & Purpose</h4>
      <p>${escapeHtml(data.overview || 'Exploration overview.')}</p>
      ${data.purpose ? `<p style="margin-top:6px;"><b>Primary Purpose:</b> ${escapeHtml(data.purpose)}</p>` : ''}
    </div>

    <div class="ai-section">
      <h4>⚙️ How It Works & Core Principles</h4>
      <p>${escapeHtml(data.howItWorks || 'Operational mechanics.')}</p>
    </div>

    ${components.length ? `
      <div class="ai-section">
        <h4>🧩 Key Components & Structure</h4>
        <div class="ai-components-list">
          ${components.map((c) => `
            <div class="ai-component-card">
              <b>${escapeHtml(c.name)}</b>
              <span>${escapeHtml(c.role || c.description || '')}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${data.practicalApplications ? `
      <div class="ai-section">
        <h4>🚀 Real-World Applications</h4>
        <p>${escapeHtml(data.practicalApplications)}</p>
      </div>
    ` : ''}

    ${followUps.length ? `
      <div class="ai-section">
        <h4>🔭 Recommended Next Explorations</h4>
        <div class="ai-followup-tags">
          ${followUps.map((term) => `
            <button class="ai-followup-btn" data-query="${escapeHtml(term)}">🔎 ${escapeHtml(term)}</button>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  contentEl.querySelectorAll('.ai-followup-btn').forEach((btn) => {
    btn.onclick = () => {
      $('ai-modal')?.classList.add('gone');
      openExplorer(btn.dataset.query);
    };
  });
}

// Wire explorer listeners
const btnOpenExplorer = $('btn-open-explorer');
if (btnOpenExplorer) btnOpenExplorer.onclick = () => openExplorer();

const tSearch = $('t-search');
if (tSearch) tSearch.onclick = () => openExplorer();

const btnCloseExplorer = $('btn-close-explorer');
if (btnCloseExplorer) btnCloseExplorer.onclick = closeExplorer;

const explorerBtn = $('explorer-btn');
if (explorerBtn) explorerBtn.onclick = () => executeSearch();

const explorerInput = $('explorer-input');
if (explorerInput) {
  explorerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeSearch();
  });
  explorerInput.addEventListener('input', () => {
    $('explorer-clear')?.classList.toggle('gone', !explorerInput.value);
  });
}

const explorerClear = $('explorer-clear');
if (explorerClear) {
  explorerClear.onclick = () => {
    if (explorerInput) {
      explorerInput.value = '';
      explorerClear.classList.add('gone');
      explorerInput.focus();
    }
  };
}

document.querySelectorAll('.sugg-chip').forEach((btn) => {
  btn.onclick = () => {
    const q = btn.dataset.q;
    if (explorerInput) explorerInput.value = q;
    executeSearch(q);
  };
});

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentSearchTab = btn.dataset.tab;
    if (currentSearchTab === 'favorites') {
      renderExplorerCards(modelSearchService.getFavorites());
    } else if (currentSearchTab === 'recent') {
      renderExplorerCards(modelSearchService.getRecentModels());
    } else {
      renderExplorerCards(currentSearchResults);
    }
  };
});

const explorerRetryBtn = $('explorer-retry-btn');
if (explorerRetryBtn) explorerRetryBtn.onclick = () => executeSearch(currentSearchQuery);

const btnCloseEmbed = $('btn-close-embed');
if (btnCloseEmbed) btnCloseEmbed.onclick = closeEmbedModal;

const btnCloseAi = $('btn-close-ai');
if (btnCloseAi) btnCloseAi.onclick = () => $('ai-modal')?.classList.add('gone');

const btnModelAi = $('btn-model-ai');
if (btnModelAi) {
  btnModelAi.onclick = () => openAiModal(currentModelMeta.name, {
    description: currentModelMeta.subtitle,
    category: currentModelMeta.category
  });
}

const pcAiBtn = $('pc-ai-btn');
if (pcAiBtn) {
  pcAiBtn.onclick = () => {
    const p = scene.parts[scene.sel >= 0 ? scene.sel : scene.hover];
    if (p) {
      openAiModal(`${p.name} · ${currentModelMeta.name}`, {
        description: p.desc,
        componentName: p.name,
        parentModel: currentModelMeta.name
      });
    }
  };
}

// Click backdrop to close
const explorerModal = $('explorer-modal');
if (explorerModal) {
  explorerModal.addEventListener('pointerdown', (e) => {
    if (e.target === explorerModal) closeExplorer();
  });
}

const embedModal = $('embed-modal');
if (embedModal) {
  embedModal.addEventListener('pointerdown', (e) => {
    if (e.target === embedModal) closeEmbedModal();
  });
}

const aiModal = $('ai-modal');
if (aiModal) {
  aiModal.addEventListener('pointerdown', (e) => {
    if (e.target === aiModal) aiModal.classList.add('gone');
  });
}
let camOn = false;
let lastVideoTime = -1;
let perc = { hands: [] };

const STORAGE_KEY_MODE = 'holohand_preferred_mode';

function stopCamera() {
  if (video.srcObject) {
    const tracks = video.srcObject.getTracks ? video.srcObject.getTracks() : [];
    tracks.forEach((track) => track.stop());
    video.srcObject = null;
  }
  camOn = false;
  latestHands = [];
  perc = { hands: [] };
  ui.feed = false;
  $('t-feed')?.classList.remove('on');
  document.body.classList.remove('feed');
}

async function startCamera(isAutoResume = false) {
  localStorage.setItem(STORAGE_KEY_MODE, 'camera');
  $('start').classList.add('gone');
  setTracking('Requesting camera…', 'warn');
  showBanner('');

  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    showBanner('Camera requires localhost or HTTPS. Open HoloHand at http://localhost:5174 or a secure HTTPS address.');
    setTracking('Camera unavailable', 'warn');
    openStartModal();
    return;
  }

  let stream;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    await new Promise((resolve, reject) => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        resolve();
        return;
      }

      const cleanup = () => {
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('error', onError);
      };

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('The webcam video stream could not be decoded.'));
      };

      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    await video.play();

    camOn = true;
    ui.feed = true;
    $('t-feed')?.classList.add('on');
    document.body.classList.add('feed');

    console.info('[Camera] Stream active:', {
      width: video.videoWidth,
      height: video.videoHeight
    });
  } catch (e) {
    stream?.getTracks().forEach(track => track.stop());

    video.srcObject = null;
    camOn = false;
    document.body.classList.remove('feed');

    console.error('[Camera] Initialization failed:', e);

    const messages = {
      NotAllowedError: 'Camera permission denied. Allow camera access in your browser settings.',
      NotFoundError: 'No webcam was found. Connect or enable a camera.',
      NotReadableError: 'The camera may be in use by another app. Close other camera apps and retry.',
      OverconstrainedError: 'The requested camera settings are unsupported.',
      AbortError: 'Camera startup was interrupted. Try again.',
      SecurityError: 'Camera access was blocked by browser security.'
    };

    showBanner(messages[e?.name] || `Camera error: ${e?.message || 'Unknown error'}`);
    setTracking('Camera error', 'warn');
    openStartModal();
    return;
  }

  setTracking('Loading hand model…', 'warn');

  try {
    await tracker.init();
    setTracking('Hands on', 'ok');
    showBanner('');

    if (!isAutoResume) toast('Hand tracking active');

    console.info('[Camera] Hand tracker initialized:', tracker.info);
  } catch (e) {
    console.error('[MediaPipe] Initialization failed:', e);
    setTracking('Camera on · Tracking unavailable', 'warn');
    showBanner('Camera works, but hand tracking failed to initialize. Check the MediaPipe model and WASM network requests.');
  }
}

function enterMouseMode(msg, remember = true) {
  if (remember) {
    localStorage.setItem(STORAGE_KEY_MODE, 'mouse');
  }
  if (camOn) {
    stopCamera();
  }
  setTracking('Mouse only', 'warn');
  if (msg) showBanner(msg + ' Mouse controls are on.', true);
}

function setTracking(text, cls) {
  trackingState = text;
  const el = $('s-track');
  if (el) {
    el.textContent = text;
    el.className = cls || '';
  }
}

function openStartModal() {
  $('start').classList.remove('gone');
}

function closeStartModal() {
  $('start').classList.add('gone');
  if (!camOn && trackingState === 'Off') {
    enterMouseMode('', true);
  }
}

$('btn-cam').onclick = () => {
  startCamera(false);
};

$('btn-mouse').onclick = () => {
  $('start').classList.add('gone');
  enterMouseMode('', true);
  toast('Mouse controls active');
};

const btnCloseStart = $('btn-close-start');
if (btnCloseStart) {
  btnCloseStart.onclick = closeStartModal;
}

const tMode = $('t-mode');
if (tMode) {
  tMode.onclick = () => {
    if ($('start').classList.contains('gone')) {
      openStartModal();
    } else {
      closeStartModal();
    }
  };
}

const sTrack = $('s-track');
if (sTrack) {
  sTrack.style.cursor = 'pointer';
  sTrack.title = 'Click to switch input mode (Camera / Mouse)';
  sTrack.onclick = openStartModal;
}

const startModal = $('start');
if (startModal) {
  startModal.addEventListener('pointerdown', (e) => {
    if (e.target === startModal) {
      closeStartModal();
    }
  });
}

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && startModal && !startModal.classList.contains('gone')) {
    closeStartModal();
  }
});

// Auto-restore saved mode on page load/refresh
const savedMode = localStorage.getItem(STORAGE_KEY_MODE);
if (savedMode === 'mouse') {
  $('start').classList.add('gone');
  enterMouseMode('', false);
} else if (savedMode === 'camera') {
  startCamera(true);
}

/** raw camera landmark -> viewport 0..1 (mirrored, matches object-fit: cover) */
function mapPoint(p) {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const s = Math.max(W / vw, H / vh);
  const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
  return { x: ((1 - p.x) * vw * s + ox) / W, y: (p.y * vh * s + oy) / H };
}

// ------------------------------------------------------------------ gesture -> action
let zoomRef = null;
let grab = null;
let lastHover = { i: -1, t: 0 };
let dwell = { i: -1, t: 0 };
let peaceCool = 0;
const prevPalm = new Map();
let activeKey = '';

function setActive(key) {
  if (key === activeKey) return;
  activeKey = key;
  document.querySelectorAll('#gest li').forEach((li) => li.classList.toggle('active', li.dataset.g === key));
}

function endGrab() {
  if (grab) scene.releaseAll();
  grab = null;
}

function control(t, dt) {
  const live = perc.hands.filter((h) => !h.held);
  $('s-hands').textContent = String(live.length);

  // two hands: distance between palms = zoom
  if (live.length >= 2) {
    const a = live[0].palm, b = live[1].palm;
    const dist = Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
    if (!zoomRef) zoomRef = { d0: Math.max(60, dist), s0: scene.scaleTarget };
    scene.scaleTarget = clamp((zoomRef.s0 * dist) / zoomRef.d0, 0.5, 2.6);
    scene.holdVel = true;
    scene.idle = 0;
    endGrab();
    scene.setHover(-1);
    prevPalm.clear();
    setActive('TWO');
    return;
  }
  zoomRef = null;

  const h = live[0];
  if (!h) {
    endGrab();
    scene.holdVel = draggingMouse;
    if (!draggingMouse) scene.setHover(-1);
    prevPalm.clear();
    setActive('');
    return;
  }

  scene.holdVel = true;
  scene.idle = 0;
  const g = h.gesture;
  const palmPx = { x: h.palm.x * W, y: h.palm.y * H };

  if (g === 'OPEN' || g === 'FIST' || g === 'NONE') {
    // openness drives the explosion
    if (scene.isSingleMesh) {
      scene.explodeTarget = 0;
    } else {
      scene.explodeTarget = g === 'FIST' ? 0 : clamp((h.openness - 0.12) / 0.78, 0, 1);
    }
    // moving the hand rotates the model
    const prev = prevPalm.get(h.id);
    if (prev) {
      const dx = palmPx.x - prev.x, dy = palmPx.y - prev.y;
      if (Math.hypot(dx, dy) > 1.2) scene.rotateBy(dx * 0.0075, dy * 0.0050, dt);
    }
    if (h.rollDelta) scene.rollBy(h.rollDelta * 1.1);
    scene.setHover(-1);
    setActive(g === 'NONE' ? 'MOVE' : g);
    if (g === 'OPEN' && prev && Math.hypot(palmPx.x - prev.x, palmPx.y - prev.y) > 6) setActive('MOVE');
  } else {
    if (g === 'POINT') {
      const idx = scene.pick(h.tip.x * W, h.tip.y * H, 95);
      scene.setHover(idx);
      if (idx >= 0) {
        lastHover = { i: idx, t };
        showPart(idx);
      }
      if (idx >= 0 && idx === dwell.i) {
        dwell.t += dt;
        if (dwell.t > 0.7 && scene.sel !== idx) scene.setSel(idx);
      } else dwell = { i: idx, t: 0 };
    } else if (g === 'PINCH') {
      const pp = { x: h.pinchPt.x * W, y: h.pinchPt.y * H };
      if (!grab) {
        let idx = scene.pick(pp.x, pp.y, 170);
        if (idx < 0 && t - lastHover.t < 0.9) idx = lastHover.i;
        if (idx >= 0) {
          grab = { part: idx, last: pp };
          scene.setSel(idx);
          scene.setHover(idx);
          showPart(idx);
        }
      } else {
        scene.dragPart(grab.part, pp.x - grab.last.x, pp.y - grab.last.y);
        grab.last = pp;
      }
    } else if (g === 'PEACE') {
      if (t > peaceCool) {
        peaceCool = t + 1.6;
        if (scene.isExternal && currentSearchResults.length > 1) {
          const down = currentSearchResults.filter((m) => m.isDownloadable);
          if (down.length > 1) {
            const curIdx = down.findIndex((m) => m.uid === currentModelMeta?.uid);
            const nextIdx = (curIdx + 1) % down.length;
            loadModelIntoHologram(down[nextIdx]);
          } else {
            scene.next();
          }
        } else {
          scene.next();
        }
      }
    }
    setActive(g);
  }
  if (g !== 'PINCH') endGrab();
  prevPalm.set(h.id, palmPx);
}

// ------------------------------------------------------------------ mouse + keyboard
let draggingMouse = false;
let mouseStart = null;
let mouseLast = null;
const onUi = (e) => e.target.closest && e.target.closest('#panel,#chips,#toolbar,#start,#explorer-modal,#embed-modal,#ai-modal,#asset-loader-overlay');

addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || onUi(e)) return;
  draggingMouse = true;
  mouseStart = mouseLast = { x: e.clientX, y: e.clientY };
});
addEventListener('pointermove', (e) => {
  if (!draggingMouse) return;
  scene.holdVel = true;
  scene.rotateBy((e.clientX - mouseLast.x) * 0.006, (e.clientY - mouseLast.y) * 0.004, 1 / 60);
  mouseLast = { x: e.clientX, y: e.clientY };
});
addEventListener('pointerup', (e) => {
  if (!draggingMouse) return;
  draggingMouse = false;
  scene.holdVel = false;
  if (Math.hypot(e.clientX - mouseStart.x, e.clientY - mouseStart.y) < 5) {
    const idx = scene.pick(e.clientX, e.clientY, 80);
    scene.setSel(idx === scene.sel ? -1 : idx);
    showPart(scene.sel);
  }
});
addEventListener('wheel', (e) => {
  if (onUi(e)) return;
  scene.zoomBy(Math.exp(-e.deltaY * 0.0012));
}, { passive: true });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeExplorer();
    closeEmbedModal();
    $('ai-modal')?.classList.add('gone');
    if (startModal && !startModal.classList.contains('gone')) {
      closeStartModal();
    }
    return;
  }
  if (e.target.tagName === 'INPUT' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.key === '/') {
    e.preventDefault();
    openExplorer();
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    if (scene.isSingleMesh) {
      toast('Single-mesh model: Exploded view disabled');
    } else {
      scene.explodeTarget = scene.explodeTarget > 0.5 ? 0 : 1;
    }
  } else if (e.key === 'ArrowRight') scene.next(1);
  else if (e.key === 'ArrowLeft') scene.next(-1);
  else if (e.key.toLowerCase() === 'r') scene.resetView();
  else if (e.key >= '1' && e.key <= String(MODELS.length)) scene.setModel(+e.key - 1);
});

// ------------------------------------------------------------------ overlay drawing
const ringR = new Map();

function drawHand(h) {
  const pts = h.lm.map((p) => ({ x: p.x * W, y: p.y * H }));
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(236, 232, 255, 0.78)';
  ctx.shadowColor = 'rgba(176, 164, 255, 0.95)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRing(h) {
  const pts = h.lm;
  const cx = h.palm.x * W, cy = h.palm.y * H;
  const g = h.gesture;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(242, 201, 76, 0.9)';
  ctx.shadowBlur = 14;
  if (g === 'POINT') {
    const x = h.tip.x * W, y = h.tip.y * H;
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (g === 'PINCH') {
    const x = h.pinchPt.x * W, y = h.pinchPt.y * H;
    ctx.strokeStyle = '#f2c94c';
    ctx.fillStyle = 'rgba(242, 201, 76, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const len = Math.hypot((pts[0].x - pts[12].x) * W, (pts[0].y - pts[12].y) * H);
    const target = len * 0.95 + 22;
    const r = (ringR.get(h.id) ?? target) * 0.85 + target * 0.15;
    ringR.set(h.id, r);
    ctx.strokeStyle = 'rgba(242, 201, 76, 0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // white arc = how far it is exploded
    const e = clamp(scene.explode, 0, 1);
    if (e > 0.01) {
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawZoom(a, b) {
  const x1 = a.palm.x * W, y1 = a.palm.y * H, x2 = b.palm.x * W, y2 = b.palm.y * H;
  ctx.save();
  ctx.strokeStyle = 'rgba(242, 201, 76, 0.85)';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(242, 201, 76, 0.8)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#fff';
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 6;
  ctx.fillText(`zoom ${scene.scale.toFixed(2)}x`, (x1 + x2) / 2, (y1 + y2) / 2 - 12);
  ctx.restore();
}

function drawLabels() {
  const e = clamp((scene.shownExplode - 0.1) / 0.3, 0, 1);
  if (e <= 0.01 || scene.uniforms.uScatter.value > 0.3) return;
  const pts = scene.labelPoints();
  const c = scene.centerScreen();
  const panelR = W > 900 ? 310 : 0;
  const left = [], right = [];
  for (const p of pts) (p.x < c.x ? left : right).push(p);
  const maxX = Math.max(...pts.map((p) => p.x), c.x);
  const minX = Math.min(...pts.map((p) => p.x), c.x);
  const colR = clamp(maxX + 80, panelR + 360, W - 170);
  const colL = clamp(minX - 80, panelR + 20, W - 400);
  ctx.save();
  ctx.globalAlpha = e;
  ctx.font = '500 12px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  const place = (list, colX, dir) => {
    list.sort((a, b) => a.y - b.y);
    const ys = list.map((p) => p.y);
    for (let i = 1; i < ys.length; i++) if (ys[i] < ys[i - 1] + 20) ys[i] = ys[i - 1] + 20;
    const over = ys.length ? ys[ys.length - 1] - (H - 90) : 0;
    if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] -= over;
    list.forEach((p, k) => {
      const hot = p.i === scene.hover || p.i === scene.sel;
      const ly = clamp(ys[k], 24, H - 24);
      ctx.strokeStyle = hot ? p.color : 'rgba(255,255,255,0.38)';
      ctx.lineWidth = hot ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(colX - dir * 16, ly);
      ctx.lineTo(colX, ly);
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, hot ? 4 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hot ? '#fff' : 'rgba(255,255,255,0.82)';
      ctx.font = `${hot ? 600 : 500} ${hot ? 13 : 12}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
      ctx.textAlign = dir > 0 ? 'left' : 'right';
      ctx.fillText(p.name, colX + dir * 6, ly);
    });
  };
  place(right, colR, 1);
  place(left, colL, -1);
  ctx.restore();
}

function drawOverlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (ui.labels) drawLabels();
  const live = perc.hands.filter((h) => !h.held);
  if (ui.skeleton) for (const h of live) drawHand(h);
  for (const h of live) drawRing(h);
  if (live.length >= 2) drawZoom(live[0], live[1]);
}

// ------------------------------------------------------------------ main loop
let lastT = performance.now() / 1000;
function frame(now) {
  const t = now / 1000;
  const dt = Math.min(0.05, Math.max(0.001, t - lastT));
  lastT = t;

  if (camOn && tracker.ready && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const hands = tracker.detect(video, now);
    latestHands = hands;

    perc = engine.update(
      hands,
      t,
      mapPoint,
      (video.videoWidth || 16) / (video.videoHeight || 9)
    );

    // KNN inference: override gesture labels when predictions are stable.
    for (const hand of perc.hands) {
      if (hand.held || datasetLoading) continue;

      const rawHand = hands.find((h) => h.label === hand.id)
        ?? (hands.length === 1 ? hands[0] : null);

      if (!rawHand) continue;

      const features = extractFeatures(rawHand.landmarks);
      if (!features) continue;

      const prediction = knn.predict(features);
      if (!prediction || prediction.score < 0.6) continue;

      let state = mlPredictionStates.get(hand.id);

      if (!state || state.label !== prediction.label) {
        state = { label: prediction.label, streak: 1 };
      } else {
        state.streak++;
      }

      mlPredictionStates.set(hand.id, state);

      // Require repeated predictions before switching gestures.
      if (state.streak >= 2) {
        hand.gesture = prediction.label;
      }
    }
  }
  control(t, dt);

  if (!draggingExplode) rExplode.value = Math.round(clamp(scene.explode, 0, 1) * 100);
  $('v-explode').textContent = Math.round(clamp(scene.explode, 0, 1) * 100) + '%';
  $('b-explode').textContent = scene.explodeTarget > 0.5 ? 'Assemble' : 'Explode';

  scene.update(dt, t);
  drawOverlay();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
