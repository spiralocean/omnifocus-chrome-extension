/**
 * Pure assembly helpers for X self-threads (1/8 … 8/8).
 * Runtime extraction lives inside extract-page.js (must stay self-contained);
 * these tests lock the join/sort rules that function uses.
 *
 * Run with: node --test tests/*.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

function parseThreadMarker(text) {
  const m = (text || "").match(/\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isFinite(n) || !Number.isFinite(total) || total < 2 || n < 1) {
    return null;
  }
  return { n, total };
}

function assembleNumberedThread(items) {
  if (items.length === 0) return [];
  const totalCounts = new Map();
  for (const it of items) {
    totalCounts.set(it.total, (totalCounts.get(it.total) || 0) + 1);
  }
  let bestTotal = items[0].total;
  let bestCount = 0;
  for (const [total, count] of totalCounts) {
    if (count > bestCount || (count === bestCount && total > bestTotal)) {
      bestTotal = total;
      bestCount = count;
    }
  }
  /** @type {Map<number, string>} */
  const byN = new Map();
  for (const it of items) {
    if (it.total !== bestTotal) continue;
    const prev = byN.get(it.n);
    if (!prev || it.text.length > prev.length) byN.set(it.n, it.text);
  }
  return [...byN.keys()]
    .sort((a, b) => a - b)
    .map((n) => byN.get(n) || "")
    .filter(Boolean);
}

/** Mirror collectXThreadFromEmbed's full_text / long-string scrape. */
function extractNumberedFromHtml(html) {
  /** @type {{ n: number, total: number, text: string }[]} */
  const items = [];
  const pushText = (raw) => {
    let text = raw;
    try {
      text = JSON.parse(`"${raw}"`);
    } catch {
      text = raw.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
    text = (text || "").trim();
    if (!text) return;
    const m =
      text.match(/\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s*$/) ||
      text.match(
        /\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s+https?:\/\/t\.co\/\w+\s*$/
      );
    if (!m) return;
    const n = Number(m[1]);
    const total = Number(m[2]);
    if (!Number.isFinite(n) || !Number.isFinite(total) || total < 2) return;
    items.push({ n, total, text });
  };

  const fullTextRe = /full_text:"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = fullTextRe.exec(html))) pushText(m[1]);
  const longRe =
    /"((?:[^"\\]|\\.){40,}?\((?:🧵\s*)?\d+\s*\/\s*\d+\)(?:\s+https?:\\\/\\\/t\.co\\\/\w+)?)"/g;
  while ((m = longRe.exec(html))) pushText(m[1]);
  return assembleNumberedThread(items);
}

test("parseThreadMarker reads 1/8 and thread emoji forms", () => {
  assert.deepEqual(parseThreadMarker("Hello\n\n(1/8)"), { n: 1, total: 8 });
  assert.deepEqual(parseThreadMarker("Hello\n\n(🧵1/8)"), { n: 1, total: 8 });
  assert.deepEqual(parseThreadMarker("Hello\n\n(🧵 2/8)"), { n: 2, total: 8 });
  assert.equal(parseThreadMarker("no marker"), null);
  assert.equal(parseThreadMarker("(1/1) alone is not a thread"), null);
});

test("assembleNumberedThread sorts and prefers longer bodies per slot", () => {
  const short2 = "short (2/3)";
  const long2 = "much longer body for part two of the thread\n\n(2/3)";
  const parts = assembleNumberedThread([
    { n: 3, total: 3, text: "end (3/3)" },
    { n: 1, total: 3, text: "start (1/3)" },
    { n: 2, total: 3, text: short2 },
    { n: 2, total: 3, text: long2 },
  ]);
  assert.deepEqual(parts, ["start (1/3)", long2, "end (3/3)"]);
});

test("joined thread is one note with all parts", () => {
  const parts = assembleNumberedThread([
    { n: 1, total: 2, text: "First (1/2)" },
    { n: 2, total: 2, text: "Second (2/2)" },
  ]);
  const note = parts.join("\n\n");
  assert.ok(note.includes("First"));
  assert.ok(note.includes("Second"));
  assert.equal(note.split("\n\n").length, 2);
});

