/**
 * charts.js
 * ----------
 * All Chart.js rendering for GLP-1 Watch.
 * Accepts data shaped by the Python API — no computation here.
 */

const _registry = {};

function destroyChart(id) {
  if (_registry[id]) { _registry[id].destroy(); delete _registry[id]; }
}
function reg(id, chart) { _registry[id] = chart; return chart; }

const PALETTE = ["#2563eb","#0ea5e9","#6366f1","#8b5cf6","#0d9488","#f59e0b","#ef4444"];

function baseOpts(unit = "") {
  return {
    responsive: true, maintainAspectRatio: true,
    plugins: {
      legend: { labels: { color: "#64748b", font: { size: 11, family: "Inter, sans-serif" }, boxWidth: 10, padding: 10 } },
      tooltip: {
        backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1,
        titleColor: "#1e293b", bodyColor: "#475569",
        titleFont: { family: "JetBrains Mono, monospace", size: 11 },
        bodyFont:  { family: "JetBrains Mono, monospace", size: 11 },
        padding: 10,
        callbacks: { label: ctx => ` ${ctx.parsed.y ?? ctx.parsed} ${unit}` },
      },
    },
    scales: {
      x: { grid: { color: "#f1f5f9" }, ticks: { color: "#94a3b8", font: { size: 10, family: "JetBrains Mono, monospace" } } },
      y: { grid: { color: "#f1f5f9" }, ticks: { color: "#94a3b8", font: { size: 10, family: "JetBrains Mono, monospace" } } },
    },
  };
}

// ─── Market charts ────────────────────────────────────────────────────────────

export function drawEdgarChart(id, sec) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  const companies = Object.keys(sec).filter(k => sec[k].glp1_rev_b > 0);
  reg(id, new Chart(el, {
    type: "bar",
    data: {
      labels: companies,
      datasets: [
        { label: "GLP-1 Total ($B)",    data: companies.map(k => sec[k].glp1_rev_b),    backgroundColor: "rgba(37,99,235,0.75)",  borderRadius: 5, borderSkipped: false },
        { label: "Obesity-Specific ($B)", data: companies.map(k => sec[k].obesity_rev_b), backgroundColor: "rgba(14,165,233,0.65)", borderRadius: 5, borderSkipped: false },
      ],
    },
    options: baseOpts("$B"),
  }));
}

export function drawCMSChart(id, cms) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  const drugs  = Object.keys(cms);
  const labels = drugs.map(d => cms[d].label.replace("Semaglutide ","Sema-").replace("Tirzepatide","Tirz").replace("Liraglutide","Lira"));
  reg(id, new Chart(el, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "WAC Price ($)", data: drugs.map(d => cms[d].wac),       backgroundColor: "rgba(99,102,241,0.65)", borderRadius: 5, borderSkipped: false },
        { label: "Net Price ($)", data: drugs.map(d => cms[d].net_price), backgroundColor: "rgba(13,148,136,0.65)", borderRadius: 5, borderSkipped: false },
      ],
    },
    options: baseOpts("$/yr"),
  }));
}

// ─── Pipeline charts ──────────────────────────────────────────────────────────

export function drawPhaseDonut(id, trials) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  const counts = { "Phase 1": 0, "Phase 2": 0, "Phase 3": 0, "Other": 0 };
  trials.forEach(t => {
    if      (t.phase_num === 3) counts["Phase 3"]++;
    else if (t.phase_num === 2) counts["Phase 2"]++;
    else if (t.phase_num === 1) counts["Phase 1"]++;
    else                        counts["Other"]++;
  });
  reg(id, new Chart(el, {
    type: "doughnut",
    data: {
      labels: Object.keys(counts),
      datasets: [{ data: Object.values(counts), backgroundColor: ["#cbd5e1","#0ea5e9","#f59e0b","#6366f1"], borderWidth: 2, borderColor: "#fff", hoverOffset: 6 }],
    },
    options: { plugins: { legend: { position: "right", labels: { color: "#64748b", font: { size: 11 }, padding: 8 } } }, responsive: true, maintainAspectRatio: true },
  }));
}

export function drawMOAChart(id, trials) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  // Count by sponsor as proxy for MOA diversity from live trials
  const sponsors = {};
  trials.forEach(t => { sponsors[t.sponsor] = (sponsors[t.sponsor] || 0) + 1; });
  const top = Object.entries(sponsors).sort((a,b)=>b[1]-a[1]).slice(0,7);
  reg(id, new Chart(el, {
    type: "bar",
    data: {
      labels: top.map(([k]) => k.length > 18 ? k.slice(0,18)+"…" : k),
      datasets: [{ label: "Trials", data: top.map(([,v])=>v), backgroundColor: PALETTE.map(c=>c+"bb"), borderRadius: 5, borderSkipped: false }],
    },
    options: { ...baseOpts("trials"), plugins: { ...baseOpts().plugins, legend: { display: false } } },
  }));
}

// ─── Forecast charts ──────────────────────────────────────────────────────────

export function drawRevenueChart(id, years, revenue) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  const anchor = 37.4;
  reg(id, new Chart(el, {
    type: "bar",
    data: {
      labels: years.map(String),
      datasets: [
        { label: "Net Revenue ($B)", data: revenue, backgroundColor: revenue.map(v => v > anchor ? "rgba(37,99,235,0.75)" : "rgba(14,165,233,0.55)"), borderRadius: 5, borderSkipped: false },
        { type: "line", label: "Trend", data: revenue, borderColor: "#2563eb", borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4 },
      ],
    },
    options: baseOpts("$B"),
  }));
}

