import { esc, formatEUR, toNumber } from "../format.js";
import { parseRowDate } from "../state.js";

function formatDateDisplay(row){
  const parsed = parseRowDate(row);
  if(!parsed) return "";
  return parsed.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function renderList(rows, {
  root,
  onDelete
}){
  if(!rows.length){
    root.innerHTML = `<div class="muted">No transactions yet.</div>`;
    return;
  }

  root.innerHTML = rows.map((row) => {
    const id = String(row.ID ?? "");
    const amountNumber = toNumber(row.Amount);
    const amountLabel = Number.isFinite(amountNumber) ? formatEUR(amountNumber) : "€0.00";
    const note = String(row.Note ?? "").trim();
    const category = String(row.Category ?? "").trim() || "Uncategorized";
    const subcategory = String(row.Subcategory ?? "").trim();
    const dateLabel = formatDateDisplay(row);

    return `
      <article class="transaction-row" data-id="${esc(id)}">
        <div class="transaction-main">
          <div class="transaction-title">
            <div class="transaction-amount">${esc(amountLabel)}</div>
            <div class="transaction-meta">
              <span class="transaction-category">${esc(category)}</span>
              ${subcategory ? `<span class="transaction-sep">•</span><span>${esc(subcategory)}</span>` : ""}
            </div>
          </div>
          <div class="transaction-note">${esc(note || "—")}</div>
        </div>
        <div class="transaction-side">
          <div class="transaction-date">${esc(dateLabel || "—")}</div>
          <button class="delete-btn" data-action="delete" type="button" aria-label="Delete transaction">
            <span class="material-symbols-rounded" aria-hidden="true">delete</span>
          </button>
        </div>
      </article>
    `;
  }).join("");

  root.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const rowEl = btn.closest(".transaction-row");
      const id = rowEl?.dataset?.id;
      if(!id || !onDelete) return;
      btn.disabled = true;
      try{
        await onDelete(id);
      }catch(err){
        console.error(err);
        btn.disabled = false;
      }
    });
  });
}
