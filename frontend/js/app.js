/**
 * app.js
 * -------
 * GLP-1 Watch frontend controller.
 *
 * This file only handles:
 *   - Tab state + rendering HTML shells
 *   - Calling the Python API via api.js
 *   - Passing API responses to charts.js for visualisation
 *
 * Zero business logic or data here — everything comes from the backend.
 */

import {
  fetchMarket, fetchPipeline, fetchForecast,
  fetchMonteCarlo, fetchRegions, fetchIntelligence,
} from "./api.js";

import {
  drawEdgarChart, drawCMSChart,
  drawPhaseDonut, drawMOAChart,
  drawRevenueChart, drawRegionDonut, drawRegionLineChart,
  drawMCHistogram, drawTornado, drawFanChart,
  drawAnalogChart, drawPayerDonut,
} from "./charts.js";

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  tab: "market",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readParams() {
  return {
    horizon:   document.getElementById("ctlHorizon")?.value  ?? 10,
    scenario:  document.getElementById("ctlScenario")?.value ?? "base",
    pen:       document.getElementById("ctlPen")?.value      ?? 18,
    net_price: parseFloat(document.getElementById("ctlPrice")?.value ?? 11) * 1000,
    gtn:       document.getElementById("ctlGTN")?.value      ?? 38,
  };
}

function setMain(html) {
  document.getElementById("mainContent").innerHTML = html;
}

