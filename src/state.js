import { toNumber } from "./format.js";

export let rows = [];

export function setRows(nextRows){
  rows = nextRows;
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
      : (String(r.Name ?? "").trim() || "Unnamed");

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
