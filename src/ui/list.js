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

function sortNames(a, b){
  if(a === "Uncategorized") return 1;
  if(b === "Uncategorized") return -1;
  return a.localeCompare(b);
}

function groupRows(rows){
  const map = new Map();
  for(const row of rows){
    const category = String(row.Category ?? "").trim() || "Uncategorized";
    const subcategory = String(row.Subcategory ?? "").trim() || "Uncategorized";
    if(!map.has(category)) map.set(category, new Map());
    const subMap = map.get(category);
    if(!subMap.has(subcategory)) subMap.set(subcategory, []);
    subMap.get(subcategory).push(row);
  }
  return map;
}

function totalRows(rows){
  return rows.reduce((sum, row) => {
    const value = toNumber(row.Amount);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function sortRowsByDate(rows){
  return rows.slice().sort((a, b) => {
    const dateA = parseRowDate(a);
    const dateB = parseRowDate(b);
    const timeA = dateA ? dateA.getTime() : 0;
    const timeB = dateB ? dateB.getTime() : 0;
    return timeB - timeA;
  });
}

export function renderList(rows, {
  root,
  onDelete,
  activeCategory = "",
  activeSubcategory = "All"
}){
  if(!rows.length){
    root.innerHTML = `<div class="muted">No transactions yet.</div>`;
    return;
  }

  const grouped = groupRows(rows);
  const categories = [...grouped.keys()].sort(sortNames);

  root.innerHTML = categories.map((category) => {
    const subMap = grouped.get(category);
    const subcategories = [...subMap.keys()].sort(sortNames);
    const categoryRows = subcategories.flatMap((sub) => subMap.get(sub));
    const categoryTotal = totalRows(categoryRows);
    const categoryCount = categoryRows.length;
    const openCategory = activeCategory && category === activeCategory;

    const subcategoryHtml = subcategories.map((subcategory) => {
      const items = sortRowsByDate(subMap.get(subcategory));
      const subTotal = totalRows(items);
      const subCount = items.length;
      const openSub = activeSubcategory !== "All" && subcategory === activeSubcategory;

      const transactionHtml = items.map((row) => {
        const id = String(row.ID ?? "");
        const amountNumber = toNumber(row.Amount);
        const amountLabel = Number.isFinite(amountNumber) ? formatEUR(amountNumber) : "€0.00";
        const note = String(row.Note ?? "").trim();
        const dateLabel = formatDateDisplay(row);
        const categoryLabel = String(row.Category ?? "").trim() || "Uncategorized";
        const subLabel = String(row.Subcategory ?? "").trim() || "Uncategorized";

        return `
          <details class="transaction-card" data-id="${esc(id)}">
            <summary class="transaction-summary">
              <span class="material-symbols-rounded list-chevron" aria-hidden="true">expand_more</span>
              <span class="transaction-value">${esc(amountLabel)}</span>
              <span class="transaction-date">${esc(dateLabel || "—")}</span>
            </summary>
            <div class="transaction-details">
              <div class="transaction-meta-row">
                <span>${esc(categoryLabel)}</span>
                <span class="transaction-sep">•</span>
                <span>${esc(subLabel)}</span>
              </div>
              <div class="transaction-note">${esc(note || "—")}</div>
              <button class="delete-btn" data-action="delete" type="button" aria-label="Delete transaction">
                <span class="material-symbols-rounded" aria-hidden="true">delete</span>
              </button>
            </div>
          </details>
        `;
      }).join("");

      return `
        <details class="list-group subcategory-group"${openSub ? " open" : ""}>
          <summary class="list-summary">
            <span class="material-symbols-rounded list-chevron" aria-hidden="true">expand_more</span>
            <div class="list-summary-text">
              <div class="list-title">${esc(subcategory)}</div>
              <div class="list-meta">${esc(subCount)} transaction${subCount === 1 ? "" : "s"}</div>
            </div>
            <div class="list-total">${esc(formatEUR(subTotal))}</div>
          </summary>
          <div class="list-content">
            ${transactionHtml || `<div class="muted">No transactions.</div>`}
          </div>
        </details>
      `;
    }).join("");

    return `
      <details class="list-group category-group"${openCategory ? " open" : ""}>
        <summary class="list-summary">
          <span class="material-symbols-rounded list-chevron" aria-hidden="true">expand_more</span>
          <div class="list-summary-text">
            <div class="list-title">${esc(category)}</div>
            <div class="list-meta">${esc(subcategories.length)} subcategor${subcategories.length === 1 ? "y" : "ies"} • ${esc(categoryCount)} transaction${categoryCount === 1 ? "" : "s"}</div>
          </div>
          <div class="list-total">${esc(formatEUR(categoryTotal))}</div>
        </summary>
        <div class="list-content">
          ${subcategoryHtml || `<div class="muted">No subcategories.</div>`}
        </div>
      </details>
    `;
  }).join("");

  root.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const rowEl = btn.closest(".transaction-card");
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
