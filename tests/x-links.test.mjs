/**
 * X clips used to copy truncated link text (`memory.th…`) and media `t.co`
 * wrappers into the note. OmniFocus / Krank then linkify them — `.th` is a
 * real TLD, so `memory.th…` becomes http://memory.th.
 *
 * Mirrors the rewrite helpers inside src/extract-page.js (must stay
 * injectable / no imports there).
 *
 * Run with: node --test tests/*.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";

function isXMediaUrl(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (
      host === "t.co" ||
      host === "pic.twitter.com" ||
      host === "pic.x.com" ||
      host === "pbs.twimg.com" ||
      host === "video.twimg.com" ||
      host.endsWith(".twimg.com")
    ) {
      return true;
    }
    if (
      host === "x.com" ||
      host === "twitter.com" ||
      host === "mobile.x.com" ||
      host === "mobile.twitter.com"
    ) {
      return /\/status\/\d+\/(photo|video|analytics)(\/|$)/.test(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

function decodeXUrl(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return String(raw || "").replace(/\\\//g, "/");
  }
}

function collectXUrlMaps(html) {
  /** @type {Map<string, string>} */
  const expand = new Map();
  /** @type {Map<string, string>} */
  const display = new Map();
  if (!html) return { expand, display };

  const expRe = /expanded_url"?:?"([^"]*)"/g;
  let m;
  while ((m = expRe.exec(html))) {
    const expanded = decodeXUrl(m[1]);
    if (!/^https?:\/\//i.test(expanded) || isXMediaUrl(expanded)) continue;

    const start = Math.max(0, m.index - 600);
    const chunk = html.slice(start, m.index + m[0].length + 600);
    const tcoMatches = [...chunk.matchAll(/https:\/\/t\.co\/[A-Za-z0-9]+/g)];
    if (tcoMatches.length > 0) {
      const expPos = m.index - start;
      let best = tcoMatches[0];
      let bestDist = Math.abs((best.index || 0) - expPos);
      for (const tm of tcoMatches) {
        const d = Math.abs((tm.index || 0) - expPos);
        if (d < bestDist) {
          best = tm;
          bestDist = d;
        }
      }
      const short = best[0];
      const prev = expand.get(short);
      if (!prev || expanded.length > prev.length) expand.set(short, expanded);
    }

    const disp = chunk.match(/display_url"?:?"([^"]*)"/);
    if (disp) {
      const d = decodeXUrl(disp[1])
        .replace(/…$/, "")
        .replace(/\.{3}$/, "");
      if (d.length >= 6 && !isXMediaUrl(`https://${d}`)) {
        display.set(d, expanded);
      }
    }
  }
  return { expand, display };
}

function rewriteXPostLinks(text, maps) {
  if (!text) return text;
  let out = String(text);
  const expand = maps?.expand || new Map();
  const display = maps?.display || new Map();

  for (const [shown, long] of display) {
    const escaped = shown.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?:https?:\\/\\/)?${escaped}(?:…|\\.{3})?`, "g"), long);
  }
  for (const [short, long] of expand) {
    out = out.split(short).join(long);
  }

  out = out.replace(/https?:\/\/t\.co\/[A-Za-z0-9]+/g, "");
  out = out.replace(/https?:\/\/pic\.(?:twitter|x)\.com\/[A-Za-z0-9]+/g, "");
  out = out.replace(
    /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/\s]+\/status\/\d+\/(?:photo|video|analytics)(?:\/\d+)?/gi,
    ""
  );
  // CSS/DOM truncated chips: "memory.th…" (.th is a TLD, so this linkifies).
  out = out.replace(
    /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}[^\s]*?(?:…|\.{3})/g,
    ""
  );

  out = out.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ");
  out = out.replace(/[ \t]+([.,;:!?])/g, "$1");
  return out.trim();
}

test("photo t.co is dropped so it cannot become a chip", () => {
  const text =
    "HOW TO READ ANYONE INSTANTLY\n\nNietzsche’s 18 Psychological Truths: https://t.co/XdRF6gyVyx";
  const out = rewriteXPostLinks(text, { expand: new Map(), display: new Map() });
  assert.equal(
    out,
    "HOW TO READ ANYONE INSTANTLY\n\nNietzsche’s 18 Psychological Truths:"
  );
  assert.ok(!out.includes("t.co"));
});

test("real t.co expands to the destination", () => {
  const expand = new Map([
    ["https://t.co/abc1234xyz", "https://theatlantic.com/article/foo"],
  ]);
  const out = rewriteXPostLinks("Read this https://t.co/abc1234xyz", {
    expand,
    display: new Map(),
  });
  assert.equal(out, "Read this https://theatlantic.com/article/foo");
});

test("truncated memory.th… display is stripped (Thailand TLD false positive)", () => {
  const out = rewriteXPostLinks(
    "See memory.th… for the rest",
    { expand: new Map(), display: new Map() }
  );
  assert.equal(out, "See for the rest");
  assert.ok(!out.includes("memory.th"));
});

test("https-prefixed truncated URL is stripped", () => {
  const out = rewriteXPostLinks("Go https://memory.th… now", {
    expand: new Map(),
    display: new Map(),
  });
  assert.equal(out, "Go now");
});

test("display_url is replaced with expanded_url", () => {
  const display = new Map([
    ["memory.theatlantic.com/foo", "https://memory.theatlantic.com/foo/full"],
  ]);
  const out = rewriteXPostLinks("See memory.theatlantic.com/foo… today", {
    expand: new Map(),
    display,
  });
  assert.equal(out, "See https://memory.theatlantic.com/foo/full today");
});

test("literary ellipsis is not treated as a truncated URL", () => {
  const out = rewriteXPostLinks("Wait for it… the hippocampus", {
    expand: new Map(),
    display: new Map(),
  });
  assert.equal(out, "Wait for it… the hippocampus");
});

test("prose 'memory. The' is left alone", () => {
  const out = rewriteXPostLinks(
    "Working memory. The hippocampus stores it.",
    { expand: new Map(), display: new Map() }
  );
  assert.equal(out, "Working memory. The hippocampus stores it.");
});

test("collectXUrlMaps pairs expanded_url with the nearest t.co", () => {
  const html = `
    {display_url:"theatlantic.com/article/foo…",expanded_url:"https://theatlantic.com/article/foo",url:"https://t.co/abc1234xyz"}
    {expanded_url:"https://twitter.com/user/status/123/photo/1",url:"https://t.co/XdRF6gyVyx"}
  `;
  const maps = collectXUrlMaps(html);
  assert.equal(
    maps.expand.get("https://t.co/abc1234xyz"),
    "https://theatlantic.com/article/foo"
  );
  assert.equal(maps.expand.has("https://t.co/XdRF6gyVyx"), false);
  assert.equal(
    maps.display.get("theatlantic.com/article/foo"),
    "https://theatlantic.com/article/foo"
  );
});

test("media expanded_url (photo/video) is not treated as a destination", () => {
  assert.equal(
    isXMediaUrl("https://twitter.com/guideforman/status/2086030980280619218/photo/1"),
    true
  );
  assert.equal(
    isXMediaUrl("https://x.com/guideforman/status/2086030980280619218"),
    false
  );
  assert.equal(isXMediaUrl("https://theatlantic.com/foo"), false);
});

test("X og:title t.co is stripped", () => {
  const title =
    'Empire Mindset | Wealth Architect on X: "HOW TO READ ANYONE INSTANTLY https://t.co/XdRF6gyVyx" / X';
  const out = rewriteXPostLinks(title, { expand: new Map(), display: new Map() });
  assert.ok(!out.includes("t.co"));
  assert.ok(out.includes("HOW TO READ ANYONE INSTANTLY"));
});
