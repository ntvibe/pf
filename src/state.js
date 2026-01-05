import { toNumber } from "./format.js";

export const CACHE_KEYS = {
  rows: "pf_cache_rows_v2",
  meta: "pf_cache_meta_v2",
  dirtyQueue: "pf_dirty_queue_v2"
};

export const COLUMN_NAMES = {
  id: "ID",
  category: "Category",
  subcategory: "Subcategory",
  date: "Date",
  amount: "Amount",
  note: "Note",
  currency: "Currency",
  updatedAt: "UpdatedAt"
};

export let rows = [];
export let dirtyQueue = [];
export let meta = { lastSyncAt: null, lastLoadAt: null };

export function setRows(nextRows){
  rows = nextRows;
}

export function setDirtyQueue(nextQueue){
  dirtyQueue = nextQueue;
}

export function setMeta(nextMeta){
  meta = { ...meta, ...nextMeta };
}

export function normalizeRow(rawRow){
  const rawCategory = String(rawRow[COLUMN_NAMES.category] ?? rawRow.Category ?? "").trim();
  const rawSubcategory = String(rawRow[COLUMN_NAMES.subcategory] ?? rawRow.Subcategory ?? "").trim();
  const rawDate = rawRow[COLUMN_NAMES.date] ?? rawRow.Date ?? "";
  const rawAmount = rawRow[COLUMN_NAMES.amount] ?? rawRow.Amount ?? "";
  const rawNote = rawRow[COLUMN_NAMES.note] ?? rawRow.Note ?? "";
  const rawCurrency = rawRow[COLUMN_NAMES.currency] ?? rawRow.Currency ?? "EUR";
  const rawUpdatedAt = rawRow[COLUMN_NAMES.updatedAt] ?? rawRow.UpdatedAt ?? "";

  return {
    ID: rawRow[COLUMN_NAMES.id] ?? rawRow.ID ?? "",
    Category: rawCategory,
    Subcategory: rawSubcategory,
    Date: rawDate ?? "",
    Amount: rawAmount ?? "",
    Note: rawNote ?? "",
    Currency: rawCurrency ?? "EUR",
    UpdatedAt: rawUpdatedAt ?? "",
    _row: rawRow._row
  };
}

