import { apiGet, apiPost } from "./api.js";
import { STORAGE_THEME } from "./config.js";
import { clearApiUrl, getStoredApiUrl, isValidAppsScriptUrl, setApiUrl } from "./storage.js";
import {
  rows,
  setRows,
  dirtyQueue,
  setDirtyQueue,
  meta,
  setMeta,
  columnConfig,
  setColumnConfig,
  detectColumns,
  normalizeRow,
  computeTotals,
  loadCache,
  saveCache,
  enqueueAddRow,
  enqueueUpdateCell,
  enqueueDeleteRow,
  isTempId
} from "./state.js";
import { esc, formatEUR, toLocalDateTimeInputValue, toNumber } from "./format.js";
import { initChart, renderChart } from "./ui/chart.js";
import { renderList } from "./ui/list.js";

const elStatus = document.getElementById("status");
const elTotal = document.getElementById("totalValue");
const listRoot = document.getElementById("assetList");
const chartPieEl = document.getElementById("chartPie");
const chartTimelineEl = document.getElementById("chartTimeline");
const chartMode = document.getElementById("chartMode");
const chartPages = document.getElementById("chartPages");
const chartDots = document.getElementById("chartDots");
const timelineFilters = document.getElementById("timelineFilters");

const btnAdd = document.getElementById("btnAdd");
const btnReload = document.getElementById("btnReload");
const btnChangeApi = document.getElementById("btnChangeApi");
const btnSaveApi = document.getElementById("btnSaveApi");
const btnCloseConnect = document.getElementById("btnCloseConnect");
const connectPanel = document.getElementById("connectPanel");
const apiUrlInput = document.getElementById("apiUrlInput");
const themeSelect = document.getElementById("themeSelect");
const transactionDialog = document.getElementById("transactionDialog");
const transactionDialogForm = document.getElementById("transactionDialogForm");
const transactionTypeSelect = document.getElementById("transactionTypeSelect");
const transactionValueInput = document.getElementById("transactionValueInput");
const transactionDateInput = document.getElementById("transactionDateInput");

let syncState = "Idle";
let statusNote = "";
let syncTimer = null;

