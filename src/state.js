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
  name: "Name",
  value: "Value",
  currency: "Currency",
  date: "Date",
  notes: "Notes",
  updatedAt: "UpdatedAt"
};

export let rows = [];
export let dirtyQueue = [];
export let meta = { lastSyncAt: null, lastLoadAt: null };
export let syncHeaders = { ...COLUMN_NAMES };

const SYNC_HEADER_ALIASES = {
  id: ["Id", "Record ID", "RecordId"],
  category: ["Category", "Cat", "Type"],
  subcategory: ["Subcategory", "Sub Category", "Sub-Category", "Subcat"],
  name: ["Name", "Title", "Label"],
  value: ["Value", "Amount", "Amount (EUR)", "Amount(EUR)", "Total"],
  notes: ["Notes", "Note", "Memo", "Description"],
  date: ["Date", "Date/Time", "Datetime", "Timestamp"],
  currency: ["Currency", "Curr", "Currency Code"],
  updatedAt: ["UpdatedAt", "Updated At", "Updated", "Last Updated"]
};

function normalizeHeaderName(name){
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function getAliasesForKey(key){
  const primary = COLUMN_NAMES[key];
  const aliases = SYNC_HEADER_ALIASES[key] || [];
  return [primary, ...aliases].filter(Boolean);
}

function buildRowLookup(rawRow){
  const normalizedMap = new Map();
  if(rawRow && typeof rawRow === "object"){
    for(const key of Object.keys(rawRow)){
      normalizedMap.set(normalizeHeaderName(key), rawRow[key]);
    }
  }
  return (aliases) => {
    for(const alias of aliases){
      if(rawRow && Object.prototype.hasOwnProperty.call(rawRow, alias)){
        return rawRow[alias];
      }
      const normalized = normalizeHeaderName(alias);
      if(normalizedMap.has(normalized)){
        return normalizedMap.get(normalized);
      }
    }
    return undefined;
  };
}

function updateSyncHeaders(headerRow){
  if(!Array.isArray(headerRow)) return;
  const normalizedToIndex = new Map(
    headerRow.map((value, idx) => [normalizeHeaderName(value), idx])
  );
  const nextHeaders = {};
  for(const key of Object.keys(COLUMN_NAMES)){
    const aliases = getAliasesForKey(key);
    for(const alias of aliases){
      const idx = normalizedToIndex.get(normalizeHeaderName(alias));
      if(idx != null){
        nextHeaders[key] = String(headerRow[idx] ?? COLUMN_NAMES[key]).trim() || COLUMN_NAMES[key];
        break;
      }
    }
  }
  syncHeaders = { ...syncHeaders, ...nextHeaders };
}

export function resolveSyncHeader(column){
  if(!column) return column;
  const normalized = normalizeHeaderName(column);
  for(const key of Object.keys(COLUMN_NAMES)){
    const aliases = getAliasesForKey(key);
    if(aliases.some((alias) => normalizeHeaderName(alias) === normalized)){
      return syncHeaders[key] || COLUMN_NAMES[key];
    }
  }
  return column;
}

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
  const lookup = buildRowLookup(rawRow);
  const rawCategory = String(lookup(getAliasesForKey("category")) ?? "").trim();
  const rawSubcategory = String(lookup(getAliasesForKey("subcategory")) ?? "").trim();
  const rawName = String(lookup(getAliasesForKey("name")) ?? "").trim();
  const rawValue = lookup(getAliasesForKey("value")) ?? "";
  const rawDate = lookup(getAliasesForKey("date")) ?? "";
  const rawNotes = lookup(getAliasesForKey("notes")) ?? "";
  const rawCurrency = lookup(getAliasesForKey("currency")) ?? "EUR";
  const rawUpdatedAt = lookup(getAliasesForKey("updatedAt")) ?? "";

  return {
    ID: lookup(getAliasesForKey("id")) ?? "",
    Category: rawCategory,
    Subcategory: rawSubcategory,
    Name: rawName,
    Value: rawValue ?? "",
    Currency: rawCurrency ?? "EUR",
    Date: rawDate ?? "",
    Notes: rawNotes ?? "",
    UpdatedAt: rawUpdatedAt ?? "",
    _row: rawRow._row
  };
}

function isMeaningfulRow(row){
  const fields = [
    row.ID,
    row.Category,
    row.Subcategory,
    row.Name,
    row.Value,
    row.Currency,
    row.Date,
    row.Notes,
    row.UpdatedAt
  ];
  return fields.some((value) => String(value ?? "").trim() !== "");
}

export function normalizeRowsFromApi(data){
  if(!Array.isArray(data)) return null;
  if(!data.length) return [];

  const first = data[0];
  if(first && typeof first === "object" && !Array.isArray(first)){
    updateSyncHeaders(Object.keys(first));
    const normalized = data.map((row) => normalizeRow(row));
    return normalized.filter(isMeaningfulRow);
  }

  if(Array.isArray(first)){
    const header = first.map((value) => String(value ?? "").trim());
    updateSyncHeaders(header);
    const headerIndex = new Map(header.map((name, idx) => [normalizeHeaderName(name), idx]));
    const columnKeys = Object.keys(COLUMN_NAMES);
    const hasKnownHeader = columnKeys.some((key) => {
      const aliases = getAliasesForKey(key);
      return aliases.some((alias) => headerIndex.has(normalizeHeaderName(alias)));
    });
    if(!hasKnownHeader) return null;

    const normalized = data.slice(1).map((row) => {
      const obj = {};
      for(const key of columnKeys){
        const aliases = getAliasesForKey(key);
        let idx = null;
        for(const alias of aliases){
          const match = headerIndex.get(normalizeHeaderName(alias));
          if(match != null){
            idx = match;
            break;
          }
        }
        if(idx != null && idx < row.length){
          obj[COLUMN_NAMES[key]] = row[idx];
        }
      }
      return normalizeRow(obj);
    });
    return normalized.filter(isMeaningfulRow);
  }

  return null;
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
    const num = toNumber(row.Value);
    if(Number.isFinite(num)) total += num;
  }
  return total;
}

export function buildChartData(mode, inputRows = rows){
  const map = new Map();
  for(const row of inputRows){
    const value = toNumber(row.Value);
    if(!Number.isFinite(value) || value <= 0) continue;
    const key = mode === "subcategory"
      ? (String(row.Subcategory ?? "").trim() || "Uncategorized")
      : (String(row.Category ?? "").trim() || "Uncategorized");
    map.set(key, (map.get(key) || 0) + value);
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
    const value = toNumber(row.Value);
    if(!Number.isFinite(value)) continue;
    const date = parseRowDate(row);
    if(!date) continue;
    const key = date.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + value);
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
    [syncHeaders.category || COLUMN_NAMES.category]: row.Category ?? "",
    [syncHeaders.subcategory || COLUMN_NAMES.subcategory]: row.Subcategory ?? "",
    [syncHeaders.name || COLUMN_NAMES.name]: row.Name ?? "",
    [syncHeaders.value || COLUMN_NAMES.value]: row.Value ?? "",
    [syncHeaders.currency || COLUMN_NAMES.currency]: row.Currency ?? "EUR",
    [syncHeaders.date || COLUMN_NAMES.date]: row.Date ?? "",
    [syncHeaders.notes || COLUMN_NAMES.notes]: row.Notes ?? ""
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