function loadingShell(message = "Fetching from backend…") {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;
                justify-content:center;height:260px;gap:14px">
      <div class="spinner"></div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;
                  color:var(--text3)">${message}</div>
    </div>`;
}

function errorShell(message) {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;
                justify-content:center;height:260px;gap:10px">
      <div style="font-size:1.5rem">⚠️</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;
                  color:var(--red);text-align:center;max-width:400px">${message}</div>
      <div style="font-size:0.72rem;color:var(--text3)">
        Is the backend running? <code>uvicorn main:app --reload --port 8000</code>
      </div>
    </div>`;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Tab switching ────────────────────────────────────────────────────────────
window.switchTab = function(tab) {
  state.tab = tab;
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  render();
};

window.onParamChange = function() { render(); };

window.selectAnalog = function(el, name) {
  document.querySelectorAll(".a-pill").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  drawAnalogChart("analogChart", name);
};

window.runMC = function() { render(); };

window.exportCSV = async function() {
  const p      = readParams();
  const data   = await fetchForecast(p);
  let csv      = "Year,Net Revenue ($B),Patients (M),Rx Scripts (M),Scenario\n";
  data.years.forEach((y, i) => {
    csv += `${y},${data.revenue[i]},${data.patients[i]},${data.rx[i]},${p.scenario}\n`;
  });
  const a      = document.createElement("a");
  a.href       = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download   = `glp1watch_${p.scenario}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
};

// ─── Master render ────────────────────────────────────────────────────────────
async function render() {
  const tab = state.tab;
  const p   = readParams();

  if (tab === "market")       await renderMarket();
  if (tab === "pipeline")     await renderPipeline();
  if (tab === "forecast")     await renderForecast(p);
  if (tab === "montecarlo")   await renderMonteCarlo(p);
  if (tab === "intelligence") await renderIntelligence();
}

// ═══════════════════════════════════════════════════════════════════
// MARKET TAB
// ═══════════════════════════════════════════════════════════════════
async function renderMarket() {
  setMain(loadingShell("Loading market data from backend…"));
  let data;
  try { data = await fetchMarket(); }
  catch (e) { setMain(errorShell(e.message)); return; }

  const { cms, cdc, sec, market, drugs } = data;
  const growth = ((market.total_glp1_rev_2023_b / market.total_glp1_rev_2022_b - 1) * 100).toFixed(0);

  const approvedRows = drugs.filter(d => d.phase === "approved").map(d => `
    <tr>
      <td><strong>${d.name}</strong></td>
      <td class="tbl-num" style="color:var(--text3)">${d.company}</td>
      <td>${d.brand}</td>
      <td><span class="phase-badge approved">Approved</span></td>
      <td class="tbl-num" style="text-align:right">$${d.wac}K</td>
      <td style="text-align:right">
        <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
          <div style="width:60px;height:4px;background:var(--border);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${d.share/40*100}%;background:var(--blue);border-radius:99px"></div>
          </div>
          <span class="tbl-num">${d.share}%</span>
        </div>
      </td>
      <td style="text-align:right">
        <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
          <div style="width:50px;height:4px;background:var(--border);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${d.effica/25*100}%;background:var(--sky);border-radius:99px"></div>
          </div>
          <span class="tbl-num">~${d.effica}%</span>
        </div>
      </td>
    </tr>`).join("");

  const secRows = Object.entries(sec).filter(([,v]) => v.glp1_rev_b > 0).map(([name, v]) => `
    <tr>
      <td><strong>${name}</strong></td>
      <td class="tbl-num" style="color:var(--text3)">${v.ticker}</td>
      <td class="tbl-num" style="text-align:right">$${v.glp1_rev_b.toFixed(1)}B</td>
      <td class="tbl-num" style="text-align:right">$${v.obesity_rev_b.toFixed(1)}B</td>
      <td style="text-align:right"><span class="pos tbl-num">+${v.yoy_pct}%</span></td>
      <td><a href="${v.filing_url}" target="_blank" class="tbl-link">${v.source} ↗</a></td>
    </tr>`).join("");

  setMain(`
    <div class="kpi-row">
      <div class="kpi blue">
        <div class="kpi-label">GLP-1 Market 2023</div>
        <div class="kpi-value">$${market.total_glp1_rev_2023_b}B</div>
        <div class="kpi-sub">Global net revenue · IQVIA 2024</div>
        <div class="kpi-delta pos">▲ +${growth}% YoY</div>
      </div>
      <div class="kpi sky">
        <div class="kpi-label">US Patients on GLP-1</div>
        <div class="kpi-value">${market.patients_on_glp1_us_m}M</div>
        <div class="kpi-sub">Active US prescriptions · 2024</div>
        <div class="kpi-delta pos">▲ ~6.3% of obese adults</div>
      </div>
      <div class="kpi amber">
        <div class="kpi-label">US Obesity Prevalence</div>
        <div class="kpi-value">${cdc.obesity_rate_pct}%</div>
        <div class="kpi-sub">CDC NHANES 2021–22 · ${cdc.us_obese_adults_m}M adults</div>
        <div class="kpi-delta neutral">Severe: ${cdc.severe_obesity_pct}%</div>
      </div>
      <div class="kpi indigo">
        <div class="kpi-label">2030 Forecast</div>
        <div class="kpi-value">$${market.forecast_2030_base_b}B</div>
        <div class="kpi-sub">Base · $${market.forecast_2030_bear_b}B–$${market.forecast_2030_bull_b}B range</div>
        <div class="kpi-delta pos">▲ ~3.5× current</div>
      </div>
    </div>

    <div class="sec-div">Competitor Revenue — SEC EDGAR</div>
    <div class="g2">
      <div class="card">
        <div class="card-hd">
          <div><div class="card-title">GLP-1 Revenue by Company (FY2023)</div>
          <div class="card-sub">Source: 10-K / 20-F SEC filings · links open EDGAR directly</div></div>
          <span class="chip sky">SEC EDGAR</span>
        </div>
        <canvas id="edgarChart" height="200"></canvas>
      </div>
      <div class="card">
        <div class="card-hd">
          <div><div class="card-title">CMS Average Net vs WAC Prices</div>
          <div class="card-sub">Medicare Part D 2023 · data.cms.gov</div></div>
          <span class="chip indigo">CMS 2023</span>
        </div>
        <canvas id="cmsChart" height="200"></canvas>
      </div>
    </div>

    <div class="sec-div">Approved Drug Landscape</div>
    <div class="card">
      <div class="card-hd">
        <div><div class="card-title">Marketed GLP-1 / Incretin Agents</div>
        <div class="card-sub">FDA-approved · share estimated from script volume (IQVIA public)</div></div>
        <span class="chip teal">SOURCED</span>
      </div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Drug</th><th>Company</th><th>Brand</th><th>Status</th>
            <th style="text-align:right">WAC/yr</th><th style="text-align:right">Mkt Share</th>
            <th style="text-align:right">Wt Loss</th></tr></thead>
          <tbody>${approvedRows}</tbody>
        </table>
      </div>
    </div>

    <div class="sec-div">Revenue Filings</div>
    <div class="card">
      <div class="card-hd">
        <div><div class="card-title">Competitor GLP-1 Revenue — FY2023</div></div>
        <span class="chip sky">SEC EDGAR</span>
      </div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Company</th><th>Ticker</th>
            <th style="text-align:right">GLP-1 Rev</th><th style="text-align:right">Obesity Rev</th>
            <th style="text-align:right">YoY</th><th>Source</th></tr></thead>
          <tbody>${secRows}</tbody>
        </table>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    drawEdgarChart("edgarChart", sec);
    drawCMSChart("cmsChart", cms);
  });
}