export function drawRegionDonut(id, regions) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  reg(id, new Chart(el, {
    type: "doughnut",
    data: {
      labels: regions.map(r => r.name),
      datasets: [{ data: regions.map(r => r.peak_rev), backgroundColor: regions.map(r => r.color+"cc"), borderWidth: 2, borderColor: "#fff" }],
    },
    options: { plugins: { legend: { position: "bottom", labels: { color: "#64748b", font: { size: 10 }, padding: 6 } } }, responsive: true, maintainAspectRatio: true },
  }));
}

export function drawRegionLineChart(id, years, regions) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  reg(id, new Chart(el, {
    type: "line",
    data: {
      labels: years.map(String),
      datasets: regions.map(r => ({
        label: r.code, data: r.series,
        borderColor: r.color, backgroundColor: r.color+"18",
        fill: false, tension: 0.4, borderWidth: 2, pointRadius: 2,
      })),
    },
    options: baseOpts("$B"),
  }));
}

// ─── Monte Carlo charts ───────────────────────────────────────────────────────

export function drawMCHistogram(id, histogram) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  const { labels, counts, p10_val, p90_val } = histogram;
  reg(id, new Chart(el, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: labels.map(l => {
          const v = parseFloat(l);
          if (v < p10_val) return "rgba(220,38,38,0.65)";
          if (v < p90_val) return "rgba(37,99,235,0.65)";
          return "rgba(99,102,241,0.65)";
        }),
        borderRadius: 2, borderSkipped: false,
      }],
    },
    options: { ...baseOpts("sims"), plugins: { ...baseOpts().plugins, legend: { display: false }, tooltip: { ...baseOpts().plugins.tooltip, callbacks: { label: ctx => ` ${ctx.parsed.y} simulations` } } } },
  }));
}

export function drawTornado(id, tornado) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  reg(id, new Chart(el, {
    type: "bar",
    data: {
      labels: tornado.map(d => d.label),
      datasets: [
        { label: "Upside",   data: tornado.map(d => d.upside),   backgroundColor: "rgba(37,99,235,0.70)", borderRadius: 3, borderSkipped: false },
        { label: "Downside", data: tornado.map(d => d.downside), backgroundColor: "rgba(220,38,38,0.65)", borderRadius: 3, borderSkipped: false },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { labels: { color: "#64748b", font: { size: 10 } } } },
      scales: {
        x: { grid: { color: "#f1f5f9" }, ticks: { color: "#94a3b8", font: { size: 10, family: "JetBrains Mono, monospace" } }, title: { display: true, text: "Δ Revenue ($B)", color: "#94a3b8" } },
        y: { grid: { display: false }, ticks: { color: "#475569", font: { size: 10 } } },
      },
      responsive: true, maintainAspectRatio: true,
    },
  }));
}

export function drawFanChart(id, years, fan) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  reg(id, new Chart(el, {
    type: "line",
    data: {
      labels: years.map(String),
      datasets: [
        { label: "P90 (Bull)", data: fan.p90, borderColor: "#6366f1", borderWidth: 1, fill: "+1", backgroundColor: "rgba(99,102,241,0.07)", tension: 0.4, pointRadius: 0 },
        { label: "P50 (Base)", data: fan.p50, borderColor: "#2563eb", borderWidth: 2.5, fill: false, tension: 0.4, pointRadius: 3, pointBackgroundColor: "#2563eb" },
        { label: "P10 (Bear)", data: fan.p10, borderColor: "#dc2626", borderWidth: 1, fill: "-1", backgroundColor: "rgba(220,38,38,0.04)", tension: 0.4, pointRadius: 0 },
      ],
    },
    options: baseOpts("$B"),
  }));
}

// ─── Intel charts ─────────────────────────────────────────────────────────────

export function drawAnalogChart(id, name, curves) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  const src = curves || window._analogCurves || {};
  const curve = src[name] || src["Ozempic"] || [];
  const labels = Array.from({ length: curve.length }, (_, i) => `Yr ${i+1}`);
  reg(id, new Chart(el, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: `${name} (reference)`, data: curve, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.07)", fill: true, tension: 0.4, borderWidth: 2, pointRadius: 3, pointBackgroundColor: "#f59e0b" },
        { label: "Target Asset (65%)",  data: curve.map(v => +(v*0.65).toFixed(1)), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.06)", fill: true, tension: 0.4, borderWidth: 2, pointRadius: 3, borderDash: [5,3], pointBackgroundColor: "#2563eb" },
      ],
    },
    options: baseOpts("$B"),
  }));
}

export function drawPayerDonut(id, payerMix) {
  destroyChart(id);
  const el = document.getElementById(id); if (!el) return;
  reg(id, new Chart(el, {
    type: "doughnut",
    data: {
      labels: payerMix.map(p => p.label),
      datasets: [{ data: payerMix.map(p => p.pct), backgroundColor: payerMix.map(p => p.color+"cc"), borderWidth: 2, borderColor: "#fff" }],
    },
    options: { plugins: { legend: { position: "bottom", labels: { color: "#64748b", font: { size: 10 }, padding: 6 } } }, responsive: true, maintainAspectRatio: true },
  }));
}
