"use strict";

const UNIT_KEYS = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliet",
  "Shipping",
];
const STORAGE_KEY = "gs_closing_note_draft_v3";

const DEFAULT_OPEN_COUNT = 5; // ✅ keep first 5 open by default

const el = (id) => document.getElementById(id);

let saveTimer = null;
let undoTimers = {}; // per-unit undo timer
let lastClearedState = {}; // per-unit state snapshot for undo

function splitItems(text) {
  const raw = (text || "")
    .split(/\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function nowTimeString() {
  const d = new Date();
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDisplayName(key) {
  const input = el(`name_${key}`);
  const val = input ? input.value.trim() : "";
  return val || key; // fallback to default
}

function validateRequiredFields() {
  const date = el("closingDate").value;
  const lead = el("lead").value.trim();

  el("dateError").textContent = "";
  el("leadError").textContent = "";
  el("closingDate").classList.remove("invalid");
  el("lead").classList.remove("invalid");

  let ok = true;

  if (!date) {
    ok = false;
    el("dateError").textContent = "Date is required.";
    el("closingDate").classList.add("invalid");
  }
  if (!lead) {
    ok = false;
    el("leadError").textContent = "Closing agent name is required.";
    el("lead").classList.add("invalid");
  }

  el("copyBtn").disabled = !ok;
  el("copyWsBtn").disabled = !ok;
  el("floatingCopyBtn").disabled = !ok;

  return ok;
}

function buildWorkstationsLines() {
  const unitLines = [];
  let unitCounter = 0;

  for (const key of UNIT_KEYS) {
    const prio = el(`prio_${key}`).value;

    const cItems = splitItems(el(`c_${key}`).value);
    const ipItems = splitItems(el(`ip_${key}`).value);
    const rItems = splitItems(el(`r_${key}`).value);

    if (!cItems.length && !ipItems.length && !rItems.length) continue;

    unitCounter += 1;
    const label = getDisplayName(key);

    unitLines.push(`${unitCounter}. ${label} | Priority: ${prio}`);
    if (cItems.length) unitLines.push(`   - C: ${cItems.join(", ")}`);
    if (ipItems.length) unitLines.push(`   - IP: ${ipItems.join(", ")}`);
    if (rItems.length) unitLines.push(`   - R: ${rItems.join(", ")}`);
  }

  return unitLines.length ? unitLines : ["(none)"];
}

function buildFullOutput() {
  const dateIso = el("closingDate").value;
  const dateText = formatDate(dateIso) || "(date not set)";
  const lead = el("lead").value.trim() || "(name not set)";
  const revenue = el("revenue").value.trim() || "(not provided)";
  const budget = el("budget").value.trim() || "(not provided)";
  const important = el("importantNotes").value.trim();

  const lines = [];
  lines.push("**Geek Squad Closing Note**");
  lines.push(`Date of closing: ${dateText} | Closing agent: ${lead}`);
  lines.push(`Revenue: ${revenue}`);
  lines.push(`Budget: ${budget}`);
  lines.push("");

  lines.push("**Important notes**");
  lines.push(important ? `- ${important.replace(/\n/g, "\n- ")}` : "- (none)");
  lines.push("");

  lines.push("**Workstations**");
  lines.push(buildWorkstationsLines().join("\n"));

  return lines.join("\n");
}

function buildWorkstationsOnlyOutput() {
  const lines = [];
  lines.push("**Workstations**");
  lines.push(buildWorkstationsLines().join("\n"));
  return lines.join("\n");
}

function refreshOutput() {
  el("output").value = buildFullOutput();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const out = el("output");
    out.value = text;
    out.focus();
    out.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      refreshOutput();
    }
  }
}

async function handleCopyFull() {
  if (!validateRequiredFields()) {
    el("copyStatus").textContent =
      "Please fill the required fields (date + closing agent).";
    return;
  }
  const ok = await copyText(el("output").value);
  el("copyStatus").textContent = ok
    ? "Copied ✅ Paste into Teams."
    : "Copy failed. Try selecting text manually.";
}

async function handleCopyWorkstationsOnly() {
  if (!validateRequiredFields()) {
    el("copyStatus").textContent =
      "Please fill the required fields (date + closing agent).";
    return;
  }
  const ok = await copyText(buildWorkstationsOnlyOutput());
  el("copyStatus").textContent = ok
    ? "Copied workstations ✅"
    : "Copy failed. Try selecting text manually.";
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraftToStorage, 350);
}

