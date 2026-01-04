import { apiGet, apiPost } from "./api.js";
import { STORAGE_LAST_CATEGORY, STORAGE_LAST_SUBCATEGORY, STORAGE_THEME } from "./config.js";
import { clearApiUrl, getStoredApiUrl, isValidAppsScriptUrl, setApiUrl } from "./storage.js";
import {
  rows,
  setRows,
  dirtyQueue,
  setDirtyQueue,
  meta,
  setMeta,
  normalizeRow,
  computeTotal,
  getCategories,
  getSubcategories,
  getFilteredTransactions,
  loadCache,
  saveCache,
  enqueueAddRow,
  enqueueUpdateCell,
  enqueueDeleteRow
} from "./state.js";
import { esc, formatEUR, toLocalDateTimeInputValue, toNumber } from "./format.js";
import { initChart, renderChart } from "./ui/chart.js";
import { renderList } from "./ui/list.js";

const elStatus = document.getElementById("status");
const elTotal = document.getElementById("totalValue");
const listRoot = document.getElementById("transactionList");
const chartPieEl = document.getElementById("chartPie");
const chartTimelineEl = document.getElementById("chartTimeline");
const chartMode = document.getElementById("chartMode");
const chartPages = document.getElementById("chartPages");
const chartDots = document.getElementById("chartDots");

const categoryFilterSelect = document.getElementById("categoryFilter");
const subcategoryFilterSelect = document.getElementById("subcategoryFilter");

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
const transactionCategorySelect = document.getElementById("transactionCategorySelect");
const transactionCategoryInput = document.getElementById("transactionCategoryInput");
const transactionSubcategorySelect = document.getElementById("transactionSubcategorySelect");
const transactionSubcategoryInput = document.getElementById("transactionSubcategoryInput");
const transactionAmountInput = document.getElementById("transactionAmountInput");
const transactionDateInput = document.getElementById("transactionDateInput");
const transactionNoteInput = document.getElementById("transactionNoteInput");

let syncState = "Idle";
let statusNote = "";
let syncTimer = null;
let selectedCategory = "";
let selectedSubcategory = "All";

const NEW_OPTION_VALUE = "__new__";

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
  connectPanel.hidden = false;
  apiUrlInput.value = prefill;
  apiUrlInput.classList.remove("invalid");
  setControlsEnabled(false);
  setStatus("Connect your Apps Script URL to load data.");
  requestAnimationFrame(() => apiUrlInput.focus());
}

function hideConnectPanel({ enableControls = true } = {}){
  connectPanel.hidden = true;
  setControlsEnabled(enableControls);
}

function applyTheme(theme){
  document.documentElement.dataset.theme = theme;
}

function renderHeader(filteredRows){
  const total = computeTotal(filteredRows);
  elTotal.textContent = total !== 0 ? formatEUR(total) : "€0.00";
}

function renderFilters(){
  const categories = getCategories(rows);
  if(!categories.length){
    categoryFilterSelect.innerHTML = `<option value="">No categories yet</option>`;
    categoryFilterSelect.disabled = true;
    subcategoryFilterSelect.innerHTML = `<option value="All">All</option>`;
    subcategoryFilterSelect.disabled = true;
    selectedCategory = "";
    selectedSubcategory = "All";
    return;
  }

  categoryFilterSelect.disabled = false;
  categoryFilterSelect.innerHTML = categories.map((category) => (
    `<option value="${esc(category)}">${esc(category)}</option>`
  )).join("");

  if(!categories.includes(selectedCategory)){
    selectedCategory = categories[0];
  }
  categoryFilterSelect.value = selectedCategory;

  updateSubcategoryFilter();
}

function updateSubcategoryFilter(){
  const subcategories = getSubcategories(selectedCategory, rows);
  subcategoryFilterSelect.disabled = false;
  const options = ["All", ...subcategories];
  subcategoryFilterSelect.innerHTML = options.map((subcategory) => (
    `<option value="${esc(subcategory)}">${esc(subcategory)}</option>`
  )).join("");

  if(!options.includes(selectedSubcategory)){
    selectedSubcategory = "All";
  }
  subcategoryFilterSelect.value = selectedSubcategory;
}

