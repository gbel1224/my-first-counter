/* ============================================================
   Save system — localStorage backed, versioned, with a small
   migration hook so old saves keep working as the schema grows.
   Public API: save(), load(), hasSave(), clear(), exportSave(),
   importSave().
   ============================================================ */

const SAVE_KEY = "lifeSimulator:save";
export const SAVE_VERSION = 1;

/* Bump SAVE_VERSION and add a case here when the shape changes. */
function migrate(data) {
  if (!data || typeof data !== "object") return null;
  let d = data;
  // Future migrations go here, e.g.:
  // if (d.version < 2) { d = { ...d, version: 2, /* new fields */ }; }
  d.version = SAVE_VERSION;
  return d;
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function save(state) {
  try {
    const payload = { ...state, version: SAVE_VERSION, savedAt: Date.now() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error("Save failed:", err);
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.error("Load failed:", err);
    return null;
  }
}

export function clear() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.error("Clear failed:", err);
  }
}

/* Export the current save as a shareable/backup string (base64 JSON). */
export function exportSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return btoa(unescape(encodeURIComponent(raw)));
  } catch {
    return null;
  }
}

/* Import a previously exported string. Returns the parsed state or null. */
export function importSave(code) {
  try {
    const json = decodeURIComponent(escape(atob(code.trim())));
    const data = migrate(JSON.parse(json));
    if (!data) return null;
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return data;
  } catch (err) {
    console.error("Import failed:", err);
    return null;
  }
}