test("Outdoctrination sample HTML yields a multi-part thread when available", () => {
  // Optional fixture from a live curl during development.
  const fixture = "/tmp/x-thread.html";
  if (!existsSync(fixture)) {
    // Skip soft — CI / clean machines won't have the scraped page.
    return;
  }
  const html = readFileSync(fixture, "utf8");
  const parts = extractNumberedFromHtml(html);
  assert.ok(
    parts.length >= 2,
    `expected multi-part thread, got ${parts.length}`
  );
  // Prefer detecting the advertised 8-part GlyNAC thread when fully present.
  if (parts.length >= 8) {
    assert.ok(parts[0].includes("1/8") || parts[0].includes("🧵1/8"));
    assert.ok(parts[parts.length - 1].includes("8/8"));
  }
});

/**
 * Unnumbered self-thread: full_text map + all nearby IDs (path ∪ payload),
 * mirrors collectXThreadFromEmbed's unnumbered path after the "only path links"
 * fix.
 */
function extractUnnumberedFromHtml(html, handle, statusId) {
  function snowflakeMs(idStr) {
    return Number(BigInt(idStr) >> 22n) + 1288834974657;
  }
  function decode(raw) {
    try {
      return JSON.parse(`"${raw}"`);
    } catch {
      return raw.replace(/\\n/g, "\n");
    }
  }

  /** @type {Map<string, string>} */
  const textById = new Map();
  const restRe = /rest_id:"(\d+)"/g;
  let m;
  while ((m = restRe.exec(html))) {
    const sid = m[1];
    const chunk = html.slice(m.index, m.index + 8000);
    const ft = chunk.match(/full_text:"((?:[^"\\]|\\.)*)"/);
    if (!ft) continue;
    const text = decode(ft[1]).trim();
    if (!text) continue;
    const prev = textById.get(sid);
    if (!prev || text.length > prev.length) textById.set(sid, text);
  }

  const rootMs = snowflakeMs(statusId);
  const WINDOW_MS = 2 * 60 * 60 * 1000;
  const MAX_GAP_MS = 15 * 60 * 1000;
  /** @type {Set<string>} */
  const candidateIds = new Set([statusId]);
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pathRe = new RegExp(`/${escaped}/status/(\\d+)`, "gi");
  while ((m = pathRe.exec(html))) candidateIds.add(m[1]);
  for (const id of textById.keys()) {
    if (!rootMs || Math.abs(snowflakeMs(id) - rootMs) <= WINDOW_MS) {
      candidateIds.add(id);
    }
  }

  let cluster = [...candidateIds].sort((a, b) => {
    const d = snowflakeMs(a) - snowflakeMs(b);
    if (d !== 0) return d;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (rootMs) {
    const inWindow = cluster.filter(
      (id) => Math.abs(snowflakeMs(id) - rootMs) <= WINDOW_MS
    );
    if (inWindow.length > 0) cluster = inWindow;
  }

  let rootIdx = cluster.indexOf(statusId);
  if (rootIdx < 0) rootIdx = 0;
  let start = rootIdx;
  while (start > 0) {
    const gap = snowflakeMs(cluster[start]) - snowflakeMs(cluster[start - 1]);
    if (gap < 0 || gap > MAX_GAP_MS) break;
    start--;
  }
  let end = rootIdx;
  while (end < cluster.length - 1) {
    const gap = snowflakeMs(cluster[end + 1]) - snowflakeMs(cluster[end]);
    if (gap < 0 || gap > MAX_GAP_MS) break;
    end++;
  }
  cluster = cluster.slice(start, end + 1);

  return cluster.map((id) => textById.get(id)).filter(Boolean);
}

test("guideforman unnumbered thread (no 1/N markers) extracts many parts", () => {
  const fixture = "/tmp/x-thread2.html";
  if (!existsSync(fixture)) return;

  const html = readFileSync(fixture, "utf8");
  // Numbered path should find nothing useful for this thread.
  assert.equal(extractNumberedFromHtml(html).length, 0);

  const parts = extractUnnumberedFromHtml(
    html,
    "guideforman",
    "2086030980280619218"
  );
  assert.ok(
    parts.length >= 10,
    `expected long unnumbered thread, got ${parts.length}`
  );
  assert.ok(parts[0].includes("HOW TO READ ANYONE") || parts[0].includes("Truth"));
  const joined = parts.join("\n\n");
  assert.ok(joined.includes("Truth 1"));
  assert.ok(joined.includes("Truth 18") || joined.includes("Truth 10"));
});
