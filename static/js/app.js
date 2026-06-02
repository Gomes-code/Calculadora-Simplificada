const STORAGE_KEY = "calculadoraCarbonoPowerBI";

const SCENARIO_FIELD = {
  min: "emissao_composicao_min",
  med: "emissao_composicao_med",
  max: "emissao_composicao_max",
};

let state = loadState();
let categories = [];
let itemsByCategory = {};
let charts = {};
let currentLang = localStorage.getItem('tpf_lang') || 'pt';

function getTranslation(key) {
  if (typeof translations !== 'undefined' && translations[currentLang] && translations[currentLang][key]) {
    return translations[currentLang][key];
  }
  return key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.innerHTML = getTranslation(key).replace(/\n/g, '<br>');
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = getTranslation(key);
  });
}

window.changeLang = function(lang) {
  currentLang = lang;
  localStorage.setItem('tpf_lang', lang);
  applyTranslations();
  if (typeof renderSidebar === 'function') renderSidebar();
  if (typeof updateDashboard === 'function') updateDashboard();
};

const CATEGORY_COLORS = {
  "superestrutura": "#023E8A",
  "infra_fundacao": "#0077B6",
  "alvenaria_externa": "#0096C7",
  "alvenaria_interna": "#00B4D8",
  "revestimento_parede_externo": "#48CAE4",
  "revestimento_parede_interno": "#90E0EF",
  "piso_externo": "#F4A261", // Harmonious warm accent
  "piso_interno": "#E76F51", // Deeper warm accent
  "telhado": "#2A9D8F", // Soft teal-green
  "default": "#CCCCCC"
};

const el = {
  scenarioSelect: document.getElementById("scenarioSelect"),
  scenarioName: document.getElementById("scenarioName"),
  saveSimulation: document.getElementById("saveSimulation"),
  builtArea: document.getElementById("builtArea"),
  categoryList: document.getElementById("categoryList"),
  clearFilterBtn: document.getElementById("clearFilterBtn"),
  historyList: document.getElementById("historyList"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  clearQuantities: document.getElementById("clearQuantities"),
  kpiTotal: document.getElementById("kpiTotal"),
  kpiRate: document.getElementById("kpiRate"),
  kpiTrees: document.getElementById("kpiTrees"),
  kpiCost: document.getElementById("kpiCost"),
  kpiCostRate: document.getElementById("kpiCostRate"),
  kpiGauge1Val: document.getElementById("kpiGauge1Val"),
  kpiGauge2Val: document.getElementById("kpiGauge2Val"),
  diffGauge1: document.getElementById("diffGauge1"),
  diffGauge2: document.getElementById("diffGauge2"),
  effGauge1: document.getElementById("effGauge1"),
  effGauge2: document.getElementById("effGauge2"),
  refGauge1: document.getElementById("refGauge1"),
  refGauge2: document.getElementById("refGauge2"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  stateSelect: document.getElementById("stateSelect")
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.history = parsed.history || [];
      return parsed;
    }
  } catch (e) {}
  return {
    scenario: "med",
    builtArea: 0,
    selectedState: "SP",
    selected: {}, // { catKey: itemId }
    quantities: {}, // { catKey: number }
    history: []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}

// --- UI Theme (Light/Dark) ---
function initTheme() {
  const savedTheme = localStorage.getItem("tpf-theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  el.themeToggleBtn.textContent = savedTheme === "dark" ? "🌓 Escuro" : "🌓 Claro";
  
  el.themeToggleBtn.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("tpf-theme", newTheme);
    el.themeToggleBtn.textContent = newTheme === "dark" ? "🌓 Escuro" : "🌓 Claro";
    updateChartTheme(newTheme);
  });
}

function updateChartTheme(theme) {
  const isDark = theme === "dark";
  const textColor = isDark ? "#FFFFFF" : "#1D1D1B";
  const gridColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)";
  
  Chart.defaults.color = textColor;
  
  if (charts.bar) {
    charts.bar.options.scales.x.grid.color = gridColor;
    charts.bar.options.scales.y.grid.color = gridColor;
    charts.bar.options.scales.x.ticks.color = textColor;
    charts.bar.options.scales.y.ticks.color = textColor;
    charts.bar.update();
  }
  if (charts.pie) charts.pie.update();
}

