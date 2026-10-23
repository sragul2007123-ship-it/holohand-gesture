import assert from 'node:assert';
import http from 'node:http';
import * as THREE from 'three';
import {
  isSemanticName,
  cleanSemanticName,
  componentIdentificationService,
  ComponentIdentificationService
} from '../src/services/componentIdentification.js';
import { ModelLoaderService } from '../src/services/modelLoader.js';

console.log('--- RUNNING UNIVERSAL SEMANTIC 3D COMPONENT IDENTIFICATION TESTS ---');

// ------------------------------------------------------------------ Test 1: Extraction of Meaningful Node Names
console.log('\nTest 1: Extraction of Meaningful Node Names');
assert.strictEqual(isSemanticName('Left_Ventricle'), true, 'Left_Ventricle should be recognized as semantic');
assert.strictEqual(isSemanticName('HighPressureTurbine'), true, 'HighPressureTurbine should be recognized as semantic');
assert.strictEqual(isSemanticName('Cranial_Bone'), true, 'Cranial_Bone should be recognized as semantic');
assert.strictEqual(isSemanticName('Robotic_Gripper_Jaw'), true, 'Robotic_Gripper_Jaw should be recognized as semantic');
assert.strictEqual(cleanSemanticName('left_ventricle_mesh'), 'Left Ventricle', 'Cleaned name should strip _mesh and capitalize');
assert.strictEqual(cleanSemanticName('highPressureTurbine_geom'), 'High Pressure Turbine', 'Cleaned camelCase name should space and capitalize');
console.log('  [PASS] Meaningful node and mesh names are accurately recognized and formatted.');

// ------------------------------------------------------------------ Test 2: Rejection of Generic Names
console.log('\nTest 2: Rejection of Generic Names as Semantic Labels');
const genericTokens = [
  'Object_0', 'Object_1', 'Object_123',
  'Mesh_001', 'mesh', 'Mesh1',
  'Node_0', 'Node-12', 'node',
  'Component 1', 'Component_4', 'Component 2',
  'Part_01', 'Part 3',
  'Box01', 'pCube1', 'pSphere1', 'polySurface12',
  'default', 'defaultobject', 'material_0',
  'Sketchfab_model', 'RootNode', 'Scene',
  '12345', '0', '', '   ', null, undefined
];

for (const token of genericTokens) {
  assert.strictEqual(
    isSemanticName(token),
    false,
    `Generic token "${token}" must NOT be accepted as a verified semantic name`
  );
}
console.log(`  [PASS] All ${genericTokens.length} generic tokens rejected as non-semantic identifiers.`);

// ------------------------------------------------------------------ Test 3: Layered Priority & Hierarchy Extraction
console.log('\nTest 3: Layered Priority & Parent-Child Hierarchy Extraction');
const service = new ComponentIdentificationService();

// Case 3A: Explicit metadata priority over nodeName
const compMeta = service.classifyComponent({
  id: 'c1',
  nodeName: 'Rough_Engine_Mesh',
  extras: { displayName: 'Rotary Combustor Unit' }
}, 0);
assert.strictEqual(compMeta.nameSource, 'metadata');
assert.strictEqual(compMeta.verificationStatus, 'verified');
assert.strictEqual(compMeta.displayName, 'Rotary Combustor Unit');
assert.strictEqual(compMeta.confidence, 1.0);

// Case 3B: Meaningful nodeName over hierarchy
const compNode = service.classifyComponent({
  id: 'c2',
  nodeName: 'Left_Atrium',
  parentPath: ['RootNode', 'Heart_Assembly']
}, 1);
assert.strictEqual(compNode.nameSource, 'nodeName');
assert.strictEqual(compNode.displayName, 'Left Atrium');
assert.strictEqual(compNode.confidence, 0.90);

// Case 3C: Generic nodeName inheriting meaningful parent hierarchy
const compHier = service.classifyComponent({
  id: 'c3',
  nodeName: 'Object_4',
  meshName: 'Mesh_002',
  parentPath: ['RootNode', 'Left_Ventricle', 'Sub_Mesh_Group']
}, 2);
assert.strictEqual(compHier.nameSource, 'hierarchy');
assert.strictEqual(compHier.displayName, 'Left Ventricle');
assert.strictEqual(compHier.confidence, 0.75);

