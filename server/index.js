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
function getEducationalKnowledge(query, component = '', title = '', desc = '', status = 'verified', sourceName = '') {
  const q = (query + ' ' + title + ' ' + desc).toLowerCase();
  const c = (component || '').trim();
  const isSuggested = status === 'suggested';
  const uncertaintyNotice = isSuggested
    ? '⚠️ Uncertainty Notice: This component name is an automated contextual suggestion based on spatial arrangement and model topic. The source 3D asset metadata did not provide a verified anatomical or engineering label.'
    : null;

  // 1. Biological: Heart Anatomy
  if (q.includes('heart') || q.includes('cardio') || q.includes('ventricle') || q.includes('aorta')) {
    return {
      subject: 'Human Heart Anatomy',
      category: 'Biological Anatomy',
      componentName: c || null,
      sourceName: sourceName || c || null,
      verificationStatus: status,
      uncertaintyNotice,
      purpose: 'The central muscular pump of the circulatory system, circulating oxygenated blood to tissues and deoxygenated blood to the lungs.',
      howItWorks: 'A four-chambered dual-pump system operating in synchronized cardiac cycles. The right side receives systemic venous blood and sends it to the pulmonary circuit; the left side receives pulmonary venous blood and pumps it into systemic circulation under higher pressure.',
      whatItIs: c ? `Anatomical structure of the cardiovascular system ("${c}").` : 'Human cardiac organ model.',
      whatItDoes: c ? `Facilitates synchronized hemodynamic pumping, valve gating, or ventricular contraction.` : 'Circulates blood throughout the human body.',
      relationship: c ? `Integrated into the four-chambered cardiac muscular wall and coronary vascular tree.` : 'Core pump of the cardiovascular system.',
      majorComponents: [
        { name: 'Right Atrium', role: 'Receives deoxygenated blood returning from the superior and inferior vena cava.' },
        { name: 'Right Ventricle', role: 'Pumps venous blood into the pulmonary artery toward pulmonary capillaries for gas exchange.' },
        { name: 'Left Atrium', role: 'Receives oxygen-rich blood from the pulmonary veins.' },
        { name: 'Left Ventricle', role: 'Thick muscular chamber pumping oxygenated blood at high pressure into the aorta.' },
        { name: 'Aorta & Coronary Arteries', role: 'Main systemic arterial trunk and primary vessels supplying myocardium.' },
        { name: 'Valves (Tricuspid, Mitral, Aortic, Pulmonary)', role: 'Ensure strictly unidirectional laminar blood flow without regurgitation.' }
      ],
      componentFocus: c ? `Focused component "${c}" (${status}): Essential cardiac structure maintaining systemic or pulmonary perfusion.` : null,
      practicalApplications: 'Cardiology, cardiac surgery, hemodynamic simulation, artificial mechanical hearts (e.g. Syncardia), and biocompatible valve replacements.',
      exploreNext: ['Cardiac conduction system (SA/AV nodes)', 'Pulmonary circulation & gas exchange', 'Coronary artery disease & stenting', 'Echocardiography 3D doppler imaging']
    };
  }

  // 2. Biological: Human Brain & Neurology
  if (q.includes('brain') || q.includes('cerebr') || q.includes('cortex') || q.includes('neuron') || q.includes('skull')) {
    return {
      subject: 'Human Brain & Central Nervous System',
      category: 'Neuroanatomy',
      componentName: c || null,
      sourceName: sourceName || c || null,
      verificationStatus: status,
      uncertaintyNotice,
      purpose: 'The central computational and regulatory organ of the nervous system, orchestrating cognition, sensory processing, emotional regulation, and autonomic homeostasis.',
      howItWorks: 'Billions of neurons form interconnected electro-chemical synaptic networks. Action potentials traverse axonal pathways, while cortical regions execute specialized functional modularity.',
      whatItIs: c ? `Cortical, subcortical, or cerebellar neural structure ("${c}").` : 'Encephalic neuroanatomical model.',
      whatItDoes: c ? `Executes neural computation, sensory integration, or motor regulation.` : 'Integrates conscious thought and involuntary reflex regulation.',
      relationship: c ? `Interconnected via white matter axonal tracts within the cranial vault.` : 'Coordinates all peripheral nervous and bodily functions.',
      majorComponents: [
        { name: 'Frontal Lobe', role: 'Executive function, planning, working memory, and voluntary motor output.' },
        { name: 'Parietal Lobe', role: 'Somatosensory integration, multimodal spatial perception, and sensory mapping.' },
        { name: 'Temporal Lobe', role: 'Auditory cortex, language comprehension (Wernicke area), and hippocampus memory consolidation.' },
        { name: 'Occipital Lobe', role: 'Primary visual cortex executing edge detection, color, and motion processing.' },
        { name: 'Cerebellum', role: 'Sensorimotor coordination, sub-millisecond movement timing, and motor adaptation.' },
        { name: 'Brainstem (Midbrain, Pons, Medulla)', role: 'Autonomic respiratory and cardiovascular vital rhythm generation.' }
      ],
      componentFocus: c ? `Focused neural element "${c}" (${status}): Specialized encephalic division in brain architecture.` : null,
      practicalApplications: 'Neurosurgery trajectory planning, brain-computer interfaces (BCI), functional fMRI neuroimaging, and neurological rehabilitation.',
      exploreNext: ['Hippocampal long-term potentiation', 'Neurotransmitter pharmacology (Dopamine, GABA, Glutamate)', 'Blood-brain barrier transport mechanisms', 'Deep brain stimulation (DBS)']
    };
  }

  // 3. Biological: Human Skeleton
  if (q.includes('skeleton') || q.includes('bone') || q.includes('spine') || q.includes('vertebra') || q.includes('femur')) {
    return {
      subject: 'Human Osteology & Skeletal System',
      category: 'Anatomical Osteology',
      componentName: c || null,
      sourceName: sourceName || c || null,
      verificationStatus: status,
      uncertaintyNotice,
      purpose: 'Rigid endoskeletal framework providing mechanical structural support, protecting delicate visceral organs, anchoring musculature, and serving as a mineral reservoir.',
      howItWorks: 'Composed of osseous tissue (compact cortical bone and trabecular cancellous bone) reinforced by type I collagen and hydroxyapatite crystals. Articulated via synovial and cartilaginous joints.',
      whatItIs: c ? `Skeletal bone or joint module ("${c}").` : 'Human skeletal architectural framework.',
      whatItDoes: c ? `Bears compressive/tensile loads, protects organs, or acts as a biomechanical lever.` : 'Facilitates articulated movement and structural integrity.',
      relationship: c ? `Articulated in kinematic osteological chain through ligaments and tendons.` : 'Internal structural framework of the human anatomy.',
      majorComponents: [
        { name: 'Cranium & Facial Skeleton', role: 'Shields encephalon and provides rigid orbits for sensory organs.' },
        { name: 'Vertebral Column (Cervical, Thoracic, Lumbar, Sacral)', role: 'Articulated weight-bearing axis protecting the spinal cord.' },
        { name: 'Thoracic Cage (Ribs & Sternum)', role: 'Compliant protective cage shielding heart and lungs during respiration.' },
        { name: 'Pelvic Girdle', role: 'Robust ring transferring upper body mass onto bilateral lower limbs.' },
        { name: 'Appendicular Extremities (Femur, Humerus, Tibia)', role: 'Biomechanical lever arms facilitating locomotion and manipulation.' }
      ],
      componentFocus: c ? `Focused skeletal bone "${c}" (${status}): Structural load-bearing or articulated osteological element.` : null,
      practicalApplications: 'Orthopedic surgical implants, forensic anthropology, biomechanical gait analysis, and prosthetic engineering.',
      exploreNext: ['Osteoclast/osteoblast bone remodeling dynamics', 'Synovial joint tribology & cartilage wear', 'Fracture biomechanics & osteosynthesis plating', 'Bone marrow hematopoiesis']
    };
  }

  // 4. Engineering: Turbofan Aircraft Engine
  if (q.includes('engine') || q.includes('turbofan') || q.includes('turbine') || q.includes('jet') || q.includes('compressor')) {
    return {
      subject: 'Turbofan Aircraft Engine',
      category: 'Aerospace Propulsion',
      componentName: c || null,
      sourceName: sourceName || c || null,
      verificationStatus: status,
      uncertaintyNotice,
      purpose: 'Generates thrust to propel commercial and military aircraft via the Brayton thermodynamic cycle coupled with high-bypass airflow.',
      howItWorks: 'Air is ingested by the front fan. A portion enters the core for compression, fuel combustion, and turbine expansion; the larger bypass flow produces the majority of sub-supersonic thrust with high propulsive efficiency.',
      whatItIs: c ? `Aerospace propulsion turbomachinery module ("${c}").` : 'High-bypass turbofan aircraft engine.',
      whatItDoes: c ? `Accelerates airflow, compresses gas, extracts expansion enthalpy, or guides exhaust.` : 'Generates reactionary thrust via continuous combustion and airflow bypass.',
      relationship: c ? `Mounted co-axially on concentric drive shafts within the nacelle assembly.` : 'Primary propulsion powerplant of modern aviation.',
      majorComponents: [
        { name: 'Front Fan', role: 'Accelerates massive mass flow of bypass air around the core engine.' },
        { name: 'Low/High Pressure Compressors', role: 'Sequentially pressurizes intake air through intermeshing rotor and stator stages.' },
        { name: 'Combustion Chamber', role: 'Injects atomized jet fuel (Jet-A) into compressed air for sustained high-energy combustion.' },
        { name: 'High/Low Pressure Turbines', role: 'Extracts kinetic enthalpy from exhaust gas to drive the compressor and fan shafts.' },
        { name: 'Exhaust Nozzle', role: 'Accelerates remaining hot gas to ambient velocity producing reactionary thrust.' }
      ],
      componentFocus: c ? `Selected component "${c}" (${status}): Critical mechanical module subjected to extreme thermal and rotational loads.` : null,
      practicalApplications: 'Commercial aviation (CFM LEAP, GE9X, Rolls-Royce Trent), industrial power generation gas turbines, and supersonic military propulsion.',
      exploreNext: ['Turbine blade single-crystal superalloys & ceramic thermal barrier coatings', 'Variable stator vanes & bleed valve control', 'Afterburning turbofans', 'Geared turbofan architecture']
    };
  }

  // 5. Engineering: Sports Car / Automotive
  if (q.includes('car') || q.includes('auto') || q.includes('vehicle') || q.includes('chassis') || q.includes('drivetrain')) {
    return {
      subject: 'Automotive Engineering & Powertrain',
      category: 'Ground Transportation Mechatronics',
      componentName: c || null,
      sourceName: sourceName || c || null,
      verificationStatus: status,
      uncertaintyNotice,
      purpose: 'High-performance automotive platform engineered for aerodynamic efficiency, dynamic cornering grip, and responsive energy conversion.',
      howItWorks: 'Converts chemical or electrical energy into mechanical rotational torque transmitted through the gearbox, differential, and half-shafts to pneumatic tires.',
      whatItIs: c ? `Automotive subsystem module ("${c}").` : 'Vehicle mechanical chassis and aerodynamic envelope.',
      whatItDoes: c ? `Transmits tractive drive torque, dampens kinetic chassis pitch/roll, or directs airflow.` : 'Transports occupants and cargo with controlled kinematic dynamics.',
      relationship: c ? `Anchored to structural chassis subframe or powertrain integration points.` : 'Integrated mechanical and electrical automotive assembly.',
      majorComponents: [
        { name: 'Monocoque Chassis & Subframes', role: 'Provides high torsional rigidity and crash absorption crumple zones.' },
        { name: 'Powertrain & Transmission', role: 'Generates motive torque with selectable gear reduction ratios.' },
        { name: 'Independent Multi-Link Suspension', role: 'Controls wheel camber, caster, and toe angles through road surface undulations.' },
        { name: 'Braking System (Calipers & Discs)', role: 'Converts rotational kinetic energy into heat via hydraulic friction dissipation.' },
        { name: 'Aerodynamic Body Panels & Diffuser', role: 'Generates stabilizing downforce while minimizing parasitic aerodynamic drag.' }
      ],
      componentFocus: c ? `Focused vehicle part "${c}" (${status}): Essential structural, suspension, or propulsion module.` : null,
      practicalApplications: 'Automotive vehicle dynamics, motorsport racing engineering, electric vehicle battery packaging, and active safety systems.',
      exploreNext: ['Torque vectoring electronic differentials', 'Active aerodynamics & drag reduction systems (DRS)', 'Regenerative braking energy recovery', 'Carbon-fiber reinforced polymer (CFRP) manufacturing']
    };
  }

  // 6. Engineering: Articulated Robot Arm
  if (q.includes('robot') || q.includes('arm') || q.includes('manipulator') || q.includes('actuator') || q.includes('mechatronic')) {
    return {
      subject: 'Articulated Robotic Arm',
      category: 'Robotics & Mechatronics',
      componentName: c || null,
      sourceName: sourceName || c || null,
      verificationStatus: status,
      uncertaintyNotice,
      purpose: 'Multi-degree-of-freedom robotic manipulator designed for precise, repeatable spatial positioning and kinematic manipulation in manufacturing and research.',
      howItWorks: 'Actuators (brushless DC servo motors with harmonic drive gearboxes) rotate joints. Forward and inverse kinematics algorithms compute joint angles required for the end-effector to follow planned Cartesian trajectories.',
      whatItIs: c ? `Robotic kinematic link or actuator joint ("${c}").` : 'Industrial articulated robotic arm.',
      whatItDoes: c ? `Actuates rotational degree of freedom, provides structural reach, or grips objects.` : 'Executes programmed robotic motion profiles with sub-millimeter repeatability.',
      relationship: c ? `Connected serially in kinematic link chain from base to end-effector.` : 'Modular articulated mechatronic manipulator.',
      majorComponents: [
        { name: 'Base Pedestal', role: 'Rigid mechanical foundation containing power distribution and primary azimuth joint.' },
        { name: 'Shoulder & Elbow Joints', role: 'Primary kinematic links delivering large-amplitude planar and spatial reach.' },
        { name: 'Spherical Wrist (Pitch/Yaw/Roll)', role: 'Provides 3 rotational degrees of freedom for accurate tool orientation.' },
        { name: 'End Effector / Gripper', role: 'Interchangeable payload interface (vacuum cups, parallel jaws, welding torch).' },
        { name: 'Feedback Encoders', role: 'High-resolution optical/magnetic encoders reporting real-time angular positions to motion controllers.' }
      ],
      componentFocus: c ? `Selected component "${c}" (${status}): Structural link or joint assembly in kinematic chain.` : null,
      practicalApplications: 'Automotive assembly lines, semiconductor wafer handling, robotic surgical systems (e.g. da Vinci), and space station manipulators (Canadarm2).',
      exploreNext: ['Inverse kinematics & Jacobian motion planning', 'Impedance & force-feedback control', 'Harmonic drive strain-wave gearing', 'Computer vision visual servoing']
    };
  }

  // 7. Paleontology: Dinosaur & Fossil Skeletal System
  if (q.includes('dinosaur') || q.includes('fossil') || q.includes('t-rex') || q.includes('paleo')) {
    return {
      subject: title || 'Prehistoric Vertebrate Paleontology',
      category: 'Paleontology & Evolutionary Biology',
      componentName: c || null,
      sourceName: sourceName || c || null,
      verificationStatus: status,
      uncertaintyNotice,
      purpose: 'Fossilized anatomical skeletal architecture illustrating biomechanics, functional morphology, and evolutionary adaptations of extinct archosaurs.',
      howItWorks: 'Endoskeleton composed of mineralized calcium phosphate bones configured to support heavy bipedal or quadrupedal locomotion, distribute bite forces, and house respiratory air sacs analogous to modern avian systems.',
      whatItIs: c ? `Fossilized osteological fossil component ("${c}").` : 'Prehistoric vertebrate skeletal fossil specimen.',
      whatItDoes: c ? `Anchored musculature, shielded internal organs, or supported biomechanical articulation.` : 'Displays skeletal morphology and locomotive mechanics of extinct organisms.',
      relationship: c ? `Articulated in osteological axial or appendicular skeleton.` : 'Preserved fossil specimen in paleontological archive.',
      majorComponents: [
        { name: 'Cranium & Mandible', role: 'Reinforced skull architecture with fenestrae reducing weight while anchoring massive jaw adductor muscles.' },
        { name: 'Vertebral Column', role: 'Articulated cervical, dorsal, sacral, and caudal vertebrae providing axial tensile strength.' },
        { name: 'Pelvic Girdle (Ilium, Ischium, Pubis)', role: 'Anchor point for robust hindlimb extensor muscles responsible for locomotion.' },
        { name: 'Appendicular Limbs', role: 'Digitigrade limb bones designed for weight-bearing efficiency.' }
      ],
      componentFocus: c ? `Selected element "${c}" (${status}): Skeletal structure providing mechanical support or functional articulation.` : null,
      practicalApplications: 'Evolutionary biology, biomechanical finite element analysis (FEA), comparative vertebrate anatomy, and museum science.',
      exploreNext: ['Pneumatized bones and dinosaur respiratory dynamics', 'Theropod-avian evolutionary transition', 'Bite-force biomechanics', 'Fossil photogrammetry & 3D digital preservation']
    };
  }

  // 8. Generic Universal 3D Asset Fallback
  return {
    subject: title || query || 'Universal 3D Model',
    category: 'Universal 3D Asset',
    componentName: c || null,
    sourceName: sourceName || c || null,
    verificationStatus: status,
    uncertaintyNotice,
    purpose: desc || `3D model representation of ${title || query || 'the assembly'} for interactive spatial exploration, structural inspection, and educational analysis.`,
    howItWorks: 'Modeled with polygon geometry and surface textures, structured to represent real-world physical boundaries, volumetric scale, and mechanical or biological assemblies.',
    whatItIs: c ? `Component element ("${c}") of the 3D model assembly.` : '3D geometric volumetric assembly.',
    whatItDoes: c ? `Contributes to the overall structural form, mechanical assembly, or visual representation.` : 'Represents real-world physical form and mechanical boundaries.',
    relationship: c ? `Integrated component part situated within the primary coordinate space of the model.` : 'Complete integrated 3D asset.',
    majorComponents: c
      ? [{ name: c, role: `Selected component under inspection (${status}).` }]
      : [{ name: 'Complete 3D Assembly', role: 'Integrated volumetric geometry.' }],
    componentFocus: c ? `Focused component: ${c} (${status})` : null,
    practicalApplications: 'Interactive 3D education, scientific simulation, virtual training, industrial design visualization, and digital archiving.',
    exploreNext: ['Related engineering and scientific references', 'Component hierarchy & exploded visualization', 'Material properties and geometric scale']
  };
}

