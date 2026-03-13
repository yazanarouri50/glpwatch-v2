"""
forecast.py
-----------
Quantitative modelling engine for GLP-1 Watch.

All heavy computation lives here:
  - Logistic (S-curve) revenue model
  - Patient / Rx volume series
  - Patient funnel (CDC NHANES anchored)
  - Monte Carlo simulation (NumPy vectorised — fast at 50K iterations)
  - eNPV pipeline valuation
  - Regional revenue splits
  - Histogram binning for MC distribution chart
  - Tornado sensitivity drivers
"""

import numpy as np
from typing import List, Dict, Any

# ─── Constants ────────────────────────────────────────────────────────────────

SCENARIO_MULT = {"base": 1.00, "bull": 1.35, "bear": 0.68}

# US obese adults (millions) — CDC NHANES 2021-22
US_OBESE_ADULTS_M = 108.4

# Market growth rate parameter (fitted to 2022→2023 actuals)
LOGISTIC_GROWTH_RATE = 0.30

# Inflection year (years after 2023)
LOGISTIC_T_MID = 5

REGIONS = [
    {"name": "United States", "code": "US",  "weight": 0.52, "cagr": 0.18, "color": "#2563eb"},
    {"name": "EU5",           "code": "EU5", "weight": 0.20, "cagr": 0.14, "color": "#0ea5e9"},
    {"name": "Japan",         "code": "JP",  "weight": 0.07, "cagr": 0.09, "color": "#6366f1"},
    {"name": "China",         "code": "CN",  "weight": 0.09, "cagr": 0.29, "color": "#8b5cf6"},
    {"name": "Rest of World", "code": "RoW", "weight": 0.12, "cagr": 0.22, "color": "#0d9488"},
]

ANALOG_CURVES = {
    "Humira":   [0.8,  1.9,  3.2,  4.8,  6.5,  8.2,  9.8,  11.2, 12.0, 11.5],
    "Keytruda": [0.5,  1.4,  2.8,  5.0,  7.8,  10.5, 13.2, 16.0, 18.5, 20.0],
    "Ozempic":  [1.2,  3.5,  6.8,  10.2, 14.0, 18.0, 21.5, 24.0, 25.5, 26.0],
    "Harvoni":  [3.8,  6.2,  5.1,  3.8,  2.9,  2.1,  1.8,  1.5,  1.2,  1.0],
    "Revlimid": [0.6,  1.2,  2.0,  2.9,  3.8,  4.6,  5.3,  5.9,  6.4,  6.8],
}

TORNADO_DRIVERS = [
    {"label": "Peak Class Penetration",  "low_frac": -0.28, "high_frac":  0.32},
    {"label": "Net Price Level",          "low_frac": -0.20, "high_frac":  0.19},
    {"label": "Market Growth Rate",       "low_frac": -0.15, "high_frac":  0.17},
    {"label": "Gross-to-Net Discount",    "low_frac": -0.13, "high_frac":  0.09},
    {"label": "Competitive Entry Timing", "low_frac": -0.11, "high_frac":  0.06},
    {"label": "Payer Coverage Rate",      "low_frac": -0.09, "high_frac":  0.10},
    {"label": "Patient Persistency",      "low_frac": -0.07, "high_frac":  0.08},
]

PIPELINE_ASSETS = [
    {"name": "Asset A — Ph3 GLP-1/GIP Dual", "pts": 0.72, "peak_rev": 3.2, "loe": 2038, "wac": 17.5, "phase": "Phase 3"},
    {"name": "Asset B — Ph2 Oral GLP-1",      "pts": 0.38, "peak_rev": 1.8, "loe": 2039, "wac": 14.0, "phase": "Phase 2"},
    {"name": "Asset C — Ph1 Triple Agonist",  "pts": 0.15, "peak_rev": 2.4, "loe": 2041, "wac": 19.0, "phase": "Phase 1"},
]


# ─── Revenue model ────────────────────────────────────────────────────────────

