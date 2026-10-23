/**
 * Sketchfab API Provider client for HoloHand Universal 3D Explorer.
 * Connects securely to the local backend proxy to protect API tokens and avoid CORS issues.
 */

export class SketchfabProvider {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Check connection status and API token authentication.
   */
  async checkHealth() {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return {
        status: 'error',
        authenticated: false,
        error: err.message
      };
    }
  }

  /**
   * Search for 3D models with normalized query and filters.
   *
   * @param {string} query - Natural language query
   * @param {Object} [options]
   * @param {boolean|null} [options.downloadable=true] - Filter by downloadable status
   * @param {string} [options.sortBy='-likeCount'] - Sorting parameter
   * @param {string|null} [options.cursor=null] - Pagination cursor
   * @param {number} [options.count=24] - Results per page
   * @returns {Promise<{results: Array, total: number, next: string|null, query: string}>}
   */
  async search(query, options = {}) {
    const {
      downloadable = true,
      sortBy = '-likeCount',
      cursor = null,
      count = 24
    } = options;

    const params = new URLSearchParams();
    params.set('q', query.trim());
    params.set('sort_by', sortBy);
    params.set('count', String(count));

    if (downloadable !== null) {
      params.set('downloadable', downloadable ? 'true' : 'false');
    }

    if (cursor) {
      params.set('cursor', cursor);
    }

    const res = await fetch(`${this.baseUrl}/api/search?${params.toString()}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Search failed with status ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Fetch full model details and metadata.
   */
  async getModel(uid) {
    if (!uid) throw new Error('Model UID is required');
    const res = await fetch(`${this.baseUrl}/api/models/${encodeURIComponent(uid)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Model fetch failed with status ${res.status}`);
    }
    return await res.json();
  }

  /**
   * Return the URL to stream the authorized GLB asset.
   */
  getAssetDownloadUrl(uid) {
    if (!uid) throw new Error('Model UID is required');
    return `${this.baseUrl}/api/models/${encodeURIComponent(uid)}/download-asset`;
  }

  /**
   * Direct alias for getAssetDownloadUrl expected by loader callers.
   */
  getModelAssetUrl(uid) {
    return this.getAssetDownloadUrl(uid);
  }

  /**
   * Request contextual component suggestions for unverified parts.
   */
  async requestComponentSuggestions(payload) {
    const res = await fetch(`${this.baseUrl}/api/ai-explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Component suggestion failed (${res.status})`);
    return await res.json();
  }

  /**
   * Query the educational AI assistant for explanation of subject and components.
   */
  async getEducationalExplanation(query, { component = '', title = '', desc = '', subject = '', status = 'verified', sourceName = '' } = {}) {
    const params = new URLSearchParams();
    const effectiveSubject = query || subject || title;
    params.set('query', effectiveSubject);
    params.set('subject', effectiveSubject);
    if (title) params.set('title', title);
    if (desc) params.set('desc', desc);
    if (component) params.set('component', component);
    if (status) params.set('status', status);
    if (sourceName) params.set('sourceName', sourceName);

    const res = await fetch(`${this.baseUrl}/api/ai-explain?${params.toString()}`);
    if (!res.ok) throw new Error(`AI explanation failed (${res.status})`);
    return await res.json();
  }

  /**
   * Alias for getEducationalExplanation.
   */
  async getAIExplanation(subject, context = {}) {
    return this.getEducationalExplanation(subject, context);
  }
}

export const sketchfabProvider = new SketchfabProvider();
