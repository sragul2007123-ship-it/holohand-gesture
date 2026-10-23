import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const PALETTE = [
  '#4fe3e0', // Neon Cyan
  '#f2c94c', // Cyber Gold
  '#ff6b9a', // Hot Pink
  '#8c7bff', // Electric Violet
  '#6ff0a8', // Mint Green
  '#ff9a3c', // Warm Amber
  '#38bdf8', // Sky Blue
  '#f43f5e', // Coral
  '#a855f7'  // Deep Purple
];

const TARGET_PARTICLE_BUDGET = 26000;
const FIT = 2.7;

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function cleanComponentName(name, index) {
  if (!name || typeof name !== 'string') return `Component ${index + 1}`;
  let clean = name
    .replace(/^Sketchfab_model_?/i, '')
    .replace(/^RootNode_?/i, '')
    .replace(/^Object_\d+_?/i, '')
    .replace(/[._-]+/g, ' ')
    .trim();

  // If name became empty or generic numbers
  if (!clean || /^\d+$/.test(clean)) {
    return `Component ${index + 1}`;
  }
  // Capitalize words
  return clean
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export class ModelLoaderService {
  constructor() {
    this.loader = new GLTFLoader();
  }

  /**
   * Load a GLTF/GLB asset from URL with progress reporting.
   *
   * @param {string} url - Asset endpoint URL
   * @param {Function} [onProgress] - (percent: number, loaded: number, total: number) => void
   * @returns {Promise<Object>} Processed HoloHand model entry with point-cloud geo, meshes, and parts metadata
   */
  async loadGLB(url, onProgress = null) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          try {
            const entry = this.processGltf(gltf);
            resolve(entry);
          } catch (err) {
            reject(new Error(`Failed to process 3D model geometry: ${err.message}`));
          }
        },
        (xhr) => {
          if (onProgress && xhr.total > 0) {
            const pct = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
            onProgress(pct, xhr.loaded, xhr.total);
          }
        },
        (error) => {
          reject(new Error(`GLTF loading network error: ${error?.message || 'Failed to download asset'}`));
        }
      );
    });
  }

  /**
   * Process a loaded GLTF scene graph into HoloHand-compatible geometry and components.
   */
  processGltf(gltf) {
    const root = gltf.scene || gltf.scenes[0];
    if (!root) throw new Error('GLTF contains no valid scene');

    // 1. Traverse and collect all renderable mesh nodes
    const meshes = [];
    root.updateMatrixWorld(true);

    root.traverse((child) => {
      if (child.isMesh && child.geometry) {
        meshes.push(child);
      }
    });

    if (meshes.length === 0) {
      throw new Error('3D model contains no renderable mesh geometry.');
    }

    // 2. Compute overall model bounding box & center
    const overallBox = new THREE.Box3();
    meshes.forEach((mesh) => {
      mesh.geometry.computeBoundingBox();
      const meshBox = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      overallBox.union(meshBox);
    });

    const center = new THREE.Vector3();
    overallBox.getCenter(center);

    const size = new THREE.Vector3();
    overallBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scaleFactor = (FIT * 1.8) / maxDim;

    // 3. Extract components / parts
    // Case A & B: Multiple meshes -> treat each distinct mesh as a selectable component
    // Case C: Single mesh -> single component with surface analysis
    const partsMeta = [];
    const isSingleMesh = meshes.length === 1;

    // Group meshes if there are too many (e.g. > 24) to keep within shader uniform MAXP=24
    const MAX_PARTS = 24;
    let groupedMeshes = [];

    if (meshes.length <= MAX_PARTS) {
      groupedMeshes = meshes.map((m, i) => ({
        name: cleanComponentName(m.name, i),
        meshes: [m],
        isVerifiedName: Boolean(m.name && !m.name.startsWith('Object_'))
      }));
    } else {
      // Chunk meshes spatially or by hierarchy into MAX_PARTS
      const step = Math.ceil(meshes.length / MAX_PARTS);
      for (let i = 0; i < meshes.length; i += step) {
        const chunk = meshes.slice(i, i + step);
        const firstName = chunk[0].name;
        groupedMeshes.push({
          name: cleanComponentName(firstName, Math.floor(i / step)),
          meshes: chunk,
          isVerifiedName: false
        });
      }
    }

    // Calculate vertex counts for adaptive sampling
    let totalModelVertices = 0;
    meshes.forEach((m) => {
      const posAttr = m.geometry.getAttribute('position');
      if (posAttr) totalModelVertices += posAttr.count;
    });

    const samplingRatio = Math.min(1.0, TARGET_PARTICLE_BUDGET / Math.max(1, totalModelVertices));
    let totalSampledPoints = 0;

    // First pass: determine exact sampled count
    const sampledCounts = groupedMeshes.map((part) => {
      let partVertCount = 0;
      part.meshes.forEach((m) => {
        const pos = m.geometry.getAttribute('position');
        if (pos) partVertCount += pos.count;
      });
      const count = Math.max(30, Math.round(partVertCount * samplingRatio));
      totalSampledPoints += count;
      return count;
    });

    // 4. Construct HoloHand Point-Cloud Buffer Arrays
    const posArray = new Float32Array(totalSampledPoints * 3);
    const dirArray = new Float32Array(totalSampledPoints * 3);
    const colArray = new Float32Array(totalSampledPoints * 3);
    const partArray = new Float32Array(totalSampledPoints);
    const randArray = new Float32Array(totalSampledPoints * 3);
    const seedArray = new Float32Array(totalSampledPoints);

    let pointOffset = 0;
    let maxExplodedRadius = 0;

    groupedMeshes.forEach((part, partIdx) => {
      const colorHex = PALETTE[partIdx % PALETTE.length];
      const rgb = hexRgb(colorHex);

      // Compute part centroid in centered & scaled space
      const partBox = new THREE.Box3();
      part.meshes.forEach((m) => {
        const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
        partBox.union(b);
      });

      const partCenter = new THREE.Vector3();
      partBox.getCenter(partCenter);

      // Centered & scaled part center
      const localPartCenter = partCenter.clone().sub(center).multiplyScalar(scaleFactor);

      // Radial explode vector outward from model center
      let explodeDir = localPartCenter.clone();
      if (explodeDir.lengthSq() < 0.05) {
        // If center component, give slight axial offset
        explodeDir.set(
          (Math.sin(partIdx * 1.5) * 0.4),
          (Math.cos(partIdx * 1.5) * 0.4),
          (Math.sin(partIdx * 2.3) * 0.4)
        );
      } else {
        explodeDir.normalize().multiplyScalar(0.75 + (partIdx % 4) * 0.18);
      }

      // If single mesh, no explosion offset (Case C)
      if (isSingleMesh) {
        explodeDir.set(0, 0, 0);
      }

      const anchors = [{
        a: [localPartCenter.x, localPartCenter.y, localPartCenter.z],
        d: [explodeDir.x, explodeDir.y, explodeDir.z]
      }];

      const samples = [];
      const targetCount = sampledCounts[partIdx];
      let partPointsWritten = 0;

      // Sample vertices from part meshes
      part.meshes.forEach((mesh) => {
        const posAttr = mesh.geometry.getAttribute('position');
        if (!posAttr) return;

        const count = posAttr.count;
        const matrixWorld = mesh.matrixWorld;
        const v = new THREE.Vector3();
        const stride = Math.max(1, Math.floor(count / (targetCount / part.meshes.length)));

        for (let i = 0; i < count && partPointsWritten < targetCount; i += stride) {
          v.fromBufferAttribute(posAttr, i);
          v.applyMatrix4(matrixWorld);

          // Center & scale
          v.sub(center).multiplyScalar(scaleFactor);

          const idx3 = pointOffset * 3;
          posArray[idx3] = v.x;
          posArray[idx3 + 1] = v.y;
          posArray[idx3 + 2] = v.z;

          dirArray[idx3] = explodeDir.x;
          dirArray[idx3 + 1] = explodeDir.y;
          dirArray[idx3 + 2] = explodeDir.z;

          // Hologram shimmer
          const br = 0.78 + 0.32 * Math.random();
          colArray[idx3] = rgb[0] * br;
          colArray[idx3 + 1] = rgb[1] * br;
          colArray[idx3 + 2] = rgb[2] * br;

          partArray[pointOffset] = partIdx;

          const rr = Math.random();
          const tt = Math.random() * Math.PI * 2;
          const uu = Math.random() * 2 - 1;
          const s = Math.sqrt(Math.max(0, 1 - uu * uu));
          randArray[idx3] = s * Math.cos(tt) * rr;
          randArray[idx3 + 1] = uu * rr;
          randArray[idx3 + 2] = s * Math.sin(tt) * rr;

          seedArray[pointOffset] = Math.random();

          const dist = Math.hypot(v.x + explodeDir.x, v.y + explodeDir.y, v.z + explodeDir.z);
          if (dist > maxExplodedRadius) maxExplodedRadius = dist;

          if (Math.random() < 0.05) {
            samples.push(v.x, v.y, v.z, explodeDir.x, explodeDir.y, explodeDir.z);
          }

          pointOffset++;
          partPointsWritten++;
        }
      });

      // Fill remainder if needed
      while (partPointsWritten < targetCount && pointOffset < totalSampledPoints) {
        const idx3 = pointOffset * 3;
        posArray[idx3] = localPartCenter.x + (Math.random() - 0.5) * 0.1;
        posArray[idx3 + 1] = localPartCenter.y + (Math.random() - 0.5) * 0.1;
        posArray[idx3 + 2] = localPartCenter.z + (Math.random() - 0.5) * 0.1;
        dirArray[idx3] = explodeDir.x;
        dirArray[idx3 + 1] = explodeDir.y;
        dirArray[idx3 + 2] = explodeDir.z;
        colArray[idx3] = rgb[0];
        colArray[idx3 + 1] = rgb[1];
        colArray[idx3 + 2] = rgb[2];
        partArray[pointOffset] = partIdx;
        randArray[idx3] = 0;
        randArray[idx3 + 1] = 0;
        randArray[idx3 + 2] = 0;
        seedArray[pointOffset] = Math.random();
        pointOffset++;
        partPointsWritten++;
      }

      partsMeta.push({
        name: part.name,
        desc: isSingleMesh
          ? 'Integrated single-mesh 3D surface structure.'
          : (part.isVerifiedName ? `Verified component: ${part.name}` : `Structural component node ${partIdx + 1}`),
        color: colorHex,
        anchors,
        samples: new Float32Array(samples)
      });
    });

    // 5. Build BufferGeometry
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dirArray, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colArray, 3));
    geo.setAttribute('aPart', new THREE.BufferAttribute(partArray, 1));
    geo.setAttribute('aRand', new THREE.BufferAttribute(randArray, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seedArray, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);

    // 6. Normalize mesh scene graph for solid view mode
    root.position.sub(center);
    root.scale.setScalar(scaleFactor);

    // Replace materials with cyber hologram styling
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        // Keep original material or apply clean semi-transparent holographic material
        if (child.material) {
          child.material.transparent = true;
          child.material.opacity = 0.88;
        }
      }
    });

    return {
      geo,
      meta: partsMeta,
      meshGroup: root,
      fit: FIT / Math.max(0.5, maxExplodedRadius),
      count: totalSampledPoints,
      isSingleMesh,
      meshCount: meshes.length,
      vertexCount: totalModelVertices
    };
  }

  /**
   * Free GPU memory and resources of a loaded model.
   */
  disposeModel(entry) {
    if (!entry) return;
    try {
      if (entry.geo) entry.geo.dispose();
      if (entry.meshGroup) {
        entry.meshGroup.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
    } catch (e) {
      console.warn('[ModelLoader] Resource disposal warning:', e);
    }
  }
}

export const modelLoaderService = new ModelLoaderService();
