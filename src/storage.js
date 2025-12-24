import { STORAGE_API } from "./config.js";

export function isValidAppsScriptUrl(url){
  try{
    const u = new URL(url);
    return (u.hostname === "script.google.com" || u.hostname === "script.googleusercontent.com") && url.length > 20;
  }catch{
    return false;
  }
}

export function getStoredApiUrl(){
  return localStorage.getItem(STORAGE_API) || "";
}

export async function getApiUrl(force=false){
  const url = (!force && localStorage.getItem(STORAGE_API)) || "";
  if(!url) throw new Error("No API URL provided.");
  if(!isValidAppsScriptUrl(url)) throw new Error("Invalid Apps Script URL.");
  return url;
}

export function setApiUrl(url){
  localStorage.setItem(STORAGE_API, url);
}

export function clearApiUrl(){
  localStorage.removeItem(STORAGE_API);
}
