/**
 * api.js
 * -------
 * Thin HTTP client for the GLP-1 Watch Python backend.
 * All data and computation comes from FastAPI — this file
 * just wraps fetch() calls with error handling.
 *
 * Change BASE_URL to your deployed backend URL for production.
 */

export const BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:8000"
  : "https://glp1watch.onrender.com";

/**
 * Generic fetch wrapper.
 * Throws on non-2xx responses with a descriptive message.
 */
async function apiFetch(path, params = {}) {
  const url = new URL(BASE_URL + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error ${res.status} on ${path}`);
  }
  return res.json();
}

/** GET /api/health */
export const fetchHealth = () => apiFetch("/api/health");

/** GET /api/market */
export const fetchMarket = () => apiFetch("/api/market");

/** GET /api/pipeline */
export const fetchPipeline = () => apiFetch("/api/pipeline");

/**
 * GET /api/forecast
 * @param {object} params - { horizon, scenario, pen, net_price, gtn }
 */
export const fetchForecast = (params) => apiFetch("/api/forecast", params);

/**
 * GET /api/montecarlo
 * @param {object} params - { horizon, scenario, pen, net_price, gtn, iterations }
 */
export const fetchMonteCarlo = (params) => apiFetch("/api/montecarlo", params);

/**
 * GET /api/regions
 * @param {object} params - { horizon, scenario, pen, net_price, gtn }
 */
export const fetchRegions = (params) => apiFetch("/api/regions", params);

/** GET /api/intelligence */
export const fetchIntelligence = () => apiFetch("/api/intelligence");
