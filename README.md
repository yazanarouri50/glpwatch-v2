# GLP-1 Watch 

Author: Yazan Arouri

> Personal research dashboard tracking the global GLP-1 / obesity drug market boom.  
> **Python backend (FastAPI + NumPy) · Vanilla JS frontend · Live ClinicalTrials.gov API**

---

## Architecture

```
frontend/          :pure HTML/CSS/JS — zero business logic
  index.html
  styles/main.css
  js/
    app.js         :tab rendering, calls backend API
    api.js         : thin fetch() wrapper for all endpoints
    charts.js      : Chart.js rendering, accepts API data shapes

backend/           : all data + computation
  main.py          : FastAPI app, all routes
  data.py          : ClinicalTrials.gov async fetch, sourced static data
  forecast.py      : NumPy logistic model, Monte Carlo, eNPV
  requirements.txt
```

The frontend **never** does modelling. Every number comes from the Python API.

---

## Local Setup

### 1 — Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs available at **http://localhost:8000/docs** (FastAPI auto-generated Swagger UI).

### 2 — Frontend

```bash
cd frontend
python3 -m http.server 8080
# or: npx serve .
```

Open **http://localhost:8080**

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/market` | CMS, CDC, SEC, drug landscape |
| GET | `/api/pipeline` | Live ClinicalTrials.gov fetch |
| GET | `/api/forecast` | Logistic growth model (NumPy) |
| GET | `/api/montecarlo` | MC simulation (NumPy, up to 50K iterations) |
| GET | `/api/regions` | Regional revenue splits |
| GET | `/api/intelligence` | eNPV, analog curves, payer mix (illustrative) |

Forecast params: `horizon`, `scenario`, `pen`, `net_price`, `gtn`, `iterations`

---

## Data Sources


[ClinicalTrials.gov v2 API](https://clinicaltrials.gov/data-api/api) for  Active GLP-1 obesity trials 
[CMS Part D 2023](https://data.cms.gov) for WAC vs net price by drug
[CDC NHANES 2021-22](https://www.cdc.gov/obesity/data/adult.html)  for US obesity prevalence 
[SEC EDGAR](https://www.sec.gov)  for NVO / LLY competitor revenue 
[IQVIA Institute 2024](https://www.iqvia.com/insights/the-iqvia-institute) for Market size estimates 

---

## Forecast Methodology

**Revenue model** — logistic S-curve:
```
Rev(t) = Addressable × k / (1 + exp(-r × (t - t_mid)))
  k      = peak penetration (user input)
  r      = 0.30 (fitted to 2022→2023 actuals)
  t_mid  = 5 (inflection at year 5)
```

**Monte Carlo** — NumPy vectorised, 4 independent uniform input distributions:
- Peak penetration: ±30%
- Net price: ±18%
- Market growth: ±24%
- Gross-to-net discount: ±10%

**eNPV** — `(peak_rev × 5.2× multiple × PTS) − R&D cost` at 12% WACC

---

## Deployment

**Backend** → [Render](https://render.com) (free tier, Python web service)  
**Frontend** → GitHub Pages (static, free)

Update `BASE_URL` in `frontend/js/api.js` to your Render URL before deploying.

---

## Tech Stack

- **FastAPI** — Python API framework
- **Uvicorn** — ASGI server
- **NumPy** — vectorised Monte Carlo and logistic model
- **HTTPX** — async HTTP client for ClinicalTrials.gov
- **Chart.js 4.4** — all visualisations
- **Vanilla JS** — ES modules, no framework

---

## Why this exists

I got curious about the commercial mechanics behind the GLP-1 boom — a drug class growing 100%+ YoY with real open questions about pricing sustainability, payer access, and competitive entry from oral formulations and triple agonists. Built this to quantify those questions using public data.
