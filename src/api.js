import { getApiUrl } from "./storage.js";

export async function apiGet(){
  const api = await getApiUrl(false);
  const url = api + (api.includes("?") ? "&" : "?") + "t=" + Date.now();
  const res = await fetch(url, { cache:"no-store" });
  const json = await res.json();
  if(!json || json.success !== true) throw new Error(json?.error || "Load failed");
  return Array.isArray(json.data) ? json.data : [];
}

export async function apiPost(payload){
  const api = await getApiUrl(false);
  // ✅ text/plain avoids CORS preflight with Apps Script
  const res = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if(!json || json.success !== true) throw new Error(json?.error || "Request failed");
  return json;
}
