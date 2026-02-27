"use strict";

const UNIT_NAMES = [
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

const el = (id) => document.getElementById(id);

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

function makeUnitCard(name, idx) {
  const card = document.createElement("div");
  card.className = "unitCard";

  card.innerHTML = `
    <div class="unitHeader">
      <p class="unitName">${idx + 1}. ${name}</p>
      <p class="unitMeta">Fill C / IP / R as needed</p>
    </div>

    <div class="twoCol">
      <div>
        <label for="prio_${name}">Priority</label>
        <select id="prio_${name}">
          <option>Low</option>
          <option selected>Medium</option>
          <option>High</option>
        </select>
      </div>
      <div></div>
    </div>

    <div class="tagBlock">
      <div>
        <div class="tagLabel">
          <span class="tagCode">C</span><span class="tagText">Completed</span>
        </div>
        <textarea id="c_${name}" placeholder="e.g., RAM installed, Windows updated"></textarea>
      </div>

      <div>
        <div class="tagLabel">
          <span class="tagCode">IP</span><span class="tagText">In progress</span>
        </div>
        <textarea id="ip_${name}" placeholder="e.g., Cleaning motherboard"></textarea>
      </div>

      <div>
        <div class="tagLabel">
          <span class="tagCode">R</span><span class="tagText">Remaining</span>
        </div>
        <textarea id="r_${name}" placeholder="e.g., AFK setup"></textarea>
      </div>
    </div>
  `;

  card
    .querySelectorAll("select, textarea")
    .forEach((elm) => elm.addEventListener("input", updateOutput));
  return card;
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
  return ok;
}

function buildOutput() {
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
  lines.push("**Workstations**");

  const unitLines = [];
  let unitCounter = 0; // ✅ FIX: separate counter for numbering

  UNIT_NAMES.forEach((name) => {
    const prio = el(`prio_${name}`).value;

    const cItems = splitItems(el(`c_${name}`).value);
    const ipItems = splitItems(el(`ip_${name}`).value);
    const rItems = splitItems(el(`r_${name}`).value);

    if (!cItems.length && !ipItems.length && !rItems.length) return; // hide empty

    unitCounter += 1;
    unitLines.push(`${unitCounter}. ${name} | Priority: ${prio}`);
    if (cItems.length) unitLines.push(`   - C: ${cItems.join(", ")}`);
    if (ipItems.length) unitLines.push(`   - IP: ${ipItems.join(", ")}`);
    if (rItems.length) unitLines.push(`   - R: ${rItems.join(", ")}`);
  });

  lines.push(unitLines.length ? unitLines.join("\n") : "(none)");
  lines.push("");
  lines.push("**Important notes**");
  lines.push(important ? `- ${important.replace(/\n/g, "\n- ")}` : "- (none)");

  return lines.join("\n");
}

function updateOutput() {
  el("output").value = buildOutput();
  validateRequiredFields();
}

async function copyOutput() {
  if (!validateRequiredFields()) {
    el("copyStatus").textContent =
      "Please fill the required fields (date + closing agent).";
    return;
  }

  const text = el("output").value;
  const status = el("copyStatus");

  try {
    await navigator.clipboard.writeText(text);
    status.textContent = "Copied ✅ Paste into Teams.";
  } catch (e) {
    const out = el("output");
    out.focus();
    out.select();
    document.execCommand("copy");
    status.textContent = "Copied (fallback) ✅ Paste into Teams.";
  }
}

function resetAll() {
  el("closingDate").value = "";
  el("lead").value = "";
  el("revenue").value = "";
  el("budget").value = "";
  el("importantNotes").value = "";
  UNIT_NAMES.forEach((name) => {
    el(`prio_${name}`).value = "Medium";
    el(`c_${name}`).value = "";
    el(`ip_${name}`).value = "";
    el(`r_${name}`).value = "";
  });
  el("copyStatus").textContent = "";
  updateOutput();
}

function init() {
  const unitsDiv = el("units");
  UNIT_NAMES.forEach((name, idx) =>
    unitsDiv.appendChild(makeUnitCard(name, idx)),
  );

  ["closingDate", "lead", "revenue", "budget", "importantNotes"].forEach(
    (id) => {
      el(id).addEventListener("input", updateOutput);
      el(id).addEventListener("blur", validateRequiredFields);
    },
  );

  el("copyBtn").addEventListener("click", copyOutput);
  el("resetBtn").addEventListener("click", resetAll);

  updateOutput();
}

document.addEventListener("DOMContentLoaded", init);