async function bootstrap() {
  initTheme();
  initBenchmarks();
  // Chart.js globais
  Chart.defaults.color = document.documentElement.getAttribute("data-theme") === "dark" ? "#FFFFFF" : "#1D1D1B";
  Chart.defaults.font.family = "'Aptos', Roboto, Arial, sans-serif";

  el.scenarioSelect.value = state.scenario;
  el.builtArea.value = state.builtArea || "";
  el.stateSelect.value = state.selectedState || "SP";

  el.scenarioSelect.addEventListener("change", () => {
    state.scenario = el.scenarioSelect.value;
    saveState();
    updateDashboard();
  });
  
  el.stateSelect.addEventListener("change", () => {
    state.selectedState = el.stateSelect.value;
    saveState();
    updateDashboard();
  });
  
  el.builtArea.addEventListener("input", () => {
    state.builtArea = parseFloat(el.builtArea.value.replace(",", ".")) || 0;
    saveState();
    updateDashboard();
  });

  el.clearQuantities.addEventListener("click", () => {
    state.selected = {};
    state.quantities = {};
    saveState();
    renderSidebar();
    updateDashboard();
  });

  if (el.saveSimulation) {
    el.saveSimulation.addEventListener("click", () => {
      const name = el.scenarioName.value.trim() || `Análise ${state.history.length + 1}`;
      let totalE = 0;
      let totalC = 0;
      const uf = state.selectedState || "SP";
      categories.forEach(cat => {
        const k = cat.category_key;
        const c = state.selected[k];
        const q = state.quantities[k] || 0;
        if (c && q > 0) {
          const i = (itemsByCategory[k] || []).find(x => String(x.codigo_composicao) === String(c));
          if (i) {
            totalE += (q * getFactor(i));
            const cVal = (i.costs && i.costs[uf]) ? i.costs[uf] : 0;
            totalC += (q * cVal);
          }
        }
      });
      const r = state.builtArea > 0 ? totalE / state.builtArea : 0;
      
      const entry = {
        id: Date.now(),
        name: name,
        scenario: state.scenario,
        selectedState: state.selectedState || "SP",
        builtArea: state.builtArea,
        selected: JSON.parse(JSON.stringify(state.selected)),
        quantities: JSON.parse(JSON.stringify(state.quantities)),
        totalEmission: totalE,
        totalCost: totalC,
        rate: r
      };
      
      state.history.push(entry);
      if (state.history.length > 5) state.history.shift(); 
      
      if (el.scenarioName) el.scenarioName.value = "";
      saveState();
      renderHistory();
      updateDashboard();
    });
  }

  if (el.clearHistoryBtn) {
    el.clearHistoryBtn.addEventListener("click", () => {
      state.history = [];
      saveState();
      renderHistory();
      updateDashboard();
    });
  }

  if (el.clearFilterBtn) {
    el.clearFilterBtn.addEventListener("click", () => {
      document.querySelectorAll(".cat-item").forEach(item => {
        item.style.display = "block";
      });
      el.clearFilterBtn.style.display = "none";
    });
  }

  initCharts();

  try {
    categories = await fetchJson("/api/categories");
    const promises = categories.map(async (cat) => {
      itemsByCategory[cat.category_key] = await fetchJson(`/api/items/${encodeURIComponent(cat.category_key)}?show_incomplete=1`);
    });
    await Promise.all(promises);
    
    renderSidebar();
    updateDashboard();
  } catch (e) {
    console.error("Erro ao carregar dados", e);
    el.categoryList.innerHTML = "<div class='loading-text'>Erro ao carregar os dados da API.</div>";
  }
}

function renderSidebar() {
  el.categoryList.innerHTML = categories.map(cat => {
    const key = cat.category_key;
    const items = itemsByCategory[key] || [];
    const selectedItem = state.selected[key] || "";
    const qty = state.quantities[key] || "";
    
    const options = items.map(item => `<option value="${item.codigo_composicao}" ${item.codigo_composicao == selectedItem ? "selected" : ""}>${item.codigo_composicao} - ${item.descricao}</option>`).join("");
    
    const translatedCatTitle = getTranslation("cat_" + key) || cat.label;

    return `
      <div class="cat-item">
        <div class="cat-title">${translatedCatTitle}</div>
        <select class="cat-select" data-cat="${key}">
          <option value="">${getTranslation("lbl_select_material")}</option>
          ${options}
        </select>
        <input type="number" class="cat-input" data-cat="${key}" placeholder="${getTranslation("lbl_qty_sqm")}" value="${qty}">
        <div class="progress-container">
          <div class="progress-fill" id="prog_${key}"></div>
        </div>
      </div>
    `;
  }).join("");

  el.categoryList.querySelectorAll(".cat-select").forEach(sel => {
    sel.addEventListener("change", (e) => {
      state.selected[e.target.dataset.cat] = e.target.value;
      saveState();
      updateDashboard();
    });
  });
  el.categoryList.querySelectorAll(".cat-input").forEach(inp => {
    inp.addEventListener("input", (e) => {
      state.quantities[e.target.dataset.cat] = parseFloat(e.target.value) || 0;
      saveState();
      updateDashboard();
    });
  });
}

function getFactor(item) {
  if (!item) return 0;
  const field = SCENARIO_FIELD[state.scenario] || SCENARIO_FIELD.med;
  const value = Number(item[field]);
  return isNaN(value) ? 0 : value;
}

