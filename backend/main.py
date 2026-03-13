"""
main.py
-------
GLP-1 Watch — FastAPI backend.

Run locally:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Endpoints:
    GET /api/health
    GET /api/market
    GET /api/pipeline
    GET /api/forecast?horizon=10&scenario=base&pen=18&net_price=11000&gtn=38
    GET /api/montecarlo?horizon=10&scenario=base&pen=18&net_price=11000&gtn=38&iterations=10000
    GET /api/regions?horizon=10&scenario=base&pen=18&net_price=11000&gtn=38
    GET /api/intelligence
"""

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from data import fetch_clinical_trials, get_cms_data, get_cdc_data, get_sec_data, get_market_estimates, get_drug_landscape
from forecast import (
    build_revenue_series,
    build_patient_series,
    build_rx_series,
    build_patient_funnel,
    build_regional_series,
    run_monte_carlo,
    build_histogram,
    calc_enpv,
    PIPELINE_ASSETS,
    TORNADO_DRIVERS,
    ANALOG_CURVES,
    REGIONS,
)

app = FastAPI(
    title="GLP-1 Watch API",
    description="Backend data and modelling API for GLP-1 Watch dashboard.",
    version="1.0.0",
)

# Allow frontend (any localhost port + GitHub Pages) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://yazanarouri50.github.io",  
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


# ─── Market overview ──────────────────────────────────────────────────────────

@app.get("/api/market")
def market():
    """
    Returns all data needed for the Market Overview tab:
    - CMS drug spending (sourced static, CORS-blocked)
    - CDC obesity stats (sourced static)
    - SEC EDGAR competitor revenue (sourced static)
    - Market size estimates (IQVIA public report)
    - Approved drug landscape
    """
    return {
        "cms":      get_cms_data(),
        "cdc":      get_cdc_data(),
        "sec":      get_sec_data(),
        "market":   get_market_estimates(),
        "drugs":    get_drug_landscape(),
    }


# ─── Pipeline ─────────────────────────────────────────────────────────────────

@app.get("/api/pipeline")
async def pipeline():
    """
    Fetches live trial data from ClinicalTrials.gov v2 API.
    Falls back to curated static dataset if API is unavailable.
    Returns trial records + phase summary counts.
    """
    trials, live = await fetch_clinical_trials()

    phase_counts = {1: 0, 2: 0, 3: 0, 0: 0}
    for t in trials:
        phase_counts[t.get("phase_num", 0)] += 1

    return {
        "trials":       trials,
        "live":         live,
        "total":        len(trials),
        "phase_counts": phase_counts,
    }


# ─── Forecast ─────────────────────────────────────────────────────────────────

@app.get("/api/forecast")
def forecast(
    horizon:   int   = Query(10,    ge=5,  le=15,  description="Years from 2025"),
    scenario:  str   = Query("base",                description="base | bull | bear"),
    pen:       float = Query(18.0,  ge=5,  le=40,  description="Peak penetration % of obese adults"),
    net_price: float = Query(11000, ge=4000, le=20000, description="Avg net price per patient per year $"),
    gtn:       float = Query(38.0,  ge=15, le=65,  description="Gross-to-net discount %"),
):
    """
    Runs the logistic S-curve revenue forecast model.
    Returns year-by-year revenue, patient volumes, Rx scripts,
    patient funnel, and summary KPIs.
    """
    params = dict(horizon=horizon, scenario=scenario, pen=pen / 100, net_price=net_price, gtn=gtn / 100)

    years   = list(range(2025, 2025 + horizon))
    rev     = build_revenue_series(**params)
    pts     = build_patient_series(**params)
    rx      = build_rx_series(**params)
    funnel  = build_patient_funnel(pen / 100)

    peak_rev   = max(rev)
    total_rev  = sum(rev)
    npv        = round(total_rev * 0.63, 2)

    return {
        "years":     years,
        "revenue":   rev,
        "patients":  pts,
        "rx":        rx,
        "funnel":    funnel,
        "kpis": {
            "peak_revenue":   peak_rev,
            "total_revenue":  total_rev,
            "npv":            npv,
            "peak_patients":  round(peak_rev * 1e9 / net_price / 1e6, 2),
            "gtn_erosion_k":  round((gtn / 100 * net_price) / (1 - gtn / 100) / 1000, 1),
        },
        "params": params,
    }


# ─── Monte Carlo ──────────────────────────────────────────────────────────────

