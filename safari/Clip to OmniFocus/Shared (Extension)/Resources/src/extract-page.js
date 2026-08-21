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
   * X renders t.co as CSS-truncated text (`memory.th…`). `.th` is a TLD, so
   * OmniFocus/Krank linkify that fragment into http://memory.th. Photo tweets
   * also append a media t.co that redirects to /status/…/photo/1.
   *
   * Keep @mentions / #hashtags as visible text; replace URL anchors with the
   * real destination (or drop media/unknown t.co). Mirrored in tests/x-links.test.mjs.
   */
  /** @type {{ expand: Map<string, string>, display: Map<string, string> }} */
  let xUrlMaps = { expand: new Map(), display: new Map() };

  /** @param {string} raw */
  function isXMediaUrl(raw) {
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
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
        return /\/status\/\d+\/(photo|video|analytics)(\/|$)/.test(parsed.pathname);
      }
      return false;
    } catch {
      return false;
    }
  }

  /** @param {string} raw */
  function decodeXUrl(raw) {
    try {
      return JSON.parse(`"${raw}"`);
    } catch {
      return String(raw || "").replace(/\\\//g, "/");
    }
  }

  /** @param {string} html */
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
        const shown = decodeXUrl(disp[1])
          .replace(/…$/, "")
          .replace(/\.{3}$/, "");
        if (shown.length >= 6 && !isXMediaUrl(`https://${shown}`)) {
          display.set(shown, expanded);
        }
      }
    }
    return { expand, display };
  }

  function refreshXUrlMaps() {
    xUrlMaps = collectXUrlMaps(document.documentElement?.innerHTML || "");
  }

  /**
   * @param {string} text
   * @param {{ expand?: Map<string, string>, display?: Map<string, string> }} [maps]
   */
  function rewriteXPostLinks(text, maps = xUrlMaps) {
    if (!text) return text;
    let out = String(text);
    const expand = maps?.expand || new Map();
    const display = maps?.display || new Map();

    for (const [shown, long] of display) {
      const escaped = shown.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(
        new RegExp(`(?:https?:\\/\\/)?${escaped}(?:…|\\.{3})?`, "g"),
        long
      );
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
    out = out.replace(
      /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}[^\s]*?(?:…|\.{3})/g,
      ""
    );

    out = out.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ");
    out = out.replace(/[ \t]+([.,;:!?])/g, "$1");
    return out.trim();
  }

  /** Mentions / hashtags / cashtags — keep the visible @/#/$ text. */
  function isXChromeLink(href) {
    try {
      const path = new URL(href, location.href).pathname;
      if (/^\/[A-Za-z0-9_]+\/?$/.test(path)) return true;
      if (path.startsWith("/hashtag/")) return true;
      if (path.startsWith("/search")) return true;
      if (path.includes("cashtag")) return true;
      return false;
    } catch {
      return false;
    }
  }

  /** @param {Element} a */
  function resolvedXLinkText(a) {
    const href = a.getAttribute("href") || "";
    const visible = (a.innerText || a.textContent || "").trim();
    if (!href) return visible;
    if (isXChromeLink(href)) return visible;

    const dataExp = a.getAttribute("data-expanded-url") || "";
    const titleAttr = a.getAttribute("title") || "";
    let abs = href;
    try {
      abs = new URL(href, location.href).href;
    } catch {
      // keep href
    }
    for (const cand of [dataExp, titleAttr, abs]) {
      if (/^https?:\/\//i.test(cand)) return cand;
    }
    return visible;
  }

  /**
   * innerText of a tweet includes CSS-truncated link labels. Swap URL <a>s for
   * href/expanded before reading so we never store `memory.th…`.
   * @param {Element | null} el
   */
  function serializeXRichText(el) {
    if (!el) return "";
    const links = el.querySelectorAll("a[href]");
    if (links.length === 0) return (el.innerText || "").trim();
    const clone = el.cloneNode(true);
    if (!(clone instanceof Element)) return (el.innerText || "").trim();
    for (const a of clone.querySelectorAll("a[href]")) {
      const label = resolvedXLinkText(a);
      a.replaceWith(document.createTextNode(label));
    }
    return (clone.innerText || "").trim();
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
    const longText = serializeXRichText(longForm);
    if (longText.length > 80) return longText;

    // Primary tweet text only — not quote-tweet text nested in a child article.
    const mainTextEls = [...article.querySelectorAll('[data-testid="tweetText"]')].filter(
      (el) => el.closest("article") === article
    );
    if (mainTextEls.length === 0) return "";
    // Concatenate in DOM order (some clients split blocks across nodes).
    return mainTextEls
      .map((el) => serializeXRichText(el))
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

  /** Author statusId → best body seen so far (survives virtualized unmounts). */
  /** @type {Map<string, string>} */
  const harvestedXTexts = new Map();

  /**
   * @param {string} id
   * @param {string} text
   */
  function rememberXText(id, text) {
    if (!id || !text) return;
    const prev = harvestedXTexts.get(id);
    if (!prev || text.length > prev.length) harvestedXTexts.set(id, text);
  }

  /**
   * @param {Element} article
   * @param {string} handle
   */
  function isAuthorXArticle(article, handle) {
    const handleLc = handle.toLowerCase();
    const author = authorHandleFromXArticle(article);
    if (author && author.toLowerCase() === handleLc) return true;
    return Boolean(
      article.querySelector(
        `a[href*="/${handle}/status/"], a[href*="/${handleLc}/status/"]`
      )
    );
  }

  /** Copy currently mounted same-author cards into the harvest map. */
  function harvestVisibleXAuthorPosts(handle) {
    for (const article of topLevelXArticles()) {
      if (!isAuthorXArticle(article, handle)) continue;
      const sid = statusIdFromXArticle(article);
      const text = textFromXArticle(article);
      if (sid && text) rememberXText(sid, text);
    }
  }

  /**
   * Expand truncated tweet bodies and "Show more replies" cells in the
   * conversation column. Do not click <a href> "Show this thread" — that
   * navigates away.
   */
  function expandVisibleXConversation() {
    const root =
      document.querySelector('[data-testid="primaryColumn"]') || document.body;
    if (!root) return;
    for (const el of root.querySelectorAll(
      '[data-testid="tweet-text-show-more-link"]'
    )) {
      try {
        el.click();
      } catch {
        // ignore
      }
    }
    const want =
      /show more replies|show additional replies|show probable spam|show post/i;
    for (const el of root.querySelectorAll('div[role="button"], button')) {
      const label = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (!label || label.length > 72) continue;
      if (!want.test(label)) continue;
      try {
        el.click();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Pull full_text out of embedded page JSON. Only keep bodies for this
   * author's /handle/status/ IDs (or IDs already harvested from the DOM).
   * @param {string} handle
   * @returns {{ n: number, total: number, text: string }[]}
   */
  function harvestXEmbedTexts(handle) {
    const html = document.documentElement?.innerHTML || "";
    refreshXUrlMaps();
    /** @type {{ n: number, total: number, text: string }[]} */
    const numberedItems = [];
    if (!html || html.length < 1000) return numberedItems;

    const considerNumbered = (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      const marker = parseThreadMarker(trimmed);
      const withLink = trimmed.match(
        /\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s+https?:\/\/t\.co\/\w+\s*$/
      );
      if (marker) {
        numberedItems.push({
          n: marker.n,
          total: marker.total,
          text: trimmed,
        });
        return;
      }
      if (!withLink) return;
      const n = Number(withLink[1]);
      const total = Number(withLink[2]);
      if (!Number.isFinite(n) || !Number.isFinite(total) || total < 2) return;
      numberedItems.push({ n, total, text: trimmed });
    };

    /** @type {Map<string, string>} */
    const rawById = new Map();
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
      const prev = rawById.get(sid);
      if (!prev || text.length > prev.length) rawById.set(sid, text);
    }

    const fullTextRe = /full_text:"((?:[^"\\]|\\.)*)"/g;
    while ((m = fullTextRe.exec(html))) considerNumbered(decodeXFullText(m[1]));
    const longRe =
      /"((?:[^"\\]|\\.){40,}?\((?:🧵\s*)?\d+\s*\/\s*\d+\)(?:\s+https?:\\\/\\\/t\.co\\\/\w+)?)"/g;
    while ((m = longRe.exec(html))) considerNumbered(decodeXFullText(m[1]));

    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pathRe = new RegExp(`/${escaped}/status/(\\d+)`, "gi");
    while ((m = pathRe.exec(html))) {
      const text = rawById.get(m[1]);
      if (text) rememberXText(m[1], text);
    }
    // Fill bodies for IDs we already know are the author's (from the DOM).
    for (const [id, text] of rawById) {
      if (harvestedXTexts.has(id)) rememberXText(id, text);
    }

    return numberedItems;
  }

  /**
   * Cluster harvested author IDs around the opened status by snowflake time.
   * @param {string} statusId
   * @returns {string[]}
   */
  function assembleUnnumberedFromHarvest(statusId) {
    const rootMs = snowflakeMs(statusId);
    const WINDOW_MS = 2 * 60 * 60 * 1000;
    const MAX_GAP_MS = 15 * 60 * 1000;

    /** @type {string[]} */
    let cluster = [...harvestedXTexts.keys()];
    if (statusId && !harvestedXTexts.has(statusId)) cluster.push(statusId);
    if (cluster.length === 0) return [];

    cluster.sort((a, b) => {
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
    if (rootIdx < 0) {
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

    const parts = [];
    for (const id of cluster.slice(start, end + 1)) {
      const text = harvestedXTexts.get(id);
      if (text) parts.push(text);
    }
    return parts;
  }

  /**
   * @param {string} handle
   * @param {string} statusId
   * @returns {string[]}
   */
  function assembleXThread(handle, statusId) {
    refreshXUrlMaps();
    harvestVisibleXAuthorPosts(handle);
    const numberedItems = harvestXEmbedTexts(handle);
    for (const text of harvestedXTexts.values()) {
      const marker = parseThreadMarker(text);
      if (marker) {
        numberedItems.push({ n: marker.n, total: marker.total, text });
      }
    }
    const numbered = assembleNumberedThread(numberedItems)
      .map((t) => rewriteXPostLinks(t))
      .filter(Boolean);
    if (numbered.length > 1) return numbered;
    return assembleUnnumberedFromHarvest(statusId)
      .map((t) => rewriteXPostLinks(t))
      .filter(Boolean);
  }

  /**
   * X virtualizes the conversation: only a few posts stay mounted. Scroll the
   * timeline and copy each same-author card into harvestedXTexts as it appears
   * so unmounting does not drop earlier posts. Stop when the harvest size
   * (monotonic) stops growing — not when the current viewport stops growing.
   */
  async function loadFullXThread() {
    if (!isXPost()) return;
    const path = location.pathname.match(/^\/([^/]+)\/status\/\d+/);
    if (!path) return;
    const handle = path[1];

    const sleepMs = 350;
    const maxPasses = 80;
    const y0 = window.scrollY;
    const column =
      document.querySelector('[data-testid="primaryColumn"]') ||
      document.scrollingElement ||
      document.documentElement;

    const scrollByPx = (dy) => {
      window.scrollBy(0, dy);
      try {
        if (typeof column.scrollBy === "function") column.scrollBy(0, dy);
        else column.scrollTop = (column.scrollTop || 0) + dy;
      } catch {
        // ignore
      }
    };

    // Start at top so ancestor thread posts mount first.
    window.scrollTo(0, 0);
    try {
      column.scrollTop = 0;
    } catch {
      // ignore
    }
    await sleep(sleepMs);
    expandVisibleXConversation();
    harvestVisibleXAuthorPosts(handle);
    harvestXEmbedTexts(handle);

    let prev = harvestedXTexts.size;
    let stable = 0;

    for (let i = 0; i < maxPasses; i++) {
      const step = Math.max(500, Math.floor(window.innerHeight * 0.8));
      scrollByPx(step);
      await sleep(sleepMs);
      expandVisibleXConversation();
      harvestVisibleXAuthorPosts(handle);
      harvestXEmbedTexts(handle);
      const next = harvestedXTexts.size;
      if (next <= prev) stable++;
      else stable = 0;
      prev = next;
      if (stable >= 6 && next >= 1) break;
    }

    window.scrollTo(0, y0);
    await sleep(80);
    refreshXUrlMaps();
  }

  /**
   * Live tweet body — and on status URLs, the full self-thread (numbered 1/N
   * or unnumbered multi-post threads like "Truth 1…Truth 18").
   */
  function xPostText() {
    if (!isXPost()) return "";
    refreshXUrlMaps();

    const path = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (path) {
      const parts = assembleXThread(path[1], path[2]);
      if (parts.length > 1) return rewriteXPostLinks(parts.join("\n\n"));
      if (parts.length === 1) return rewriteXPostLinks(parts[0]);
    }

    // Profile / home / timeline: first visible top-level tweet body.
    const firstArticle = topLevelXArticles()[0] || document.querySelector("article");
    if (firstArticle) {
      const text = rewriteXPostLinks(textFromXArticle(firstArticle));
      if (text) return text;
    }
    const first = document.querySelector('[data-testid="tweetText"]');
    return rewriteXPostLinks(serializeXRichText(first));
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
  let title = (
    youTubeVideoTitle() ||
    ogTitle ||
    twitterTitle ||
    document.title ||
    "Untitled"
  ).trim();
  // X og:title often embeds a media t.co that Brave/Krank cannot open.
  if (isXPost()) title = rewriteXPostLinks(title) || title;

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
  const rawExcerpt =
    (isXPost() && selection ? rewriteXPostLinks(selection) : selection) ||
    youTubeDescription() ||
    xPostText() ||
    quoraAnswerText() ||
    jsonLdArticleBody() ||
    articleExcerpt ||
    metaDescription;
  const excerpt = normalizeExcerpt(rawExcerpt).slice(0, EXCERPT_MAX);

  return {
    title,
    url,
    excerpt,
    selection,
    siteName,
  };
}