function getHistoryAnalysis() {
  if (!state.history || state.history.length === 0) return null;
  
  let minEmission = Math.min(...state.history.map(h => h.totalEmission));
  let minCost = Math.min(...state.history.map(h => h.totalCost || 0));
  let maxEmission = Math.max(...state.history.map(h => h.totalEmission));
  let maxCost = Math.max(...state.history.map(h => h.totalCost || 0));
  
  let isSingleBest = state.history.some(h => h.totalEmission === minEmission && (h.totalCost || 0) === minCost);
  
  let bestEntry = null;
  let worstEntry = null;
  
  if (isSingleBest) {
    bestEntry = state.history.find(h => h.totalEmission === minEmission && (h.totalCost || 0) === minCost);
  } else {
    let bestScore = Infinity;
    state.history.forEach(h => {
       let mC = minCost > 0 ? minCost : 1;
       let mE = minEmission > 0 ? minEmission : 1;
       let score = (h.totalEmission / mE) + ((h.totalCost || 0) / mC);
       if (score < bestScore) {
         bestScore = score;
         bestEntry = h;
       }
    });
  }
  
  let worstScore = -Infinity;
  let mC2 = minCost > 0 ? minCost : 1;
  let mE2 = minEmission > 0 ? minEmission : 1;
  state.history.forEach(h => {
     let score = (h.totalEmission / mE2) + ((h.totalCost || 0) / mC2);
     if (score > worstScore) {
       worstScore = score;
       worstEntry = h;
     }
  });
  
  return { minEmission, minCost, maxEmission, maxCost, isSingleBest, bestEntry, worstEntry };
}