def build_revenue_series(
    horizon:   int   = 10,
    scenario:  str   = "base",
    pen:       float = 0.18,
    net_price: float = 11_000,
    gtn:       float = 0.38,
) -> List[float]:
    """
    Projects global GLP-1 class net revenue using a logistic (S-curve) model.

    Model:
        Rev(t) = Addressable × k / (1 + exp(-r * (t - t_mid)))

    Where:
        k        = peak penetration ceiling (fraction of obese adults)
        r        = 0.30 intrinsic growth rate (fitted to 2022→2023 actuals)
        t_mid    = 5 (inflection at year 5 post-2023)
        Addressable = CDC obese population × net price (post G2N)

    Args:
        horizon:   number of years from 2025
        scenario:  "base" | "bull" | "bear"
        pen:       peak penetration as fraction (e.g. 0.18 = 18%)
        net_price: average net price per patient per year ($)
        gtn:       gross-to-net discount rate (not applied again — net_price already net)

    Returns:
        List of net revenue values ($B) for each year
    """
    mult        = SCENARIO_MULT.get(scenario, 1.0)
    addressable = US_OBESE_ADULTS_M * 1e6 * net_price / 1e9  # $B

    years = np.arange(2025, 2025 + horizon)
    t     = years - 2023

    logistic = addressable * pen / (1 + np.exp(-LOGISTIC_GROWTH_RATE * (t - LOGISTIC_T_MID)))
    revenue  = logistic * mult

    return [round(float(v), 2) for v in revenue]


def build_patient_series(
    horizon:   int   = 10,
    scenario:  str   = "base",
    pen:       float = 0.18,
    net_price: float = 11_000,
    gtn:       float = 0.38,
) -> List[float]:
    """Implied patients (millions) per year from revenue series."""
    rev = build_revenue_series(horizon=horizon, scenario=scenario, pen=pen, net_price=net_price, gtn=gtn)
    return [round(v * 1e9 / net_price / 1e6, 2) for v in rev]


def build_rx_series(
    horizon:   int   = 10,
    scenario:  str   = "base",
    pen:       float = 0.18,
    net_price: float = 11_000,
    gtn:       float = 0.38,
) -> List[float]:
    """
    Implied annual Rx scripts (millions).
    Assumption: ~24 scripts/patient/year (biweekly injectable or monthly oral).
    """
    pts = build_patient_series(horizon=horizon, scenario=scenario, pen=pen, net_price=net_price, gtn=gtn)
    return [round(v * 24, 1) for v in pts]


# ─── Patient funnel ───────────────────────────────────────────────────────────

def build_patient_funnel(pen: float = 0.18) -> List[Dict]:
    """
    Returns funnel steps from US obese adults → addressable market.
    Anchored to CDC NHANES 2021-22 data.

    Conversion rates sourced from:
    - IQVIA Institute 2024 (public)
    - Novo Nordisk investor day presentations (public)
    """
    base = US_OBESE_ADULTS_M
    steps = [
        ("US Obese Adults",        100.0, base),
        ("Diagnosed",              72.0,  round(base * 0.72, 1)),
        ("Treatment Eligible",     38.0,  round(base * 0.38, 1)),
        ("Seeking Rx Treatment",   22.0,  round(base * 0.22, 1)),
        ("Insurance Access",       16.0,  round(base * 0.16, 1)),
        ("On GLP-1 Class Today",   9.0,   round(base * 0.09, 1)),
        (f"Peak Pen. ({pen*100:.0f}%)", round(pen * 100, 1), round(base * pen, 1)),
    ]
    return [{"label": s[0], "pct": s[1], "abs_m": s[2]} for s in steps]


# ─── Regional series ──────────────────────────────────────────────────────────