function getDraft() {
  const draft = {
    meta: { savedAt: new Date().toISOString() },
    settings: {
      showOnlyActive: !!el("showActiveToggle").checked,
      collapseAllLabel: el("collapseAllBtn")?.textContent || "Collapse all",
    },
    closingDate: el("closingDate").value,
    lead: el("lead").value,
    revenue: el("revenue").value,
    budget: el("budget").value,
    importantNotes: el("importantNotes").value,
    units: {},
  };

  for (const key of UNIT_KEYS) {
    draft.units[key] = {
      displayName: getDisplayName(key),
      priority: el(`prio_${key}`).value,
      c: el(`c_${key}`).value,
      ip: el(`ip_${key}`).value,
      r: el(`r_${key}`).value,
      collapsed: isUnitCollapsed(key),
    };
  }
  return draft;
}

function setSaveMetaFromDraft(draft) {
  const iso = draft?.meta?.savedAt;
  if (!iso) return;
  try {
    const d = new Date(iso);
    const time = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    el("saveMeta").textContent = `Last saved: ${time}`;
  } catch {}
}

function saveDraftToStorage() {
  try {
    const draft = getDraft();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    el("saveMeta").textContent = `Last saved: ${nowTimeString()}`;
  } catch {
    el("saveMeta").textContent = "Could not save (storage blocked).";
  }
}

function hasDraft() {
  return !!localStorage.getItem(STORAGE_KEY);
}

function loadDraftFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;

  try {
    const draft = JSON.parse(raw);
    if (!draft) return false;

    el("closingDate").value = draft.closingDate || "";
    el("lead").value = draft.lead || "";
    el("revenue").value = draft.revenue || "";
    el("budget").value = draft.budget || "";
    el("importantNotes").value = draft.importantNotes || "";
    el("showActiveToggle").checked = !!draft.settings?.showOnlyActive;

    // Restore per-unit
    for (const key of UNIT_KEYS) {
      const u = draft.units?.[key];
      if (!u) continue;
      el(`name_${key}`).value = u.displayName || key;
      el(`prio_${key}`).value = u.priority || "Medium";
      el(`c_${key}`).value = u.c || "";
      el(`ip_${key}`).value = u.ip || "";
      el(`r_${key}`).value = u.r || "";
      setUnitCollapsed(key, !!u.collapsed);
    }

    // Restore collapse all button label
    if (draft.settings?.collapseAllLabel) {
      el("collapseAllBtn").textContent = draft.settings.collapseAllLabel;
    }

    setSaveMetaFromDraft(draft);
    return true;
  } catch {
    return false;
  }
}

function isUnitCollapsed(key) {
  const body = el(`body_${key}`);
  return body?.classList.contains("isCollapsed") || false;
}

function setUnitCollapsed(key, collapsed) {
  const body = el(`body_${key}`);
  const btn = el(`toggle_${key}`);
  if (!body || !btn) return;
  body.classList.toggle("isCollapsed", collapsed);
  btn.textContent = collapsed ? "Expand" : "Collapse";
}

function toggleUnit(key) {
  const body = el(`body_${key}`);
  body.classList.toggle("isCollapsed");
  el(`toggle_${key}`).textContent = body.classList.contains("isCollapsed")
    ? "Expand"
    : "Collapse";
  scheduleSave();
}

