/**
 * Injected into the active tab via chrome.scripting.executeScript({ func }).
 * Must be fully self-contained — no imports or outer scope references.
 */
export function extractPageData() {
  const EXCERPT_MAX = 1200;

  const selection = window.getSelection()?.toString().trim() ?? "";

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

  function isYouTubeWatch() {
    const host = location.hostname.replace(/^www\./, "");
    return (
      (host === "youtube.com" || host === "m.youtube.com") &&
      location.pathname === "/watch"
    );
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
  const siteName = (ogSite || location.hostname.replace(/^www\./, "")).trim();

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
        ? paragraphs.slice(0, 3).join("\n\n")
        : articleEl.innerText.trim().slice(0, EXCERPT_MAX);
  }

  // Prefer the real video description over YouTube's generic meta blurb.
  const excerpt = (
    selection ||
    youTubeDescription() ||
    metaDescription ||
    articleExcerpt
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT_MAX);

  return {
    title,
    url,
    excerpt,
    selection,
    siteName,
  };
}