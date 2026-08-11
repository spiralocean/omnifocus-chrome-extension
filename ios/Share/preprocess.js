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

  function textFromXArticle(article) {
    var longForm =
      article.querySelector('[data-testid="twitterArticleRichTextView"]') ||
      article.querySelector('[data-testid="article-detail"]') ||
      article.querySelector('div[data-testid="card.layoutLarge.detail"]');
    var longText =
      (longForm && longForm.innerText && longForm.innerText.trim()) || "";
    if (longText.length > 80) return longText;

    var nodes = article.querySelectorAll('[data-testid="tweetText"]');
    var parts = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].closest("article") !== article) continue;
      var t = (nodes[i].innerText && nodes[i].innerText.trim()) || "";
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

  function collectXThreadFromDom(handle, statusId) {
    var handleLc = handle.toLowerCase();
    var articles = topLevelXArticles();
    var cards = [];
    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      var author = authorHandleFromXArticle(article);
      var authorStatus = article.querySelector(
        'a[href*="/' + handle + '/status/"], a[href*="/' + handleLc + '/status/"]'
      );
      var isAuthor =
        (author && author.toLowerCase() === handleLc) || Boolean(authorStatus);
      var sid = statusIdFromXArticle(article);
      var text = textFromXArticle(article);
      if (!text) continue;
      cards.push({
        statusId: sid,
        text: text,
        isAuthor: isAuthor,
        marker: parseThreadMarker(text),
      });
    }
    var numbered = [];
    for (var n = 0; n < cards.length; n++) {
      if (cards[n].isAuthor && cards[n].marker) {
        numbered.push({
          n: cards[n].marker.n,
          total: cards[n].marker.total,
          text: cards[n].text,
        });
      }
    }
    var assembled = assembleNumberedThread(numbered);
    if (assembled.length > 1) return assembled;
    if (!cards.length) return [];
    var rootIdx = -1;
    for (var s = 0; s < cards.length; s++) {
      if (cards[s].statusId === statusId) {
        rootIdx = s;
        break;
      }
    }
    if (rootIdx < 0) {
      for (var r = 0; r < cards.length; r++) {
        if (cards[r].isAuthor) {
          rootIdx = r;
          break;
        }
      }
    }
    if (rootIdx < 0) return [];
    var start = rootIdx;
    while (start > 0 && cards[start - 1].isAuthor) start--;
    var end = rootIdx;
    while (end < cards.length - 1 && cards[end + 1].isAuthor) end++;
    var slice = [];
    for (var c = start; c <= end; c++) {
      if (cards[c].isAuthor) slice.push(cards[c].text);
    }
    return slice;
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

  function threadScore(parts) {
    if (!parts || !parts.length) return 0;
    var chars = 0;
    for (var i = 0; i < parts.length; i++) chars += parts[i].length;
    return parts.length * 1000000 + chars;
  }

  function collectXThreadFromEmbed(handle, statusId) {
    var html =
      (document.documentElement && document.documentElement.innerHTML) || "";
    if (!html || html.length < 1000) return [];
    var numberedItems = [];
    var textById = {};

    function considerNumbered(text) {
      var trimmed = (text || "").trim();
      if (!trimmed) return;
      var m =
        trimmed.match(/\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s*$/) ||
        trimmed.match(
          /\((?:🧵\s*)?(\d+)\s*\/\s*(\d+)\)\s+https?:\/\/t\.co\/\w+\s*$/
        );
      if (!m) return;
      var n = Number(m[1]);
      var total = Number(m[2]);
      if (!isFinite(n) || !isFinite(total) || total < 2) return;
      numberedItems.push({ n: n, total: total, text: trimmed });
    }

    var restRe = /rest_id:"(\d+)"/g;
    var m;
    while ((m = restRe.exec(html))) {
      var sid = m[1];
      var chunk = html.slice(m.index, m.index + 8000);
      var ft = chunk.match(/full_text:"((?:[^"\\]|\\.)*)"/);
      if (!ft) continue;
      var text = decodeXFullText(ft[1]).trim();
      if (!text) continue;
      considerNumbered(text);
      if (!textById[sid] || text.length > textById[sid].length) {
        textById[sid] = text;
      }
    }

    var fullTextRe = /full_text:"((?:[^"\\]|\\.)*)"/g;
    while ((m = fullTextRe.exec(html))) considerNumbered(decodeXFullText(m[1]));
    var longRe =
      /"((?:[^"\\]|\\.){40,}?\((?:🧵\s*)?\d+\s*\/\s*\d+\)(?:\s+https?:\\\/\\\/t\.co\\\/\w+)?)"/g;
    while ((m = longRe.exec(html))) considerNumbered(decodeXFullText(m[1]));

    var numbered = assembleNumberedThread(numberedItems);
    if (numbered.length > 1) return numbered;

    var rootMs = snowflakeMs(statusId);
    var WINDOW_MS = 2 * 60 * 60 * 1000;
    var MAX_GAP_MS = 15 * 60 * 1000;
    var candidateIds = {};
    if (statusId) candidateIds[statusId] = 1;
    var escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var pathRe = new RegExp("/" + escaped + "/status/(\\d+)", "gi");
    while ((m = pathRe.exec(html))) candidateIds[m[1]] = 1;
    var tweetRe = /tweet-(\d{15,})/g;
    while ((m = tweetRe.exec(html))) {
      if (textById[m[1]]) candidateIds[m[1]] = 1;
    }
    for (var tid in textById) {
      if (!Object.prototype.hasOwnProperty.call(textById, tid)) continue;
      if (!rootMs || Math.abs(snowflakeMs(tid) - rootMs) <= WINDOW_MS) {
        candidateIds[tid] = 1;
      }
    }
    var cluster = Object.keys(candidateIds).sort(function (a, b) {
      var d = snowflakeMs(a) - snowflakeMs(b);
      if (d !== 0) return d;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    if (!cluster.length) {
      return textById[statusId] ? [textById[statusId]] : [];
    }
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
    cluster = cluster.slice(start, end + 1);

    var parts = [];
    for (var p = 0; p < cluster.length; p++) {
      if (textById[cluster[p]]) parts.push(textById[cluster[p]]);
    }
    return parts;
  }

  function xPostText() {
    if (!isXPost()) return "";

    var path = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (path) {
      var handle = path[1];
      var statusId = path[2];
      var fromDom = collectXThreadFromDom(handle, statusId);
      var fromEmbed = collectXThreadFromEmbed(handle, statusId);
      var parts =
        threadScore(fromEmbed) > threadScore(fromDom)
          ? fromEmbed
          : fromDom.length > 0
            ? fromDom
            : fromEmbed;
      if (parts.length > 1) return parts.join("\n\n");
      if (parts.length === 1) return parts[0];
    }

    var firsts = topLevelXArticles();
    var firstArticle = firsts[0] || document.querySelector("article");
    if (firstArticle) {
      var text = textFromXArticle(firstArticle);
      if (text) return text;
    }
    var first = document.querySelector('[data-testid="tweetText"]');
    return (first && first.innerText && first.innerText.trim()) || "";
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

  var excerpt = normalizeExcerpt(
    selection ||
      xPostText() ||
      quoraAnswerText() ||
      jsonLdArticleBody() ||
      articleExcerpt ||
      metaDescription
  ).slice(0, EXCERPT_MAX);

  return {
    title: title,
    url: url,
    excerpt: excerpt,
    selection: selection,
    siteName: siteName,
  };
}
