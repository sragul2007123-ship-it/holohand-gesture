import http from 'node:http';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Force IPv4 first on Node.js to prevent IPv6 timeout issues on Windows
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore in older environments
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Simple .env parser without external dependencies
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch (err) {
      console.warn('[Server] Note: Could not read .env file:', err.message);
    }
  }
}

loadEnv();

const PORT = parseInt(process.env.PORT || '3001', 10);
const SKETCHFAB_API_TOKEN = (process.env.SKETCHFAB_API_TOKEN || '').trim();

function getAuthHeaders() {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'HoloHand-Universal-Explorer/1.0'
  };
  if (SKETCHFAB_API_TOKEN) {
    headers['Authorization'] = `Token ${SKETCHFAB_API_TOKEN}`;
  }
  return headers;
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendError(res, statusCode, message, details = null) {
  sendJson(res, statusCode, {
    error: true,
    message,
    details: details ? String(details) : undefined,
    timestamp: new Date().toISOString()
  });
}

// Educational AI knowledge engine for science, engineering, anatomy & nature
function getEducationalKnowledge(query, component = '', title = '', desc = '') {
  const q = (query + ' ' + title + ' ' + desc).toLowerCase();
  const c = component.toLowerCase();

  // Knowledge base mappings
  if (q.includes('heart') || q.includes('cardio') || q.includes('ventricle') || q.includes('aorta')) {
    return {
      subject: 'Human Heart Anatomy',
      category: 'Biological Anatomy',
      purpose: 'The central muscular pump of the circulatory system, circulating oxygenated blood to tissues and deoxygenated blood to the lungs.',
      howItWorks: 'A four-chambered dual-pump system operating in synchronized cardiac cycles. The right side receives systemic venous blood and sends it to the pulmonary circuit; the left side receives pulmonary venous blood and pumps it into systemic circulation under higher pressure.',
      majorComponents: [
        { name: 'Right Atrium', role: 'Receives deoxygenated blood returning from the superior and inferior vena cava.' },
        { name: 'Right Ventricle', role: 'Pumps venous blood into the pulmonary artery toward pulmonary capillaries for gas exchange.' },
        { name: 'Left Atrium', role: 'Receives oxygen-rich blood from the pulmonary veins.' },
        { name: 'Left Ventricle', role: 'Thick muscular chamber pumping oxygenated blood at high pressure into the aorta.' },
        { name: 'Aorta & Coronary Arteries', role: 'Main systemic arterial trunk and primary vessels supplying myocardium.' },
        { name: 'Valves (Tricuspid, Mitral, Aortic, Pulmonary)', role: 'Ensure strictly unidirectional laminar blood flow without regurgitation.' }
      ],
      componentFocus: component ? `Selected component "${component}": Key anatomical feature contributing to structural integrity or hemodynamic flow.` : null,
      practicalApplications: 'Cardiology, cardiac surgery, hemodynamic simulation, artificial mechanical hearts (e.g. Syncardia), and biocompatible valve replacements.',
      exploreNext: ['Cardiac conduction system (SA/AV nodes)', 'Pulmonary circulation & gas exchange', 'Coronary artery disease & stenting', 'Echocardiography 3D doppler imaging']
    };
  }

  if (q.includes('engine') || q.includes('turbofan') || q.includes('turbine') || q.includes('jet')) {
    return {
      subject: 'Turbofan Aircraft Engine',
      category: 'Aerospace Propulsion',
      purpose: 'Generates thrust to propel commercial and military aircraft via the Brayton thermodynamic cycle coupled with high-bypass airflow.',
      howItWorks: 'Air is ingested by the front fan. A portion enters the core for compression, fuel combustion, and turbine expansion; the larger bypass flow produces the majority of sub-supersonic thrust with high propulsive efficiency.',
      majorComponents: [
        { name: 'Front Fan', role: 'Accelerates massive mass flow of bypass air around the core engine.' },
        { name: 'Low/High Pressure Compressors', role: 'Sequentially pressurizes intake air through intermeshing rotor and stator stages.' },
        { name: 'Combustion Chamber', role: 'Injects atomized jet fuel (Jet-A) into compressed air for sustained high-energy combustion.' },
        { name: 'High/Low Pressure Turbines', role: 'Extracts kinetic enthalpy from exhaust gas to drive the compressor and fan shafts.' },
        { name: 'Exhaust Nozzle', role: 'Accelerates remaining hot gas to ambient velocity producing reactionary thrust.' }
      ],
      componentFocus: component ? `Selected component "${component}": Critical mechanical module subjected to extreme thermal and rotational loads.` : null,
      practicalApplications: 'Commercial aviation (CFM LEAP, GE9X, Rolls-Royce Trent), industrial power generation gas turbines, and supersonic military propulsion.',
      exploreNext: ['Turbine blade single-crystal superalloys & ceramic thermal barrier coatings', 'Variable stator vanes & bleed valve control', 'Afterburning turbofans', 'Geared turbofan architecture']
    };
  }

  if (q.includes('robot') || q.includes('arm') || q.includes('manipulator') || q.includes('actuator')) {
    return {
      subject: 'Articulated Robotic Arm',
      category: 'Robotics & Mechatronics',
      purpose: 'Multi-degree-of-freedom robotic manipulator designed for precise, repeatable spatial positioning and kinematic manipulation in manufacturing and research.',
      howItWorks: 'Actuators (brushless DC servo motors with harmonic drive gearboxes) rotate joints. Forward and inverse kinematics algorithms compute joint angles required for the end-effector to follow planned Cartesian trajectories.',
      majorComponents: [
        { name: 'Base Pedestal', role: 'Rigid mechanical foundation containing power distribution and primary azimuth joint.' },
        { name: 'Shoulder & Elbow Joints', role: 'Primary kinematic links delivering large-amplitude planar and spatial reach.' },
        { name: 'Spherical Wrist (Pitch/Yaw/Roll)', role: 'Provides 3 rotational degrees of freedom for accurate tool orientation.' },
        { name: 'End Effector / Gripper', role: 'Interchangeable payload interface (vacuum cups, parallel jaws, welding torch).' },
        { name: 'Feedback Encoders', role: 'High-resolution optical/magnetic encoders reporting real-time angular positions to motion controllers.' }
      ],
      componentFocus: component ? `Selected component "${component}": Structural link or joint assembly in kinematic chain.` : null,
      practicalApplications: 'Automotive assembly lines, semiconductor wafer handling, robotic surgical systems (e.g. da Vinci), and space station manipulators (Canadarm2).',
      exploreNext: ['Inverse kinematics & Jacobian motion planning', 'Impedance & force-feedback control', 'Harmonic drive strain-wave gearing', 'Computer vision visual servoing']
    };
  }

  if (q.includes('dinosaur') || q.includes('fossil') || q.includes('t-rex') || q.includes('skeleton')) {
    return {
      subject: title || 'Prehistoric Vertebrate Paleontology',
      category: 'Paleontology & Evolutionary Biology',
      purpose: 'Fossilized anatomical skeletal architecture illustrating biomechanics, functional morphology, and evolutionary adaptations of extinct archosaurs.',
      howItWorks: 'Endoskeleton composed of mineralized calcium phosphate bones configured to support heavy bipedal or quadrupedal locomotion, distribute bite forces, and house respiratory air sacs analogous to modern avian systems.',
      majorComponents: [
        { name: 'Cranium & Mandible', role: 'Reinforced skull architecture with fenestrae reducing weight while anchoring massive jaw adductor muscles.' },
        { name: 'Vertebral Column', role: 'Articulated cervical, dorsal, sacral, and caudal vertebrae providing axial tensile strength.' },
        { name: 'Pelvic Girdle (Ilium, Ischium, Pubis)', role: 'Anchor point for robust hindlimb extensor muscles responsible for locomotion.' },
        { name: 'Appendicular Limbs', role: 'Digitigrade limb bones designed for weight-bearing efficiency.' }
      ],
      componentFocus: component ? `Selected element "${component}": Skeletal structure providing mechanical support or functional articulation.` : null,
      practicalApplications: 'Evolutionary biology, biomechanical finite element analysis (FEA), comparative vertebrate anatomy, and museum science.',
      exploreNext: ['Pneumatized bones and dinosaur respiratory dynamics', 'Theropod-avian evolutionary transition', 'Bite-force biomechanics', 'Fossil photogrammetry & 3D digital preservation']
    };
  }

  // Generic fallback with verified metadata
  return {
    subject: title || query,
    category: 'Universal 3D Asset',
    purpose: desc || `3D model representation of ${title || query} for interactive spatial exploration, structural inspection, and educational analysis.`,
    howItWorks: 'Modeled with polygon geometry and surface textures, structured to represent real-world physical boundaries, volumetric scale, and mechanical or biological assemblies.',
    majorComponents: component
      ? [{ name: component, role: 'Selected component under inspection.' }]
      : [{ name: 'Complete 3D Assembly', role: 'Integrated volumetric geometry.' }],
    componentFocus: component ? `Focused component: ${component}` : null,
    practicalApplications: 'Interactive 3D education, scientific simulation, virtual training, industrial design visualization, and digital archiving.',
    exploreNext: ['Related engineering and scientific references', 'Component hierarchy & exploded visualization', 'Material properties and geometric scale']
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  try {
    // 1. Health check & credentials verification
    if (pathname === '/api/health') {
      let isVerified = false;
      let accountName = null;

      if (SKETCHFAB_API_TOKEN) {
        try {
          const checkRes = await fetch('https://api.sketchfab.com/v3/me', {
            headers: getAuthHeaders(),
            signal: AbortSignal.timeout(8000)
          });
          if (checkRes.ok) {
            const userData = await checkRes.json();
            isVerified = true;
            accountName = userData.username || userData.displayName;
          }
        } catch (e) {
          console.warn('[Server] Sketchfab /me verification warning:', e.message);
        }
      }

      sendJson(res, 200, {
        status: 'online',
        provider: 'Sketchfab Data API v3',
        authenticated: isVerified,
        account: accountName,
        hasToken: Boolean(SKETCHFAB_API_TOKEN),
        serverTime: new Date().toISOString()
      });
      return;
    }

    // 2. Search endpoint
    if (pathname === '/api/search') {
      const q = (parsedUrl.searchParams.get('q') || '').trim();
      const downloadable = parsedUrl.searchParams.get('downloadable');
      const sortBy = parsedUrl.searchParams.get('sort_by') || '-likeCount';
      const cursor = parsedUrl.searchParams.get('cursor');
      const count = Math.min(parseInt(parsedUrl.searchParams.get('count') || '24', 10), 48);

      if (!q) {
        sendJson(res, 200, {
          query: '',
          results: [],
          total: 0,
          next: null,
          previous: null
        });
        return;
      }

      // Build Sketchfab search URL
      const sfUrl = new URL('https://api.sketchfab.com/v3/search');
      sfUrl.searchParams.set('type', 'models');
      sfUrl.searchParams.set('q', q);
      sfUrl.searchParams.set('sort_by', sortBy);
      sfUrl.searchParams.set('count', String(count));

      if (downloadable === 'true') {
        sfUrl.searchParams.set('downloadable', 'true');
      } else if (downloadable === 'false') {
        sfUrl.searchParams.set('downloadable', 'false');
      }

      if (cursor) {
        sfUrl.searchParams.set('cursor', cursor);
      }

      const sfRes = await fetch(sfUrl.toString(), {
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(15000)
      });

      if (!sfRes.ok) {
        const errText = await sfRes.text();
        console.error(`[Server] Sketchfab search returned status ${sfRes.status}:`, errText);
        sendError(res, sfRes.status, `Sketchfab API error: ${sfRes.statusText}`, errText);
        return;
      }

      const sfData = await sfRes.json();
      const rawResults = Array.isArray(sfData.results) ? sfData.results : [];

      // Normalize into standardized HoloHand provider asset format
      const normalizedResults = rawResults.map((m) => {
        // Find best thumbnail image (around 400-800px width)
        const images = m.thumbnails?.images || [];
        const sortedImages = [...images].sort((a, b) => (b.width || 0) - (a.width || 0));
        const bestThumb = sortedImages.find((img) => img.width <= 720) || sortedImages[0];

        return {
          id: m.uid,
          provider: 'sketchfab',
          title: m.name || 'Untitled 3D Asset',
          description: m.description || '',
          creator: {
            name: m.user?.displayName || m.user?.username || 'Unknown Creator',
            username: m.user?.username,
            profileUrl: m.user?.profileUrl || (m.user?.username ? `https://sketchfab.com/${m.user.username}` : null),
            avatarUrl: m.user?.avatar?.images?.[0]?.url || null
          },
          license: {
            label: m.license?.label || 'All Rights Reserved',
            code: m.license?.slug || null,
            attributionRequired: m.license?.requirements?.attribution ?? true,
            commercialUse: m.license?.requirements?.commercial ?? false
          },
          isDownloadable: Boolean(m.isDownloadable),
          thumbnailUrl: bestThumb?.url || null,
          embedUrl: `https://sketchfab.com/models/${m.uid}/embed?autostart=1&internal=1&ui_infos=0&ui_controls=1&ui_watermark=1`,
          webUrl: m.viewerUrl || `https://sketchfab.com/3d-models/${m.slug || m.uid}`,
          stats: {
            likes: m.likeCount || 0,
            views: m.viewCount || 0,
            faces: m.faceCount || 0,
            vertices: m.vertexCount || 0
          },
          createdAt: m.createdAt,
          publishedAt: m.publishedAt
        };
      });

      sendJson(res, 200, {
        query: q,
        results: normalizedResults,
        total: normalizedResults.length,
        next: sfData.next || null,
        previous: sfData.previous || null,
        provider: 'sketchfab'
      });
      return;
    }

    // 3. Model metadata endpoint
    const modelMatch = pathname.match(/^\/api\/models\/([a-zA-Z0-9]+)$/);
    if (modelMatch) {
      const uid = modelMatch[1];
      const sfRes = await fetch(`https://api.sketchfab.com/v3/models/${uid}`, {
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(10000)
      });

      if (!sfRes.ok) {
        sendError(res, sfRes.status, `Failed to retrieve model ${uid}: ${sfRes.statusText}`);
        return;
      }

      const m = await sfRes.json();
      const images = m.thumbnails?.images || [];
      const bestThumb = images.sort((a, b) => b.width - a.width).find((img) => img.width <= 720) || images[0];

      sendJson(res, 200, {
        id: m.uid,
        provider: 'sketchfab',
        title: m.name,
        description: m.description,
        creator: {
          name: m.user?.displayName || m.user?.username,
          username: m.user?.username,
          profileUrl: m.user?.profileUrl
        },
        license: {
          label: m.license?.label,
          code: m.license?.slug,
          attributionRequired: m.license?.requirements?.attribution ?? true
        },
        isDownloadable: Boolean(m.isDownloadable),
        thumbnailUrl: bestThumb?.url || null,
        embedUrl: `https://sketchfab.com/models/${m.uid}/embed?autostart=1&internal=1&ui_infos=0&ui_controls=1`,
        webUrl: m.viewerUrl,
        stats: {
          likes: m.likeCount,
          views: m.viewCount,
          faces: m.faceCount,
          vertices: m.vertexCount
        },
        categories: m.categories?.map((c) => c.name) || [],
        tags: m.tags?.map((t) => t.name) || []
      });
      return;
    }

    // 4. Download Asset Proxy (Streams authorized GLB from S3 securely to client)
    const downloadMatch = pathname.match(/^\/api\/models\/([a-zA-Z0-9]+)\/download-asset$/);
    if (downloadMatch) {
      const uid = downloadMatch[1];

      if (!SKETCHFAB_API_TOKEN) {
        sendError(res, 401, 'Sketchfab API token is required to obtain download assets. Please configure SKETCHFAB_API_TOKEN in .env.');
        return;
      }

      // Step 1: Call Sketchfab authorized download endpoint
      const dlRes = await fetch(`https://api.sketchfab.com/v3/models/${uid}/download`, {
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(12000)
      });

      if (!dlRes.ok) {
        if (dlRes.status === 403) {
          sendError(res, 403, 'This model is not authorized for download or is preview-only by the creator.');
        } else {
          sendError(res, dlRes.status, `Sketchfab download authorization failed: ${dlRes.statusText}`);
        }
        return;
      }

      const dlData = await dlRes.json();
      const glbTarget = dlData.glb || dlData.gltf;

      if (!glbTarget || !glbTarget.url) {
        sendError(res, 404, 'No suitable GLB/glTF asset found in download response for this model.');
        return;
      }

      const assetUrl = glbTarget.url;
      const isGlb = Boolean(dlData.glb?.url);

      // Step 2: Stream the asset binary directly from S3 to the client
      const s3Res = await fetch(assetUrl, {
        signal: AbortSignal.timeout(30000)
      });

      if (!s3Res.ok) {
        sendError(res, s3Res.status, `Failed to retrieve model binary from storage: ${s3Res.statusText}`);
        return;
      }

      const contentLength = s3Res.headers.get('content-length');
      const responseHeaders = {
        'Content-Type': isGlb ? 'model/gltf-binary' : 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      };

      if (contentLength) {
        responseHeaders['Content-Length'] = contentLength;
      }

      res.writeHead(200, responseHeaders);

      // Pipe the body stream
      if (s3Res.body) {
        const reader = s3Res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } else {
        const arrayBuf = await s3Res.arrayBuffer();
        res.end(Buffer.from(arrayBuf));
      }
      return;
    }

    // 5. Educational AI Explanations
    if (pathname === '/api/ai-explain') {
      const query = parsedUrl.searchParams.get('query') || parsedUrl.searchParams.get('subject') || '';
      const title = parsedUrl.searchParams.get('title') || '';
      const desc = parsedUrl.searchParams.get('desc') || '';
      const component = parsedUrl.searchParams.get('component') || '';

      const explanation = getEducationalKnowledge(query, component, title, desc);
      sendJson(res, 200, explanation);
      return;
    }

    // Fallback 404 for unknown api routes
    if (pathname.startsWith('/api/')) {
      sendError(res, 404, `API route not found: ${pathname}`);
      return;
    }

    // Static file serving if running standalone server without Vite
    const distPath = path.join(rootDir, 'dist');
    if (fs.existsSync(distPath)) {
      let filePath = path.join(distPath, pathname === '/' ? 'index.html' : pathname);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(distPath, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.wasm': 'application/wasm'
      };
      res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    sendError(res, 404, 'Endpoint not found');
  } catch (err) {
    console.error(`[Server Error] ${req.method} ${pathname}:`, err);
    if (!res.headersSent) {
      sendError(res, 500, 'Internal Server Error', err.message);
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[HoloHand Backend Server] Listening at http://127.0.0.1:${PORT}`);
  console.log(`[HoloHand Backend Server] Sketchfab Token: ${SKETCHFAB_API_TOKEN ? 'Configured & Protected' : 'Not Set'}`);
});