function updateDashboard() {
  let totalEmission = 0;
  let totalCost = 0;
  const uf = state.selectedState || "SP";
  const catEmissions = [];
  const catLabels = [];
  const catColors = [];
  let maxCatEmission = 0;

  let analysis = getHistoryAnalysis();
  let bestEntry = analysis ? analysis.bestEntry : null;

  const bestCatEmissions = [];

  categories.forEach((cat, idx) => {
    const key = cat.category_key;
    const itemCode = state.selected[key];
    const qty = state.quantities[key] || 0;
    
    let emission = 0;
    let cost = 0;
    if (itemCode && qty > 0) {
      const item = (itemsByCategory[key] || []).find(i => String(i.codigo_composicao) === String(itemCode));
      if (item) {
        emission = qty * getFactor(item);
        cost = qty * ((item.costs && item.costs[uf]) ? item.costs[uf] : 0);
      }
    }

    let bestEmission = 0;
    if (bestEntry) {
      const bCode = bestEntry.selected[key];
      const bQty = bestEntry.quantities[key] || 0;
      const bUf = bestEntry.selectedState || "SP";
      if (bCode && bQty > 0) {
        const bItem = (itemsByCategory[key] || []).find(i => String(i.codigo_composicao) === String(bCode));
        if (bItem) {
            bestEmission = bQty * getFactor(bItem);
        }
      }
    }
    
    totalEmission += emission;
    totalCost += cost;
    catLabels.push(getTranslation("cat_" + key) || cat.label);
    catEmissions.push(emission);
    bestCatEmissions.push(bestEmission);
    catColors.push(CATEGORY_COLORS[key] || CATEGORY_COLORS.default);
    if (emission > maxCatEmission) maxCatEmission = emission;
  });

  categories.forEach((cat, idx) => {
    const bar = document.getElementById(`prog_${cat.category_key}`);
    if (bar) {
      const emission = catEmissions[idx];
      const pct = maxCatEmission > 0 ? (emission / maxCatEmission) * 100 : 0;
      bar.style.width = `${pct}%`;
      bar.style.backgroundColor = catColors[idx];
    }
  });

  const area = state.builtArea || 0;
  const rate = area > 0 ? totalEmission / area : 0;
  const costRate = area > 0 ? totalCost / area : 0;
  
  el.kpiTotal.textContent = `${totalEmission.toLocaleString("pt-BR", {maximumFractionDigits:2})} kgCO₂e`;
  if (el.kpiCost) el.kpiCost.textContent = `R$ ${totalCost.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  if (el.kpiCostRate) el.kpiCostRate.textContent = `R$ ${costRate.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  el.kpiRate.textContent = rate.toLocaleString("pt-BR", {maximumFractionDigits:2});
  
  const trees = Math.round(totalEmission / 15);
  el.kpiTrees.textContent = `🌲 ${trees.toLocaleString("pt-BR")}`;

  applyTranslations();
  updateCharts(catLabels, catEmissions, bestCatEmissions, catColors, totalEmission, totalCost, rate, analysis);
  renderHistory(analysis);
}

function renderHistory(analysis) {
  if (!el.historyList) return;
  if (!state.history || state.history.length === 0) {
    el.historyList.innerHTML = `<div class="history-empty">${getTranslation("hist_empty")}</div>`;
    return;
  }
  
  if (!analysis) {
    analysis = getHistoryAnalysis();
  }

  el.historyList.innerHTML = state.history.map((h, i) => {
    let badges = [];
    if (state.history.length > 1) {
      if (analysis.isSingleBest && h.id === analysis.bestEntry.id) {
        badges.push(`<span class="history-badge badge-super-best">${getTranslation("verdict_balanced")}</span>`);
      } else {
        if (h.totalEmission === analysis.minEmission) badges.push(`<span class="history-badge badge-emission">${getTranslation("verdict_more_efficient")}</span>`);
        if ((h.totalCost||0) === analysis.minCost) badges.push(`<span class="history-badge badge-cost">${getTranslation("badge_cost") || "Melhor Custo"}</span>`);
        if (!analysis.isSingleBest && h.id === analysis.bestEntry.id) badges.push(`<span class="history-badge badge-balanced">${getTranslation("verdict_balanced")}</span>`);
      }
      
      if (analysis.worstEntry && h.id === analysis.worstEntry.id && analysis.worstEntry.id !== analysis.bestEntry.id) {
        badges.push(`<span class="history-badge badge-worst">${getTranslation("verdict_less_efficient")}</span>`);
      }
    }
    
    return `
      <div class="history-item" data-id="${h.id}">
        <div class="history-header">
          <span class="history-name">${h.name}</span>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div class="history-badges-container">${badges.join("")}</div>
            <button class="history-delete-btn" data-delete-id="${h.id}" title="Excluir Análise">✕</button>
          </div>
        </div>
        <div class="history-details">
          <span>${(h.totalEmission).toLocaleString("pt-BR", {maximumFractionDigits:2})} kgCO₂e</span>
          <span>R$ ${(h.totalCost||0).toLocaleString("pt-BR", {maximumFractionDigits:2})}</span>
        </div>
      </div>
    `;
  }).reverse().join("");

  el.historyList.querySelectorAll(".history-item").forEach(item => {
    item.addEventListener("click", (e) => {
      // Check if clicked the delete button
      if (e.target.classList.contains("history-delete-btn")) {
        const idToDelete = parseInt(e.target.dataset.deleteId);
        state.history = state.history.filter(h => h.id !== idToDelete);
        saveState();
        updateDashboard();
        return;
      }

      const id = parseInt(item.dataset.id);
      const entry = state.history.find(h => h.id === id);
      if (entry) {
        state.scenario = entry.scenario;
        state.selectedState = entry.selectedState || "SP";
        state.builtArea = entry.builtArea;
        state.selected = JSON.parse(JSON.stringify(entry.selected));
        state.quantities = JSON.parse(JSON.stringify(entry.quantities));
        
        el.scenarioSelect.value = state.scenario;
        if(el.stateSelect) el.stateSelect.value = state.selectedState;
        el.builtArea.value = state.builtArea;
        
        saveState();
        renderSidebar();
        updateDashboard();
      }
    });
  });
}

function initCharts() {
  const handleChartClick = (evt, elements) => {
    if (elements && elements.length > 0) {
      const idx = elements[0].index;
      const catKey = categories[idx].category_key;
      
      document.querySelectorAll(".cat-item").forEach(item => {
        const select = item.querySelector(".cat-select");
        if (select && select.dataset.cat === catKey) {
          item.style.display = "block";
        } else {
          item.style.display = "none";
        }
      });
      el.clearFilterBtn.style.display = "block";
    }
  };

  const ctxPie = document.getElementById("pieChart").getContext("2d");
  charts.pie = new Chart(ctxPie, {
    type: "pie",
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 0 }] },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw || 0;
              const total = context.chart._metasets[context.datasetIndex].total;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${pct}%`;
            }
          }
        }
      },
      onClick: handleChartClick
    }
  });

  const ctxBar = document.getElementById("barChart").getContext("2d");
  charts.bar = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Análise Atual',
          data: [],
          backgroundColor: '#0067FF',
          borderWidth: 0,
          borderRadius: 4
        },
        {
          label: 'Melhor Análise (Ref)',
          data: [],
          backgroundColor: '#9C9B9B',
          borderWidth: 0,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y', 
      plugins: { 
        legend: { 
          display: true, 
          position: 'top', 
          labels: { boxWidth: 12 },
          onClick: function(e, legendItem, legend) {
            Chart.defaults.plugins.legend.onClick.call(this, e, legendItem, legend);
            if (legendItem.datasetIndex === 1) {
              const isHidden = this.chart.isDatasetVisible(1) === false;
              if (charts.gauge1) {
                charts.gauge1.setDatasetVisibility(1, !isHidden);
                charts.gauge1.update();
                if(el.diffGauge1) el.diffGauge1.style.visibility = isHidden ? "hidden" : "visible";
              }
              if (charts.gauge2) {
                charts.gauge2.setDatasetVisibility(1, !isHidden);
                charts.gauge2.update();
                if(el.diffGauge2) el.diffGauge2.style.visibility = isHidden ? "hidden" : "visible";
              }
            }
          }
        } 
      }, 
      scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' } }, y: { grid: { display: false } } },
      onClick: handleChartClick
    }
  });

  // Gauge 1 (Total)
  const ctxG1 = document.getElementById("gaugeChart1").getContext("2d");
  charts.gauge1 = new Chart(ctxG1, {
    type: "doughnut",
    data: { 
      datasets: [
        { data: [0, 100], backgroundColor: ["#0067FF", "rgba(156,155,155,0.1)"], borderWidth: 0, weight: 2 },
        { data: [0, 100], backgroundColor: ["rgba(0,103,255,0.2)", "transparent"], borderWidth: 0, weight: 0.5 }
      ] 
    },
    options: { responsive: true, maintainAspectRatio: false, circumference: 180, rotation: 270, cutout: '70%', plugins: { tooltip: { enabled: false } } }
  });

  // Gauge 2 (Rate vs Ref)
  const ctxG2 = document.getElementById("gaugeChart2").getContext("2d");
  charts.gauge2 = new Chart(ctxG2, {
    type: "doughnut",
    data: { 
      datasets: [
        { data: [0, 100], backgroundColor: ["#179B75", "rgba(156,155,155,0.1)"], borderWidth: 0, weight: 2 },
        { data: [0, 100], backgroundColor: ["rgba(23,155,117,0.2)", "transparent"], borderWidth: 0, weight: 0.5 }
      ] 
    },
    options: { responsive: true, maintainAspectRatio: false, circumference: 180, rotation: 270, cutout: '70%', plugins: { tooltip: { enabled: false } } }
  });
}

function updateCharts(labels, data, bestData, colors, total, cost, rate, analysis) {
  // Pie
  charts.pie.data.labels = labels;
  charts.pie.data.datasets[0].data = data;
  charts.pie.data.datasets[0].backgroundColor = colors;
  charts.pie.update();

  // Bar
  charts.bar.data.labels = labels;
  charts.bar.data.datasets[0].data = data;
  charts.bar.data.datasets[0].backgroundColor = colors;
  
  // Only show Best Data if history exists and is not empty
  if (state.history && state.history.length > 0) {
    charts.bar.data.datasets[1].data = bestData;
    charts.bar.data.datasets[1].hidden = false;
  } else {
    charts.bar.data.datasets[1].hidden = true;
  }
  charts.bar.update();

  // Find max and min values in history for dynamic gauges and best lines
  let maxTotal = total;
  let maxCost = cost;
  let minTotal = total;
  let minCost = cost;
  
  if (analysis) {
    maxTotal = Math.max(total, analysis.maxEmission);
    maxCost = Math.max(cost, analysis.maxCost);
    minTotal = analysis.bestEntry.totalEmission;
    minCost = analysis.bestEntry.totalCost || 0;
  }

  // Gauge 1 (Total)
  const gauge1Max = Math.max(10, Math.max(total, maxTotal) * 1.3);
  charts.gauge1.data.datasets[0].data = [total, Math.max(0, gauge1Max - total)];
  charts.gauge1.data.datasets[1].data = [minTotal, Math.max(0, gauge1Max - minTotal)];
  let diffCarbon = 0;
  if (!state.history || state.history.length === 0) {
    charts.gauge1.data.datasets[1].hidden = true;
    el.diffGauge1.textContent = "";
    if(el.effGauge1) el.effGauge1.textContent = "";
    if(el.refGauge1) el.refGauge1.style.display = "block";
    charts.gauge1.data.datasets[0].backgroundColor[0] = "#0067FF"; // Default blue
  } else {
    charts.gauge1.data.datasets[1].hidden = false;
    diffCarbon = minTotal > 0 ? ((total - minTotal) / minTotal) * 100 : 0;
    charts.gauge1.data.datasets[0].backgroundColor[0] = diffCarbon <= 0 ? "#179B75" : "#E85C46";
    if (diffCarbon > 0) {
      el.diffGauge1.textContent = `▲ ${diffCarbon.toFixed(1)}%`;
      el.diffGauge1.style.color = "#E85C46";
      if(el.effGauge1) { el.effGauge1.textContent = getTranslation("verdict_less_efficient"); el.effGauge1.style.color = "#E85C46"; }
      if(el.refGauge1) el.refGauge1.style.display = "block";
    } else if (diffCarbon < 0) {
      el.diffGauge1.textContent = `▼ ${Math.abs(diffCarbon).toFixed(1)}%`;
      el.diffGauge1.style.color = "#179B75";
      if(el.effGauge1) { el.effGauge1.textContent = getTranslation("verdict_more_efficient"); el.effGauge1.style.color = "#179B75"; }
      if(el.refGauge1) el.refGauge1.style.display = "block";
    } else {
      el.diffGauge1.textContent = `-`;
      el.diffGauge1.style.color = "var(--text-muted)";
      if(el.effGauge1) { el.effGauge1.textContent = getTranslation("verdict_equivalent"); el.effGauge1.style.color = "var(--text-muted)"; }
      if(el.refGauge1) el.refGauge1.style.display = "none";
    }
  }
  charts.gauge1.update();
  if (el.kpiGauge1Val) el.kpiGauge1Val.textContent = `${total.toLocaleString("pt-BR", {maximumFractionDigits:2})} kgCO₂e`;

  // Gauge 2 (Cost)
  const gauge2Max = Math.max(100, Math.max(cost, maxCost) * 1.3);
  charts.gauge2.data.datasets[0].data = [cost, Math.max(0, gauge2Max - cost)];
  charts.gauge2.data.datasets[1].data = [minCost, Math.max(0, gauge2Max - minCost)];
  let diffCost = 0;
  if (!state.history || state.history.length === 0) {
    charts.gauge2.data.datasets[1].hidden = true;
    el.diffGauge2.textContent = "";
    if(el.effGauge2) el.effGauge2.textContent = "";
    if(el.refGauge2) el.refGauge2.style.display = "block";
    charts.gauge2.data.datasets[0].backgroundColor[0] = "#179B75";
  } else {
    charts.gauge2.data.datasets[1].hidden = false;
    diffCost = minCost > 0 ? ((cost - minCost) / minCost) * 100 : 0;
    charts.gauge2.data.datasets[0].backgroundColor[0] = diffCost <= 0 ? "#179B75" : "#E85C46";
    if (diffCost > 0) {
      el.diffGauge2.textContent = `▲ ${diffCost.toFixed(1)}%`;
      el.diffGauge2.style.color = "#E85C46";
      if(el.effGauge2) { el.effGauge2.textContent = getTranslation("verdict_less_efficient"); el.effGauge2.style.color = "#E85C46"; }
      if(el.refGauge2) el.refGauge2.style.display = "block";
    } else if (diffCost < 0) {
      el.diffGauge2.textContent = `▼ ${Math.abs(diffCost).toFixed(1)}%`;
      el.diffGauge2.style.color = "#179B75";
      if(el.effGauge2) { el.effGauge2.textContent = getTranslation("verdict_more_efficient"); el.effGauge2.style.color = "#179B75"; }
      if(el.refGauge2) el.refGauge2.style.display = "block";
    } else {
      el.diffGauge2.textContent = `-`;
      el.diffGauge2.style.color = "var(--text-muted)";
      if(el.effGauge2) { el.effGauge2.textContent = getTranslation("verdict_equivalent"); el.effGauge2.style.color = "var(--text-muted)"; }
      if(el.refGauge2) el.refGauge2.style.display = "none";
    }
  }
  charts.gauge2.update();
  if (el.kpiGauge2Val) el.kpiGauge2Val.textContent = `R$ ${cost.toLocaleString("pt-BR", {maximumFractionDigits:2})}`;
  
  updateBenchmarks();
}

/* =========================================================
   BENCHMARKS & MODAL
   ========================================================= */
const benchmarkData = {
  carbon: [
    { id: "cecarbon", name: "CECarbon (BR, 109 obras, 2024)", min: 110, avg: 210, max: 310 },
    { id: "caldas", name: "Caldas et al. (HIS, 2017)", min: 320, avg: 350, max: 380 },
    { id: "belizario", name: "Belizário (HIS, 2022)", min: 170, avg: 215, max: 260 },
    { id: "melo", name: "Melo et al. (Diferentes Tip., 2023)", min: 270, avg: 330, max: 390 },
    { id: "minunno", name: "Minunno et al. (Global, 2021)", min: 260, avg: 435, max: 610 },
    { id: "rock", name: "Rock et al. (Europa, 2022)", min: 70, avg: 295, max: 520 },
    { id: "zirkel_wood", name: "Zirkel (Wood frame)", min: 322, avg: 422, max: 522 },
    { id: "zirkel_steel", name: "Zirkel (Steel frame)", min: 673, avg: 773, max: 873 },
    { id: "zirkel_pre", name: "Zirkel (Pré-moldado)", min: 970, avg: 1070, max: 1170 },
  ]
};

function initBenchmarks() {
  const select = document.getElementById("bmCarbonType");
  if (select) {
    select.innerHTML = benchmarkData.carbon.map(b => `<option value="${b.id}">${b.name}</option>`).join("");
    if (state.bmCarbonType) select.value = state.bmCarbonType;
  }
  const input = document.getElementById("bmCubInput");
  if (input && state.bmCubValue) {
    input.value = state.bmCubValue;
  }
}

function openBenchmarkModal(type) {
  document.getElementById("benchmarkModal").style.display = "flex";
  updateBenchmarks();
}
function closeBenchmarkModal() {
  document.getElementById("benchmarkModal").style.display = "none";
}

function updateBenchmarks() {
  const typeSelect = document.getElementById("bmCarbonType");
  const cubInput = document.getElementById("bmCubInput");
  
  if (typeSelect) state.bmCarbonType = typeSelect.value;
  if (cubInput) state.bmCubValue = parseFloat(cubInput.value) || 0;
  saveState();

  let carbRate = parseFloat((el.kpiRate.textContent || "0").replace(/\./g, "").replace(",", ".")) || 0;
  let costRate = parseFloat((el.kpiCostRate.textContent || "0").replace(/[^\d,-]/g, "").replace(",", ".")) || 0;

  // 1. Carbon
  const carbRef = benchmarkData.carbon.find(c => c.id === state.bmCarbonType) || benchmarkData.carbon[0];
  const carbGoodMax = carbRef.min;
  const carbAvgMax = carbRef.max;
  
  let carbStatus = carbRate <= carbGoodMax ? "good" : (carbRate <= carbAvgMax ? "avg" : "bad");
  let carbIcon = carbStatus === "good" ? "▼" : (carbStatus === "avg" ? "▬" : "▲");
  let carbColor = carbStatus === "good" ? "var(--accent-green)" : (carbStatus === "avg" ? "#facc15" : "var(--accent-red)");
  
  if (document.getElementById("statusCarbon")) {
    const el = document.getElementById("statusCarbon");
    el.textContent = carbRate > 0 ? carbIcon : "➖";
    el.style.color = carbRate > 0 ? carbColor : "inherit";
  }

  const cRange = Math.max(carbRef.max * 1.5, carbRate * 1.2);
  let cPos = Math.min(100, Math.max(0, (carbRate / cRange) * 100));
  if (document.getElementById("bmCarbMarker")) document.getElementById("bmCarbMarker").style.left = cPos + "%";
  if (document.getElementById("bmCarbInfo")) document.getElementById("bmCarbInfo").textContent = `Faixa Ref: ${carbRef.min} a ${carbRef.max} kgCO₂e/m²`;

  // 2. Cost
  let cub = state.bmCubValue || 0;
  let costStatus = "none";
  let costIcon = "➖";
  let costColor = "inherit";
  if (cub > 0 && costRate > 0) {
    const costGoodMax = cub;
    const costAvgMax = cub * 1.2;
    costStatus = costRate <= costGoodMax ? "good" : (costRate <= costAvgMax ? "avg" : "bad");
    costIcon = costStatus === "good" ? "▼" : (costStatus === "avg" ? "▬" : "▲");
    costColor = costStatus === "good" ? "var(--accent-green)" : (costStatus === "avg" ? "#facc15" : "var(--accent-red)");
    
    const costRange = Math.max(costAvgMax * 1.5, costRate * 1.2);
    let costPos = Math.min(100, Math.max(0, (costRate / costRange) * 100));
    if (document.getElementById("bmCostMarker")) document.getElementById("bmCostMarker").style.left = costPos + "%";
    if (document.getElementById("bmCostInfo")) document.getElementById("bmCostInfo").textContent = `Faixa Ref: Bom < R$ ${cub.toFixed(2)} | Ruim > R$ ${costAvgMax.toFixed(2)}`;
  } else {
    if (document.getElementById("bmCostMarker")) document.getElementById("bmCostMarker").style.left = "0%";
    if (document.getElementById("bmCostInfo")) document.getElementById("bmCostInfo").textContent = "Informe o CUB Local para calcular a faixa.";
  }
  
  if (document.getElementById("statusCost")) {
    const el = document.getElementById("statusCost");
    el.textContent = costRate > 0 && cub > 0 ? costIcon : "➖";
    el.style.color = costRate > 0 && cub > 0 ? costColor : "inherit";
  }
}

function generateReport() {
  if (!state.history || state.history.length === 0) {
    alert("Não há cenários no histórico para exportar.");
    return;
  }

  const printArea = document.getElementById("printArea");
  if (!printArea) return;

  let html = "";
  const dateStr = new Date().toLocaleDateString("pt-BR");

  // Encontrar a "Melhor Escolha" (Menor Carbono e Menor Custo) para servir de referência
  let minCarbon = Infinity;
  let minCost = Infinity;
  state.history.forEach(h => {
    if (h.totalEmission > 0 && h.totalEmission < minCarbon) minCarbon = h.totalEmission;
    if (h.totalCost > 0 && h.totalCost < minCost) minCost = h.totalCost;
  });

  state.history.forEach((h, index) => {
    // Calcular indicadores do cenário
    const bArea = h.builtArea || 1;
    const carbRate = bArea > 0 ? (h.totalEmission / bArea) : 0;
    const costRate = bArea > 0 ? (h.totalCost / bArea) : 0;

    // Calcular diferença em relação à melhor escolha (Desempenho Geral e Custo Parcial)
    let diffCarbon = 0, diffCost = 0;
    let carbVerdict = "---", costVerdict = "---";
    let carbVerdictColor = "#555", costVerdictColor = "#555";
    let carbDiffStr = "-", costDiffStr = "-";

    if (minCarbon !== Infinity && minCarbon > 0) {
      diffCarbon = ((h.totalEmission - minCarbon) / minCarbon) * 100;
      if (diffCarbon > 0) {
        carbVerdict = getTranslation("verdict_less_efficient");
        carbVerdictColor = "#E85C46"; // Vermelho
        carbDiffStr = `▲ ${diffCarbon.toFixed(1)}%`;
      } else if (diffCarbon < 0) {
        carbVerdict = getTranslation("verdict_more_efficient");
        carbVerdictColor = "#179B75"; // Verde
        carbDiffStr = `▼ ${Math.abs(diffCarbon).toFixed(1)}%`;
      } else {
        carbVerdict = getTranslation("verdict_balanced");
        carbVerdictColor = "#179B75";
        carbDiffStr = getTranslation("verdict_equivalent");
      }
    }

    if (minCost !== Infinity && minCost > 0) {
      diffCost = ((h.totalCost - minCost) / minCost) * 100;
      if (diffCost > 0) {
        costVerdict = getTranslation("verdict_less_efficient");
        costVerdictColor = "#E85C46";
        costDiffStr = `▲ ${diffCost.toFixed(1)}%`;
      } else if (diffCost < 0) {
        costVerdict = getTranslation("verdict_more_efficient");
        costVerdictColor = "#179B75";
        costDiffStr = `▼ ${Math.abs(diffCost).toFixed(1)}%`;
      } else {
        costVerdict = getTranslation("verdict_balanced");
        costVerdictColor = "#179B75";
        costDiffStr = getTranslation("verdict_equivalent");
      }
    }

    // Calcular enquadramento
    const carbRef = benchmarkData.carbon.find(c => c.id === state.bmCarbonType) || benchmarkData.carbon[0];
    let carbStatus = carbRate <= carbRef.min ? getTranslation("status_good") : (carbRate <= carbRef.max ? getTranslation("status_avg") : getTranslation("status_bad"));
    
    let costStatus = "---";
    if (state.bmCubValue > 0) {
      costStatus = costRate <= state.bmCubValue ? getTranslation("status_good") : (costRate <= state.bmCubValue * 1.2 ? getTranslation("status_avg") : getTranslation("status_bad"));
    }

    // Gerar Tabela de Materiais
    let tableRows = "";
    Object.keys(h.selected).forEach(catKey => {
      const itemCode = h.selected[catKey];
      const q = h.quantities[catKey] || 0;
      if (itemCode && q > 0) {
        // Buscar nome e dados em itemsByCategory
        const catItems = itemsByCategory[catKey] || [];
        const itemObj = catItems.find(x => String(x.codigo_composicao) === String(itemCode));
        if (itemObj) {
          const catLabel = categories.find(c => c.category_key === catKey)?.label || catKey;
          const emissao = (itemObj.emissao_composicao_med || 0) * q;
          const pctEmissao = h.totalEmission > 0 ? ((emissao / h.totalEmission) * 100).toFixed(1) : 0;
          const custo = (itemObj.costs && itemObj.costs[h.selectedState] ? itemObj.costs[h.selectedState] : 0) * q;
          const pctCusto = h.totalCost > 0 ? ((custo / h.totalCost) * 100).toFixed(1) : 0;

          tableRows += `
            <tr>
              <td>${catLabel}</td>
              <td>${itemCode} - ${itemObj.descricao}</td>
              <td>${q.toLocaleString("pt-BR", {maximumFractionDigits:2})}</td>
              <td>${emissao.toLocaleString("pt-BR", {maximumFractionDigits:2})} kgCO₂e (${pctEmissao}%)</td>
              <td>R$ ${custo.toLocaleString("pt-BR", {maximumFractionDigits:2})} (${pctCusto}%)</td>
            </tr>
          `;
        }
      }
    });

    html += `
      <div class="report-page">
        <div class="report-header">
          <div class="report-title">
            <h1>${getTranslation("report_title")} ${index + 1}</h1>
            <h2>${h.name}</h2>
          </div>
          <div class="report-meta">
            ${getTranslation("report_date")}: ${dateStr}<br>
            ${getTranslation("report_state")}: ${h.selectedState}<br>
            ${getTranslation("report_area")}: ${bArea.toLocaleString("pt-BR")} m²
          </div>
        </div>

        <div class="report-kpi-grid">
          <div class="report-kpi">
            <div class="report-kpi-title">${getTranslation("report_total_carbon")}</div>
            <div class="report-kpi-val" style="color: ${carbVerdictColor};">${carbDiffStr}</div>
            <div style="font-size: 11pt; font-weight: bold; margin-top: 10px; color: ${carbVerdictColor};">${carbVerdict}</div>
            <div style="font-size: 9pt; color: #777;">${getTranslation("report_total")}: ${h.totalEmission.toLocaleString("pt-BR", {maximumFractionDigits:2})} kgCO₂e</div>
          </div>
          <div class="report-kpi">
            <div class="report-kpi-title">${getTranslation("report_total_cost")}</div>
            <div class="report-kpi-val" style="color: ${costVerdictColor};">${costDiffStr}</div>
            <div style="font-size: 11pt; font-weight: bold; margin-top: 10px; color: ${costVerdictColor};">${costVerdict}</div>
            <div style="font-size: 9pt; color: #777;">${getTranslation("report_total")}: R$ ${h.totalCost.toLocaleString("pt-BR", {maximumFractionDigits:2})}</div>
          </div>
        </div>

        <div class="report-bm-box">
          <div class="report-bm-title">${getTranslation("report_bm_box")}</div>
          <div class="report-bm-row">
            <div class="report-bm-item">
              <strong>${getTranslation("report_carb_intensity")}:</strong> ${carbRate.toLocaleString("pt-BR", {maximumFractionDigits:2})} kgCO₂e/m²<br>
              <span style="color:#555; font-size:9pt;">${getTranslation("report_ref")}: ${carbRef.name}</span>
              <div class="report-kpi-indicator">${getTranslation("report_status")}: ${carbStatus}</div>
            </div>
            <div class="report-bm-item">
              <strong>${getTranslation("report_cost_intensity")}:</strong> R$ ${costRate.toLocaleString("pt-BR", {maximumFractionDigits:2})} /m²<br>
              <span style="color:#555; font-size:9pt;">${getTranslation("report_cub_base")}: R$ ${(state.bmCubValue||0).toLocaleString("pt-BR", {maximumFractionDigits:2})}</span>
              <div class="report-kpi-indicator">${getTranslation("report_status")}: ${costStatus}</div>
            </div>
          </div>
        </div>

        <h3 style="color: var(--tpf-blue-inst); margin-bottom: 10px;">${getTranslation("report_materials")}</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>${getTranslation("report_th_cat")}</th>
              <th>${getTranslation("report_th_mat")}</th>
              <th>${getTranslation("report_th_qty")}</th>
              <th>${getTranslation("report_th_emis")}</th>
              <th>${getTranslation("report_th_cost")}</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || `<tr><td colspan="5" style="text-align:center;">${getTranslation("report_no_mat")}</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  });

  printArea.innerHTML = html;
  setTimeout(() => {
    window.print();
  }, 100);
}

document.addEventListener("DOMContentLoaded", bootstrap);