function snapshotUnit(key) {
  return {
    displayName: getDisplayName(key),
    priority: el(`prio_${key}`).value,
    c: el(`c_${key}`).value,
    ip: el(`ip_${key}`).value,
    r: el(`r_${key}`).value,
    collapsed: isUnitCollapsed(key),
  };
}

function applyUnitState(key, state) {
  el(`name_${key}`).value = state.displayName || key;
  el(`prio_${key}`).value = state.priority || "Medium";
  el(`c_${key}`).value = state.c || "";
  el(`ip_${key}`).value = state.ip || "";
  el(`r_${key}`).value = state.r || "";
  setUnitCollapsed(key, !!state.collapsed);
}

function showUndo(key, show) {
  const undoBtn = el(`undo_${key}`);
  if (!undoBtn) return;
  undoBtn.style.display = show ? "inline-block" : "none";
}

function clearUnit(key) {
  lastClearedState[key] = snapshotUnit(key);

  el(`prio_${key}`).value = "Medium";
  el(`c_${key}`).value = "";
  el(`ip_${key}`).value = "";
  el(`r_${key}`).value = "";

  refreshOutput();
  applyShowOnlyActive();
  scheduleSave();

  showUndo(key, true);
  if (undoTimers[key]) clearTimeout(undoTimers[key]);
  undoTimers[key] = setTimeout(() => {
    showUndo(key, false);
    delete undoTimers[key];
    delete lastClearedState[key];
  }, 5000);
}

function undoClearUnit(key) {
  const state = lastClearedState[key];
  if (!state) return;

  applyUnitState(key, state);

  showUndo(key, false);
  if (undoTimers[key]) clearTimeout(undoTimers[key]);
  delete undoTimers[key];
  delete lastClearedState[key];

  refreshOutput();
  applyShowOnlyActive();
  scheduleSave();
}

function unitHasContent(key) {
  return (
    splitItems(el(`c_${key}`).value).length ||
    splitItems(el(`ip_${key}`).value).length ||
    splitItems(el(`r_${key}`).value).length
  );
}

function applyShowOnlyActive() {
  const showOnly = !!el("showActiveToggle").checked;
  for (const key of UNIT_KEYS) {
    const card = el(`card_${key}`);
    if (!card) continue;
    card.style.display = !showOnly || unitHasContent(key) ? "" : "none";
  }
}

function collapseAll(shouldCollapse) {
  for (const key of UNIT_KEYS) {
    setUnitCollapsed(key, shouldCollapse);
  }
  el("collapseAllBtn").textContent = shouldCollapse
    ? "Expand all"
    : "Collapse all";
  scheduleSave();
}

function applyDefaultCollapse() {
  // ✅ First 5 open, rest collapsed (only if no draft exists)
  UNIT_KEYS.forEach((key, idx) => {
    setUnitCollapsed(key, idx >= DEFAULT_OPEN_COUNT);
  });
  el("collapseAllBtn").textContent = "Collapse all";
}

