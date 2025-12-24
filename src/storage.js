import { STORAGE_API } from "./config.js";

export function isValidAppsScriptUrl(url){
  try{
    const u = new URL(url);
    return (u.hostname === "script.google.com" || u.hostname === "script.googleusercontent.com") && url.length > 20;
  }catch{
    return false;
  }
}

export async function getApiUrl(force=false){
  let url = (!force && localStorage.getItem(STORAGE_API)) || "";
  while(true){
    if(url && !force) return url;
    const input = prompt("Paste Apps Script Web App URL (ends with /exec):", url || "https://script.google.com/macros/s/XXXXX/exec");
    if(input === null){
      if(url) return url;
      throw new Error("No API URL provided.");
    }
    const cleaned = input.trim();
    if(!cleaned) continue;
    if(!isValidAppsScriptUrl(cleaned)){
      alert("Invalid Apps Script URL. Paste the full /exec link.");
      continue;
    }
    localStorage.setItem(STORAGE_API, cleaned);
    return cleaned;
  }
}

export function clearApiUrl(){
  localStorage.removeItem(STORAGE_API);
}