// ═══════════════════════════════════════════════════════════════════
// PIPELINE TAB
// ═══════════════════════════════════════════════════════════════════
async function renderPipeline() {
  setMain(loadingShell("Fetching live trial data from ClinicalTrials.gov…"));
  let data;
  try { data = await fetchPipeline(); }
  catch (e) { setMain(errorShell(e.message)); return; }

  const { trials, live, total, phase_counts } = data;

  const statusColor = s => {
    if (s === "RECRUITING")            return "color:var(--blue)";
    if (s === "ACTIVE_NOT_RECRUITING") return "color:var(--sky)";
    if (s === "COMPLETED")             return "color:var(--teal)";
    return "color:var(--text3)";
  };
  const phaseClass = n => n === 3 ? "ph3" : n === 2 ? "ph2" : "ph1";

  const rows = trials.slice(0, 30).map(t => `
    <tr>
      <td><a href="${t.url}" target="_blank" class="tbl-link">${t.nct}</a></td>
      <td style="font-size:0.75rem;max-width:280px">${t.title}</td>
      <td><span class="phase-badge ${phaseClass(t.phase_num)}">${t.phase.replace("PHASE","Ph ").replace("_"," ") || "N/A"}</span></td>
      <td><span style="font-size:0.72rem;${statusColor(t.status)}">${t.status.replace(/_/g," ")}</span></td>
      <td style="font-size:0.73rem;color:var(--text3);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.sponsor}</td>
      <td class="tbl-num" style="color:var(--text3)">${t.completion}</td>
      <td class="tbl-num" style="text-align:right">${typeof t.enrollment === "number" ? t.enrollment.toLocaleString() : t.enrollment}</td>
    </tr>`).join("");

  setMain(`
    <div class="kpi-row">
      <div class="kpi blue">
        <div class="kpi-label">Active Trials Found</div>
        <div class="kpi-value">${total}</div>
        <div class="kpi-sub">ClinicalTrials.gov · ${live ? "live query" : "static fallback"}</div>
        <div class="kpi-delta ${live ? "pos" : "neutral"}">${live ? "● Live API" : "○ Sourced data"}</div>
      </div>
      <div class="kpi amber">
        <div class="kpi-label">Phase 3 Trials</div>
        <div class="kpi-value">${phase_counts[3]}</div>
        <div class="kpi-sub">Late-stage obesity pipeline</div>
        <div class="kpi-delta pos">NDA/BLA horizon 2025–27</div>
      </div>
      <div class="kpi sky">
        <div class="kpi-label">Phase 2 Trials</div>
        <div class="kpi-value">${phase_counts[2]}</div>
        <div class="kpi-sub">Mid-stage candidates</div>
        <div class="kpi-delta neutral">2027+ potential approvals</div>
      </div>
      <div class="kpi indigo">
        <div class="kpi-label">Phase 1 Trials</div>
        <div class="kpi-value">${phase_counts[1]}</div>
        <div class="kpi-sub">Early / novel MOA</div>
        <div class="kpi-delta neutral">Oral, weekly, combo formats</div>
      </div>
    </div>

    <div class="sec-div">Pipeline Distribution</div>
    <div class="g2">
      <div class="card">
        <div class="card-hd">
          <div><div class="card-title">Phase Distribution</div><div class="card-sub">Trials by stage</div></div>
          <span class="chip ${live ? "live" : "teal"}">${live ? "LIVE" : "SOURCED"}</span>
        </div>
        <canvas id="phaseChart" height="210"></canvas>
      </div>
      <div class="card">
        <div class="card-hd">
          <div><div class="card-title">Mechanism of Action</div><div class="card-sub">MOA combinations in development</div></div>
          <span class="chip blue">MOA</span>
        </div>
        <canvas id="moaChart" height="210"></canvas>
      </div>
    </div>

    <div class="sec-div">Live Trial Registry</div>
    <div class="card">
      <div class="card-hd">
        <div><div class="card-title">Active GLP-1 Obesity Trials</div>
        <div class="card-sub">NCT IDs link directly to ClinicalTrials.gov · showing ${Math.min(total,30)} of ${total}</div></div>
        <span class="chip ${live ? "live" : "amber"}">${live ? "LIVE API" : "FALLBACK"}</span>
      </div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>NCT ID</th><th>Study Title</th><th>Phase</th><th>Status</th>
            <th>Sponsor</th><th>Completion</th><th style="text-align:right">Enrollment</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    drawPhaseDonut("phaseChart", trials);
    drawMOAChart("moaChart", trials);
  });
}

// ═══════════════════════════════════════════════════════════════════
// FORECAST TAB
// ═══════════════════════════════════════════════════════════════════
async function renderForecast(p) {
  setMain(loadingShell("Running forecast model…"));
  let data, regionData;
  try {
    [data, regionData] = await Promise.all([fetchForecast(p), fetchRegions(p)]);
  } catch (e) { setMain(errorShell(e.message)); return; }

  const { years, revenue, patients, funnel, kpis } = data;

  const FUNNEL_COLORS = ["#2563eb","#2563eb","#0ea5e9","#0ea5e9","#6366f1","#6366f1","#0d9488"];
  const funnelHtml = funnel.map((f, i) => `
    <div class="f-row">
      <div class="f-lbl">${f.label}</div>
      <div class="f-track">
        <div class="f-fill" style="width:${Math.min(f.pct,100)}%;background:${FUNNEL_COLORS[i]}">${f.pct}%</div>
      </div>
      <div class="f-abs">${f.abs_m}M</div>
    </div>`).join("");

  const regionCards = regionData.regions.map(r => `
    <div class="region-tile">
      <div class="r-name" style="color:${r.color}">${r.name}</div>
      <div class="r-rev">$${r.peak_rev.toFixed(1)}B</div>
      <div class="r-meta">${(r.weight*100).toFixed(0)}% share · +${(r.cagr*100).toFixed(0)}% CAGR</div>
      <div class="r-bar"><div class="r-fill" style="width:${r.weight*100}%;background:${r.color}"></div></div>
    </div>`).join("");

  setMain(`
    <div class="kpi-row">
      <div class="kpi blue">
        <div class="kpi-label">Class Peak Revenue</div>
        <div class="kpi-value">$${kpis.peak_revenue.toFixed(0)}B</div>
        <div class="kpi-sub">Global net · ${p.scenario} case</div>
        <div class="kpi-delta pos">@ ${p.pen}% peak penetration</div>
      </div>
      <div class="kpi sky">
        <div class="kpi-label">Cumulative ${p.horizon}Y Revenue</div>
        <div class="kpi-value">$${kpis.total_revenue.toFixed(0)}B</div>
        <div class="kpi-sub">2025–${2024+parseInt(p.horizon)}</div>
        <div class="kpi-delta pos">NPV ~$${kpis.npv}B @ 12% WACC</div>
      </div>
      <div class="kpi indigo">
        <div class="kpi-label">Peak Patients</div>
        <div class="kpi-value">${kpis.peak_patients.toFixed(0)}M</div>
        <div class="kpi-sub">@ $${(p.net_price/1000).toFixed(0)}K avg net price</div>
        <div class="kpi-delta pos">▲ vs 6.8M today</div>
      </div>
      <div class="kpi amber">
        <div class="kpi-label">G2N Erosion</div>
        <div class="kpi-value">${p.gtn}%</div>
        <div class="kpi-sub">WAC → net discount</div>
        <div class="kpi-delta neg">▼ $${kpis.gtn_erosion_k}K / patient</div>
      </div>
    </div>

    <div class="sec-div">Revenue Projection — Logistic Growth Model (Python / NumPy)</div>
    <div class="g3">
      <div class="card">
        <div class="card-hd">
          <div><div class="card-title">Global GLP-1 Class Net Revenue Forecast ($B)</div>
          <div class="card-sub">Logistic S-curve · anchored to 2023 CMS/IQVIA actuals · computed server-side in Python</div></div>
          <span class="chip ${p.scenario==="bull"?"teal":p.scenario==="bear"?"red":"blue"}">${p.scenario.toUpperCase()}</span>
        </div>
        <canvas id="revChart" height="200"></canvas>
      </div>
      <div class="card">
        <div class="card-hd">
          <div><div class="card-title">Patient Funnel</div>
          <div class="card-sub">US Obesity addressable market · CDC NHANES 2022</div></div>
          <span class="chip amber">CDC</span>
        </div>
        <div class="funnel">${funnelHtml}</div>
      </div>
    </div>

    <div class="sec-div">Regional Breakdown</div>
    <div class="card">
      <div class="card-hd">
        <div><div class="card-title">Revenue by Geography</div>
        <div class="card-sub">Regional weights from WHO + company segment reporting</div></div>
        <span class="chip sky">GLOBAL</span>
      </div>
      <div class="g2" style="margin-bottom:16px">
        <canvas id="regionDonut" height="180"></canvas>
        <canvas id="regionLine"  height="180"></canvas>
      </div>
      <div class="region-grid">${regionCards}</div>
    </div>`);

  requestAnimationFrame(() => {
    drawRevenueChart("revChart", years, revenue);
    drawRegionDonut("regionDonut", regionData.regions);
    drawRegionLineChart("regionLine", years, regionData.regions);
  });
}

// ═══════════════════════════════════════════════════════════════════
// MONTE CARLO TAB
// ═══════════════════════════════════════════════════════════════════
async function renderMonteCarlo(p) {
  setMain(loadingShell("Running 10,000-iteration Monte Carlo simulation in Python…"));
  let data;
  try { data = await fetchMonteCarlo({ ...p, iterations: 10000 }); }
  catch (e) { setMain(errorShell(e.message)); return; }

  const { stats, histogram, fan, tornado } = data;
  const years = Array.from({ length: parseInt(p.horizon) }, (_, i) => 2025 + i);

  setMain(`
    <div class="sec-div">Monte Carlo — Python / NumPy · ${data.iterations.toLocaleString()} Iterations</div>
    <div class="g2">
      <div class="card">
        <div class="card-hd">
          <div><div class="card-title">Revenue Distribution</div>
          <div class="card-sub">Cumulative ${p.horizon}-year net revenue · computed server-side with NumPy</div></div>
          <span class="chip blue">${data.iterations.toLocaleString()} SIMS</span>
        </div>
        <canvas id="mcHistChart" height="215"></canvas>
        <div class="mc-stats">
          <div class="mc-stat"><div class="mc-stat-lbl">P10 / Bear</div><div class="mc-stat-val" style="color:var(--red)">$${stats.p10}B</div></div>
          <div class="mc-stat"><div class="mc-stat-lbl">P50 / Base</div><div class="mc-stat-val" style="color:var(--blue)">$${stats.p50}B</div></div>
          <div class="mc-stat"><div class="mc-stat-lbl">P90 / Bull</div><div class="mc-stat-val" style="color:var(--indigo)">$${stats.p90}B</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-hd">
          <div><div class="card-title">Tornado — Key Value Drivers</div>
          <div class="card-sub">Sensitivity of P50 revenue to ±1σ input change</div></div>
          <span class="chip amber">SENSITIVITY</span>
        </div>
        <canvas id="tornadoChart" height="215"></canvas>
      </div>
    </div>
    <div class="card">
      <div class="card-hd">
        <div><div class="card-title">Confidence Fan — P10 / P50 / P90 Revenue Bands</div>
        <div class="card-sub">Uncertainty compounds over time · bands computed from simulation percentiles</div></div>
        <span class="chip sky">FAN CHART</span>
      </div>
      <canvas id="fanChart" height="160"></canvas>
    </div>`);

  requestAnimationFrame(() => {
    drawMCHistogram("mcHistChart", histogram);
    drawTornado("tornadoChart", tornado);
    drawFanChart("fanChart", years, fan);
  });
}

// ═══════════════════════════════════════════════════════════════════
// COMMERCIAL INTEL TAB
// ═══════════════════════════════════════════════════════════════════
async function renderIntelligence() {
  setMain(loadingShell("Loading commercial intelligence data…"));
  let data;
  try { data = await fetchIntelligence(); }
  catch (e) { setMain(errorShell(e.message)); return; }

  const { pipeline_assets, total_enpv, analog_curves, payer_mix, rx_waterfall } = data;

  const npvRows = pipeline_assets.map(a => `
    <tr>
      <td><strong>${a.name}</strong></td>
      <td class="tbl-num" style="color:var(--amber)">${(a.pts*100).toFixed(0)}%</td>
      <td class="tbl-num">$${a.wac}K</td>
      <td class="tbl-num">$${a.peak_rev.toFixed(1)}B</td>
      <td class="tbl-num">${a.loe}</td>
      <td class="tbl-num">$${a.gross_npv}B</td>
      <td class="tbl-num">$${a.rd_cost}B</td>
      <td class="tbl-num" style="color:${a.enpv>0?"var(--blue)":"var(--red)"}">$${a.enpv}B</td>
    </tr>`).join("");

  const analogBtns = Object.keys(analog_curves)
    .map(name => `<button class="a-pill ${name==="Ozempic"?"active":""}" onclick="selectAnalog(this,'${name}')">${name}</button>`)
    .join("");

  const wfHtml = rx_waterfall.map(s => `
    <div class="wf-item">
      <div class="wf-lbl">${s.label}</div>
      <div class="wf-track">
        <div class="wf-fill" style="width:${s.pct}%;background:${s.color}">
          <span>${s.value.toLocaleString()}</span>
        </div>
      </div>
      <div class="wf-pct">${s.pct}%</div>
    </div>`).join("");

  const payerBarsHtml = payer_mix.map(pd => `
    <div class="payer-row">
      <div class="payer-lbl">${pd.label}</div>
      <div class="payer-track">
        <div class="payer-fill" style="width:${pd.pct}%;background:${pd.color}">${pd.pct}%</div>
      </div>
    </div>`).join("");

  // Store analog curves for the chart
  window._analogCurves = analog_curves;

  setMain(`
    <div class="mockup-banner">
      <div class="mb-icon">🔒</div>
      <div>
        <div class="mb-title">Commercial Intelligence — Prototype Showcase</div>
        <div class="mb-desc">Illustrates what's possible with internal data (IQVIA Rx, payer mix, field force CRM). All figures are illustrative. eNPV computed server-side in Python.</div>
      </div>
    </div>

    <div class="sec-div">eNPV Pipeline Valuation — Python / NumPy Financial</div>
    <div class="card">
      <div class="card-hd">
        <div><div class="card-title">Pipeline Asset eNPV Model</div>
        <div class="card-sub">eNPV = (Gross NPV × PTS) − R&D cost · 12% WACC · computed server-side · all figures illustrative</div></div>
        <span class="chip amber">ILLUSTRATIVE</span>
      </div>
      <div style="overflow-x:auto">
        <table class="npv-tbl">
          <thead><tr><th>Asset</th><th style="text-align:right">PTS</th><th style="text-align:right">WAC</th>
            <th style="text-align:right">Peak Rev</th><th style="text-align:right">LoE</th>
            <th style="text-align:right">Gross NPV</th><th style="text-align:right">R&D Cost</th>
            <th style="text-align:right">eNPV</th></tr></thead>
          <tbody>${npvRows}</tbody>
          <tfoot><tr><td colspan="5">Portfolio Total eNPV</td><td></td><td></td><td>$${total_enpv}B</td></tr></tfoot>
        </table>
      </div>
    </div>

    <div class="sec-div">Launch Curve Analog Selector</div>
    <div class="card">
      <div class="card-hd">
        <div><div class="card-title">Analog Uptake Curve Analysis</div>
        <div class="card-sub">Historical launch reference · target asset shown at 65% scale · source: company annual reports</div></div>
        <span class="chip blue">ANALOG</span>
      </div>
      <div class="analog-pills">${analogBtns}</div>
      <canvas id="analogChart" height="180"></canvas>
    </div>

    <div class="g2">
      <div class="card">
        <div class="card-hd">
          <div><div class="card-title">IQVIA-Style Rx Waterfall</div>
          <div class="card-sub">TRx → NRx → patient starts · illustrative IQVIA data structure</div></div>
          <span class="chip amber">IQVIA MOCKUP</span>
        </div>
        ${wfHtml}
      </div>
      <div class="card">
        <div class="card-hd">
          <div><div class="card-title">Payer Mix & Access Modeling</div>
          <div class="card-sub">Coverage by channel · access as revenue multiplier</div></div>
          <span class="chip sky">PAYER</span>
        </div>
        <canvas id="payerChart" height="180"></canvas>
        <div style="margin-top:14px">${payerBarsHtml}</div>
      </div>
    </div>`);

  requestAnimationFrame(() => {
    drawAnalogChart("analogChart", "Ozempic", analog_curves);
    drawPayerDonut("payerChart", payer_mix);
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  const bar     = document.getElementById("loadBar");
  const status  = document.getElementById("loadStatus");
  const overlay = document.getElementById("loadOverlay");

  const steps = [
    { msg: "Connecting to Python backend…", pct: 30 },
    { msg: "Checking API health…",          pct: 60 },
    { msg: "Loading application…",          pct: 90 },
  ];

  for (const s of steps) {
    status.textContent = s.msg;
    bar.style.width    = s.pct + "%";
    await delay(200);
  }

  try {
    await fetchHealth();
    status.textContent = "✓ Backend connected — ready";
  } catch {
    status.textContent = "⚠ Backend not found — start uvicorn on port 8000";
    status.style.color = "#dc2626";
  }

  bar.style.width = "100%";
  await delay(300);
  overlay.style.opacity = "0";
  await delay(350);
  overlay.style.display = "none";

  render();
}

boot();
