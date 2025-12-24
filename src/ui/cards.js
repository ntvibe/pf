import { computeTotals } from "../state.js";
import { esc, formatEUR } from "../format.js";

export function renderCards(rows, container){
  const { total, byType } = computeTotals(rows);
  const preferred = ["Bank","Crypto","Gold"];
  const items = [];

  items.push({ label: "Total Net Worth", value: formatEUR(total) });

  for(const t of preferred){
    items.push({ label: t, value: formatEUR(byType.get(t) || 0) });
  }

  for(const [t, v] of [...byType.entries()].sort((a,b)=>b[1]-a[1])){
    if(preferred.includes(t)) continue;
    items.push({ label: t, value: formatEUR(v) });
  }

  container.innerHTML = items.map(it => `
    <div class="card">
      <div class="label">${esc(it.label)}</div>
      <div class="value">${esc(it.value || "—")}</div>
    </div>
  `).join("");
}
