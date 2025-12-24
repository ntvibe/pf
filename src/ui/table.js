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

export function renderTable(rows, {
  root,
  setStatus,
  onDelete,
  onSave,
  onRowsChanged,
  focusNew=false
}){
  if(!rows.length){
    root.innerHTML = `<div class="muted" style="padding:12px;">No data.</div>`;
    return;
  }

  const cols = ["Name","Type","Value","Currency"];

  const thead = `
    <thead>
      <tr>
        <th class="col-actions">Actions</th>
        ${cols.map(c => `<th>${esc(c)}</th>`).join("")}
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${rows.map((r, idx) => {
        const id = String(r.ID ?? "");
        const type = TYPES.includes(String(r.Type)) ? String(r.Type) : "Other";
        const valN = toNumber(r.Value);
        const valInvalid = (String(r.Value ?? "").trim() !== "" && !Number.isFinite(valN));
        const currency = String(r.Currency ?? "EUR") || "EUR";

        return `
          <tr data-idx="${idx}" data-id="${esc(id)}">
            <td class="col-actions">
              <button class="mini" data-action="delete">🗑️</button>
            </td>

            <td>
              <div class="cellmeta">
                ${cellDot("idle")}
                <input data-kind="name" type="text" value="${esc(r.Name ?? "")}" placeholder="e.g. Erste Bank, BTC, Gold" />
              </div>
            </td>

            <td>
              <div class="cellmeta">
                ${cellDot("idle")}
                <select data-kind="type">
                  ${TYPES.map(t => `<option value="${esc(t)}"${t===type?" selected":""}>${esc(t)}</option>`).join("")}
                </select>
              </div>
            </td>

            <td class="right">
              <div class="cellmeta" style="justify-content:flex-end;">
                ${cellDot("idle")}
                <input data-kind="value" inputmode="decimal" class="${valInvalid ? "invalid" : ""}" type="text" value="${esc(r.Value ?? "")}" placeholder="e.g. 1200" />
              </div>
            </td>

            <td>
              <div class="cellmeta">
                ${cellDot("idle")}
                <input data-kind="currency" type="text" value="${esc(currency)}" placeholder="EUR" />
              </div>
            </td>
          </tr>
        `;
      }).join("")}
    </tbody>
  `;

  root.innerHTML = `<table>${thead}${tbody}</table>`;

  const table = root.querySelector("table");

  function setDot(rowEl, kind, state){
    const cell = rowEl.querySelector(`[data-kind="${kind}"]`);
    const meta = cell?.closest(".cellmeta");
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
      setStatus("Saved ✅");
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

  table.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if(!btn) return;
    const rowEl = btn.closest("tr");
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

  table.addEventListener("change", async (e) => {
    const rowEl = e.target.closest("tr");
    if(!rowEl) return;
    const el = e.target;

    if(el.matches('select[data-kind="type"]')){
      await saveField(rowEl, "type", "Type", el.value);
    }
  });

  table.addEventListener("input", (e) => {
    const el = e.target;
    if(el.matches('input[data-kind="value"]')){
      markValueValidity(el);
    }
  });

  table.addEventListener("focusin", (e) => {
    const el = e.target;
    if(!(el instanceof HTMLElement)) return;
    if(el.matches('input[data-kind], select[data-kind]')){
      el.dataset.before = el.value;
    }
  });

  table.addEventListener("focusout", async (e) => {
    const el = e.target;
    if(!(el instanceof HTMLElement)) return;
    if(!el.matches('input[data-kind], select[data-kind]')) return;

    const rowEl = el.closest("tr");
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
      const last = root.querySelector("tbody tr:last-child input[data-kind='name']");
      if(last) last.focus();
    });
  }
}
