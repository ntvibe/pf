import { apiGet, apiPost } from "./api.js";
import { clearApiUrl } from "./storage.js";
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

function setStatus(t){ elStatus.textContent = t; }

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
btnChangeApi.onclick = async () => { clearApiUrl(); await reload(); };

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

reload();
