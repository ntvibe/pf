import { TYPES } from "../config.js";
import { esc, toNumber, formatEUR, toLocalDateTimeInputValue } from "../format.js";
const expandedTypes = new Set();
const expandedEntries = new Set();
let listenersAttached = false;
let boundRoot = null;
let currentRows = [];
let currentOptions = {};

function markValueValidity(input){
  const s = String(input.value ?? "").trim();
  if(!s){ input.classList.remove("invalid"); return; }
  const n = toNumber(s);
  if(Number.isFinite(n)) input.classList.remove("invalid");
  else input.classList.add("invalid");
}

function sortTypes(a, b){
  const aIndex = TYPES.indexOf(a.type);
  const bIndex = TYPES.indexOf(b.type);
  if(aIndex === -1 && bIndex === -1){
    return a.type.localeCompare(b.type);
  }
  if(aIndex === -1) return 1;
  if(bIndex === -1) return -1;
  return aIndex - bIndex;
}

function buildGroups(rows){
  const map = new Map();
  for(const row of rows){
    const rawType = String(row.Type ?? "Other").trim() || "Other";
    const typeName = TYPES.includes(rawType) ? rawType : rawType;
    if(!map.has(typeName)){
      map.set(typeName, { type: typeName, rows: [], total: 0 });
    }
    const group = map.get(typeName);
    const val = toNumber(row.Value);
    group.rows.push(row);
    group.total += Number.isFinite(val) ? val : 0;
  }
  return [...map.values()].sort(sortTypes);
}

function toDateTimeInputValue(raw){
  const trimmed = String(raw ?? "").trim();
  if(!trimmed) return toLocalDateTimeInputValue();
  const parsed = new Date(trimmed);
  if(Number.isNaN(parsed.getTime())){
    if(trimmed.includes("T")) return trimmed.slice(0, 16);
    if(trimmed.length >= 10) return `${trimmed.slice(0, 10)}T00:00`;
    return toLocalDateTimeInputValue();
  }
  return toLocalDateTimeInputValue(parsed);
}