// Generate contextual component suggestions for unverified parts
function generateComponentSuggestions(payload = {}) {
  const modelTitle = payload.modelTitle || '';
  const description = payload.description || '';
  const tags = Array.isArray(payload.tags) ? payload.tags.join(' ') : '';
  const q = (modelTitle + ' ' + description + ' ' + tags).toLowerCase();
  const components = Array.isArray(payload.components) ? payload.components : [];

  let candidates = [];
  let domain = 'Generic Assembly';

  if (q.includes('heart') || q.includes('cardio') || q.includes('ventricle') || q.includes('aorta')) {
    domain = 'Human Heart Anatomy';
    candidates = [
      { name: 'Left Ventricle', role: 'Thick muscular chamber pumping oxygenated blood into systemic circulation' },
      { name: 'Right Ventricle', role: 'Pumps venous blood into the pulmonary artery for oxygenation' },
      { name: 'Left Atrium', role: 'Receives oxygen-rich blood returning from the pulmonary veins' },
      { name: 'Right Atrium', role: 'Receives deoxygenated blood returning from systemic vena cava' },
      { name: 'Aorta', role: 'Primary systemic arterial trunk distributing oxygenated blood' },
      { name: 'Pulmonary Artery', role: 'Transports deoxygenated blood from right ventricle to lungs' },
      { name: 'Myocardium', role: 'Involuntary striated cardiac muscle tissue driving pumping contractions' },
      { name: 'Heart Valves', role: 'Ensure strictly unidirectional laminar hemodynamic flow' }
    ];
  } else if (q.includes('brain') || q.includes('cerebr') || q.includes('cortex') || q.includes('skull')) {
    domain = 'Human Brain Neuroanatomy';
    candidates = [
      { name: 'Frontal Lobe', role: 'Executive function, planning, working memory, and voluntary motor output' },
      { name: 'Parietal Lobe', role: 'Somatosensory integration, multimodal spatial perception, and sensory mapping' },
      { name: 'Temporal Lobe', role: 'Auditory cortex, language comprehension, and memory consolidation' },
      { name: 'Occipital Lobe', role: 'Primary cortical visual processing center' },
      { name: 'Cerebellum', role: 'Sensorimotor coordination, movement timing, and motor adaptation' },
      { name: 'Brainstem', role: 'Autonomic respiratory and cardiovascular vital rhythm generation' }
    ];
  } else if (q.includes('skeleton') || q.includes('bone') || q.includes('spine') || q.includes('femur')) {
    domain = 'Human Skeletal System';
    candidates = [
      { name: 'Cranium & Skull', role: 'Protective casing shielding the brain and housing sensory organs' },
      { name: 'Vertebral Column', role: 'Articulated spinal vertebrae providing axial load support' },
      { name: 'Thoracic Ribcage', role: 'Protective bony cage shielding thoracic visceral organs' },
      { name: 'Pelvic Girdle', role: 'Weight-bearing pelvic basin connecting axial spine to lower limbs' },
      { name: 'Appendicular Extremities', role: 'Articulated limb bones structured for movement and manipulation' }
    ];
  } else if (q.includes('engine') || q.includes('turbofan') || q.includes('turbine') || q.includes('jet')) {
    domain = 'Turbofan Aircraft Engine';
    candidates = [
      { name: 'Front Fan Rotor', role: 'Compresses massive bypass airflow providing majority of thrust' },
      { name: 'Low Pressure Compressor', role: 'Initial stage axial compression blades' },
      { name: 'High Pressure Compressor', role: 'Intermeshing rotor and stator stages delivering high compression' },
      { name: 'Combustion Chamber', role: 'Annular combustor where atomized fuel burns in compressed air' },
      { name: 'High Pressure Turbine', role: 'Extracts gas enthalpy to drive high-pressure compressor shaft' },
      { name: 'Low Pressure Turbine', role: 'Multi-stage turbine driving low-pressure front fan shaft' },
      { name: 'Exhaust Nozzle', role: 'Accelerates exhaust gases producing reactionary thrust' }
    ];
  } else if (q.includes('car') || q.includes('auto') || q.includes('vehicle') || q.includes('chassis')) {
    domain = 'Automotive Ground Vehicle';
    candidates = [
      { name: 'Vehicle Chassis & Frame', role: 'Structural architecture bearing dynamic road loads' },
      { name: 'Powertrain & Engine', role: 'Motor generating rotational tractive torque' },
      { name: 'Suspension Assembly', role: 'Dampers and springs isolating road surface undulations' },
      { name: 'Wheels & Tires', role: 'Traction interface transmitting acceleration and braking force' },
      { name: 'Braking System', role: 'Hydraulic friction calipers converting kinetic energy to heat' },
      { name: 'Interior Cockpit', role: 'Steering controls, telemetry displays, and seating' }
    ];
  } else if (q.includes('robot') || q.includes('arm') || q.includes('manipulator')) {
    domain = 'Articulated Robotic Arm';
    candidates = [
      { name: 'Base Pedestal', role: 'Rigid mounting base containing main azimuth actuator' },
      { name: 'Shoulder Joint', role: 'High-torque articulated revolute joint providing elevation reach' },
      { name: 'Elbow Articulation', role: 'Secondary articulated link controlling radial extension' },
      { name: 'Spherical Wrist', role: '3-axis roll-pitch-yaw joint orienting end-effector in space' },
      { name: 'End Effector Gripper', role: 'Mechanical tool interface manipulating workpieces' }
    ];
  }

  // Map candidates to unverified component IDs
  const suggestions = components.map((comp, idx) => {
    const candidate = candidates.length > 0
      ? candidates[idx % candidates.length]
      : { name: `Suggested Sub-module ${idx + 1}`, role: 'Contextual structural component' };

    return {
      id: comp.id,
      suggestedName: candidate.name,
      role: candidate.role,
      confidence: 0.55,
      verificationStatus: 'suggested',
      uncertaintyNotice: `Automated contextual suggestion based on "${domain}" topic. Not verified from source 3D asset metadata.`
    };
  });

  return {
    domain,
    suggestions,
    modelTitle,
    source: 'contextual_ai_assistant'
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

    // 5. Educational AI Explanations & Component Suggestions
    if (pathname === '/api/ai-explain') {
      if (req.method === 'POST') {
        let bodyStr = '';
        for await (const chunk of req) {
          bodyStr += chunk;
          if (bodyStr.length > 500000) break;
        }
        let payload = {};
        try {
          payload = JSON.parse(bodyStr);
        } catch {
          payload = {};
        }

        if (Array.isArray(payload.components)) {
          const suggestions = generateComponentSuggestions(payload);
          sendJson(res, 200, suggestions);
          return;
        }

        const query = payload.query || payload.subject || payload.modelTitle || '';
        const title = payload.title || payload.modelTitle || '';
        const desc = payload.desc || payload.description || '';
        const component = payload.component || payload.componentName || '';
        const status = payload.status || payload.verificationStatus || 'verified';
        const sourceName = payload.sourceName || '';

        const explanation = getEducationalKnowledge(query, component, title, desc, status, sourceName);
        sendJson(res, 200, explanation);
        return;
      }

      // GET request
      const query = parsedUrl.searchParams.get('query') || parsedUrl.searchParams.get('subject') || '';
      const title = parsedUrl.searchParams.get('title') || '';
      const desc = parsedUrl.searchParams.get('desc') || '';
      const component = parsedUrl.searchParams.get('component') || '';
      const status = parsedUrl.searchParams.get('status') || 'verified';
      const sourceName = parsedUrl.searchParams.get('sourceName') || '';

      const explanation = getEducationalKnowledge(query, component, title, desc, status, sourceName);
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