function makeUnitCard(key, idx) {
  const card = document.createElement("div");
  card.className = "unitCard";
  card.id = `card_${key}`;

  card.innerHTML = `
    <div class="unitTop">
      <input id="name_${key}" class="unitNameInput" type="text" value="${key}" aria-label="Unit name" />
      <div class="unitButtons">
        <button type="button" id="toggle_${key}" class="secondary smallBtn">Collapse</button>
        <button type="button" id="clear_${key}" class="secondary smallBtn">Clear</button>
        <button type="button" id="undo_${key}" class="secondary smallBtn" style="display:none;">Undo</button>
      </div>
    </div>

    <div class="unitBody" id="body_${key}">
      <div class="twoCol">
        <div>
          <label for="prio_${key}">Priority</label>
          <select id="prio_${key}">
            <option>Low</option>
            <option selected>Medium</option>
            <option>High</option>
          </select>
        </div>
        <div></div>
      </div>

      <div class="tagBlock">
        <div>
          <div class="tagLabel"><span class="tagCode">C</span><span class="tagText">Completed</span></div>
          <textarea id="c_${key}" placeholder="e.g., RAM installed, Windows updated"></textarea>
        </div>

        <div>
          <div class="tagLabel"><span class="tagCode">IP</span><span class="tagText">In progress</span></div>
          <textarea id="ip_${key}" placeholder="e.g., Cleaning motherboard"></textarea>
        </div>

        <div>
          <div class="tagLabel"><span class="tagCode">R</span><span class="tagText">Remaining</span></div>
          <textarea id="r_${key}" placeholder="e.g., AFK setup"></textarea>
        </div>
      </div>
    </div>
  `;

  // Controls
  card
    .querySelector(`#toggle_${key}`)
    .addEventListener("click", () => toggleUnit(key));
  card
    .querySelector(`#clear_${key}`)
    .addEventListener("click", () => clearUnit(key));
  card
    .querySelector(`#undo_${key}`)
    .addEventListener("click", () => undoClearUnit(key));

  // When unit name changes: refresh output + save
  card.querySelector(`#name_${key}`).addEventListener("input", () => {
    refreshOutput();
    scheduleSave();
  });

  // On changes: output + active visibility + autosave
  card.querySelectorAll("select, textarea").forEach((elem) => {
    elem.addEventListener("input", () => {
      refreshOutput();
      applyShowOnlyActive();
      scheduleSave();
    });
  });

  return card;
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);

  el("closingDate").value = "";
  el("lead").value = "";
  el("revenue").value = "";
  el("budget").value = "";
  el("importantNotes").value = "";

  el("showActiveToggle").checked = false;
  el("saveMeta").textContent = "";
  el("copyStatus").textContent = "";

  for (const key of UNIT_KEYS) {
    el(`name_${key}`).value = key;
    el(`prio_${key}`).value = "Medium";
    el(`c_${key}`).value = "";
    el(`ip_${key}`).value = "";
    el(`r_${key}`).value = "";
    showUndo(key, false);
    if (undoTimers[key]) clearTimeout(undoTimers[key]);
    delete undoTimers[key];
    delete lastClearedState[key];
  }

  applyDefaultCollapse();
  applyShowOnlyActive();
  refreshOutput();
  validateRequiredFields();
}

function init() {
  // Render units
  const unitsDiv = el("units");
  UNIT_KEYS.forEach((key, idx) => unitsDiv.appendChild(makeUnitCard(key, idx)));

  // ✅ Default collapse rule: open first 5, rest collapsed — unless draft exists
  const loaded = loadDraftFromStorage();
  if (!loaded) applyDefaultCollapse();

  // Wire top fields
  ["closingDate", "lead", "revenue", "budget", "importantNotes"].forEach(
    (id) => {
      el(id).addEventListener("input", () => {
        refreshOutput();
        applyShowOnlyActive();
        scheduleSave();
      });
      el(id).addEventListener("blur", validateRequiredFields);
    },
  );

  // Toggle show active
  el("showActiveToggle").addEventListener("change", () => {
    applyShowOnlyActive();
    scheduleSave();
  });

  // Collapse all
  el("collapseAllBtn").addEventListener("click", () => {
    const isCurrentlyCollapse = el("collapseAllBtn")
      .textContent.toLowerCase()
      .includes("collapse");
    collapseAll(isCurrentlyCollapse);
  });

  // Copy
  el("copyBtn").addEventListener("click", handleCopyFull);
  el("copyWsBtn").addEventListener("click", handleCopyWorkstationsOnly);
  el("floatingCopyBtn").addEventListener("click", handleCopyFull);

  // Reset
  el("resetBtn").addEventListener("click", resetAll);

  // Initial UI state
  applyShowOnlyActive();
  refreshOutput();
  validateRequiredFields();
}

document.addEventListener("DOMContentLoaded", init);