function formatDateTimeDisplay(raw){
  const trimmed = String(raw ?? "").trim();
  if(!trimmed) return "";
  const parsed = new Date(trimmed);
  if(Number.isNaN(parsed.getTime())) return trimmed;
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
  setStatus,
  onDelete,
  onUpdate,
  onAddEntry,
  onRowsChanged,
  supportsDate = true,
  focusRowId = null
}){
  currentRows = rows;
  currentOptions = {
    root,
    setStatus,
    onDelete,
    onUpdate,
    onAddEntry,
    onRowsChanged,
    supportsDate,
    focusRowId
  };
  if(!rows.length){
    root.innerHTML = `<div class="muted">No data.</div>`;
    return;
  }

  const groups = buildGroups(rows);
  const focusRow = focusRowId
    ? rows.find((row) => String(row.ID) === String(focusRowId))
    : null;
  const focusType = focusRow ? (String(focusRow.Type ?? "Other") || "Other") : null;

  root.innerHTML = groups.map((group) => {
    const isExpanded = expandedTypes.has(group.type) || group.type === focusType;
    const chevron = isExpanded ? "expand_less" : "expand_more";
    const totalLabel = group.total !== 0 ? formatEUR(group.total) : "€0.00";
    const totalTransactions = group.rows.length;

    return `
      <section class="type-group" data-type="${esc(group.type)}" data-expanded="${isExpanded}">
        <div class="type-group-header">
          <button class="type-toggle" data-action="toggle-type" type="button" aria-label="Toggle ${esc(group.type)}">
            <span class="material-symbols-rounded" aria-hidden="true">${chevron}</span>
          </button>
          <div class="type-group-info">
            <div class="type-name">${esc(group.type)}</div>
            <div class="muted">${totalTransactions} transaction${totalTransactions === 1 ? "" : "s"}</div>
          </div>
          <div class="type-group-total">${totalLabel}</div>
        </div>
        <div class="type-group-body" ${isExpanded ? "" : "hidden"}>
          <div class="entry-list">
            ${group.rows.map((row) => {
              const id = String(row.ID ?? "");
              const type = TYPES.includes(String(row.Type)) ? String(row.Type) : "Other";
              const valN = toNumber(row.Value);
              const valInvalid = (String(row.Value ?? "").trim() !== "" && !Number.isFinite(valN));
              const dateValue = toDateTimeInputValue(row.Date ?? "");
              const displayDate = formatDateTimeDisplay(row.Date ?? "") || formatDateTimeDisplay(dateValue);
              const isEntryExpanded = expandedEntries.has(id) || id === String(focusRowId ?? "");
              const entryChevron = isEntryExpanded ? "expand_less" : "expand_more";
              const valueLabel = Number.isFinite(valN) ? formatEUR(valN) : "€0.00";

              return `
                <div class="transaction-card" data-id="${esc(id)}" data-expanded="${isEntryExpanded}">
                  <div class="transaction-summary">
                    <button class="entry-toggle" data-action="toggle-entry" type="button" aria-label="Toggle transaction">
                      <span class="material-symbols-rounded" aria-hidden="true">${entryChevron}</span>
                    </button>
                    <div class="transaction-value">${valueLabel}</div>
                    <div class="transaction-date">${esc(displayDate || "")}</div>
                    <button class="delete-btn" data-action="delete-entry" type="button" aria-label="Delete transaction">
                      <span class="material-symbols-rounded" aria-hidden="true">delete</span>
                    </button>
                  </div>
                  <div class="transaction-details" ${isEntryExpanded ? "" : "hidden"}>
                    <div class="field">
                      <label>Type</label>
                      <select data-kind="type">
                        ${TYPES.map((t) => `<option value="${esc(t)}"${t===type?" selected":""}>${esc(t)}</option>`).join("")}
                      </select>
                    </div>
                    <div class="field-row">
                      <div class="field">
                        <label>Value (EUR)</label>
                        <input data-kind="value" inputmode="decimal" class="value-input ${valInvalid ? "invalid" : ""}" type="text" value="${esc(row.Value ?? "")}" placeholder="e.g. 1200" />
                      </div>
                      <div class="field">
                        <label>Date &amp; Time</label>
                        <input data-kind="date" type="datetime-local" value="${esc(dateValue)}" ${supportsDate ? "" : "disabled"} />
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <button class="secondary-btn" data-action="add-entry" type="button">
            <span class="material-symbols-rounded" aria-hidden="true">add</span>
            Add transaction
          </button>
        </div>
      </section>
    `;
  }).join("");

  if(!listenersAttached || boundRoot !== root){
    listenersAttached = true;
    boundRoot = root;

    root.addEventListener("click", async (event) => {
      const btn = event.target.closest("button[data-action]");
      if(!btn) return;

      const typeEl = btn.closest(".type-group");
      const typeName = typeEl?.dataset?.type || "";

      if(btn.dataset.action === "toggle-type"){
        if(typeEl){
          const expanded = typeEl.dataset.expanded === "true";
          if(expanded){
            expandedTypes.delete(typeName);
          }else{
            expandedTypes.add(typeName);
          }
          renderList(currentRows, currentOptions);
        }
        return;
      }

      if(btn.dataset.action === "toggle-entry"){
        const entryEl = btn.closest(".transaction-card");
        const id = entryEl?.dataset?.id || "";
        if(!id) return;
        const expanded = entryEl.dataset.expanded === "true";
        if(expanded){
          expandedEntries.delete(id);
        }else{
          expandedEntries.add(id);
        }
        renderList(currentRows, currentOptions);
        return;
      }

      if(btn.dataset.action === "add-entry"){
        if(onAddEntry) await onAddEntry({ typeName });
        return;
      }

      if(btn.dataset.action === "delete-entry"){
        const entryEl = btn.closest(".transaction-card");
        const id = entryEl?.dataset?.id || "";
        if(!id) return;
        btn.disabled = true;
        try{
          await onDelete(id);
          if(onRowsChanged) onRowsChanged(currentRows);
        }catch(err){
          console.error(err);
          setStatus("Delete failed ❌ " + (err.message || err));
          btn.disabled = false;
        }
      }
    });

    root.addEventListener("change", async (event) => {
      const entryEl = event.target.closest(".transaction-card");
      if(!entryEl) return;
      const id = entryEl.dataset.id;
      const el = event.target;

      if(el.matches('select[data-kind="type"]')){
        await onUpdate(id, "Type", el.value);
        await onUpdate(id, "Asset", el.value);
        if(onRowsChanged) onRowsChanged(currentRows);
      }
    });

    root.addEventListener("input", (event) => {
      const el = event.target;
      if(el.matches('input[data-kind="value"]')){
        markValueValidity(el);
      }
    });

    root.addEventListener("focusin", (event) => {
      const el = event.target;
      if(!(el instanceof HTMLElement)) return;
      if(el.matches('input[data-kind], select[data-kind]')){
        el.dataset.before = el.value;
      }
    });

    root.addEventListener("focusout", async (event) => {
      const el = event.target;
      if(!(el instanceof HTMLElement)) return;
      if(!el.matches('input[data-kind], select[data-kind]')) return;

      const before = el.dataset.before ?? "";
      const after = el.value ?? "";
      delete el.dataset.before;

      if(after === before) return;

      const entryEl = el.closest(".transaction-card");
      if(!entryEl) return;
      const id = entryEl.dataset.id;

      const kind = el.getAttribute("data-kind");

      if(kind === "value"){
        const s = String(after).trim();
        if(!s){
          await onUpdate(id, "Value", "");
          if(onRowsChanged) onRowsChanged(currentRows);
          return;
        }
        const n = toNumber(s);
        if(!Number.isFinite(n)){
          el.classList.add("invalid");
          setStatus("Invalid number ❌ (not saved)");
          const row = currentRows.find((r) => String(r.ID) === String(id));
          el.value = String(row?.Value ?? "");
          markValueValidity(el);
          return;
        }
        el.classList.remove("invalid");
        await onUpdate(id, "Value", s);
      } else if(kind === "date"){
        if(!supportsDate) return;
        await onUpdate(id, "Date", after);
      }

      if(onRowsChanged) onRowsChanged(currentRows);
    });
  }

  if(focusRowId){
    requestAnimationFrame(() => {
      const target = root.querySelector(`.transaction-card[data-id="${CSS.escape(String(focusRowId))}"] input[data-kind="value"]`);
      if(target) target.focus();
    });
  }
}
