import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { componentIdentificationService, cleanSemanticName, isSemanticName } from './componentIdentification.js';

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

export class ModelLoaderService {
  constructor() {
    this.loader = new GLTFLoader();
  }

  /**
   * Load a GLTF/GLB asset from URL with progress reporting.
   *
   * @param {string} url - Asset endpoint URL
   * @param {Function} [onProgress] - (percent: number, loaded: number, total: number) => void
   * @param {Object} [modelMeta] - Optional model metadata (title, creator, etc.)
   * @returns {Promise<Object>} Processed HoloHand model entry with point-cloud geo, meshes, and parts metadata
   */
  async loadGLB(url, onProgress = null, modelMeta = {}) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          try {
            const entry = this.processGltf(gltf, modelMeta);
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
   * Recursively inspects node hierarchy, extracts original metadata, and performs
   * layered semantic naming.
   *
   * @param {Object} gltf - Loaded GLTF scene container
   * @param {Object} [modelMeta] - Model metadata (title, category, tags, etc.)
   */
  processGltf(gltf, modelMeta = {}) {
    const root = gltf.scene || gltf.scenes[0];
    if (!root) throw new Error('GLTF contains no valid scene');

    // 1. Recursively traverse and collect all renderable mesh nodes with hierarchy & metadata
    const rawMeshEntries = [];
    root.updateMatrixWorld(true);

    function walkNode(node, parentPath) {
      const currentName = (node.name || '').trim();
      const nextPath = currentName ? [...parentPath, currentName] : parentPath;

      if (node.isMesh && node.geometry) {
        node.geometry.computeBoundingBox();
        const meshBox = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
        const centerV = new THREE.Vector3();
        meshBox.getCenter(centerV);
        const sizeV = new THREE.Vector3();
        meshBox.getSize(sizeV);

        rawMeshEntries.push({
          mesh: node,
          nodeName: node.name || '',
          meshName: (node.geometry && node.geometry.name) || '',
          parentPath: [...parentPath],
          extras: {
            ...(node.userData || {}),
            ...(node.geometry?.userData || {})
          },
          bounds: {
            center: [centerV.x, centerV.y, centerV.z],
            size: [sizeV.x, sizeV.y, sizeV.z],
            min: [meshBox.min.x, meshBox.min.y, meshBox.min.z],
            max: [meshBox.max.x, meshBox.max.y, meshBox.max.z]
          }
        });
      }

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          walkNode(child, nextPath);
        }
      }
    }

    walkNode(root, []);

    if (rawMeshEntries.length === 0) {
      throw new Error('3D model contains no renderable mesh geometry.');
    }

    // 2. Compute overall model bounding box & center
    const overallBox = new THREE.Box3();
    rawMeshEntries.forEach(({ mesh }) => {
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
    const partsMeta = [];
    const isSingleMesh = rawMeshEntries.length === 1;

    // Group meshes if there are too many (e.g. > 24) to keep within shader uniform MAXP=24
    const MAX_PARTS = 24;
    let groupedEntries = [];

    if (rawMeshEntries.length <= MAX_PARTS) {
      groupedEntries = rawMeshEntries.map((entry, i) => ({
        id: `part-${i}`,
        nodeName: entry.nodeName,
        meshName: entry.meshName,
        parentPath: entry.parentPath,
        extras: entry.extras,
        bounds: entry.bounds,
        meshes: [entry.mesh]
      }));
    } else {
      // Chunk meshes into MAX_PARTS while keeping primary parentPath and names
      const step = Math.ceil(rawMeshEntries.length / MAX_PARTS);
      for (let i = 0; i < rawMeshEntries.length; i += step) {
        const chunk = rawMeshEntries.slice(i, i + step);
        const first = chunk[0];
        groupedEntries.push({
          id: `part-${Math.floor(i / step)}`,
          nodeName: first.nodeName,
          meshName: first.meshName,
          parentPath: first.parentPath,
          extras: first.extras,
          bounds: first.bounds,
          meshes: chunk.map((c) => c.mesh)
        });
      }
    }

    // Run semantic identification across all grouped parts
    const classifiedComponents = componentIdentificationService.identifyComponents(
      groupedEntries,
      modelMeta
    );

    // If single mesh, adapt display name and description
    if (isSingleMesh && classifiedComponents.length > 0) {
      const comp0 = classifiedComponents[0];
      if (comp0.verificationStatus === 'unverified') {
        comp0.displayName = `${modelMeta.title || modelMeta.name || 'Model'} (Integrated Mesh)`;
        comp0.verificationStatus = 'verified';
        comp0.nameSource = 'metadata';
        comp0.confidence = 1.0;
        comp0.description = 'Single integrated 3D mesh structure. Exploded views are disabled; use rotation and zoom for surface inspection.';
      }
    }

    // Calculate vertex counts for adaptive sampling
    let totalModelVertices = 0;
    rawMeshEntries.forEach(({ mesh }) => {
      const posAttr = mesh.geometry.getAttribute('position');
      if (posAttr) totalModelVertices += posAttr.count;
    });

    const samplingRatio = Math.min(1.0, TARGET_PARTICLE_BUDGET / Math.max(1, totalModelVertices));
    let totalSampledPoints = 0;

    // First pass: determine exact sampled count
    const sampledCounts = groupedEntries.map((part) => {
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

    groupedEntries.forEach((part, partIdx) => {
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

      const compInfo = classifiedComponents[partIdx] || {
        id: `part-${partIdx}`,
        displayName: `Unnamed part ${partIdx + 1}`,
        sourceName: `node_${partIdx}`,
        nodeName: `node_${partIdx}`,
        meshName: '',
        suggestedName: null,
        nameSource: 'fallback',
        confidence: 0.1,
        verificationStatus: 'unverified',
        description: 'Structural component node',
        role: 'Structural component',
        parentPath: [],
        bounds: null,
        extras: {}
      };

      partsMeta.push({
        id: compInfo.id,
        name: compInfo.displayName, // backward compatibility
        displayName: compInfo.displayName,
        sourceName: compInfo.sourceName,
        nodeName: compInfo.nodeName,
        meshName: compInfo.meshName,
        suggestedName: compInfo.suggestedName,
        nameSource: compInfo.nameSource,
        confidence: compInfo.confidence,
        verificationStatus: compInfo.verificationStatus,
        desc: compInfo.description || compInfo.role,
        role: compInfo.role || compInfo.description,
        parentPath: compInfo.parentPath,
        bounds: compInfo.bounds,
        extras: compInfo.extras,
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
      meshCount: rawMeshEntries.length,
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