def build_regional_series(rev: List[float]) -> List[Dict]:
    """
    Splits global revenue into per-region time series.
    Uses deterministic noise (seeded) to simulate realistic inter-year variation
    without random re-ordering on each call.
    """
    rng = np.random.default_rng(seed=42)  # fixed seed = deterministic output

    result = []
    for i, region in enumerate(REGIONS):
        noise  = rng.uniform(0.92, 1.08, size=len(rev))
        series = [round(float(v * region["weight"] * n), 2) for v, n in zip(rev, noise)]
        result.append({"region": region, "series": series})
    return result


# ─── Monte Carlo ─────────────────────────────────────────────────────────────

def run_monte_carlo(base_total_rev: float, iterations: int = 10_000) -> Dict:
    """
    NumPy-vectorised Monte Carlo simulation.

    Samples from independent uniform distributions over key forecast drivers:
      - Peak penetration noise:  U(0.70, 1.30)   ±30%
      - Net price noise:         U(0.82, 1.18)   ±18%
      - Market growth noise:     U(0.76, 1.24)   ±24%
      - G2N discount noise:      U(0.90, 1.10)   ±10%

    At 10K iterations this runs in ~1ms on any modern CPU.
    At 50K iterations still <10ms.

    Args:
        base_total_rev: base case cumulative revenue ($B)
        iterations:     number of simulation runs

    Returns:
        dict with sorted sims array and percentile stats
    """
    rng = np.random.default_rng()

    pen_noise    = rng.uniform(0.70, 1.30, iterations)
    price_noise  = rng.uniform(0.82, 1.18, iterations)
    growth_noise = rng.uniform(0.76, 1.24, iterations)
    gtn_noise    = rng.uniform(0.90, 1.10, iterations)

    sims = base_total_rev * pen_noise * price_noise * growth_noise * gtn_noise
    sims.sort()

    return {
        "sims":    [round(float(v), 1) for v in sims],
        "p10":     round(float(np.percentile(sims, 10)), 1),
        "p25":     round(float(np.percentile(sims, 25)), 1),
        "p50":     round(float(np.percentile(sims, 50)), 1),
        "p75":     round(float(np.percentile(sims, 75)), 1),
        "p90":     round(float(np.percentile(sims, 90)), 1),
        "mean":    round(float(np.mean(sims)), 1),
        "std_dev": round(float(np.std(sims)), 1),
    }


def build_histogram(sims: List[float], bins: int = 35) -> Dict:
    """
    Bins Monte Carlo results for bar chart rendering.

    Returns:
        labels:  bin midpoint labels
        counts:  simulation count per bin
        p10_val: P10 threshold (for colouring bars)
        p90_val: P90 threshold
    """
    arr         = np.array(sims)
    counts, edges = np.histogram(arr, bins=bins)
    labels      = [round(float((edges[i] + edges[i+1]) / 2), 1) for i in range(len(edges)-1)]
    p10_val     = float(np.percentile(arr, 10))
    p90_val     = float(np.percentile(arr, 90))

    return {
        "labels":  labels,
        "counts":  [int(c) for c in counts],
        "p10_val": round(p10_val, 1),
        "p90_val": round(p90_val, 1),
    }


# ─── eNPV ─────────────────────────────────────────────────────────────────────

def calc_enpv(asset: Dict) -> Dict:
    """
    Expected Net Present Value calculation.

        eNPV = (Gross NPV × PTS) − R&D Cost
        Gross NPV = peak_rev × 5.2× revenue multiple
        R&D Cost  = peak_rev × 0.45 (industry avg proxy ~$1.5B)
        Discount rate: 12% WACC (baked into the revenue multiple)

    Args:
        asset: dict with keys: pts, peak_rev

    Returns:
        dict with gross_npv, rd_cost, enpv
    """
    gross_npv = round(asset["peak_rev"] * 5.2 * asset["pts"], 2)
    rd_cost   = round(asset["peak_rev"] * 0.45, 2)
    enpv      = round(gross_npv - rd_cost, 2)
    return {"gross_npv": gross_npv, "rd_cost": rd_cost, "enpv": enpv}
