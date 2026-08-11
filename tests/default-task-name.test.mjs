/**
 * Run with: node --test
 *
 * defaultTaskName strips a page title's trailing site name ("Article - The
 * Verge") but must not touch a dash that is part of the content. The cases
 * below are the intent, not just the current behaviour — the YouTube ones are
 * the regression this function was rewritten to fix.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  composeNote,
  defaultTaskName,
  formatClipNote,
  NOTE_MAX_LENGTH,
} from "../src/omnifocus.js";

test("keeps a dash that is content, not a site suffix", () => {
  // extract-page.js already strips " - YouTube", so anything left is the
  // video's own title. Trimming again ate the artist.
  assert.equal(
    defaultTaskName("Song Title - Artist Name", "YouTube"),
    "Song Title - Artist Name"
  );
  assert.equal(
    defaultTaskName("Never Gonna Give You Up - Rick Astley", "youtube.com"),
    "Never Gonna Give You Up - Rick Astley"
  );
  assert.equal(
    defaultTaskName("How to Cook Rice - A Beginner's Guide", "YouTube"),
    "How to Cook Rice - A Beginner's Guide"
  );
});

test("strips the site name when the trailing segment matches the site", () => {
  assert.equal(defaultTaskName("Some Article - The Verge", "The Verge"), "Some Article");
  assert.equal(defaultTaskName("Some Article - The Verge", "theverge.com"), "Some Article");
  assert.equal(defaultTaskName("My Post — Medium", "medium.com"), "My Post");
  assert.equal(defaultTaskName("Recipe – Serious Eats", "seriouseats.com"), "Recipe");
  assert.equal(defaultTaskName("Breaking News | BBC", "bbc.co.uk"), "Breaking News");
  assert.equal(defaultTaskName("Foo - NPR", "npr.org"), "Foo");
});

test("matches a hostname label, so subdomains and public suffixes are fine", () => {
  assert.equal(
    defaultTaskName("Getting Things Done - Wikipedia", "en.wikipedia.org"),
    "Getting Things Done"
  );
  assert.equal(
    defaultTaskName("Getting Things Done - Wikipedia", "Wikipedia"),
    "Getting Things Done"
  );
});

test("keeps the title when the suffix is unrelated to the site", () => {
  assert.equal(
    defaultTaskName("Interview with Foo - Bar", "example.com"),
    "Interview with Foo - Bar"
  );
  assert.equal(defaultTaskName("A - B - C", "example.com"), "A - B - C");
  assert.equal(defaultTaskName("A - B - Example", "example.com"), "A - B");
});

test("never strips without a site name to compare against", () => {
  assert.equal(defaultTaskName("Article - The Verge", ""), "Article - The Verge");
  assert.equal(defaultTaskName("Article - The Verge"), "Article - The Verge");
});

test("degenerate titles", () => {
  assert.equal(defaultTaskName("", "example.com"), "Untitled");
  assert.equal(defaultTaskName("Plain Title", "example.com"), "Plain Title");
  assert.equal(defaultTaskName("- Weird", "example.com"), "- Weird");
});

test("truncates past the OmniFocus URL length budget", () => {
  const name = defaultTaskName("x".repeat(600), "example.com");
  assert.equal(name.length, 500);
  assert.ok(name.endsWith("…"));
});

test("composeNote keeps the URL and only trims a long body", () => {
  const url = "https://x.com/user/status/1234567890123456789";
  const body = "A".repeat(NOTE_MAX_LENGTH);
  const note = composeNote(url, body, NOTE_MAX_LENGTH);
  assert.ok(note.startsWith(url + "\n\n"));
  assert.ok(note.length <= NOTE_MAX_LENGTH);
  assert.ok(note.endsWith("…"));
  // Old whole-string truncate at 1200 would leave almost no body room after URL.
  assert.ok(note.length > 1200, "budget must fit long X posts past the old 1200 cap");
});

test("formatClipNote fits a long X-style post under the raised budget", () => {
  const url = "https://x.com/foo/status/99";
  // Premium long post-ish length (~4k) should fit entirely with URL.
  const excerpt = "Line one.\n\n" + "word ".repeat(800);
  const note = formatClipNote({ url, excerpt });
  assert.ok(note.includes("Line one."));
  assert.ok(note.startsWith(url));
  assert.ok(note.length <= NOTE_MAX_LENGTH);
  // Should not need ellipsis for ~4k body + URL under 8000.
  assert.ok(!note.endsWith("…"));
});
