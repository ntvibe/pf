import { TYPES } from "../config.js";
import { esc, toNumber } from "../format.js";

function cellDot(state){
  const cls = state === "ok" ? "ok" : state === "err" ? "err" : state === "saving" ? "saving" : "";
  return `<span class="dot ${cls}"></span>`;
}

function markValueValidity(input){
  const s = String(input.value ?? "").trim();
  if(!s){ input.classList.remove("invalid"); return; }
  const n = toNumber(s);
  if(Number.isFinite(n)) input.classList.remove("invalid");
  else input.classList.add("invalid");
}

export function renderList(rows, {
  root,
  setStatus,
  onDelete,
  onSave,
  onRowsChanged,
  focusNew=false
}){
  if(!rows.length){
    root.innerHTML = `<div class="muted">No data.</div>`;
    return;
  }

  root.innerHTML = rows.map((r, idx) => {
    const id = String(r.ID ?? "");
    const type = TYPES.includes(String(r.Type)) ? String(r.Type) : "Other";
    const valN = toNumber(r.Value);
    const valInvalid = (String(r.Value ?? "").trim() !== "" && !Number.isFinite(valN));
    const currency = String(r.Currency ?? "EUR") || "EUR";

    return `
      <article class="asset-card" data-idx="${idx}" data-id="${esc(id)}">
        <div class="asset-header">
          <div class="asset-title">Asset</div>
          <button class="delete-btn" data-action="delete" type="button" aria-label="Delete asset">🗑️</button>
        </div>

        <div class="field">
          <label>Name</label>
          <div class="state-pill">${cellDot("idle")}<span class="muted">Updates on blur</span></div>
          <input data-kind="name" type="text" value="${esc(r.Name ?? "")}" placeholder="e.g. Erste Bank, BTC, Gold" />
        </div>

        <div class="field">
          <label>Type</label>
          <div class="state-pill">${cellDot("idle")}<span class="muted">Updates on change</span></div>
          <select data-kind="type">
            ${TYPES.map(t => `<option value="${esc(t)}"${t===type?" selected":""}>${esc(t)}</option>`).join("")}
          </select>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Value</label>
            <div class="state-pill">${cellDot("idle")}<span class="muted">EUR</span></div>
            <input data-kind="value" inputmode="decimal" class="value-input ${valInvalid ? "invalid" : ""}" type="text" value="${esc(r.Value ?? "")}" placeholder="e.g. 1200" />
          </div>
          <div class="field">
            <label>Currency</label>
            <div class="state-pill">${cellDot("idle")}<span class="muted">ISO</span></div>
            <input data-kind="currency" class="currency-input" type="text" value="${esc(currency)}" placeholder="EUR" />
          </div>
        </div>
      </article>
    `;
  }).join("");

  function setDot(rowEl, kind, state){
    const cell = rowEl.querySelector(`[data-kind="${kind}"]`);
    const meta = cell?.closest(".field");
    const dot = meta?.querySelector(".dot");
    if(!dot) return;
    dot.classList.remove("ok","err","saving");
    if(state === "ok") dot.classList.add("ok");
    else if(state === "err") dot.classList.add("err");
    else if(state === "saving") dot.classList.add("saving");
  }

  async function saveField(rowEl, kind, columnName, rawValue, { coerceNumber=false } = {}){
    const id = rowEl.dataset.id;
    const idx = Number(rowEl.dataset.idx);
    if(!id || !Number.isFinite(idx)) return;

    setStatus("Saving…");
    setDot(rowEl, kind, "saving");

    try{
      let valueToSave = rawValue;
      if(coerceNumber){
        const n = toNumber(rawValue);
        if(Number.isFinite(n)) valueToSave = n;
      }

      await onSave(id, columnName, valueToSave);

      if(rows[idx]) rows[idx][columnName] = valueToSave;
      if(onRowsChanged) onRowsChanged(rows);

      setDot(rowEl, kind, "ok");
      setStatus("Saved");
    }catch(err){
      console.error(err);
      setDot(rowEl, kind, "err");
      setStatus("Save failed ❌ " + (err.message || err));

      const input = rowEl.querySelector(`[data-kind="${kind}"]`);
      if(input && rows[idx]){
        input.value = String(rows[idx][columnName] ?? "");
      }
      if(kind === "value") markValueValidity(input);
    }
  }

  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if(!btn) return;
    const rowEl = btn.closest(".asset-card");
    const id = rowEl?.dataset?.id || "";
    if(!id) return;

    if(btn.dataset.action === "delete"){
      btn.disabled = true;
      try{ await onDelete(id); }
      catch(err){
        console.error(err);
        setStatus("Delete failed ❌ " + (err.message || err));
        btn.disabled = false;
      }
    }
  });

  root.addEventListener("change", async (e) => {
    const rowEl = e.target.closest(".asset-card");
    if(!rowEl) return;
    const el = e.target;

    if(el.matches('select[data-kind="type"]')){
      await saveField(rowEl, "type", "Type", el.value);
    }
  });

  root.addEventListener("input", (e) => {
    const el = e.target;
    if(el.matches('input[data-kind="value"]')){
      markValueValidity(el);
    }
  });

  root.addEventListener("focusin", (e) => {
    const el = e.target;
    if(!(el instanceof HTMLElement)) return;
    if(el.matches('input[data-kind], select[data-kind]')){
      el.dataset.before = el.value;
    }
  });

  root.addEventListener("focusout", async (e) => {
    const el = e.target;
    if(!(el instanceof HTMLElement)) return;
    if(!el.matches('input[data-kind], select[data-kind]')) return;

    const rowEl = el.closest(".asset-card");
    if(!rowEl) return;

    const kind = el.getAttribute("data-kind");
    const before = el.dataset.before ?? "";
    const after = el.value ?? "";
    delete el.dataset.before;

    if(after === before) return;

    if(kind === "name"){
      await saveField(rowEl, "name", "Name", after);
    } else if(kind === "currency"){
      await saveField(rowEl, "currency", "Currency", after.toUpperCase().trim() || "EUR");
    } else if(kind === "value"){
      const s = String(after).trim();
      if(!s){
        await saveField(rowEl, "value", "Value", "");
        return;
      }
      const n = toNumber(s);
      if(!Number.isFinite(n)){
        el.classList.add("invalid");
        setDot(rowEl, "value", "err");
        setStatus("Invalid number ❌ (not saved)");

        const idx = Number(rowEl.dataset.idx);
        el.value = String(rows[idx]?.Value ?? "");
        markValueValidity(el);
        return;
      }
      el.classList.remove("invalid");
      await saveField(rowEl, "value", "Value", s, { coerceNumber:true });
    }
  });

  if(focusNew){
    requestAnimationFrame(() => {
      const last = root.querySelector(".asset-card:last-child input[data-kind='name']");
      if(last) last.focus();
    });
  }
}