function renderAll(){
  renderFilters();
  const filteredRows = selectedCategory
    ? getFilteredTransactions(selectedCategory, selectedSubcategory, rows)
    : [];
  renderHeader(filteredRows);
  renderChart(filteredRows);
  renderList(filteredRows, {
    root: listRoot,
    onDelete: deleteRowById
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

function createEmptyRow({ category = "", subcategory = "" } = {}){
  const tempId = `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return {
    ID: tempId,
    Category: category,
    Subcategory: subcategory,
    Date: toLocalDateTimeInputValue(new Date()),
    Amount: "",
    Note: "",
    Currency: "EUR",
    UpdatedAt: "",
    _row: ""
  };
}

function updateNewOptionVisibility(selectEl, inputEl){
  if(!selectEl || !inputEl) return;
  const showInput = selectEl.value === NEW_OPTION_VALUE;
  inputEl.hidden = !showInput;
  if(showInput){
    requestAnimationFrame(() => inputEl.focus());
  }
}

function setTransactionDialogDefaults(){
  if(transactionAmountInput){
    transactionAmountInput.value = "";
    transactionAmountInput.classList.remove("invalid");
  }
  if(transactionDateInput){
    transactionDateInput.value = toLocalDateTimeInputValue(new Date());
  }
  if(transactionNoteInput){
    transactionNoteInput.value = "";
  }
}

function buildCategoryOptions({ includeNew = true } = {}){
  const categories = getCategories(rows);
  const options = categories.map((category) => (
    `<option value="${esc(category)}">${esc(category)}</option>`
  ));
  if(includeNew){
    options.push(`<option value="${NEW_OPTION_VALUE}">Add new…</option>`);
  }
  return options.join("");
}

function buildSubcategoryOptions(category, { includeNew = true } = {}){
  const subs = getSubcategories(category, rows);
  const options = [
    `<option value="">None</option>`,
    ...subs.map((subcategory) => (
      `<option value="${esc(subcategory)}">${esc(subcategory)}</option>`
    ))
  ];
  if(includeNew){
    options.push(`<option value="${NEW_OPTION_VALUE}">Add new…</option>`);
  }
  return options.join("");
}

function openTransactionDialog(){
  if(!transactionDialog) return;

  const categories = getCategories(rows);
  transactionCategorySelect.innerHTML = buildCategoryOptions();

  const lastCategory = localStorage.getItem(STORAGE_LAST_CATEGORY) || "";
  const defaultCategory = categories.includes(lastCategory)
    ? lastCategory
    : (selectedCategory || categories[0] || "");

  if(defaultCategory){
    transactionCategorySelect.value = defaultCategory;
  }else{
    transactionCategorySelect.value = NEW_OPTION_VALUE;
  }

  transactionCategoryInput.value = "";
  updateNewOptionVisibility(transactionCategorySelect, transactionCategoryInput);

  const currentCategory = transactionCategorySelect.value === NEW_OPTION_VALUE
    ? ""
    : transactionCategorySelect.value;

  transactionSubcategorySelect.innerHTML = buildSubcategoryOptions(currentCategory);

  const lastSubcategory = localStorage.getItem(STORAGE_LAST_SUBCATEGORY) || "";
  const subcategories = getSubcategories(currentCategory, rows);
  if(subcategories.includes(lastSubcategory)){
    transactionSubcategorySelect.value = lastSubcategory;
  }else{
    transactionSubcategorySelect.value = "";
  }
  transactionSubcategoryInput.value = "";
  updateNewOptionVisibility(transactionSubcategorySelect, transactionSubcategoryInput);

  setTransactionDialogDefaults();
  transactionDialog.showModal();
  requestAnimationFrame(() => transactionCategorySelect?.focus());
}

async function addTransaction({ category, subcategory, amount, dateTime, note } = {}){
  const newRow = createEmptyRow({ category, subcategory });
  newRow.Category = category;
  newRow.Subcategory = subcategory;
  newRow.Amount = amount;
  newRow.Date = dateTime;
  newRow.Note = note || "";

  setRows([...rows, newRow]);
  setDirtyQueue(enqueueAddRow(dirtyQueue, newRow));
  markDirty();
  renderAll();
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

async function applyQueueOperation(op, { keepalive = false } = {}){
  if(op.op === "updateCell"){
    return apiPost({ action:"updateCell", id: op.id, column: op.column, value: op.value }, { keepalive });
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
    setMeta({ lastLoadAt: Date.now() });

    const normalized = data.map((r) => normalizeRow(r));
    setRows(normalized);

    saveCache();
    renderAll();
    setStatus(`Loaded ${rows.length} transaction${rows.length === 1 ? "" : "s"}`);
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

categoryFilterSelect.addEventListener("change", () => {
  selectedCategory = categoryFilterSelect.value;
  selectedSubcategory = "All";
  updateSubcategoryFilter();
  renderAll();
});

subcategoryFilterSelect.addEventListener("change", () => {
  selectedSubcategory = subcategoryFilterSelect.value || "All";
  renderAll();
});

transactionCategorySelect.addEventListener("change", () => {
  updateNewOptionVisibility(transactionCategorySelect, transactionCategoryInput);
  const categoryValue = transactionCategorySelect.value === NEW_OPTION_VALUE
    ? ""
    : transactionCategorySelect.value;
  transactionSubcategorySelect.innerHTML = buildSubcategoryOptions(categoryValue);
  transactionSubcategorySelect.value = "";
  transactionSubcategoryInput.value = "";
  updateNewOptionVisibility(transactionSubcategorySelect, transactionSubcategoryInput);
});

transactionSubcategorySelect.addEventListener("change", () => {
  updateNewOptionVisibility(transactionSubcategorySelect, transactionSubcategoryInput);
});

if(transactionDialogForm){
  transactionDialogForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    let categoryValue = transactionCategorySelect.value;
    if(categoryValue === NEW_OPTION_VALUE){
      categoryValue = transactionCategoryInput.value.trim();
      if(!categoryValue){
        transactionCategoryInput.classList.add("invalid");
        setStatus("Enter a category.");
        return;
      }
    }
    transactionCategoryInput.classList.remove("invalid");

    let subcategoryValue = transactionSubcategorySelect.value;
    if(subcategoryValue === NEW_OPTION_VALUE){
      subcategoryValue = transactionSubcategoryInput.value.trim();
      if(!subcategoryValue){
        transactionSubcategoryInput.classList.add("invalid");
        setStatus("Enter a subcategory.");
        return;
      }
    }
    transactionSubcategoryInput.classList.remove("invalid");

    const amountRaw = transactionAmountInput.value.trim();
    if(!amountRaw){
      transactionAmountInput.classList.add("invalid");
      setStatus("Enter an amount.");
      return;
    }
    const amountNumber = toNumber(amountRaw);
    if(!Number.isFinite(amountNumber)){
      transactionAmountInput.classList.add("invalid");
      setStatus("Invalid number ❌");
      return;
    }
    transactionAmountInput.classList.remove("invalid");

    const dateTime = transactionDateInput.value || toLocalDateTimeInputValue(new Date());
    const note = transactionNoteInput.value.trim();
    await addTransaction({
      category: categoryValue,
      subcategory: subcategoryValue || "",
      amount: amountRaw,
      dateTime,
      note
    });

    selectedCategory = categoryValue;
    selectedSubcategory = subcategoryValue || "All";
    localStorage.setItem(STORAGE_LAST_CATEGORY, categoryValue);
    if(subcategoryValue){
      localStorage.setItem(STORAGE_LAST_SUBCATEGORY, subcategoryValue);
    }else{
      localStorage.removeItem(STORAGE_LAST_SUBCATEGORY);
    }

    renderAll();
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
  onModeChange: () => renderChart(getFilteredTransactions(selectedCategory, selectedSubcategory, rows))
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
  setRows(cached.rows.map((row) => normalizeRow(row)));
  setDirtyQueue(cached.dirtyQueue || []);
  setMeta(cached.meta || {});
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
