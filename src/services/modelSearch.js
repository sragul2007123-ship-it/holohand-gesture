import { sketchfabProvider } from '../providers/sketchfabProvider.js';

const STORAGE_KEY_RECENT_SEARCHES = 'holohand_recent_searches';
const STORAGE_KEY_FAVORITES = 'holohand_favorite_models';
const STORAGE_KEY_RECENT_MODELS = 'holohand_recent_models';

export const EXPLORER_CATEGORIES = [
  {
    name: 'Anatomy & Biology',
    icon: '🫀',
    queries: ['Human heart anatomy', 'Human skeleton', 'Human brain', 'Animal cell', 'DNA molecule']
  },
  {
    name: 'Aerospace & Space',
    icon: '🚀',
    queries: ['Turbofan engine', 'Apollo lunar lander', 'Mars rover', 'Satellite', 'Space telescope']
  },
  {
    name: 'Robotics & Engineering',
    icon: '🦾',
    queries: ['Robot arm', 'Electric vehicle motor', 'Hydraulic pump', 'V8 engine', 'Industrial machinery']
  },
  {
    name: 'Paleontology & History',
    icon: '🦖',
    queries: ['Dinosaur', 'Tyrannosaurus rex fossil', 'Colosseum', 'Ancient artifact', 'Historical monument']
  },
  {
    name: 'Technology & Devices',
    icon: '📱',
    queries: ['Smartphone internal components', 'CPU architecture', 'Computer motherboard', 'Drone quadcopter']
  }
];

export class ModelSearchService {
  constructor(provider = sketchfabProvider) {
    this.provider = provider;
  }

  /**
   * Normalize search string for better keyword matching.
   */
  normalizeQuery(query) {
    if (!query || typeof query !== 'string') return '';
    return query
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Execute search across the active 3D provider.
   */
  async search(query, options = {}) {
    const cleanQuery = this.normalizeQuery(query);
    if (!cleanQuery) {
      return { results: [], total: 0, query: '' };
    }

    this.saveRecentSearch(cleanQuery);
    return await this.provider.search(cleanQuery, options);
  }

  // --- Local Persistence for Searches, History, and Favourites ---

  getRecentSearches() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_RECENT_SEARCHES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveRecentSearch(query) {
    try {
      const recents = this.getRecentSearches().filter((q) => q.toLowerCase() !== query.toLowerCase());
      recents.unshift(query);
      localStorage.setItem(STORAGE_KEY_RECENT_SEARCHES, JSON.stringify(recents.slice(0, 10)));
    } catch (e) {
      console.warn('[ModelSearch] Could not save recent search:', e);
    }
  }

  getFavorites() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_FAVORITES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  isFavorite(modelId) {
    const favs = this.getFavorites();
    return favs.some((m) => m.id === modelId);
  }

  toggleFavorite(model) {
    try {
      let favs = this.getFavorites();
      const modelId = model.id || model.uid;
      const exists = favs.some((m) => (m.id || m.uid) === modelId);
      if (exists) {
        favs = favs.filter((m) => (m.id || m.uid) !== modelId);
      } else {
        favs.unshift({
          id: modelId,
          uid: modelId,
          title: model.title,
          creator: model.creator,
          thumbnailUrl: model.thumbnailUrl || model.thumbnail,
          isDownloadable: Boolean(model.isDownloadable),
          savedAt: new Date().toISOString()
        });
      }
      localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favs.slice(0, 30)));
      return !exists;
    } catch (e) {
      console.warn('[ModelSearch] Could not update favorites:', e);
      return false;
    }
  }

  getRecentModels() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_RECENT_MODELS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  recordViewedModel(model) {
    try {
      const modelId = model.id || model.uid;
      let recents = this.getRecentModels().filter((m) => (m.id || m.uid) !== modelId);
      recents.unshift({
        id: modelId,
        uid: modelId,
        title: model.title,
        creator: model.creator,
        thumbnailUrl: model.thumbnailUrl || model.thumbnail,
        isDownloadable: Boolean(model.isDownloadable),
        viewedAt: new Date().toISOString()
      });
      localStorage.setItem(STORAGE_KEY_RECENT_MODELS, JSON.stringify(recents.slice(0, 20)));
    } catch (e) {
      console.warn('[ModelSearch] Could not record viewed model:', e);
    }
  }
}

export const modelSearchService = new ModelSearchService();
