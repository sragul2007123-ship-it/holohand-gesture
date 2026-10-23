/**
 * HoloHand Component Identification Service
 *
 * Implements a layered naming strategy for 3D model components:
 * 1. Explicit component display name from model metadata / extras / userData
 * 2. Meaningful GLTF node or mesh name (verified non-generic)
 * 3. Meaningful parent/child hierarchy
 * 4. Contextual component suggestions generated using model subject & structural evidence
 * 5. Neutral fallback label ("Unnamed part N")
 *
 * Strictly separates:
 * - sourceName: original raw identifier from source asset
 * - displayName: visible label
 * - suggestedName: AI / heuristic guess if any
 * - nameSource: 'metadata' | 'nodeName' | 'hierarchy' | 'suggestion' | 'fallback'
 * - confidence: numeric score 0.0 - 1.0
 * - verificationStatus: 'verified' | 'suggested' | 'unverified'
 */

// Patterns indicating non-semantic generic identifiers
const GENERIC_NAME_PATTERNS = [
  /^object[_\-\s]*\d+$/i,
  /^mesh[_\-\s]*\d*$/i,
  /^node[_\-\s]*\d*$/i,
  /^component[_\-\s]*\d*$/i,
  /^part[_\-\s]*\d*$/i,
  /^element[_\-\s]*\d*$/i,
  /^piece[_\-\s]*\d*$/i,
  /^group[_\-\s]*\d*$/i,
  /^submesh[_\-\s]*\d*$/i,
  /^geometry[_\-\s]*\d*$/i,
  /^shape[_\-\s]*\d*$/i,
  /^primitive[_\-\s]*\d*$/i,
  /^polysurface[_\-\s]*\d*$/i,
  /^pcube[_\-\s]*\d*$/i,
  /^psphere[_\-\s]*\d*$/i,
  /^pcylinder[_\-\s]*\d*$/i,
  /^box[_\-\s]*\d*$/i,
  /^cylinder[_\-\s]*\d*$/i,
  /^sphere[_\-\s]*\d*$/i,
  /^plane[_\-\s]*\d*$/i,
  /^default[_\-\s]*(object|material|geometry)?$/i,
  /^material[_\-\s]*\d*$/i,
  /^sketchfab[_\-\s]*(model|scene|root)?$/i,
  /^root[_\-\s]*(node|scene)?$/i,
  /^scene[_\-\s]*\d*$/i,
  /^collada[_\-\s]*.*$/i,
  /^unnamed[_\-\s]*.*$/i,
  /^unknown[_\-\s]*.*$/i,
  /^null$/i,
  /^undefined$/i,
  /^\d+$/,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i // UUID
];

/**
 * Determine if a given string is a meaningful, semantic component name
 * rather than a generic CAD/modeling tool auto-generated token.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isSemanticName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;

  // Pure digits or single letter + digits (e.g. "m12", "p1")
  if (/^[a-z]?[0-9]+$/i.test(trimmed)) return false;

  // Test against regex patterns
  for (const pattern of GENERIC_NAME_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // Tokenize and check if ALL constituent words are generic CAD/modeling terms
  const tokens = trimmed.toLowerCase().split(/[._\-\s\d]+/).filter(Boolean);
  const genericWords = new Set([
    'object', 'mesh', 'submesh', 'node', 'component', 'part', 'element',
    'piece', 'group', 'grp', 'geometry', 'geom', 'geo', 'shape', 'primitive',
    'polysurface', 'poly', 'surface', 'cube', 'pcube', 'sphere', 'psphere',
    'cylinder', 'pcylinder', 'box', 'plane', 'default', 'material', 'mat',
    'sketchfab', 'root', 'rootnode', 'scene', 'collada', 'unnamed', 'unknown',
    'null', 'undefined', 'sub', 'lod', 'instance', 'inst', 'model'
  ]);

  if (tokens.length > 0 && tokens.every((t) => genericWords.has(t))) {
    return false;
  }

  // Must contain at least two consecutive alphabetical characters
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return false;

  return true;
}

/**
 * Clean and format a semantic name for user presentation.
 * Strips technical suffixes, underscores, and capitalizes words.
 *
 * @param {string} raw
 * @returns {string}
 */
