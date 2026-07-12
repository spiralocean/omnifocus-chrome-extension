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
  var EXCERPT_MAX = 1200;

  var selection = (window.getSelection && window.getSelection().toString().trim()) || "";

  // For a YouTube video, fold the current playback position into the link so the
  // clipped task resumes where you left off (watch-later flow).
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

  var title = (meta('meta[property="og:title"]') ||
    meta('meta[name="twitter:title"]') ||
    document.title ||
    "Untitled").trim();

  var siteName = (meta('meta[property="og:site_name"]') ||
    location.hostname.replace(/^www\./, "")).trim();

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
  for (var i = 0; i < selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
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
        ? paragraphs.slice(0, 3).join("\n\n")
        : articleEl.innerText.trim().slice(0, EXCERPT_MAX);
  }

  var excerpt = (selection || metaDescription || articleExcerpt)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT_MAX);

  return {
    title: title,
    url: url,
    excerpt: excerpt,
    selection: selection,
    siteName: siteName,
  };
}
