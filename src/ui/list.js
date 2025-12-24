import { TYPES } from "../config.js";
import { esc, toNumber, formatEUR } from "../format.js";
import { getAssetName } from "../state.js";

const expandedAssets = new Set();
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

function buildGroups(rows){
  const map = new Map();
  for(const row of rows){
    const assetName = getAssetName(row);
    if(!map.has(assetName)){
      map.set(assetName, { assetName, rows: [], total: 0 });
    }
    const group = map.get(assetName);
    group.rows.push(row);
    const val = toNumber(row.Value);
    group.total += Number.isFinite(val) ? val : 0;
  }
  return [...map.values()].sort((a,b) => a.assetName.localeCompare(b.assetName));
}

export function renderList(rows, {
  root,
  setStatus,
  onDelete,
  onUpdate,
  onAddEntry,
  onRenameAsset,
  onRowsChanged,
  supportsEntries = true,
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
    onRenameAsset,
    onRowsChanged,
    supportsEntries,
    supportsDate,
    focusRowId
  };
  if(!rows.length){
    root.innerHTML = `<div class="muted">No data.</div>`;
    return;
  }

  const groups = buildGroups(rows);
  const focusGroup = focusRowId
    ? getAssetName(rows.find((row) => String(row.ID) === String(focusRowId)) || {})
    : null;

  root.innerHTML = groups.map((group) => {
    const isExpanded = expandedAssets.has(group.assetName) || group.assetName === focusGroup;
    const chevron = isExpanded ? "expand_less" : "expand_more";
    const totalLabel = group.total > 0 ? formatEUR(group.total) : "€0.00";

    return `
      <article class="asset-group" data-asset="${esc(group.assetName)}" data-expanded="${isExpanded}">
        <div class="asset-group-header">
          <button class="asset-toggle" data-action="toggle" type="button" aria-label="Toggle ${esc(group.assetName)}">
            <span class="material-symbols-rounded" aria-hidden="true">${chevron}</span>
          </button>
          <div class="asset-group-info">
            <input class="asset-name-input" data-kind="asset" type="text" value="${esc(group.assetName)}" placeholder="Asset name" />
            <div class="muted">${group.rows.length} entr${group.rows.length === 1 ? "y" : "ies"}</div>
          </div>
          <div class="asset-group-total">${totalLabel}</div>
        </div>
        <div class="asset-group-body" ${isExpanded ? "" : "hidden"}>
          <div class="entry-list">
            ${group.rows.map((row) => {
              const id = String(row.ID ?? "");
              const type = TYPES.includes(String(row.Type)) ? String(row.Type) : "Other";
              const currency = String(row.Currency ?? "EUR") || "EUR";
              const valN = toNumber(row.Value);
              const valInvalid = (String(row.Value ?? "").trim() !== "" && !Number.isFinite(valN));
              const dateValue = String(row.Date ?? "").trim() || new Date().toISOString().slice(0, 10);

              return `
                <div class="entry-card" data-id="${esc(id)}">
                  <div class="entry-header">
                    <div class="entry-title">Entry</div>
                    <button class="delete-btn" data-action="delete-entry" type="button" aria-label="Delete entry">
                      <span class="material-symbols-rounded" aria-hidden="true">delete</span>
                    </button>
                  </div>
                  <div class="field">
                    <label>Entry</label>
                    <input data-kind="entry" type="text" value="${esc(row.Entry ?? "")}" placeholder="e.g. Main account" ${supportsEntries ? "" : "disabled"} />
                  </div>
                  <div class="field">
                    <label>Type</label>
                    <select data-kind="type">
                      ${TYPES.map((t) => `<option value="${esc(t)}"${t===type?" selected":""}>${esc(t)}</option>`).join("")}
                    </select>
                  </div>
                  <div class="field-row">
                    <div class="field">
                      <label>Value</label>
                      <input data-kind="value" inputmode="decimal" class="value-input ${valInvalid ? "invalid" : ""}" type="text" value="${esc(row.Value ?? "")}" placeholder="e.g. 1200" />
                    </div>
                    <div class="field">
                      <label>Currency</label>
                      <input data-kind="currency" class="currency-input" type="text" value="${esc(currency)}" placeholder="EUR" />
                    </div>
                  </div>
                  <div class="field">
                    <label>Date</label>
                    <input data-kind="date" type="date" value="${esc(dateValue)}" ${supportsDate ? "" : "disabled"} />
                  </div>
                </div>
              `;
            }).join("")}
          </div>
          <button class="secondary-btn" data-action="add-entry" type="button" ${supportsEntries ? "" : "disabled"}>
            <span class="material-symbols-rounded" aria-hidden="true">add</span>
            Add entry
          </button>
        </div>
      </article>
    `;
  }).join("");

  if(!listenersAttached || boundRoot !== root){
    listenersAttached = true;
    boundRoot = root;

    root.addEventListener("click", async (event) => {
      const btn = event.target.closest("button[data-action]");
      if(!btn) return;

      const groupEl = btn.closest(".asset-group");
      const assetName = groupEl?.dataset?.asset || "";

      if(btn.dataset.action === "toggle"){
        if(groupEl){
          const expanded = groupEl.dataset.expanded === "true";
          if(expanded){
            expandedAssets.delete(assetName);
          }else{
            expandedAssets.add(assetName);
          }
          renderList(currentRows, currentOptions);
        }
        return;
      }

      if(btn.dataset.action === "add-entry"){
        if(onAddEntry) await onAddEntry(assetName);
        return;
      }

      if(btn.dataset.action === "delete-entry"){
        const entryEl = btn.closest(".entry-card");
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
      const entryEl = event.target.closest(".entry-card");
      if(!entryEl) return;
      const id = entryEl.dataset.id;
      const el = event.target;

      if(el.matches('select[data-kind="type"]')){
        await onUpdate(id, "Type", el.value);
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

      if(el.matches('input[data-kind="asset"]')){
        const groupEl = el.closest(".asset-group");
        const assetName = groupEl?.dataset?.asset || "";
        const nextName = String(after).trim() || "Unnamed";
        if(expandedAssets.has(assetName)){
          expandedAssets.delete(assetName);
          expandedAssets.add(nextName);
        }
        await onRenameAsset(assetName, nextName);
        if(onRowsChanged) onRowsChanged(currentRows);
        return;
      }

      const entryEl = el.closest(".entry-card");
      if(!entryEl) return;
      const id = entryEl.dataset.id;

      const kind = el.getAttribute("data-kind");

      if(kind === "entry"){
        if(!supportsEntries) return;
        await onUpdate(id, "Entry", after.trim());
      } else if(kind === "currency"){
        await onUpdate(id, "Currency", after.toUpperCase().trim() || "EUR");
      } else if(kind === "value"){
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
      const target = root.querySelector(`.entry-card[data-id="${CSS.escape(String(focusRowId))}"] input[data-kind="entry"]`);
      if(target) target.focus();
    });
  }
}