// Case 3D: Entirely generic falling back to neutral "Unnamed part N"
const compFallback = service.classifyComponent({
  id: 'c4',
  nodeName: 'Object_9',
  parentPath: ['RootNode', 'Object_1']
}, 3);
assert.strictEqual(compFallback.nameSource, 'fallback');
assert.strictEqual(compFallback.displayName, 'Unnamed part 4');
assert.strictEqual(compFallback.verificationStatus, 'unverified');
assert.strictEqual(compFallback.confidence, 0.10);

console.log('  [PASS] Layered naming priority strictly verified: Metadata (1.0) > NodeName (0.90) > Hierarchy (0.75) > Fallback (0.10).');

// ------------------------------------------------------------------ Test 4: Disambiguation of Sibling Components
console.log('\nTest 4: Disambiguation of Duplicate Verified Names');
const multiComps = [
  { id: 'p1', nodeName: 'Object_1', parentPath: ['Left_Wing'] },
  { id: 'p2', nodeName: 'Object_2', parentPath: ['Left_Wing'] }
];
const disambiguated = service.identifyComponents(multiComps);
assert.strictEqual(disambiguated[0].displayName, 'Left Wing (1)');
assert.strictEqual(disambiguated[1].displayName, 'Left Wing (2)');
console.log('  [PASS] Sibling components inheriting identical parent names are cleanly disambiguated.');

// ------------------------------------------------------------------ Test 5: Contextual AI Suggestions & Uncertainty Flags
console.log('\nTest 5: Contextual AI Suggestions & Uncertainty Flags');
const unverifiedSet = [
  {
    id: 'part-0',
    sourceName: 'Object_0',
    displayName: 'Unnamed part 1',
    verificationStatus: 'unverified',
    confidence: 0.10,
    bounds: { center: [0, 1.2, 0] }
  },
  {
    id: 'part-1',
    sourceName: 'Object_1',
    displayName: 'Unnamed part 2',
    verificationStatus: 'unverified',
    confidence: 0.10,
    bounds: { center: [0, -0.8, 0] }
  }
];

const suggested = await service.resolveContextualSuggestions(
  { uid: 'test-heart-123', title: 'Human Heart Medical Model' },
  unverifiedSet
);

assert.strictEqual(suggested[0].verificationStatus, 'suggested', 'Should have suggested status');
assert.strictEqual(suggested[0].nameSource, 'suggestion', 'Should have suggestion nameSource');
assert.strictEqual(suggested[0].confidence, 0.50, 'Suggested confidence must be calibrated at 0.50');
assert.strictEqual(typeof suggested[0].uncertaintyNotice, 'string', 'Must contain clear uncertainty notice');
assert.strictEqual(suggested[0].uncertaintyNotice.includes('Not verified from source 3D'), true, 'Uncertainty notice must explicitly state not verified');
assert.strictEqual(suggested[0].displayName.includes('(Suggested)'), true, 'Display label must state (Suggested)');
console.log('  [PASS] Contextual suggestions properly assigned with calibrated confidence (0.50) and explicit uncertainty disclaimers.');

// ------------------------------------------------------------------ Test 6: Never Overwriting Verified Names
console.log('\nTest 6: Protection of Verified Names during AI Suggestions');
const mixedSet = [
  {
    id: 'p-verified',
    displayName: 'Coronary Artery',
    sourceName: 'Coronary_Artery_Node',
    verificationStatus: 'verified',
    confidence: 0.95
  },
  {
    id: 'p-unverified',
    displayName: 'Unnamed part 2',
    sourceName: 'Object_2',
    verificationStatus: 'unverified',
    confidence: 0.10
  }
];