export function cleanSemanticName(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let cleaned = raw
    .replace(/^Sketchfab_model_?/i, '')
    .replace(/^RootNode_?/i, '')
    .replace(/^Object_\d+_?/i, '')
    .replace(/_(geom|geometry|mesh|mat|material|lod\d+|grp|group|node)$/i, '')
    .replace(/[._\-]+/g, ' ')
    .trim();

  // If camelCase, insert space: "leftVentricle" -> "left Ventricle"
  cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Normalize spacing
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Capitalize each word
  return cleaned
    .split(' ')
    .map((w) => {
      // Keep acronyms uppercase (e.g. DNA, V8, HP, LP)
      if (w.length <= 3 && w.toUpperCase() === w) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
}

/**
 * Domain-specific contextual candidate vocabulary for known educational topics.
 */
const DOMAIN_CANDIDATES = {
  heart: [
    { name: 'Left Ventricle', role: 'Thick muscular chamber pumping oxygenated blood into systemic circulation', axis: 'bottom-left' },
    { name: 'Right Ventricle', role: 'Pumps venous blood into the pulmonary artery for oxygenation', axis: 'bottom-right' },
    { name: 'Left Atrium', role: 'Receives oxygen-rich blood returning from the pulmonary veins', axis: 'top-left' },
    { name: 'Right Atrium', role: 'Receives deoxygenated blood returning from systemic vena cava', axis: 'top-right' },
    { name: 'Aorta', role: 'Primary systemic arterial trunk distributing oxygenated blood', axis: 'top-center' },
    { name: 'Pulmonary Artery', role: 'Transports deoxygenated blood from right ventricle to lungs', axis: 'top-anterior' },
    { name: 'Myocardium', role: 'Involuntary striated cardiac muscle tissue driving pumping contractions', axis: 'outer-wall' },
    { name: 'Heart Valves', role: 'Ensure strictly unidirectional laminar hemodynamic flow', axis: 'internal' }
  ],
  brain: [
    { name: 'Frontal Lobe', role: 'Controls executive function, motor coordination, and reasoning', axis: 'anterior' },
    { name: 'Parietal Lobe', role: 'Integrates somatosensory information and spatial perception', axis: 'superior' },
    { name: 'Occipital Lobe', role: 'Primary cortical visual processing center', axis: 'posterior' },
    { name: 'Temporal Lobe', role: 'Processes auditory perception, memory, and semantic language', axis: 'lateral' },
    { name: 'Cerebellum', role: 'Coordinates fine motor precision, balance, and motor learning', axis: 'inferior-posterior' },
    { name: 'Brainstem', role: 'Regulates autonomic cardiovascular, respiratory, and reflex functions', axis: 'inferior' }
  ],
  skeleton: [
    { name: 'Cranium & Skull', role: 'Protective bony casing shielding the cerebrum and sensory organs', axis: 'superior' },
    { name: 'Vertebral Column', role: 'Articulated spinal vertebrae providing axial load support', axis: 'central-axial' },
    { name: 'Thoracic Ribcage', role: 'Articulated ribs and sternum protecting heart and lungs', axis: 'chest' },
    { name: 'Pelvic Girdle', role: 'Weight-bearing pelvic basin connecting spine to lower limbs', axis: 'inferior-torso' },
    { name: 'Upper Appendages', role: 'Humerus, radius, ulna, and manual phalanges for manipulation', axis: 'lateral-arms' },
    { name: 'Lower Appendages', role: 'Femur, patella, tibia, and fibula structured for bipedal locomotion', axis: 'inferior-legs' }
  ],
  engine: [
    { name: 'Front Fan Rotor', role: 'Compresses massive bypass airflow providing majority of thrust', axis: 'anterior' },
    { name: 'Low Pressure Compressor', role: 'Initial stage axial compression blades', axis: 'intake-mid' },
    { name: 'High Pressure Compressor', role: 'Intermeshing rotor and stator stages delivering high pressure ratio', axis: 'core-mid' },
    { name: 'Combustion Chamber', role: 'Annular combustor where atomized fuel burns in compressed air', axis: 'mid-core' },
    { name: 'High Pressure Turbine', role: 'Extracts gas enthalpy to drive high-pressure compressor shaft', axis: 'aft-turbine' },
    { name: 'Low Pressure Turbine', role: 'Multi-stage turbine driving low-pressure front fan shaft', axis: 'aft-power' },
    { name: 'Exhaust Nozzle', role: 'Convergent duct accelerating exhaust gases for reactive thrust', axis: 'posterior' }
  ],
  car: [
    { name: 'Vehicle Chassis & Frame', role: 'Structural monocoque architecture bearing torsional loads', axis: 'central-chassis' },
    { name: 'Engine & Powertrain', role: 'Internal combustion or electric drive motor generating torque', axis: 'front-bay' },
    { name: 'Suspension Assembly', role: 'Dampers, control arms, and springs isolating road vibrations', axis: 'wheel-wells' },
    { name: 'Wheels & Tires', role: 'Pneumatic rubber compounds providing frictional road traction', axis: 'corners' },
    { name: 'Braking System', role: 'Hydraulic calipers and ventilated rotors dissipating kinetic energy', axis: 'in-wheel' },
    { name: 'Interior Cockpit', role: 'Steering column, telemetry displays, and ergonomic seating', axis: 'cockpit' }
  ],
  robot: [
    { name: 'Base Pedestal', role: 'Rigid floor mount containing azimuth actuator and main power feed', axis: 'base' },
    { name: 'Shoulder Joint', role: 'High-torque revolute actuator providing primary elevation reach', axis: 'lower-joint' },
    { name: 'Elbow Articulation', role: 'Secondary articulated link controlling radial extension', axis: 'mid-joint' },
    { name: 'Spherical Wrist', role: '3-axis roll-pitch-yaw assembly orienting tool in space', axis: 'wrist' },
    { name: 'End Effector Gripper', role: 'Mechanical parallel jaw or vacuum tool manipulating workpieces', axis: 'terminal' }
  ]
};

export class ComponentIdentificationService {
  constructor() {
    this._cache = new Map();
  }

  /**
   * Layered identification for an individual component.
   *
   * @param {Object} rawComp - Raw component metadata extracted from scene graph
   * @param {number} index - Component index in assembly
   * @param {Object} [modelMeta] - Model context (title, description, tags, etc.)
   * @returns {Object} Enriched component metadata conforming to HoloHand schema
   */
  classifyComponent(rawComp, index, modelMeta = {}) {
    const nodeName = rawComp.nodeName || rawComp.name || '';
    const meshName = rawComp.meshName || '';
    const extras = rawComp.extras || rawComp.userData || {};
    const parentPath = Array.isArray(rawComp.parentPath) ? rawComp.parentPath : [];
    const sourceName = rawComp.sourceName || nodeName || meshName || `node_${index}`;

    let displayName = '';
    let suggestedName = null;
    let nameSource = 'fallback';
    let confidence = 0.1;
    let verificationStatus = 'unverified';
    let role = rawComp.desc || '';

    // -------------------------------------------------------------
    // Layer 1: Explicit component display name in valid model metadata / extras
    // -------------------------------------------------------------
    const metaCandidate = extras.displayName || extras.name || extras.componentName || extras.partName || extras.title;
    if (isSemanticName(metaCandidate)) {
      displayName = cleanSemanticName(metaCandidate);
      nameSource = 'metadata';
      confidence = 1.0;
      verificationStatus = 'verified';
      role = extras.description || extras.role || `Verified model metadata part: ${displayName}`;
    }

    // -------------------------------------------------------------
    // Layer 2: Meaningful GLTF node or mesh name
    // -------------------------------------------------------------
    if (!displayName) {
      if (isSemanticName(nodeName)) {
        displayName = cleanSemanticName(nodeName);
        nameSource = 'nodeName';
        confidence = 0.90;
        verificationStatus = 'verified';
        role = `Component node identified from 3D hierarchy: ${displayName}`;
      } else if (isSemanticName(meshName)) {
        displayName = cleanSemanticName(meshName);
        nameSource = 'nodeName';
        confidence = 0.85;
        verificationStatus = 'verified';
        role = `Mesh component identified from 3D geometry: ${displayName}`;
      }
    }

    // -------------------------------------------------------------
    // Layer 3: Meaningful parent/child hierarchy
    // Walk upward from immediate parent to root ancestors
    // -------------------------------------------------------------
    if (!displayName && parentPath.length > 0) {
      for (let i = parentPath.length - 1; i >= 0; i--) {
        const ancestor = parentPath[i];
        if (isSemanticName(ancestor)) {
          const cleanParent = cleanSemanticName(ancestor);
          displayName = cleanParent;
          nameSource = 'hierarchy';
          confidence = 0.75;
          verificationStatus = 'verified';
          role = `Component belonging to ${cleanParent} assembly`;
          break;
        }
      }
    }

    // -------------------------------------------------------------
    // Layer 5 Fallback (Default before Layer 4 AI suggestions)
    // -------------------------------------------------------------
    if (!displayName) {
      displayName = `Unnamed part ${index + 1}`;
      nameSource = 'fallback';
      confidence = 0.10;
      verificationStatus = 'unverified';
      role = 'Structural component without verified semantic label in source 3D asset.';
    }

    return {
      id: rawComp.id || `part-${index}`,
      sourceName,
      nodeName,
      meshName,
      parentPath,
      displayName,
      suggestedName,
      nameSource,
      confidence,
      verificationStatus,
      description: role,
      role,
      bounds: rawComp.bounds || null,
      extras
    };
  }

  /**
   * Synchronously process all components of a model through Layer 1, 2, 3, and 5.
   *
   * @param {Array<Object>} rawComponents
   * @param {Object} [modelMeta]
   * @returns {Array<Object>}
   */
  identifyComponents(rawComponents = [], modelMeta = {}) {
    if (!Array.isArray(rawComponents)) return [];

    const classified = rawComponents.map((comp, idx) =>
      this.classifyComponent(comp, idx, modelMeta)
    );

    // Disambiguate duplicate display names among verified parts
    // (e.g. if two meshes both inherited parent "Left Ventricle" -> "Left Ventricle (1)", "Left Ventricle (2)")
    const nameCounts = new Map();
    classified.forEach((c) => {
      if (c.verificationStatus === 'verified') {
        nameCounts.set(c.displayName, (nameCounts.get(c.displayName) || 0) + 1);
      }
    });

    const seenCounts = new Map();
    classified.forEach((c) => {
      if (c.verificationStatus === 'verified' && nameCounts.get(c.displayName) > 1) {
        const count = (seenCounts.get(c.displayName) || 0) + 1;
        seenCounts.set(c.displayName, count);
        c.displayName = `${c.displayName} (${count})`;
      }
    });

    return classified;
  }

  /**
   * Layer 4: Resolve contextual suggestions for unverified components.
   * Reuses legitimate source names; only provides suggested identifications
   * for unnamed/generic components.
   *
   * @param {Object} modelMeta - Model metadata (title, description, tags, uid)
   * @param {Array<Object>} components - Output of identifyComponents()
   * @param {Function} [aiQueryFn] - Optional fetcher to call /api/ai-explain
   * @returns {Promise<Array<Object>>} Enriched components with suggestions
   */
  async resolveContextualSuggestions(modelMeta = {}, components = [], aiQueryFn = null) {
    if (!Array.isArray(components) || components.length === 0) return components;

    // Check cache
    const cacheKey = modelMeta.uid || modelMeta.name || modelMeta.title || '';
    if (cacheKey && this._cache.has(cacheKey)) {
      const cachedSuggestions = this._cache.get(cacheKey);
      return this._applySuggestions(components, cachedSuggestions);
    }

    // Determine unverified components needing suggestions
    const unverified = components.filter((c) => c.verificationStatus === 'unverified');
    if (unverified.length === 0) {
      return components;
    }

    const titleLower = ((modelMeta.title || modelMeta.name || '') + ' ' + (modelMeta.description || '')).toLowerCase();

    // Check domain candidate matches
    let domainKey = null;
    if (titleLower.includes('heart') || titleLower.includes('cardio') || titleLower.includes('aorta')) domainKey = 'heart';
    else if (titleLower.includes('brain') || titleLower.includes('cerebrum') || titleLower.includes('skull')) domainKey = 'brain';
    else if (titleLower.includes('skeleton') || titleLower.includes('bone') || titleLower.includes('spine')) domainKey = 'skeleton';
    else if (titleLower.includes('turbofan') || titleLower.includes('turbine') || titleLower.includes('jet') || titleLower.includes('engine')) domainKey = 'engine';
    else if (titleLower.includes('car') || titleLower.includes('vehicle') || titleLower.includes('chassis')) domainKey = 'car';
    else if (titleLower.includes('robot') || titleLower.includes('arm') || titleLower.includes('manipulator')) domainKey = 'robot';

    let suggestions = [];

    // If an AI fetcher was provided and we have unverified components, try querying backend
    if (typeof aiQueryFn === 'function') {
      try {
        const payload = {
          modelTitle: modelMeta.title || modelMeta.name || '',
          description: modelMeta.description || modelMeta.subtitle || '',
          tags: modelMeta.tags || [],
          creator: modelMeta.creator?.name || modelMeta.creator || '',
          components: unverified.map((c) => ({
            id: c.id,
            sourceName: c.sourceName,
            bounds: c.bounds
          }))
        };
        const res = await aiQueryFn(payload);
        if (res && Array.isArray(res.suggestions)) {
          suggestions = res.suggestions;
        }
      } catch (err) {
        console.warn('[ComponentIdentification] AI suggestion request failed, falling back to local heuristics:', err.message);
      }
    }

    // Fall back to local domain candidate heuristics if backend didn't supply suggestions
    if (suggestions.length === 0 && domainKey && DOMAIN_CANDIDATES[domainKey]) {
      const candidates = DOMAIN_CANDIDATES[domainKey];
      // Sort unverified components spatially by Y height if available to map intuitively (e.g. top to bottom)
      const sortedUnverified = [...unverified].sort((a, b) => {
        const ya = a.bounds?.center ? a.bounds.center[1] : 0;
        const yb = b.bounds?.center ? b.bounds.center[1] : 0;
        return yb - ya; // Highest first
      });

      suggestions = sortedUnverified.map((comp, idx) => {
        const candidate = candidates[idx % candidates.length];
        return {
          id: comp.id,
          suggestedName: candidate.name,
          role: candidate.role,
          confidence: 0.50,
          verificationStatus: 'suggested',
          uncertaintyNotice: `Contextual suggestion based on "${modelMeta.title || domainKey}" domain assembly. Not verified from source 3D mesh metadata.`
        };
      });
    }

    if (cacheKey && suggestions.length > 0) {
      this._cache.set(cacheKey, suggestions);
    }

    return this._applySuggestions(components, suggestions);
  }

  /**
   * Apply suggestion records to matching component IDs safely without
   * overwriting verified names.
   *
   * @private
   */
  _applySuggestions(components, suggestions = []) {
    if (!Array.isArray(suggestions) || suggestions.length === 0) return components;

    const suggMap = new Map();
    suggestions.forEach((s) => {
      if (s && s.id) suggMap.set(s.id, s);
    });

    return components.map((c) => {
      // Never overwrite verified source names!
      if (c.verificationStatus === 'verified') return c;

      const sugg = suggMap.get(c.id);
      if (sugg && sugg.suggestedName) {
        return {
          ...c,
          displayName: `${sugg.suggestedName} (Suggested)`,
          suggestedName: sugg.suggestedName,
          nameSource: 'suggestion',
          confidence: typeof sugg.confidence === 'number' ? sugg.confidence : 0.50,
          verificationStatus: 'suggested',
          role: sugg.role || c.role,
          description: sugg.role || c.description,
          uncertaintyNotice: sugg.uncertaintyNotice ||
            'Contextual AI suggestion based on model topic. The 3D model source does not provide verified component tags.'
        };
      }
      return c;
    });
  }

  /**
   * Clear in-memory suggestions cache.
   */
  clearCache() {
    this._cache.clear();
  }
}

export const componentIdentificationService = new ComponentIdentificationService();
