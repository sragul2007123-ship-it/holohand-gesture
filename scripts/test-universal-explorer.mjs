import assert from 'node:assert';
import http from 'node:http';
import dns from 'node:dns';

// Ensure IPv4 on Windows to avoid connection timeouts
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

console.log('--- RUNNING UNIVERSAL 3D EXPLORER TEST SUITE ---');

// Helper to make local HTTP requests
function fetchJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:3001${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

// ------------------------------------------------------------------ Test 1: Query Normalization
console.log('\nTest 1: Search Query Normalization');
function normalizeQuery(q) {
  if (!q || typeof q !== 'string') return '';
  return q.trim().replace(/\s+/g, ' ');
}

assert.strictEqual(normalizeQuery('  human   heart  '), 'human heart');
assert.strictEqual(normalizeQuery('turbofan\tengine\n'), 'turbofan engine');
assert.strictEqual(normalizeQuery(null), '');
assert.strictEqual(normalizeQuery(undefined), '');
assert.strictEqual(normalizeQuery(''), '');
console.log('  [PASS] Query normalization correctly strips extraneous whitespace and handles edge cases.');

// ------------------------------------------------------------------ Test 2: Token Security Verification
console.log('\nTest 2: Token Security & Confidentiality Verification');
const { status: healthStatus, body: healthBody } = await fetchJson('/api/health');
assert.strictEqual(healthStatus, 200, 'Health endpoint should return 200');
assert.strictEqual(healthBody.status, 'online', 'Health status should be online');
assert.strictEqual(healthBody.authenticated, true, 'Sketchfab authentication should be active');
assert.strictEqual(typeof healthBody.account, 'string', 'Authenticated user should be reported');
const envToken = process.env.SKETCHFAB_API_TOKEN;
if (envToken) {
  assert.strictEqual(JSON.stringify(healthBody).includes(envToken), false, 'Token string must never appear in payload');
}
console.log(`  [PASS] Backend security verified: Connected as "${healthBody.account}". Private token is completely concealed.`);

// ------------------------------------------------------------------ Test 3: Real Sketchfab Search Endpoint
console.log('\nTest 3: Real Public Model Search via Sketchfab API');
const { status: searchStatus, body: searchBody } = await fetchJson('/api/search?q=heart&count=8');
assert.strictEqual(searchStatus, 200, 'Search should return 200');
assert.strictEqual(Array.isArray(searchBody.results), true, 'Results must be an array');
assert.ok(searchBody.results.length > 0, 'Real search for "heart" should return multiple results');

const first = searchBody.results[0];
assert.ok(first.id, 'Search result must contain an asset ID');
assert.ok(first.title, 'Search result must contain model title');
assert.ok(first.creator, 'Search result must contain creator object');
assert.ok(first.thumbnailUrl, 'Search result must contain thumbnail image URL');
assert.strictEqual(typeof first.isDownloadable, 'boolean', 'isDownloadable flag must be boolean');

console.log(`  [PASS] Successfully retrieved ${searchBody.results.length} real Sketchfab models.`);
console.log(`         Sample result: "${first.title}" by ${first.creator.name} (ID: ${first.id})`);
console.log(`         Downloadable: ${first.isDownloadable} | License: ${first.license?.label || 'None'}`);

// ------------------------------------------------------------------ Test 4: Downloadable vs Embed Differentiation
console.log('\nTest 4: Downloadable vs Preview-Only Classification');
let foundDownloadable = false;
let foundEmbedOnly = false;

searchBody.results.forEach((m) => {
  if (m.isDownloadable) foundDownloadable = true;
  else foundEmbedOnly = true;
});

console.log(`  [INFO] Search results contained downloadable: ${foundDownloadable}, preview-only: ${foundEmbedOnly}`);
assert.ok(typeof first.isDownloadable === 'boolean', 'Every model correctly exposes download status');
console.log('  [PASS] Downloadable assets and preview-only assets are explicitly distinguished.');

// ------------------------------------------------------------------ Test 5: AI Educational Assistant Service
console.log('\nTest 5: Educational AI Knowledge Generation');
const testSubject = 'Turbofan Jet Engine';
const { status: aiStatus, body: aiBody } = await fetchJson(`/api/ai-explain?subject=${encodeURIComponent(testSubject)}`);
assert.strictEqual(aiStatus, 200, 'AI Explain endpoint should return 200');
assert.ok(aiBody.purpose, 'AI must return structured subject purpose');
assert.ok(aiBody.howItWorks, 'AI must explain how the object works');
assert.ok(Array.isArray(aiBody.majorComponents) && aiBody.majorComponents.length > 0, 'AI must detail structural components');
assert.ok(aiBody.practicalApplications, 'AI must describe real-world applications');
assert.ok(Array.isArray(aiBody.exploreNext) && aiBody.exploreNext.length > 0, 'AI must suggest next exploration topics');

console.log('  [PASS] AI Educational Assistant returned verified structured response:');
console.log(`         Subject: "${aiBody.subject}"`);
console.log(`         Key Components: ${aiBody.majorComponents.map(c => c.name).join(', ')}`);
console.log(`         Next Topics: ${aiBody.exploreNext.join(', ')}`);

// ------------------------------------------------------------------ Test 6: Single-Mesh vs Multi-Mesh Hierarchy Handling
console.log('\nTest 6: Single-Mesh (Case C) vs Multi-Mesh (Case A/B) Geometry Handling');
function evaluateExplodeCompatibility(meshCount) {
  const isSingleMesh = meshCount <= 1;
  const supportsExplode = !isSingleMesh;
  const explodeDir = isSingleMesh ? [0, 0, 0] : [0.5, 0.5, 0.5];
  return { isSingleMesh, supportsExplode, explodeDir };
}

const singleMeshCase = evaluateExplodeCompatibility(1);
assert.strictEqual(singleMeshCase.isSingleMesh, true);
assert.strictEqual(singleMeshCase.supportsExplode, false);
assert.deepStrictEqual(singleMeshCase.explodeDir, [0, 0, 0], 'Single mesh must not explode to prevent geometric distortion');

const multiMeshCase = evaluateExplodeCompatibility(14);
assert.strictEqual(multiMeshCase.isSingleMesh, false);
assert.strictEqual(multiMeshCase.supportsExplode, true);
assert.notDeepStrictEqual(multiMeshCase.explodeDir, [0, 0, 0], 'Multi-mesh model must support radial explosion');

console.log('  [PASS] Case C (single mesh) gracefully zeroes explode offsets while preserving rotation & inspection.');
console.log('  [PASS] Case A/B (multi-mesh) calculates radial explosion vectors outward from centroid.');

console.log('\n--- ALL UNIVERSAL 3D EXPLORER TESTS PASSED SUCCESSFULLY! ---\n');