function formatTime(ts){
  if(!ts) return "";
  const date = new Date(ts);
  if(Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function updateStatus(){
  const parts = [syncState];
  if(meta.lastSyncAt){
    parts.push(`Last sync ${formatTime(meta.lastSyncAt)}`);
  }
  if(statusNote){
    parts.push(statusNote);
  }
  elStatus.textContent = parts.join(" • ");
}

function setStatus(note){
  statusNote = note || "";
  updateStatus();
}

function setSyncState(state){
  syncState = state;
  updateStatus();
  updateSyncBadge();
}

function updateSyncBadge(){
  if(syncState === "Dirty" || syncState === "Error"){
    btnReload.classList.add("dirty");
  }else{
    btnReload.classList.remove("dirty");
  }
}

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
  elTotal.textContent = total !== 0 ? formatEUR(total) : "€0.00";
}

function renderAll({ focusRowId = null } = {}){
  renderHeader();
  renderChart(rows);
  renderList(rows, {
    root: listRoot,
    setStatus,
    onDelete: deleteRowById,
    onUpdate: updateCell,
    onAddEntry: openTransactionDialog,
    onRowsChanged: () => {
      renderHeader();
      renderChart(rows);
      saveCache();
    },
    supportsDate: columnConfig.date === "Date",
    focusRowId
  });
}

function markDirty(){
  if(dirtyQueue.length){
    setSyncState("Dirty");
  }else if(meta.lastSyncAt){
    setSyncState("Synced");
  }else{
    setSyncState("Idle");
  }
  saveCache();
}

function createEmptyRow({ assetName = "", entryName = "" } = {}){
  const tempId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return {
    ID: tempId,
    Asset: assetName,
    Entry: entryName,
    Type: "Other",
    Value: "",
    Currency: "EUR",
    Date: toLocalDateTimeInputValue(new Date()),
    Notes: "",
    UpdatedAt: "",
    _row: ""
  };
}

function setTransactionDialogDefaults({ typeName = "" } = {}){
  if(transactionTypeSelect){
    transactionTypeSelect.value = typeName || "Other";
  }
  if(transactionValueInput){
    transactionValueInput.value = "";
    transactionValueInput.classList.remove("invalid");
  }
  if(transactionDateInput){
    transactionDateInput.value = toLocalDateTimeInputValue(new Date());
  }
}

function openTransactionDialog({ typeName = "" } = {}){
  if(!transactionDialog) return;
  setTransactionDialogDefaults({ typeName });
  transactionDialog.showModal();
  requestAnimationFrame(() => transactionTypeSelect?.focus());
}

async function addEntryToAsset({ typeName, value, dateTime } = {}){
  const assetName = String(typeName || "Other");
  const newRow = createEmptyRow({ assetName, entryName: "" });
  if(typeName) newRow.Type = typeName;
  newRow.Asset = assetName;
  if(value != null) newRow.Value = value;
  if(dateTime) newRow.Date = dateTime;
  setRows([...rows, newRow]);
  setDirtyQueue(enqueueAddRow(dirtyQueue, newRow));
  markDirty();
  renderAll({ focusRowId: newRow.ID });
}

async function deleteRowById(id){
  const nextRows = rows.filter((r) => String(r.ID) !== String(id));
  setRows(nextRows);
  setDirtyQueue(enqueueDeleteRow(dirtyQueue, id));
  markDirty();
  renderAll();
}

async function updateCell(id, column, value){
  const target = rows.find((r) => String(r.ID) === String(id));
  if(target){
    target[column] = value;
  }
  setDirtyQueue(enqueueUpdateCell(dirtyQueue, { id, column, value }));
  markDirty();
}

function mapUpdateColumn(column){
  if(column === "Asset") return columnConfig.asset === "Asset" ? "Asset" : "Name";
  if(column === "Entry") return columnConfig.entry || "Entry";
  if(column === "Date") return columnConfig.date || "Date";
  return column;
}

async function applyQueueOperation(op, { keepalive = false } = {}){
  if(op.op === "updateCell"){
    const column = mapUpdateColumn(op.column);
    return apiPost({ action:"updateCell", id: op.id, column, value: op.value }, { keepalive });
  }
  if(op.op === "deleteRow"){
    return apiPost({ action:"deleteRow", id: op.id }, { keepalive });
  }
  if(op.op === "addRow"){
    return apiPost({ action:"addRow", ...op.payload }, { keepalive });
  }
  return null;
}

function replaceTempId(tempId, newId){
  if(!newId) return;
  const updated = rows.map((row) => {
    if(String(row.ID) === String(tempId)){
      return { ...row, ID: newId };
    }
    return row;
  });
  setRows(updated);
  const nextQueue = dirtyQueue.map((op) => {
    if(op.id === tempId){
      return { ...op, id: newId };
    }
    return op;
  });
  setDirtyQueue(nextQueue);
}

async function syncQueue({ keepalive = false, limit = null, silent = false } = {}){
  if(!dirtyQueue.length) return { didWork: false };

  if(!silent){
    setSyncState("Syncing");
    setStatus("Syncing changes…");
  }

  let queue = [...dirtyQueue];
  let processed = 0;

  while(queue.length && (limit == null || processed < limit)){
    const op = queue[0];
    try{
      const res = await applyQueueOperation(op, { keepalive });
      if(op.op === "addRow"){
        const newId = res?.id;
        if(newId) replaceTempId(op.tempId, newId);
      }
      queue.shift();
      processed += 1;
    }catch(err){
      console.error(err);
      setDirtyQueue(queue);
      if(!silent){
        setSyncState("Error");
        setStatus("Sync error");
      }
      saveCache();
      throw err;
    }
  }

  setDirtyQueue(queue);
  saveCache();
  return { didWork: processed > 0, queueEmpty: queue.length === 0 };
}

async function refreshFromServer({ allowReplaceWhenDirty = false } = {}){
  if(dirtyQueue.length && !allowReplaceWhenDirty){
    setStatus("Local edits pending; using cached data.");
    setSyncState("Dirty");
    return false;
  }

  try{
    setStatus("Loading…");
    const data = await apiGet();
    const config = detectColumns(data);
    setMeta({ lastLoadAt: Date.now(), columns: config });

    const normalized = data.map((r) => normalizeRow(r, config));
    setRows(normalized);
    setColumnConfig(config);

    saveCache();
    renderAll();
    setStatus(`Loaded ${rows.length} asset(s)`);
    if(!dirtyQueue.length){
      setSyncState(meta.lastSyncAt ? "Synced" : "Idle");
    }
    return true;
  }catch(err){
    console.error(err);
    listRoot.innerHTML = `<div class="error">❌ ${esc(err.message || err)}</div>`;
    setSyncState("Error");
    setStatus("Error loading");
    return false;
  }
}

async function syncNow({ forceRefresh = false } = {}){
  if(!dirtyQueue.length){
    if(forceRefresh){
      const refreshed = await refreshFromServer({ allowReplaceWhenDirty: true });
      if(refreshed){
        setSyncState("Synced");
      }
    }
    return;
  }

  try{
    const result = await syncQueue();
    if(result.queueEmpty){
      setMeta({ lastSyncAt: Date.now() });
      setDirtyQueue([]);
      saveCache();
      renderAll();
      setSyncState("Synced");
      setStatus("Synced");
    }else{
      setSyncState("Dirty");
    }
  }catch(err){
    setSyncState("Error");
    setStatus("Sync failed");
  }
}

function scheduleSync(){
  if(syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if(dirtyQueue.length){
      syncNow().catch(() => {});
    }
  }, 60000);
}