export function parseRowDate(row){
  const raw = String(row.Date ?? row.UpdatedAt ?? "").trim();
  if(!raw) return null;
  const parsed = new Date(raw);
  if(Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function getCategories(inputRows = rows){
  const set = new Set();
  for(const row of inputRows){
    const name = String(row.Category ?? "").trim();
    if(name) set.add(name);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function getSubcategories(category, inputRows = rows){
  if(!category) return [];
  const set = new Set();
  for(const row of inputRows){
    if(String(row.Category ?? "").trim() !== category) continue;
    const sub = String(row.Subcategory ?? "").trim();
    if(sub) set.add(sub);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function getFilteredTransactions(category, subcategoryOrAll, inputRows = rows){
  if(!category) return [];
  const wantsSubcategory = subcategoryOrAll && subcategoryOrAll !== "All";
  const filtered = inputRows.filter((row) => {
    if(String(row.Category ?? "").trim() !== category) return false;
    if(wantsSubcategory){
      return String(row.Subcategory ?? "").trim() === subcategoryOrAll;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    const dateA = parseRowDate(a);
    const dateB = parseRowDate(b);
    const timeA = dateA ? dateA.getTime() : 0;
    const timeB = dateB ? dateB.getTime() : 0;
    return timeB - timeA;
  });
}

export function computeTotal(inputRows = rows){
  let total = 0;
  for(const row of inputRows){
    const num = toNumber(row.Amount);
    if(Number.isFinite(num)) total += num;
  }
  return total;
}

export function buildChartData(mode, inputRows = rows){
  const map = new Map();
  for(const row of inputRows){
    const amount = toNumber(row.Amount);
    if(!Number.isFinite(amount) || amount <= 0) continue;
    const key = mode === "subcategory"
      ? (String(row.Subcategory ?? "").trim() || "Uncategorized")
      : (String(row.Category ?? "").trim() || "Uncategorized");
    map.set(key, (map.get(key) || 0) + amount);
  }

  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const top = 10;
  if(sorted.length > top){
    const keep = sorted.slice(0, top);
    const rest = sorted.slice(top).reduce((sum, [, value]) => sum + value, 0);
    keep.push(["Other", rest]);
    return keep.map(([name, value]) => ({ name, value }));
  }
  return sorted.map(([name, value]) => ({ name, value }));
}

export function buildTimelineSeries(inputRows = rows){
  const map = new Map();
  for(const row of inputRows){
    const amount = toNumber(row.Amount);
    if(!Number.isFinite(amount)) continue;
    const date = parseRowDate(row);
    if(!date) continue;
    const key = date.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + amount);
  }
  let runningTotal = 0;
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => {
      runningTotal += value;
      return { date, value: runningTotal };
    });
}

export function loadCache(){
  let cachedRows = [];
  let cachedQueue = [];
  let cachedMeta = {};
  try{
    cachedRows = JSON.parse(localStorage.getItem(CACHE_KEYS.rows) || "[]");
  }catch{
    cachedRows = [];
  }
  try{
    cachedQueue = JSON.parse(localStorage.getItem(CACHE_KEYS.dirtyQueue) || "[]");
  }catch{
    cachedQueue = [];
  }
  try{
    cachedMeta = JSON.parse(localStorage.getItem(CACHE_KEYS.meta) || "{}");
  }catch{
    cachedMeta = {};
  }
  return { rows: cachedRows, dirtyQueue: cachedQueue, meta: cachedMeta };
}

export function saveCache(){
  localStorage.setItem(CACHE_KEYS.rows, JSON.stringify(rows));
  localStorage.setItem(CACHE_KEYS.dirtyQueue, JSON.stringify(dirtyQueue));
  localStorage.setItem(CACHE_KEYS.meta, JSON.stringify(meta));
}

export function isTempId(id){
  return String(id || "").startsWith("tmp_");
}

export function buildAddPayload(row){
  return {
    [COLUMN_NAMES.category]: row.Category ?? "",
    [COLUMN_NAMES.subcategory]: row.Subcategory ?? "",
    [COLUMN_NAMES.date]: row.Date ?? "",
    [COLUMN_NAMES.amount]: row.Amount ?? "",
    [COLUMN_NAMES.note]: row.Note ?? "",
    [COLUMN_NAMES.currency]: row.Currency ?? "EUR"
  };
}

export function enqueueAddRow(queue, row){
  const tempId = row.ID;
  return [
    ...queue,
    {
      op: "addRow",
      tempId,
      payload: buildAddPayload(row),
      t: Date.now()
    }
  ];
}

export function enqueueUpdateCell(queue, { id, column, value }){
  if(isTempId(id)){
    const next = queue.map((op) => {
      if(op.op === "addRow" && op.tempId === id){
        return {
          ...op,
          payload: { ...op.payload, [column]: value },
          t: Date.now()
        };
      }
      return op;
    });
    return next;
  }

  const existingIndex = queue.findIndex((op) => op.op === "updateCell" && op.id === id && op.column === column);
  if(existingIndex >= 0){
    const next = queue.slice();
    next[existingIndex] = { ...next[existingIndex], value, t: Date.now() };
    return next;
  }
  return [
    ...queue,
    { op: "updateCell", id, column, value, t: Date.now() }
  ];
}

export function enqueueDeleteRow(queue, id){
  const filtered = queue.filter((op) => op.id !== id && op.tempId !== id);
  if(isTempId(id)) return filtered;

  if(filtered.some((op) => op.op === "deleteRow" && op.id === id)) return filtered;

  return [
    ...filtered,
    { op: "deleteRow", id, t: Date.now() }
  ];
}
