import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api', withCredentials: true });

export const getProperties = (params, signal) => api.get('/properties', { params, signal });
export const getStats = () => api.get('/stats');
export const getLines = () => api.get('/lines');
export const getStations = (line) => api.get('/stations', { params: line ? { line } : {} });
export const startCrawl = (line) => api.post('/crawl', line ? { line } : {});
export const getPriceHistory = (homesUrl) => api.get('/properties/price-history', { params: { homes_url: homesUrl } });
export const getMe = () => axios.get('/auth/me', { withCredentials: true });
export const logout = () => axios.post('/auth/logout', {}, { withCredentials: true });
export const getFavorites = () => api.get('/favorites');
export const addFavorite = (id) => api.post(`/favorites/${id}`);
export const removeFavorite = (id) => api.delete(`/favorites/${id}`);

// 관심종목 (watchlist) - 크롤링 삭제에 영향받지 않는 별도 테이블
export const getWatchlist = () => api.get('/watchlist');
export const addWatchlist = (id) => api.post(`/watchlist/${id}`);
export const removeWatchlist = (id) => api.delete(`/watchlist/${id}`);