function handleBackgroundSync(){
  if(!dirtyQueue.length) return;

  const storedUrl = getStoredApiUrl();
  if(!storedUrl || !isValidAppsScriptUrl(storedUrl)) return;

  const beaconSupported = navigator.sendBeacon && dirtyQueue.length > 0;
  if(beaconSupported){
    const candidate = dirtyQueue.find((op) => op.op !== "addRow");
    if(candidate){
      try{
        const payload = JSON.stringify({
          action: candidate.op,
          id: candidate.id,
          column: candidate.column,
          value: candidate.value
        });
        navigator.sendBeacon(storedUrl, payload);
        return;
      }catch(err){
        console.warn("sendBeacon failed", err);
      }
    }
  }

  void syncQueue({ keepalive: true, limit: 2, silent: true }).catch(() => {});
}

btnAdd.onclick = () => openTransactionDialog();
btnReload.onclick = () => syncNow({ forceRefresh: true });
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
  await refreshFromServer({ allowReplaceWhenDirty: true });
};

if(transactionDialogForm){
  transactionDialogForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const valueRaw = transactionValueInput.value.trim();
    if(!valueRaw){
      transactionValueInput.classList.add("invalid");
      setStatus("Enter a value.");
      return;
    }
    const valueNumber = toNumber(valueRaw);
    if(!Number.isFinite(valueNumber)){
      transactionValueInput.classList.add("invalid");
      setStatus("Invalid number ❌");
      return;
    }
    transactionValueInput.classList.remove("invalid");

    const typeName = transactionTypeSelect.value || "Other";
    const dateTime = transactionDateInput.value || toLocalDateTimeInputValue(new Date());
    await addEntryToAsset({ typeName, value: valueRaw, dateTime });
    transactionDialog.close();
  });
}

const storedTheme = localStorage.getItem(STORAGE_THEME) || "auto";
applyTheme(storedTheme);
themeSelect.value = storedTheme;
themeSelect.onchange = () => {
  const nextTheme = themeSelect.value;
  localStorage.setItem(STORAGE_THEME, nextTheme);
  applyTheme(nextTheme);
};

initChart({
  pieEl: chartPieEl,
  timelineEl: chartTimelineEl,
  modeSelectEl: chartMode,
  pagesElement: chartPages,
  dotsElement: chartDots,
  filterElement: timelineFilters,
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

const cached = loadCache();
if(cached.rows.length){
  setRows(cached.rows);
  setDirtyQueue(cached.dirtyQueue || []);
  setMeta(cached.meta || {});
  if(cached.meta?.columns){
    setColumnConfig(cached.meta.columns);
  }
  renderAll();
}

const storedUrl = getStoredApiUrl();
if(storedUrl && isValidAppsScriptUrl(storedUrl)){
  hideConnectPanel();
  refreshFromServer({ allowReplaceWhenDirty: false });
  scheduleSync();
}else{
  if(storedUrl && !isValidAppsScriptUrl(storedUrl)){
    clearApiUrl();
  }
  listRoot.textContent = "Connect your Apps Script URL to load data.";
  showConnectPanel({ prefill: "" });
}

if(dirtyQueue.length){
  setSyncState("Dirty");
}else if(meta.lastSyncAt){
  setSyncState("Synced");
}else{
  setSyncState("Idle");
}

window.addEventListener("beforeunload", handleBackgroundSync);
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "hidden"){
    handleBackgroundSync();
  }
});
