export function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function toNumber(v){
  if(typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if(!s) return 0;
  const cleaned = s.replace(/\s/g,'').replace(/€/g,'').replace(/,/g,'.').replace(/[^\d.-]/g,'');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export function formatEUR(n){
  if(!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-US", { style:"currency", currency:"EUR", maximumFractionDigits: 2 }).format(n);
}
