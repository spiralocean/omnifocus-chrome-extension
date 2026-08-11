/**
 * Injected into the active tab via chrome.scripting.executeScript({ func }).
 * Must be fully self-contained — no imports or outer scope references.
 *
 * Note body is capped to stay inside omnifocus:// URL limits — this is a clip,
 * not a full-page archive. Prefer real page/answer text over short meta teasers
 * so the budget is spent on useful content. Keep EXCERPT_MAX in line with
 * NOTE_MAX_LENGTH in omnifocus.js (body + URL share that budget).
 */
/**
 * Must stay injectable (no outer imports). Async so X status pages can scroll
 * the conversation to load the full self-thread before we read the DOM/HTML.
 * chrome.scripting.executeScript awaits the returned Promise.
 */
export async function extractPageData() {
  // Match src/omnifocus.js NOTE_MAX_LENGTH so long X posts aren't pre-cut here.
  const EXCERPT_MAX = 8000;

  const selection = window.getSelection()?.toString().trim() ?? "";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Collapse messy HTML whitespace without erasing intentional line breaks
   * (multi-line X posts, YouTube descriptions, paragraph excerpts).
   */
  function normalizeExcerpt(text) {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Spaces/tabs only — leave newlines alone.
      .replace(/[^\S\n]+/g, " ")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      // Drop leading spaces on each line after the first non-empty content.
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Join blocks until EXCERPT_MAX without blowing past it mid-budget.
   * @param {string[]} blocks
   */
  function joinUpToLimit(blocks) {
    let out = "";
    for (const block of blocks) {
      const piece = (block || "").trim();
      if (!piece) continue;
      const next = out ? `${out}\n\n${piece}` : piece;
      if (next.length > EXCERPT_MAX) {
        if (!out) return piece.slice(0, EXCERPT_MAX);
        break;
      }
      out = next;
    }
    return out;
  }

  // For a YouTube video, fold the current playback position into the link so the
  // clipped task resumes where you left off (watch-later flow).
  function withYouTubeTimestamp(rawUrl) {
    try {
      const u = new URL(rawUrl);
      const host = u.hostname.replace(/^www\./, "");
      const isWatch =
        (host === "youtube.com" || host === "m.youtube.com") &&
        u.pathname === "/watch";
      if (!isWatch) return rawUrl;
      const seconds = Math.floor(document.querySelector("video")?.currentTime ?? 0);
      if (seconds < 5) return rawUrl;
      u.searchParams.set("t", `${seconds}s`);
      return u.toString();
    } catch {
      return rawUrl;
    }
  }

  const url = withYouTubeTimestamp(location.href);

  function hostname() {
    return location.hostname.replace(/^www\./, "");
  }

  function isYouTubeWatch() {
    const host = hostname();
    return (
      (host === "youtube.com" || host === "m.youtube.com") &&
      location.pathname === "/watch"
    );
  }

  function isXPost() {
    const host = hostname();
    return (
      host === "x.com" ||
      host === "twitter.com" ||
      host === "mobile.twitter.com" ||
      host === "mobile.x.com"
    );
  }

  function isQuora() {
    const host = hostname();
    return host === "quora.com" || host.endsWith(".quora.com");
  }

  // On a YouTube watch page, read the title from the live DOM. og:title and the
  // <title> tag can lag behind when you navigate between videos in YouTube's SPA.
  function youTubeVideoTitle() {
    if (!isYouTubeWatch()) return "";

    const domTitle =
      document.querySelector("#above-the-fold #title h1")?.textContent ||
      document.querySelector("h1.ytd-watch-metadata")?.textContent ||
      document.querySelector("#title h1 yt-formatted-string")?.textContent;
    if (domTitle?.trim()) return domTitle.trim();

    // Fallback: strip the "(3)" unread badge and trailing " - YouTube".
    return document.title
      .replace(/^\(\d+\)\s*/, "")
      .replace(/\s*-\s*YouTube\s*$/i, "")
      .trim();
  }

  // The video's own description from the live DOM. The page's meta description is
  // often YouTube's generic site blurb ("Enjoy the videos and music you love…").
  function youTubeDescription() {
    if (!isYouTubeWatch()) return "";

    const el =
      document.querySelector("#description-inline-expander") ||
      document.querySelector("#description.ytd-watch-metadata") ||
      document.querySelector("ytd-watch-metadata #description");

    const text = el?.innerText?.trim() || "";
    if (!text) return "";

    // Drop the expander's trailing "Show more"/"Show less" affordance.
    return text.replace(/\s*Show (more|less)\s*$/i, "").trim();
  }

  /**
   * Main post body from an X status article. Prefer long-form / article bodies
   * when present; otherwise tweetText (innerText keeps line breaks). Skip
   * nested quote-tweet articles so we don't clip the wrong text.
   * @param {Element} article
   */
  function textFromXArticle(article) {
    // X Articles / long-form notes (not the short tweet card).
    const longForm =
      article.querySelector('[data-testid="twitterArticleRichTextView"]') ||
      article.querySelector('[data-testid="article-detail"]') ||
      article.querySelector('div[data-testid="card.layoutLarge.detail"]');
    const longText = longForm?.innerText?.trim() || "";
    if (longText.length > 80) return longText;

    // Primary tweet text only — not quote-tweet text nested in a child article.
    const mainTextEls = [...article.querySelectorAll('[data-testid="tweetText"]')].filter(
      (el) => el.closest("article") === article
    );
    if (mainTextEls.length === 0) return "";
    // Concatenate in DOM order (some clients split blocks across nodes).
    return mainTextEls
      .map((el) => el.innerText?.trim() || "")
      .filter(Boolean)
      .join("\n\n");
  }

  /** Top-level timeline cards only (exclude nested quote-tweet articles). */
  function topLevelXArticles() {
    return [...document.querySelectorAll("article")].filter(
      (el) => !el.parentElement?.closest("article")
    );
  }

  /**
   * @param {Element} article
   * @returns {string} handle without @, or ""
   */
  function authorHandleFromXArticle(article) {
    const userLink =
      article.querySelector('[data-testid="User-Name"] a[href^="/"]') ||
      article.querySelector('a[href^="/"][role="link"] time')?.closest("a");
    const href =
      userLink?.getAttribute("href") ||
      article.querySelector('a[href*="/status/"]')?.getAttribute("href") ||
      "";
    const m = href.match(/^\/([A-Za-z0-9_]+)(?:\/|$|\?)/);
    if (!m) return "";
    const handle = m[1];
    const reserved = new Set([
      "home",
      "explore",
      "search",
      "i",
      "settings",
      "compose",
      "messages",
      "notifications",
      "intent",
      "hashtag",
    ]);
    return reserved.has(handle.toLowerCase()) ? "" : handle;
  }

  /**
   * @param {Element} article
   * @returns {string}
   */
  function statusIdFromXArticle(article) {
    const links = [...article.querySelectorAll('a[href*="/status/"]')];
    for (const a of links) {
      // Prefer the timestamp permalink on this card, not a quoted status.
      if (a.closest("article") !== article) continue;
      const m = (a.getAttribute("href") || "").match(/\/status\/(\d+)/);
      if (m) return m[1];
    }
    return "";
  }

  /**
   * Parse trailing "1/8" or "🧵1/8" thread markers authors put in posts.
   * @param {string} text
   * @returns {{ n: number, total: number } | null}
   */
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

  /**
   * Prefer the longest body for each n when the same post appears twice
   * (short full_text + expanded note).
   * @param {{ n: number, total: number, text: string }[]} items
   * @returns {string[]}
   */
  function assembleNumberedThread(items) {
    if (items.length === 0) return [];
    // Most common total wins (handles stray 1/2 quotes in replies).
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

  /**
   * Twitter snowflake → approx ms. BigInt required (IDs exceed Number precision).
   * @param {string} idStr
   * @returns {number}
   */
  function snowflakeMs(idStr) {
    try {
      return Number(BigInt(idStr) >> 22n) + 1288834974657;
    } catch {
      return 0;
    }
  }

  /**
   * Decode a GraphQL/legacy full_text payload (JSON string body, no quotes).
   * @param {string} raw
   * @returns {string}
   */
  function decodeXFullText(raw) {
    try {
      return JSON.parse(`"${raw}"`);
    } catch {
      try {
        return raw
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      } catch {
        return raw;
      }
    }
  }

  /**
   * Score a candidate thread: more parts win, then more characters.
   * @param {string[]} parts
   */
  function threadScore(parts) {
    if (!parts || parts.length === 0) return 0;
    let chars = 0;
    for (const p of parts) chars += p.length;
    return parts.length * 1_000_000 + chars;
  }

  /**
   * Same-author cards from the live conversation column (status pages show the
   * self-thread as consecutive articles before other people's replies).
   * @param {string} handle
   * @param {string} statusId
   * @returns {string[]}
   */
  function collectXThreadFromDom(handle, statusId) {
    const handleLc = handle.toLowerCase();
    const articles = topLevelXArticles();
    /** @type {{ statusId: string, text: string, isAuthor: boolean, marker: { n: number, total: number } | null }[]} */
    const cards = [];

    for (const article of articles) {
      const author = authorHandleFromXArticle(article);
      const sid = statusIdFromXArticle(article);
      const authorStatus = article.querySelector(
        `a[href*="/${handle}/status/"], a[href*="/${handleLc}/status/"]`
      );
      const isAuthor =
        (author && author.toLowerCase() === handleLc) || Boolean(authorStatus);

      const text = textFromXArticle(article);
      if (!text) continue;
      cards.push({
        statusId: sid,
        text,
        isAuthor,
        marker: parseThreadMarker(text),
      });
    }

    const numbered = cards
      .filter((c) => c.isAuthor && c.marker)
      .map((c) => ({
        n: c.marker.n,
        total: c.marker.total,
        text: c.text,
      }));
    const assembled = assembleNumberedThread(numbered);
    if (assembled.length > 1) return assembled;

    // Unnumbered self-thread: contiguous same-author run that includes the
    // opened status (expand upward for earlier thread posts too).
    if (cards.length === 0) return [];
    let rootIdx = cards.findIndex((c) => c.statusId === statusId);
    if (rootIdx < 0) rootIdx = cards.findIndex((c) => c.isAuthor);
    if (rootIdx < 0) return [];

    let start = rootIdx;
    while (start > 0 && cards[start - 1].isAuthor) start--;
    let end = rootIdx;
    while (end < cards.length - 1 && cards[end + 1].isAuthor) end++;

    return cards
      .slice(start, end + 1)
      .filter((c) => c.isAuthor)
      .map((c) => c.text);
  }

  /**
   * Pull thread bodies from embedded page JSON (SSR / hydration).
   * 1) Numbered (1/8)…(N/N) threads
   * 2) Unnumbered self-threads: all same-author status IDs near the opened post
   *    (e.g. 18 "Truth N" posts with no markers), via full_text + path order.
   *
   * @param {string} handle
   * @param {string} statusId
   * @returns {string[]}
   */
  function collectXThreadFromEmbed(handle, statusId) {
    const html = document.documentElement?.innerHTML || "";
    if (!html || html.length < 1000) return [];

    /** @type {{ n: number, total: number, text: string }[]} */
    const numberedItems = [];

    const considerNumbered = (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      const m =
        trimmed.match(/\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s*$/) ||
        trimmed.match(
          /\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s+https?:\/\/t\.co\/\w+\s*$/
        );
      if (!m) return;
      const n = Number(m[1]);
      const total = Number(m[2]);
      if (!Number.isFinite(n) || !Number.isFinite(total) || total < 2) return;
      numberedItems.push({ n, total, text: trimmed });
    };

    // rest_id → best full_text (unnumbered threads + single posts)
    /** @type {Map<string, string>} */
    const textById = new Map();
    const restRe = /rest_id:"(\d+)"/g;
    let m;
    while ((m = restRe.exec(html))) {
      const sid = m[1];
      const chunk = html.slice(m.index, m.index + 8000);
      const ft = chunk.match(/full_text:"((?:[^"\\]|\\.)*)"/);
      if (!ft) continue;
      const text = decodeXFullText(ft[1]).trim();
      if (!text) continue;
      considerNumbered(text);
      const prev = textById.get(sid);
      if (!prev || text.length > prev.length) textById.set(sid, text);
    }

    // Also scan raw full_text / long note strings for (n/m) markers only.
    const fullTextRe = /full_text:"((?:[^"\\]|\\.)*)"/g;
    while ((m = fullTextRe.exec(html))) considerNumbered(decodeXFullText(m[1]));
    const longRe =
      /"((?:[^"\\]|\\.){40,}?\((?:🧵\s*)?\d+\s*\/\s*\d+\)(?:\s+https?:\\\/\\\/t\.co\\\/\w+)?)"/g;
    while ((m = longRe.exec(html))) considerNumbered(decodeXFullText(m[1]));

    const numbered = assembleNumberedThread(numberedItems);
    if (numbered.length > 1) return numbered;

    // --- Unnumbered self-thread ---
    // Candidate IDs = author status path links ∪ tweet- entries ∪ every
    // rest_id that has full_text near the opened post's snowflake time.
    // Live X often only paints a few /handle/status/ links until you scroll;
    // full_text for the whole thread may already be in the page payload.
    const rootMs = snowflakeMs(statusId);
    const WINDOW_MS = 2 * 60 * 60 * 1000;
    const MAX_GAP_MS = 15 * 60 * 1000;

    /** @type {Set<string>} */
    const candidateIds = new Set();
    if (statusId) candidateIds.add(statusId);

    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pathRe = new RegExp(`/${escaped}/status/(\\d+)`, "gi");
    while ((m = pathRe.exec(html))) candidateIds.add(m[1]);

    const tweetRe = /tweet-(\d{15,})/g;
    while ((m = tweetRe.exec(html))) {
      if (textById.has(m[1])) candidateIds.add(m[1]);
    }

    for (const id of textById.keys()) {
      const ms = snowflakeMs(id);
      if (!rootMs || Math.abs(ms - rootMs) <= WINDOW_MS) candidateIds.add(id);
    }

    if (candidateIds.size === 0) {
      const single = textById.get(statusId);
      return single ? [single] : [];
    }

    // Sort by post time (snowflake), then id.
    let cluster = [...candidateIds].sort((a, b) => {
      const d = snowflakeMs(a) - snowflakeMs(b);
      if (d !== 0) return d;
      return a < b ? -1 : a > b ? 1 : 0;
    });

    // Prefer the time window around the opened status when we have a root.
    if (rootMs) {
      const inWindow = cluster.filter(
        (id) => Math.abs(snowflakeMs(id) - rootMs) <= WINDOW_MS
      );
      if (inWindow.length > 0) cluster = inWindow;
    }

    // Contiguous run around the opened id (small consecutive gaps).
    let rootIdx = cluster.indexOf(statusId);
    if (rootIdx < 0) {
      // Nearest id by time.
      let best = 0;
      let bestDelta = Infinity;
      for (let i = 0; i < cluster.length; i++) {
        const d = Math.abs(snowflakeMs(cluster[i]) - rootMs);
        if (d < bestDelta) {
          bestDelta = d;
          best = i;
        }
      }
      rootIdx = best;
    }
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

    const parts = [];
    for (const id of cluster) {
      const text = textById.get(id);
      if (text) parts.push(text);
    }
    return parts;
  }

  /**
   * X virtualizes the conversation: only a few posts are in the DOM until the
   * user scrolls. Nudge the timeline so more of the self-thread mounts (and more
   * payload lands in the HTML) before we collect text.
   */
  async function loadFullXThread() {
    if (!isXPost()) return;
    if (!location.pathname.match(/\/[^/]+\/status\/\d+/)) return;

    const sleepMs = 400;
    const maxPasses = 60;
    const y0 = window.scrollY;
    const column =
      document.querySelector('[data-testid="primaryColumn"]') ||
      document.scrollingElement ||
      document.documentElement;

    /** Unique author status IDs currently mounted (better than article count). */
    const authorStatusCount = () => {
      const path = location.pathname.match(/^\/([^/]+)\/status\//);
      const handle = path?.[1] || "";
      const handleLc = handle.toLowerCase();
      const ids = new Set();
      for (const article of topLevelXArticles()) {
        const author = authorHandleFromXArticle(article);
        const hit = handle
          ? article.querySelector(
              `a[href*="/${handle}/status/"], a[href*="/${handleLc}/status/"]`
            )
          : null;
        const isAuthor =
          (author && handle && author.toLowerCase() === handleLc) || Boolean(hit);
        if (!isAuthor && handle) continue;
        const sid = statusIdFromXArticle(article);
        if (sid) ids.add(sid);
      }
      // Also count path links in the live HTML for this author (payload grows too).
      if (handle) {
        const html = document.documentElement?.innerHTML || "";
        const re = new RegExp(
          `/${handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/status/(\\d+)`,
          "gi"
        );
        let m;
        while ((m = re.exec(html))) ids.add(m[1]);
      }
      return ids.size;
    };

    // Start at top so early thread posts are included.
    window.scrollTo(0, 0);
    try {
      column.scrollTop = 0;
    } catch {
      // ignore
    }
    await sleep(sleepMs);

    let prev = authorStatusCount();
    let stable = 0;
    let best = prev;

    for (let i = 0; i < maxPasses; i++) {
      const step = Math.max(600, Math.floor(window.innerHeight * 0.85));
      window.scrollBy(0, step);
      try {
        if (typeof column.scrollBy === "function") column.scrollBy(0, step);
        else column.scrollTop = (column.scrollTop || 0) + step;
      } catch {
        // ignore
      }
      await sleep(sleepMs);

      const next = authorStatusCount();
      if (next > best) best = next;
      if (next <= prev) stable++;
      else stable = 0;
      prev = next;

      // Stop when we stop discovering more of the author's status IDs.
      if (stable >= 8 && best >= 2) break;
    }

    // Restore viewport so clipping doesn't leave the user at the bottom.
    window.scrollTo(0, y0);
    await sleep(120);
  }

  /**
   * Live tweet body — and on status URLs, the full self-thread (numbered 1/N
   * or unnumbered multi-post threads like "Truth 1…Truth 18").
   */
  function xPostText() {
    if (!isXPost()) return "";

    const path = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (path) {
      const handle = path[1];
      const statusId = path[2];
      const fromDom = collectXThreadFromDom(handle, statusId);
      const fromEmbed = collectXThreadFromEmbed(handle, statusId);
      const parts =
        threadScore(fromEmbed) > threadScore(fromDom)
          ? fromEmbed
          : fromDom.length > 0
            ? fromDom
            : fromEmbed;
      if (parts.length > 1) return parts.join("\n\n");
      if (parts.length === 1) return parts[0];
    }

    // Profile / home / timeline: first visible top-level tweet body.
    const firstArticle = topLevelXArticles()[0] || document.querySelector("article");
    if (firstArticle) {
      const text = textFromXArticle(firstArticle);
      if (text) return text;
    }
    const first = document.querySelector('[data-testid="tweetText"]');
    return first?.innerText?.trim() || "";
  }

  // Load the full X conversation before reading DOM / HTML payload.
  if (isXPost() && /\/[^/]+\/status\/\d+/.test(location.pathname)) {
    try {
      await loadFullXThread();
    } catch {
      // Scroll failed — still try whatever is already on the page.
    }
  }

  /**
   * Quora og:description is a short teaser. Prefer the visible answer body.
   * Answers use custom divs (.q-text), not classic article > p markup.
   */
  function quoraAnswerText() {
    if (!isQuora()) return "";

    const rootSelectors = [
      ".puppeteer_test_answer_content",
      ".spacing_log_answer_content",
      '[class*="AnswerBase"]',
      '[class*="answer_content"]',
      // Answer permalinks often put the answer under #mainContent.
      "#mainContent",
    ];

    for (const sel of rootSelectors) {
      const root = document.querySelector(sel);
      if (!root) continue;

      // Prefer .q-text prose nodes; fall back to the root's text.
      const qTexts = [...root.querySelectorAll(".q-text")]
        .map((el) => el.innerText?.trim() || "")
        .filter((t) => t.length > 60);
      if (qTexts.length > 0) {
        // Longest block is usually the expanded answer body (not byline).
        const best = qTexts.reduce((a, b) => (a.length >= b.length ? a : b));
        if (best.length > 60) return best;
      }

      const raw = root.innerText?.trim() || "";
      // #mainContent can include the whole feed — only accept if focused.
      if (sel !== "#mainContent" && raw.length > 60) return raw;
    }

    // Question page with multiple answers: take the longest standalone .q-text.
    const all = [...document.querySelectorAll(".q-text")]
      .map((el) => el.innerText?.trim() || "")
      .filter((t) => t.length > 80);
    if (all.length === 0) return "";
    return all.reduce((a, b) => (a.length >= b.length ? a : b));
  }

  /**
   * Schema.org / JSON-LD article or Q&A bodies when the host embeds them.
   */
  function jsonLdArticleBody() {
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    );
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || "null");
        const items = Array.isArray(data)
          ? data
          : data?.["@graph"] && Array.isArray(data["@graph"])
            ? data["@graph"]
            : data
              ? [data]
              : [];

        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          if (typeof item.articleBody === "string" && item.articleBody.trim()) {
            return item.articleBody.trim();
          }
          const main = item.mainEntity;
          if (main && typeof main === "object") {
            const accepted = main.acceptedAnswer?.text;
            if (typeof accepted === "string" && accepted.trim()) {
              return accepted.trim();
            }
            const suggested = main.suggestedAnswer;
            if (Array.isArray(suggested)) {
              for (const ans of suggested) {
                if (typeof ans?.text === "string" && ans.text.trim()) {
                  return ans.text.trim();
                }
              }
            } else if (
              typeof suggested?.text === "string" &&
              suggested.text.trim()
            ) {
              return suggested.text.trim();
            }
            if (typeof main.text === "string" && main.text.trim()) {
              return main.text.trim();
            }
          }
        }
      } catch {
        // ignore malformed JSON-LD
      }
    }
    return "";
  }

  const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
  const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.content;
  const title = (
    youTubeVideoTitle() ||
    ogTitle ||
    twitterTitle ||
    document.title ||
    "Untitled"
  ).trim();

  const ogSite = document.querySelector('meta[property="og:site_name"]')?.content;
  const siteName = (ogSite || hostname()).trim();

  const descriptionCandidates = [
    document.querySelector('meta[property="og:description"]')?.content,
    document.querySelector('meta[name="description"]')?.content,
    document.querySelector('meta[name="twitter:description"]')?.content,
  ];

  let metaDescription = "";
  for (const value of descriptionCandidates) {
    if (value?.trim()) {
      metaDescription = value.trim();
      break;
    }
  }

  const selectors = [
    "article",
    "[role='article']",
    "main article",
    "main",
    "[role='main']",
    ".post-content",
    ".article-body",
    ".entry-content",
    "#article-body",
    ".story-body",
  ];

  let articleEl = null;
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && (el.innerText?.trim().length ?? 0) > 120) {
      articleEl = el;
      break;
    }
  }

  let articleExcerpt = "";
  if (articleEl) {
    const paragraphs = [...articleEl.querySelectorAll("p")]
      .map((p) => p.innerText.trim())
      .filter((text) => text.length > 40);

    articleExcerpt =
      paragraphs.length > 0
        ? // Fill the note budget; old code stopped at 3 short paragraphs.
          joinUpToLimit(paragraphs)
        : articleEl.innerText.trim().slice(0, EXCERPT_MAX);
  }

  // Prefer live / structured bodies over meta tags. Meta is often a short
  // teaser (Quora, news sites) and used to win over the real article text.
  const excerpt = normalizeExcerpt(
    selection ||
      youTubeDescription() ||
      xPostText() ||
      quoraAnswerText() ||
      jsonLdArticleBody() ||
      articleExcerpt ||
      metaDescription
  ).slice(0, EXCERPT_MAX);

  return {
    title,
    url,
    excerpt,
    selection,
    siteName,
  };
}
