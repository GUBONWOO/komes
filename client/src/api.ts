import axios from 'axios';
import type { Property, Stats, StationInfo, PriceHistoryEntry, PropertiesResponse, GetPropertiesParams, UserProfile } from './types';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api', withCredentials: true });

export const getProperties = (params: GetPropertiesParams, signal?: AbortSignal) =>
  api.get<PropertiesResponse>('/properties', { params, signal });

export const getStats  = ()           => api.get<Stats>('/stats');
export const getLines  = ()           => api.get<string[]>('/lines');
export const getStations = (line: string | null) =>
  api.get<StationInfo[]>('/stations', { params: line ? { line } : {} });

export const startCrawl = (area?: string) =>
  api.post<{ message: string }>('/crawl', area ? { area } : {});

export const getPriceHistory = (homesUrl: string) =>
  api.get<PriceHistoryEntry[]>('/properties/price-history', { params: { homes_url: homesUrl } });

export const getMe     = ()           => axios.get<UserProfile>('/auth/me', { withCredentials: true });
export const logout    = ()           => axios.post('/auth/logout', {}, { withCredentials: true });

export const getFavorites    = ()          => api.get<Property[]>('/favorites');
export const addFavorite     = (id: number) => api.post(`/favorites/${id}`);
export const removeFavorite  = (id: number) => api.delete(`/favorites/${id}`);

export const getWatchlist    = ()          => api.get<Property[]>('/watchlist');
export const addWatchlist    = (id: number) => api.post(`/watchlist/${id}`);
export const removeWatchlist = (id: number) => api.delete(`/watchlist/${id}`);
