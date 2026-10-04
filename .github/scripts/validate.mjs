#!/usr/bin/env node
/**
 * Fails the run when the generated output would be visibly broken.
 *
 * Why this exists: the README is produced by a chain of scripts
 * (build-assets.mjs renders images, recent-projects.mjs rewrites the README
 * block), and GitHub renders the result with no feedback channel. When a
 * field is renamed on one side of that chain the failure mode is silent --
 * an empty href, a missing image or a stale reference all look "fine" to
 * the workflow and only break once the page is published. A bug like
 * `repo.html_url` (a REST name used against a GraphQL response) shipped
 * that way, with all six project links rendered as href="".
 *
 * So every run re-checks the actual artefacts on disk:
 *   1. every asset the README references exists, in BOTH colour schemes
 *   2. every project link is a real, well-formed repository URL
 *   3. each card's alt text matches the repo it links to
 *   4. every SVG is a single well-formed element with non-zero dimensions
 *   5. no placeholder text ("undefined", "NaN", "[object Object]") leaked
 *      into a rendered file, and no unescaped markup from a description
 *
 * Exits non-zero when anything fails, so the workflow fails loudly and the
 * broken commit is never pushed.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";

/** Collected rather than thrown on the first, so one run reports them all. */
const failures = [];
const fail = (message) => failures.push(message);

const readme = readFileSync("README.md", "utf8");
const assets = existsSync("assets")
  ? readdirSync("assets").filter((file) => file.endsWith(".svg"))
  : [];

/* ------------------------------------------------------------------ */
/* 1. Referenced assets exist, in both colour schemes                 */
/* ------------------------------------------------------------------ */

// Dark variants are picked with <source media="(prefers-color-scheme: dark)">,
// light variants with the <img src> fallback. Both must resolve, or one
// theme renders a broken-image placeholder.
const darkRefs = [
  ...readme.matchAll(/srcset="\.?\/?(assets\/[^"]+)"/g),
].map((match) => match[1]);
const lightRefs = [
  ...readme.matchAll(/<img src="\.?\/?(assets\/[^"]+)"/g),
].map((match) => match[1]);

for (const ref of [...darkRefs, ...lightRefs]) {
  if (!existsSync(ref)) fail(`README references a missing asset: ${ref}`);
}

// The hero picks its variant by width, every other card by colour scheme.
// Either way a <picture> with only one source leaves some viewport broken.
const pictures = [...readme.matchAll(/<picture>[\s\S]*?<\/picture>/g)];
pictures.forEach((match, index) => {
  const block = match[0];
  const hasFallback = /<img src="\.?\/?assets\/[^"]+"/.test(block);
  if (!hasFallback) fail(`<picture> block ${index + 1} has no <img> fallback`);
  if (!/srcset="\.?\/?assets\/[^"]+"/.test(block)) {
    fail(`<picture> block ${index + 1} has no <source> override`);
  }
});

// A card rendered for a project the README never references means the two
// halves of the pipeline drifted apart.
const referenced = new Set(
  [...darkRefs, ...lightRefs].map((ref) => ref.split("/").pop()),
);
for (const file of assets) {
  if (file.startsWith("project-") && !referenced.has(file)) {
    fail(`Generated card is never referenced by the README: ${file}`);
  }
}

/* ------------------------------------------------------------------ */
/* 2 + 3. Project links are real and match their card                 */
/* ------------------------------------------------------------------ */

const cells = [
  ...readme.matchAll(/<a href="([^"]*)">\s*<picture>[\s\S]*?alt="([^"]*)"/g),
];

if (cells.length === 0) fail("No project cards found in README.md");

for (const [, href, alt] of cells) {
  // The exact failure this check exists for: an unresolved field yielding "".
  if (!href.trim()) {
    fail(`Project card "${alt}" has an empty href`);
    continue;
  }
  if (!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+$/.test(href)) {
    fail(`Project card "${alt}" has a malformed href: ${href}`);
  }
  // alt is the bare repo name, so it must equal the link's last path segment.
  const slug = href.split("/").pop();
  if (slug !== alt) {
    fail(`Project card alt "${alt}" does not match link target "${slug}"`);
  }
}
/* ------------------------------------------------------------------ */
/* 4 + 5. SVGs are well-formed and free of placeholder text           */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = /undefined|NaN|\[object Object\]/;

for (const file of assets) {
  const path = `assets/${file}`;
  const contents = readFileSync(path, "utf8");

  const opens = (contents.match(/<svg[\s>]/g) ?? []).length;
  const closes = (contents.match(/<\/svg>/g) ?? []).length;
  if (opens !== 1 || closes !== 1) {
    fail(`${path} is not a single well-formed <svg> element`);
  }
  if (!/^<svg[^>]*\sxmlns=/.test(contents.trim())) {
    fail(`${path} has no xmlns declaration`);
  }

  const width = contents.match(/\bwidth="(\d+)"/);
  const height = contents.match(/\bheight="(\d+)"/);
  if (!width || !height || width[1] === "0" || height[1] === "0") {
    fail(`${path} has a zero or missing width/height`);
  }

  // An unescaped "&" or a stray "<" is the signature of text that came from
  // a repo description without escaping.
  const body = contents.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, "");
  if (body.includes("&")) fail(`${path} contains an unescaped "&"`);
  if (/<(?!\/?[a-zA-Z!])/.test(body)) fail(`${path} contains a stray "<"`);

  const placeholder = contents.match(PLACEHOLDER);
  if (placeholder) {
    fail(`${path} contains placeholder text "${placeholder[0]}"`);
  }
}

/* ------------------------------------------------------------------ */

if (failures.length > 0) {
  console.error(`\nValidation failed — ${failures.length} problem(s):\n`);
  for (const message of failures) console.error(`  x ${message}`);
  console.error("\nNothing was committed. Fix the generator and re-run.\n");
  process.exit(1);
}

console.log(
  `Validation passed: ${darkRefs.length} dark + ${lightRefs.length} light refs, ` +
    `${cells.length} project links, ${assets.length} SVGs all valid.`,
);