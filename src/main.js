import { apiGet, apiPost } from "./api.js";
import { clearApiUrl } from "./storage.js";
import { rows, setRows } from "./state.js";
import { esc } from "./format.js";
import { renderCards } from "./ui/cards.js";
import { initChart, renderChart } from "./ui/chart.js";
import { renderTable } from "./ui/table.js";

const elStatus = document.getElementById("status");
const elCards = document.getElementById("cards");
const root = document.getElementById("root");
const chartEl = document.getElementById("chart");
const chartMode = document.getElementById("chartMode");

const btnAdd = document.getElementById("btnAdd");
const btnReload = document.getElementById("btnReload");
const btnChangeApi = document.getElementById("btnChangeApi");

function setStatus(t){ elStatus.textContent = t; }

function renderAll({ focusNew=false } = {}){
  renderCards(rows, elCards);
  renderChart(rows);
  renderTable(rows, {
    root,
    setStatus,
    onDelete: deleteRowById,
    onSave: saveCell,
    onRowsChanged: () => {
      renderCards(rows, elCards);
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
    root.textContent = "Loading…";

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
    root.innerHTML = `<div class="error">❌ ${esc(err.message || err)}</div>`;
    elCards.innerHTML = "";
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

reload();
