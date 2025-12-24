import { toNumber } from "./format.js";

export const CACHE_KEYS = {
  rows: "pf_cache_rows_v1",
  meta: "pf_cache_meta_v1",
  dirtyQueue: "pf_dirty_queue_v1"
};

export let rows = [];
export let dirtyQueue = [];
export let meta = { lastSyncAt: null, lastLoadAt: null, columns: null };
export let columnConfig = {
  asset: "Asset",
  entry: "Entry",
  date: "Date",
  notes: "Notes"
};

export function setRows(nextRows){
  rows = nextRows;
}

export function setDirtyQueue(nextQueue){
  dirtyQueue = nextQueue;
}

export function setMeta(nextMeta){
  meta = { ...meta, ...nextMeta };
}

export function setColumnConfig(nextConfig){
  columnConfig = { ...columnConfig, ...nextConfig };
}

export function detectColumns(rawRows = []){
  const hasAsset = rawRows.some((r) => Object.prototype.hasOwnProperty.call(r, "Asset"));
  const hasEntry = rawRows.some((r) => Object.prototype.hasOwnProperty.call(r, "Entry"));
  const hasDate = rawRows.some((r) => Object.prototype.hasOwnProperty.call(r, "Date"));
  const hasNotes = rawRows.some((r) => Object.prototype.hasOwnProperty.call(r, "Notes"));

  const nextConfig = {
    asset: hasAsset ? "Asset" : "Name",
    entry: hasEntry ? "Entry" : null,
    date: hasDate ? "Date" : null,
    notes: hasNotes ? "Notes" : null
  };
  setColumnConfig(nextConfig);
  return nextConfig;
}

export function normalizeRow(rawRow, config = columnConfig){
  const assetValue = config.asset === "Asset" ? rawRow.Asset : rawRow.Name;
  const entryValue = config.entry ? rawRow.Entry : "";
  const dateValue = config.date === "Date" ? rawRow.Date : rawRow.UpdatedAt;
  return {
    ID: rawRow.ID ?? "",
    Asset: assetValue ?? "",
    Entry: entryValue ?? "",
    Type: rawRow.Type ?? "Other",
    Value: rawRow.Value ?? "",
    Currency: rawRow.Currency ?? "EUR",
    Date: dateValue ?? "",
    Notes: rawRow.Notes ?? "",
    UpdatedAt: rawRow.UpdatedAt ?? "",
    _row: rawRow._row
  };
}

export function getAssetName(row){
  return String(row.Asset ?? "").trim() || "Unnamed";
}

export function getRowDateTime(row){
  const raw = String(row.Date ?? "").trim() || String(row.UpdatedAt ?? "").trim();
  if(!raw){
    return new Date();
  }
  const parsed = new Date(raw);
  if(Number.isNaN(parsed.getTime())){
    return null;
  }
  return parsed;
}

function formatDateTimeKey(date){
  const d = date instanceof Date ? date : new Date(date);
  if(Number.isNaN(d.getTime())){
    return String(date || "");
  }
  const pad = (num) => String(num).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getRowDateKey(row){
  const raw = String(row.Date ?? "").trim() || String(row.UpdatedAt ?? "").trim();
  if(!raw){
    return formatDateTimeKey(new Date());
  }
  const parsed = new Date(raw);
  if(Number.isNaN(parsed.getTime())){
    if(raw.includes("T")){
      return raw.replace("T", " ").slice(0, 16);
    }
    if(raw.length >= 10){
      return `${raw.slice(0, 10)} 00:00`;
    }
    return raw;
  }
  return formatDateTimeKey(parsed);
}

export function computeTotals(inputRows = rows){
  let total = 0;
  const byType = new Map();
  for(const r of inputRows){
    const type = String(r.Type ?? "Other") || "Other";
    const n = toNumber(r.Value);
    const val = Number.isFinite(n) ? n : 0;
    total += val;
    byType.set(type, (byType.get(type) || 0) + val);
  }
  return { total, byType };
}

export function buildChartData(mode, inputRows = rows){
  const map = new Map();
  for(const r of inputRows){
    const valN = toNumber(r.Value);
    if(!Number.isFinite(valN) || valN <= 0) continue;

    const key = mode === "type"
      ? (String(r.Type ?? "Other") || "Other")
      : getAssetName(r);

    map.set(key, (map.get(key) || 0) + valN);
  }

  const sorted = [...map.entries()].sort((a,b)=>b[1]-a[1]);
  const TOP = 12;
  if(sorted.length > TOP){
    const top = sorted.slice(0, TOP);
    const rest = sorted.slice(TOP).reduce((s, [,v]) => s + v, 0);
    top.push(["Other", rest]);
    return top.map(([name, value]) => ({ name, value }));
  }
  return sorted.map(([name, value]) => ({ name, value }));
}

export function buildTimelineSeries(inputRows = rows, { assetFilter = null } = {}){
  const map = new Map();
  for(const r of inputRows){
    const asset = getAssetName(r);
    if(assetFilter && assetFilter !== "All" && asset !== assetFilter) continue;
    const valN = toNumber(r.Value);
    if(!Number.isFinite(valN)) continue;
    const dateKey = getRowDateKey(r);
    map.set(dateKey, (map.get(dateKey) || 0) + valN);
  }
  return [...map.entries()]
    .sort((a,b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

export function listAssets(inputRows = rows){
  const set = new Set();
  for(const r of inputRows){
    set.add(getAssetName(r));
  }
  return [...set].sort((a,b) => a.localeCompare(b));
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
  if(cachedMeta?.columns){
    setColumnConfig(cachedMeta.columns);
  }
  return { rows: cachedRows, dirtyQueue: cachedQueue, meta: cachedMeta };
}

export function saveCache(){
  localStorage.setItem(CACHE_KEYS.rows, JSON.stringify(rows));
  localStorage.setItem(CACHE_KEYS.dirtyQueue, JSON.stringify(dirtyQueue));
  localStorage.setItem(CACHE_KEYS.meta, JSON.stringify({
    ...meta,
    columns: columnConfig
  }));
}

export function isTempId(id){
  return String(id || "").startsWith("tmp_");
}

export function buildAddPayload(row, config = columnConfig){
  const payload = {
    Type: row.Type ?? "Other",
    Value: row.Value ?? "",
    Currency: row.Currency ?? "EUR"
  };
  if(config.asset === "Asset"){
    payload.Asset = row.Asset ?? "";
  }else{
    payload.Name = row.Asset ?? "";
  }
  if(config.entry){
    payload[config.entry] = row.Entry ?? "";
  }
  if(config.date){
    payload[config.date] = row.Date ?? "";
  }
  if(config.notes){
    payload[config.notes] = row.Notes ?? "";
  }
  return payload;
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
