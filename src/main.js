import { apiGet, apiPost } from "./api.js";
import { STORAGE_THEME } from "./config.js";
import { clearApiUrl, getStoredApiUrl, isValidAppsScriptUrl, setApiUrl } from "./storage.js";
import { rows, setRows, computeTotals } from "./state.js";
import { esc, formatEUR } from "./format.js";
import { initChart, renderChart } from "./ui/chart.js";
import { renderList } from "./ui/list.js";

const elStatus = document.getElementById("status");
const elTotal = document.getElementById("totalValue");
const listRoot = document.getElementById("assetList");
const chartEl = document.getElementById("chart");
const chartMode = document.getElementById("chartMode");

const btnAdd = document.getElementById("btnAdd");
const btnReload = document.getElementById("btnReload");
const btnChangeApi = document.getElementById("btnChangeApi");
const btnSaveApi = document.getElementById("btnSaveApi");
const btnCloseConnect = document.getElementById("btnCloseConnect");
const connectPanel = document.getElementById("connectPanel");
const apiUrlInput = document.getElementById("apiUrlInput");
const themeSelect = document.getElementById("themeSelect");

function setStatus(t){ elStatus.textContent = t; }

function setControlsEnabled(enabled){
  btnAdd.disabled = !enabled;
  btnReload.disabled = !enabled;
}

function showConnectPanel({ prefill = "" } = {}){
  connectPanel.removeAttribute("hidden");
  apiUrlInput.value = prefill;
  apiUrlInput.classList.remove("invalid");
  setControlsEnabled(false);
  setStatus("Connect your Apps Script URL to load data.");
  requestAnimationFrame(() => apiUrlInput.focus());
}

function hideConnectPanel({ enableControls = true } = {}){
  connectPanel.setAttribute("hidden", "");
  setControlsEnabled(enableControls);
}

function applyTheme(theme){
  document.documentElement.dataset.theme = theme;
}

function renderHeader(){
  const { total } = computeTotals(rows);
  elTotal.textContent = total > 0 ? formatEUR(total) : "€0.00";
}

function renderAll({ focusNew=false } = {}){
  renderHeader();
  renderChart(rows);
  renderList(rows, {
    root: listRoot,
    setStatus,
    onDelete: deleteRowById,
    onSave: saveCell,
    onRowsChanged: () => {
      renderHeader();
      renderChart(rows);
    },
    focusNew
  });
}

async function addRow(){
  setStatus("Adding…");
  await apiPost({ action:"addRow", type:"Other", currency:"EUR" });
  await reload({ focusNew:true });
}

async function deleteRowById(id){
  setStatus("Deleting…");
  await apiPost({ action:"deleteRow", id });
  await reload();
}

async function saveCell(id, column, value){
  await apiPost({ action:"updateCell", id, column, value });
}

async function reload({ focusNew=false } = {}){
  try{
    setStatus("Loading…");
    listRoot.textContent = "Loading…";

    const data = await apiGet();
    setRows(data.map(r => ({
      ID: r.ID ?? "",
      Name: r.Name ?? "",
      Type: r.Type ?? "Other",
      Value: r.Value ?? "",
      Currency: r.Currency ?? "EUR",
      Notes: r.Notes ?? "",
      UpdatedAt: r.UpdatedAt ?? "",
      _row: r._row
    })));

    renderAll({ focusNew });

    setStatus(`Loaded ${rows.length} asset(s)`);
  }catch(err){
    console.error(err);
    listRoot.innerHTML = `<div class="error">❌ ${esc(err.message || err)}</div>`;
    setStatus("Error");
  }
}

btnAdd.onclick = () => addRow().catch(err => setStatus("Add failed ❌ " + (err.message || err)));
btnReload.onclick = () => reload();
btnChangeApi.onclick = () => {
  showConnectPanel({ prefill: getStoredApiUrl() });
};
btnCloseConnect.onclick = () => {
  const hasValidUrl = isValidAppsScriptUrl(getStoredApiUrl());
  hideConnectPanel({ enableControls: hasValidUrl });
};

btnSaveApi.onclick = async () => {
  const cleaned = apiUrlInput.value.trim();
  if(!cleaned || !isValidAppsScriptUrl(cleaned)){
    apiUrlInput.classList.add("invalid");
    setStatus("Paste a valid Apps Script /exec URL.");
    return;
  }
  apiUrlInput.classList.remove("invalid");
  setApiUrl(cleaned);
  hideConnectPanel();
  await reload();
};

const storedTheme = localStorage.getItem(STORAGE_THEME) || "auto";
applyTheme(storedTheme);
themeSelect.value = storedTheme;
themeSelect.onchange = () => {
  const nextTheme = themeSelect.value;
  localStorage.setItem(STORAGE_THEME, nextTheme);
  applyTheme(nextTheme);
};

initChart({
  chartEl,
  modeSelectEl: chartMode,
  onModeChange: () => renderChart(rows)
});

if("serviceWorker" in navigator){
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if(location.protocol === "https:" || isLocalhost){
    navigator.serviceWorker.register("./sw.js").catch(err => {
      console.warn("Service worker registration failed", err);
    });
  }
}

const storedUrl = getStoredApiUrl();
if(storedUrl && isValidAppsScriptUrl(storedUrl)){
  hideConnectPanel();
  reload();
}else{
  if(storedUrl && !isValidAppsScriptUrl(storedUrl)){
    clearApiUrl();
  }
  listRoot.textContent = "Connect your Apps Script URL to load data.";
  showConnectPanel({ prefill: "" });
}
