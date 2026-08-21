/*
 * Safari runs this against the page when the Share extension is invoked from a
 * web page (NSExtensionJavaScriptPreprocessingFile). The object passed to
 * completionFunction is delivered to ShareViewController as a property list.
 *
 * The extraction logic mirrors src/extract-page.js so web clips on iOS capture
 * the same data as the Chrome extension.
 */
var ExtensionPreprocessingJS = {
  run: function (args) {
    args.completionFunction(extractPageData());
  },
};

function extractPageData() {
  // Match src/omnifocus.js NOTE_MAX_LENGTH so long X posts aren't pre-cut here.
  var EXCERPT_MAX = 8000;

  var selection =
    (window.getSelection && window.getSelection().toString().trim()) || "";

  function normalizeExcerpt(text) {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .split("\n")
      .map(function (line) {
        return line.trimEnd ? line.trimEnd() : line.replace(/\s+$/, "");
      })
      .join("\n")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function joinUpToLimit(blocks) {
    var out = "";
    for (var i = 0; i < blocks.length; i++) {
      var piece = (blocks[i] || "").trim();
      if (!piece) continue;
      var next = out ? out + "\n\n" + piece : piece;
      if (next.length > EXCERPT_MAX) {
        if (!out) return piece.slice(0, EXCERPT_MAX);
        break;
      }
      out = next;
    }
    return out;
  }

  function withYouTubeTimestamp(rawUrl) {
    try {
      var u = new URL(rawUrl);
      var host = u.hostname.replace(/^www\./, "");
      var isWatch =
        (host === "youtube.com" || host === "m.youtube.com") &&
        u.pathname === "/watch";
      if (!isWatch) return rawUrl;
      var video = document.querySelector("video");
      var seconds = Math.floor((video && video.currentTime) || 0);
      if (seconds < 5) return rawUrl;
      u.searchParams.set("t", seconds + "s");
      return u.toString();
    } catch (e) {
      return rawUrl;
    }
  }

  var url = withYouTubeTimestamp(location.href);

  function meta(sel) {
    var el = document.querySelector(sel);
    return el && el.content ? el.content : "";
  }

  function hostname() {
    return location.hostname.replace(/^www\./, "");
  }

  function isXPost() {
    var host = hostname();
    return (
      host === "x.com" ||
      host === "twitter.com" ||
      host === "mobile.twitter.com" ||
      host === "mobile.x.com"
    );
  }

  function isQuoraHost() {
    var host = hostname();
    return host === "quora.com" || /\.quora\.com$/.test(host);
  }

  var xUrlMaps = { expand: {}, display: {} };

  function isXMediaUrl(raw) {
    try {
      var parsed = new URL(raw);
      var host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      if (
        host === "t.co" ||
        host === "pic.twitter.com" ||
        host === "pic.x.com" ||
        host === "pbs.twimg.com" ||
        host === "video.twimg.com" ||
        /\.twimg\.com$/.test(host)
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
    } catch (e) {
      return false;
    }
  }

  function decodeXUrl(raw) {
    try {
      return JSON.parse('"' + raw + '"');
    } catch (e) {
      return String(raw || "").replace(/\\\//g, "/");
    }
  }

  function collectXUrlMaps(html) {
    var expand = {};
    var display = {};
    if (!html) return { expand: expand, display: display };
    var expRe = /expanded_url"?:?"([^"]*)"/g;
    var m;
    while ((m = expRe.exec(html))) {
      var expanded = decodeXUrl(m[1]);
      if (!/^https?:\/\//i.test(expanded) || isXMediaUrl(expanded)) continue;
      var start = Math.max(0, m.index - 600);
      var chunk = html.slice(start, m.index + m[0].length + 600);
      var tcoRe = /https:\/\/t\.co\/[A-Za-z0-9]+/g;
      var tcoMatches = [];
      var tm;
      while ((tm = tcoRe.exec(chunk))) tcoMatches.push(tm);
      if (tcoMatches.length > 0) {
        var expPos = m.index - start;
        var best = tcoMatches[0];
        var bestDist = Math.abs(best.index - expPos);
        for (var i = 1; i < tcoMatches.length; i++) {
          var d = Math.abs(tcoMatches[i].index - expPos);
          if (d < bestDist) {
            best = tcoMatches[i];
            bestDist = d;
          }
        }
        var short = best[0];
        if (!expand[short] || expanded.length > expand[short].length) {
          expand[short] = expanded;
        }
      }
      var disp = chunk.match(/display_url"?:?"([^"]*)"/);
      if (disp) {
        var shown = decodeXUrl(disp[1]).replace(/…$/, "").replace(/\.{3}$/, "");
        if (shown.length >= 6 && !isXMediaUrl("https://" + shown)) {
          display[shown] = expanded;
        }
      }
    }
    return { expand: expand, display: display };
  }

  function refreshXUrlMaps() {
    xUrlMaps = collectXUrlMaps(
      (document.documentElement && document.documentElement.innerHTML) || ""
    );
  }

  function rewriteXPostLinks(text) {
    if (!text) return text;
    var out = String(text);
    var shown;
    for (shown in xUrlMaps.display) {
      if (!Object.prototype.hasOwnProperty.call(xUrlMaps.display, shown)) continue;
      var escaped = shown.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(
        new RegExp("(?:https?:\\/\\/)?" + escaped + "(?:…|\\.{3})?", "g"),
        xUrlMaps.display[shown]
      );
    }
    for (shown in xUrlMaps.expand) {
      if (!Object.prototype.hasOwnProperty.call(xUrlMaps.expand, shown)) continue;
      out = out.split(shown).join(xUrlMaps.expand[shown]);
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

  function isXChromeLink(href) {
    try {
      var path = new URL(href, location.href).pathname;
      if (/^\/[A-Za-z0-9_]+\/?$/.test(path)) return true;
      if (path.indexOf("/hashtag/") === 0) return true;
      if (path.indexOf("/search") === 0) return true;
      if (path.indexOf("cashtag") !== -1) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function resolvedXLinkText(a) {
    var href = a.getAttribute("href") || "";
    var visible = ((a.innerText || a.textContent || "") + "").trim();
    if (!href) return visible;
    if (isXChromeLink(href)) return visible;
    var dataExp = a.getAttribute("data-expanded-url") || "";
    var titleAttr = a.getAttribute("title") || "";
    var abs = href;
    try {
      abs = new URL(href, location.href).href;
    } catch (e) {}
    var cands = [dataExp, titleAttr, abs];
    for (var i = 0; i < cands.length; i++) {
      if (/^https?:\/\//i.test(cands[i])) return cands[i];
    }
    return visible;
  }

  function serializeXRichText(el) {
    if (!el) return "";
    var links = el.querySelectorAll("a[href]");
    if (!links.length) return ((el.innerText || "") + "").trim();
    var clone = el.cloneNode(true);
    var clonedLinks = clone.querySelectorAll("a[href]");
    for (var i = 0; i < clonedLinks.length; i++) {
      var label = resolvedXLinkText(clonedLinks[i]);
      var node = document.createTextNode(label);
      clonedLinks[i].parentNode.replaceChild(node, clonedLinks[i]);
    }
    return ((clone.innerText || "") + "").trim();
  }

  function textFromXArticle(article) {
    var longForm =
      article.querySelector('[data-testid="twitterArticleRichTextView"]') ||
      article.querySelector('[data-testid="article-detail"]') ||
      article.querySelector('div[data-testid="card.layoutLarge.detail"]');
    var longText = serializeXRichText(longForm);
    if (longText.length > 80) return longText;

    var nodes = article.querySelectorAll('[data-testid="tweetText"]');
    var parts = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].closest("article") !== article) continue;
      var t = serializeXRichText(nodes[i]);
      if (t) parts.push(t);
    }
    return parts.join("\n\n");
  }

  function topLevelXArticles() {
    var all = document.querySelectorAll("article");
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (!all[i].parentElement || !all[i].parentElement.closest("article")) {
        out.push(all[i]);
      }
    }
    return out;
  }

  function authorHandleFromXArticle(article) {
    var userLink =
      article.querySelector('[data-testid="User-Name"] a[href^="/"]') ||
      (article.querySelector('a[href^="/"][role="link"] time') &&
        article.querySelector('a[href^="/"][role="link"] time').closest("a"));
    var href =
      (userLink && userLink.getAttribute("href")) ||
      (article.querySelector('a[href*="/status/"]') &&
        article.querySelector('a[href*="/status/"]').getAttribute("href")) ||
      "";
    var m = href.match(/^\/([A-Za-z0-9_]+)(?:\/|$|\?)/);
    if (!m) return "";
    var handle = m[1];
    var reserved = {
      home: 1,
      explore: 1,
      search: 1,
      i: 1,
      settings: 1,
      compose: 1,
      messages: 1,
      notifications: 1,
      intent: 1,
      hashtag: 1,
    };
    return reserved[handle.toLowerCase()] ? "" : handle;
  }

  function statusIdFromXArticle(article) {
    var links = article.querySelectorAll('a[href*="/status/"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].closest("article") !== article) continue;
      var m = (links[i].getAttribute("href") || "").match(/\/status\/(\d+)/);
      if (m) return m[1];
    }
    return "";
  }

  function parseThreadMarker(text) {
    var m = (text || "").match(/\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s*$/);
    if (!m) return null;
    var n = Number(m[1]);
    var total = Number(m[2]);
    if (!isFinite(n) || !isFinite(total) || total < 2 || n < 1) return null;
    return { n: n, total: total };
  }

  function assembleNumberedThread(items) {
    if (!items.length) return [];
    var totalCounts = {};
    for (var i = 0; i < items.length; i++) {
      var t = items[i].total;
      totalCounts[t] = (totalCounts[t] || 0) + 1;
    }
    var bestTotal = items[0].total;
    var bestCount = 0;
    for (var key in totalCounts) {
      if (!Object.prototype.hasOwnProperty.call(totalCounts, key)) continue;
      var total = Number(key);
      var count = totalCounts[key];
      if (count > bestCount || (count === bestCount && total > bestTotal)) {
        bestTotal = total;
        bestCount = count;
      }
    }
    var byN = {};
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      if (it.total !== bestTotal) continue;
      if (!byN[it.n] || it.text.length > byN[it.n].length) byN[it.n] = it.text;
    }
    var ns = Object.keys(byN)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    var out = [];
    for (var k = 0; k < ns.length; k++) out.push(byN[ns[k]]);
    return out;
  }

  function snowflakeMs(idStr) {
    try {
      return Number(BigInt(idStr) >> 22n) + 1288834974657;
    } catch (e) {
      return 0;
    }
  }

  function decodeXFullText(raw) {
    try {
      return JSON.parse('"' + raw + '"');
    } catch (e) {
      return raw.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  }

  function rememberXText(map, id, text) {
    if (!id || !text) return;
    if (!map[id] || text.length > map[id].length) map[id] = text;
  }

  function isAuthorXArticle(article, handle) {
    var handleLc = handle.toLowerCase();
    var author = authorHandleFromXArticle(article);
    if (author && author.toLowerCase() === handleLc) return true;
    return Boolean(
      article.querySelector(
        'a[href*="/' + handle + '/status/"], a[href*="/' + handleLc + '/status/"]'
      )
    );
  }

  function assembleXThread(handle, statusId) {
    var harvested = {};
    var numberedItems = [];
    var articles = topLevelXArticles();
    for (var i = 0; i < articles.length; i++) {
      if (!isAuthorXArticle(articles[i], handle)) continue;
      var sid = statusIdFromXArticle(articles[i]);
      var body = textFromXArticle(articles[i]);
      if (sid && body) rememberXText(harvested, sid, body);
      var marker = parseThreadMarker(body);
      if (marker && body) {
        numberedItems.push({ n: marker.n, total: marker.total, text: body });
      }
    }

    var html =
      (document.documentElement && document.documentElement.innerHTML) || "";
    var rawById = {};
    if (html && html.length >= 1000) {
      function considerNumbered(text) {
        var trimmed = (text || "").trim();
        if (!trimmed) return;
        var mm =
          trimmed.match(/\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s*$/) ||
          trimmed.match(
            /\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s+https?:\/\/t\.co\/\w+\s*$/
          );
        if (!mm) return;
        var nn = Number(mm[1]);
        var tot = Number(mm[2]);
        if (!isFinite(nn) || !isFinite(tot) || tot < 2) return;
        numberedItems.push({ n: nn, total: tot, text: trimmed });
      }

      var restRe = /rest_id:"(\d+)"/g;
      var m;
      while ((m = restRe.exec(html))) {
        var chunk = html.slice(m.index, m.index + 8000);
        var ft = chunk.match(/full_text:"((?:[^"\\]|\\.)*)"/);
        if (!ft) continue;
        var text = decodeXFullText(ft[1]).trim();
        if (!text) continue;
        considerNumbered(text);
        if (!rawById[m[1]] || text.length > rawById[m[1]].length) {
          rawById[m[1]] = text;
        }
      }
      var fullTextRe = /full_text:"((?:[^"\\]|\\.)*)"/g;
      while ((m = fullTextRe.exec(html))) considerNumbered(decodeXFullText(m[1]));
      var longRe =
        /"((?:[^"\\]|\\.){40,}?\((?:🧵\s*)?\d+\s*\/\s*\d+\)(?:\s+https?:\\\/\\\/t\.co\\\/\w+)?)"/g;
      while ((m = longRe.exec(html))) considerNumbered(decodeXFullText(m[1]));

      var escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var pathRe = new RegExp("/" + escaped + "/status/(\\d+)", "gi");
      while ((m = pathRe.exec(html))) {
        if (rawById[m[1]]) rememberXText(harvested, m[1], rawById[m[1]]);
      }
      for (var hid in harvested) {
        if (rawById[hid]) rememberXText(harvested, hid, rawById[hid]);
      }
    }

    refreshXUrlMaps();
    var numbered = assembleNumberedThread(numberedItems);
    if (numbered.length > 1) {
      var cleanedNumbered = [];
      for (var ni = 0; ni < numbered.length; ni++) {
        var nt = rewriteXPostLinks(numbered[ni]);
        if (nt) cleanedNumbered.push(nt);
      }
      return cleanedNumbered;
    }

    var rootMs = snowflakeMs(statusId);
    var WINDOW_MS = 2 * 60 * 60 * 1000;
    var MAX_GAP_MS = 15 * 60 * 1000;
    var cluster = Object.keys(harvested);
    if (statusId && !harvested[statusId]) cluster.push(statusId);
    cluster.sort(function (a, b) {
      var d = snowflakeMs(a) - snowflakeMs(b);
      if (d !== 0) return d;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    if (rootMs) {
      var inWindow = [];
      for (var w = 0; w < cluster.length; w++) {
        if (Math.abs(snowflakeMs(cluster[w]) - rootMs) <= WINDOW_MS) {
          inWindow.push(cluster[w]);
        }
      }
      if (inWindow.length) cluster = inWindow;
    }
    var rootIdx = cluster.indexOf(statusId);
    if (rootIdx < 0) rootIdx = 0;
    var start = rootIdx;
    while (start > 0) {
      var gap = snowflakeMs(cluster[start]) - snowflakeMs(cluster[start - 1]);
      if (gap < 0 || gap > MAX_GAP_MS) break;
      start--;
    }
    var end = rootIdx;
    while (end < cluster.length - 1) {
      var gap2 = snowflakeMs(cluster[end + 1]) - snowflakeMs(cluster[end]);
      if (gap2 < 0 || gap2 > MAX_GAP_MS) break;
      end++;
    }
    var parts = [];
    for (var p = start; p <= end; p++) {
      if (harvested[cluster[p]]) {
        var pt = rewriteXPostLinks(harvested[cluster[p]]);
        if (pt) parts.push(pt);
      }
    }
    return parts;
  }

  function xPostText() {
    if (!isXPost()) return "";
    refreshXUrlMaps();

    var path = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (path) {
      var parts = assembleXThread(path[1], path[2]);
      if (parts.length > 1) return rewriteXPostLinks(parts.join("\n\n"));
      if (parts.length === 1) return rewriteXPostLinks(parts[0]);
    }

    var firsts = topLevelXArticles();
    var firstArticle = firsts[0] || document.querySelector("article");
    if (firstArticle) {
      var text = rewriteXPostLinks(textFromXArticle(firstArticle));
      if (text) return text;
    }
    var first = document.querySelector('[data-testid="tweetText"]');
    return rewriteXPostLinks(serializeXRichText(first));
  }

  function quoraAnswerText() {
    if (!isQuoraHost()) return "";

    var rootSelectors = [
      ".puppeteer_test_answer_content",
      ".spacing_log_answer_content",
      '[class*="AnswerBase"]',
      '[class*="answer_content"]',
      "#mainContent",
    ];

    for (var r = 0; r < rootSelectors.length; r++) {
      var sel = rootSelectors[r];
      var root = document.querySelector(sel);
      if (!root) continue;

      var qNodes = root.querySelectorAll(".q-text");
      var qTexts = [];
      for (var q = 0; q < qNodes.length; q++) {
        var t = (qNodes[q].innerText && qNodes[q].innerText.trim()) || "";
        if (t.length > 60) qTexts.push(t);
      }
      if (qTexts.length > 0) {
        var best = qTexts[0];
        for (var b = 1; b < qTexts.length; b++) {
          if (qTexts[b].length > best.length) best = qTexts[b];
        }
        if (best.length > 60) return best;
      }

      var raw = (root.innerText && root.innerText.trim()) || "";
      if (sel !== "#mainContent" && raw.length > 60) return raw;
    }

    var allNodes = document.querySelectorAll(".q-text");
    var all = [];
    for (var a = 0; a < allNodes.length; a++) {
      var at = (allNodes[a].innerText && allNodes[a].innerText.trim()) || "";
      if (at.length > 80) all.push(at);
    }
    if (all.length === 0) return "";
    var longest = all[0];
    for (var l = 1; l < all.length; l++) {
      if (all[l].length > longest.length) longest = all[l];
    }
    return longest;
  }

  function jsonLdArticleBody() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var s = 0; s < scripts.length; s++) {
      try {
        var data = JSON.parse(scripts[s].textContent || "null");
        var items = [];
        if (Array.isArray(data)) items = data;
        else if (data && Array.isArray(data["@graph"])) items = data["@graph"];
        else if (data) items = [data];

        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (!item || typeof item !== "object") continue;
          if (typeof item.articleBody === "string" && item.articleBody.trim()) {
            return item.articleBody.trim();
          }
          var main = item.mainEntity;
          if (main && typeof main === "object") {
            if (
              main.acceptedAnswer &&
              typeof main.acceptedAnswer.text === "string" &&
              main.acceptedAnswer.text.trim()
            ) {
              return main.acceptedAnswer.text.trim();
            }
            var suggested = main.suggestedAnswer;
            if (Array.isArray(suggested)) {
              for (var j = 0; j < suggested.length; j++) {
                if (
                  suggested[j] &&
                  typeof suggested[j].text === "string" &&
                  suggested[j].text.trim()
                ) {
                  return suggested[j].text.trim();
                }
              }
            } else if (
              suggested &&
              typeof suggested.text === "string" &&
              suggested.text.trim()
            ) {
              return suggested.text.trim();
            }
            if (typeof main.text === "string" && main.text.trim()) {
              return main.text.trim();
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }
    return "";
  }

  var title = (meta('meta[property="og:title"]') ||
    meta('meta[name="twitter:title"]') ||
    document.title ||
    "Untitled").trim();
  if (isXPost()) {
    refreshXUrlMaps();
    title = rewriteXPostLinks(title) || title;
  }

  var siteName = (meta('meta[property="og:site_name"]') || hostname()).trim();

  var metaDescription = (meta('meta[property="og:description"]') ||
    meta('meta[name="description"]') ||
    meta('meta[name="twitter:description"]')).trim();

  var selectors = [
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

  var articleEl = null;
  for (var j = 0; j < selectors.length; j++) {
    var el = document.querySelector(selectors[j]);
    if (el && (el.innerText || "").trim().length > 120) {
      articleEl = el;
      break;
    }
  }

  var articleExcerpt = "";
  if (articleEl) {
    var paragraphs = [].slice
      .call(articleEl.querySelectorAll("p"))
      .map(function (p) {
        return p.innerText.trim();
      })
      .filter(function (text) {
        return text.length > 40;
      });

    articleExcerpt =
      paragraphs.length > 0
        ? joinUpToLimit(paragraphs)
        : articleEl.innerText.trim().slice(0, EXCERPT_MAX);
  }

  var rawExcerpt =
    (isXPost() && selection ? rewriteXPostLinks(selection) : selection) ||
    xPostText() ||
    quoraAnswerText() ||
    jsonLdArticleBody() ||
    articleExcerpt ||
    metaDescription;
  var excerpt = normalizeExcerpt(rawExcerpt).slice(0, EXCERPT_MAX);

  return {
    title: title,
    url: url,
    excerpt: excerpt,
    selection: selection,
    siteName: siteName,
  };
}