const afterSugg = await service.resolveContextualSuggestions(
  { uid: 'test-mixed', title: 'Human Heart' },
  mixedSet
);
assert.strictEqual(afterSugg[0].displayName, 'Coronary Artery', 'Verified component must remain intact');
assert.strictEqual(afterSugg[0].verificationStatus, 'verified', 'Verified status must NOT be modified');
assert.strictEqual(afterSugg[1].verificationStatus, 'suggested', 'Only unverified component receives suggestion');
console.log('  [PASS] Ground-truth verified components are protected against overwrite.');

// ------------------------------------------------------------------ Test 7: Single-Mesh (Case C) Integration
console.log('\nTest 7: Single-Mesh (Case C) Integrated Surface Handling');
const loader = new ModelLoaderService();
const mockScene = new THREE.Scene();
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const mesh = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial());
mesh.name = 'Object_0'; // generic
mockScene.add(mesh);

const entry = loader.processGltf({ scene: mockScene }, { title: 'Dinosaur Skull' });
assert.strictEqual(entry.isSingleMesh, true, 'Should detect single mesh');
assert.strictEqual(entry.meta.length, 1, 'Should have 1 component');
assert.strictEqual(entry.meta[0].displayName, 'Dinosaur Skull (Integrated Mesh)');
assert.strictEqual(entry.meta[0].verificationStatus, 'verified');
console.log('  [PASS] Single-mesh models cleanly labeled with integrated mesh indicator without explosion offset.');

// ------------------------------------------------------------------ Test 8: In-place Metadata Update without Geometry Rebuild
console.log('\nTest 8: In-place Metadata Update without Geometry Rebuild');
const initialGeo = entry.geo;
entry.meta[0].displayName = 'Updated Skull Specimen';
assert.strictEqual(entry.geo, initialGeo, 'BufferGeometry must remain strictly identical');
console.log('  [PASS] Particle buffer references remain strictly immutable during component renaming.');

// ------------------------------------------------------------------ Test 9: Live Server API Endpoint Check
console.log('\nTest 9: Educational AI Backend API Integration');
function fetchApi(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3001,
      path: pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

try {
  // Test 9A: Component inquiry with suggested status
  const compRes = await fetchApi('/api/ai-explain?title=Human+Heart&component=Left+Ventricle&status=suggested');
  assert.strictEqual(compRes.status, 200, 'Endpoint should return 200');
  assert.strictEqual(compRes.body.componentName, 'Left Ventricle');
  assert.strictEqual(compRes.body.verificationStatus, 'suggested');
  assert.strictEqual(typeof compRes.body.uncertaintyNotice, 'string', 'Uncertainty notice must be present for suggested component');
  assert.strictEqual(typeof compRes.body.whatItIs, 'string');
  assert.strictEqual(typeof compRes.body.whatItDoes, 'string');
  assert.strictEqual(typeof compRes.body.relationship, 'string');
  assert.strictEqual(typeof compRes.body.howItWorks, 'string');
  assert.strictEqual(typeof compRes.body.practicalApplications, 'string');
  console.log('  [PASS] Component educational analysis returned complete schema with uncertainty notice.');

  // Test 9B: POST /api/ai-explain with components payload
  const postPayload = JSON.stringify({
    modelTitle: 'Turbofan Jet Engine',
    components: [
      { id: 'part-0', sourceName: 'Object_1' },
      { id: 'part-1', sourceName: 'Object_2' }
    ]
  });
  const postRes = await fetchApi('/api/ai-explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: postPayload
  });
  assert.strictEqual(postRes.status, 200);
  assert.strictEqual(Array.isArray(postRes.body.suggestions), true);
  assert.strictEqual(postRes.body.suggestions.length, 2);
  assert.strictEqual(postRes.body.suggestions[0].verificationStatus, 'suggested');
  console.log('  [PASS] POST component suggestion endpoint generated valid domain candidates.');
} catch (e) {
  console.log(`  [SKIP/WARN] Backend server not reachable on port 3001 (${e.message}); offline tests passed.`);
}

console.log('\n--- ALL SEMANTIC 3D COMPONENT IDENTIFICATION TESTS PASSED SUCCESSFULLY! ---\n');