@app.get("/api/montecarlo")
def montecarlo(
    horizon:    int   = Query(10,     ge=5,  le=15),
    scenario:   str   = Query("base"),
    pen:        float = Query(18.0,   ge=5,  le=40),
    net_price:  float = Query(11000,  ge=4000, le=20000),
    gtn:        float = Query(38.0,   ge=15, le=65),
    iterations: int   = Query(10000,  ge=1000, le=50000),
):
    """
    Runs Monte Carlo simulation with NumPy.
    Returns percentile stats, histogram bins, fan chart bands,
    and tornado sensitivity data.
    Fast even at 50K iterations thanks to NumPy vectorisation.
    """
    params = dict(horizon=horizon, scenario=scenario, pen=pen / 100, net_price=net_price, gtn=gtn / 100)
    rev        = build_revenue_series(**params)
    total_base = sum(rev)

    result  = run_monte_carlo(total_base, iterations=iterations)
    hist    = build_histogram(result["sims"])

    # Fan chart bands (P10/P50/P90 per year)
    fan = {
        "p10": [round(v * 0.60, 2) for v in rev],
        "p50": rev,
        "p90": [round(v * 1.44, 2) for v in rev],
    }

    # Tornado — express as absolute $ impact on P50
    p50 = result["p50"]
    tornado = [
        {
            "label":    d["label"],
            "downside": round(p50 * d["low_frac"], 2),
            "upside":   round(p50 * d["high_frac"], 2),
        }
        for d in TORNADO_DRIVERS
    ]

    return {
        "stats": {
            "p10":     result["p10"],
            "p25":     result["p25"],
            "p50":     result["p50"],
            "p75":     result["p75"],
            "p90":     result["p90"],
            "mean":    result["mean"],
            "std_dev": result["std_dev"],
        },
        "histogram": hist,
        "fan":        fan,
        "tornado":    tornado,
        "iterations": iterations,
    }


# ─── Regions ──────────────────────────────────────────────────────────────────

@app.get("/api/regions")
def regions(
    horizon:   int   = Query(10,    ge=5, le=15),
    scenario:  str   = Query("base"),
    pen:       float = Query(18.0,  ge=5, le=40),
    net_price: float = Query(11000, ge=4000, le=20000),
    gtn:       float = Query(38.0,  ge=15, le=65),
):
    """
    Returns peak-year and time-series revenue split by region.
    Regional weights sourced from WHO + company segment reporting.
    """
    params = dict(horizon=horizon, scenario=scenario, pen=pen / 100, net_price=net_price, gtn=gtn / 100)
    rev     = build_revenue_series(**params)
    years   = list(range(2025, 2025 + horizon))
    series  = build_regional_series(rev)
    peak    = max(rev)

    return {
        "years":   years,
        "regions": [
            {
                "name":      r["region"]["name"],
                "code":      r["region"]["code"],
                "color":     r["region"]["color"],
                "weight":    r["region"]["weight"],
                "cagr":      r["region"]["cagr"],
                "peak_rev":  round(peak * r["region"]["weight"], 2),
                "series":    r["series"],
            }
            for r in series
        ],
    }


# ─── Commercial intelligence (illustrative) ──────────────────────────────────

@app.get("/api/intelligence")
def intelligence():
    """
    Returns illustrative data for the Commercial Intel tab.
    Clearly labelled as prototype/mockup in the response metadata.
    Includes: eNPV pipeline valuation, analog curves, payer mix, Rx waterfall.
    """
    assets_with_enpv = []
    for a in PIPELINE_ASSETS:
        enpv = calc_enpv(a)
        assets_with_enpv.append({**a, **enpv})

    total_enpv = round(sum(a["enpv"] for a in assets_with_enpv), 2)

    payer_mix = [
        {"label": "Commercial",      "pct": 38, "color": "#2563eb"},
        {"label": "Medicare Part D", "pct": 29, "color": "#0ea5e9"},
        {"label": "Medicaid",        "pct": 12, "color": "#6366f1"},
        {"label": "Cash / OOP",      "pct": 14, "color": "#d97706"},
        {"label": "Other Gov",       "pct": 7,  "color": "#0d9488"},
    ]

    rx_waterfall = [
        {"label": "Total Rx (TRx)",        "value": 12400, "pct": 100, "color": "#2563eb"},
        {"label": "New Rx (NRx)",           "value": 3800,  "pct": 31,  "color": "#0ea5e9"},
        {"label": "Adjudicated Claims",     "value": 10200, "pct": 82,  "color": "#2563eb"},
        {"label": "After Prior Auth",       "value": 8400,  "pct": 68,  "color": "#6366f1"},
        {"label": "Patient Starts",         "value": 7900,  "pct": 64,  "color": "#6366f1"},
        {"label": "Refills (Persistent)",   "value": 5200,  "pct": 42,  "color": "#0d9488"},
    ]

    return {
        "illustrative": True,
        "pipeline_assets": assets_with_enpv,
        "total_enpv":      total_enpv,
        "analog_curves":   ANALOG_CURVES,
        "payer_mix":       payer_mix,
        "rx_waterfall":    rx_waterfall,
    }


# ─── Dev entrypoint ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
