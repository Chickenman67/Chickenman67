#!/usr/bin/env node
/**
 * Rewrites the "Recently Worked On" table in README.md.
 *
 * Why this exists: GitHub's markdown renderer has no include/transclusion
 * support, so a generated list cannot live in a separate file. The only
 * reliable approach is to rewrite the block between the AUTO markers on
 * every run. Text outside the markers is never touched.
 *
 * Input : /tmp/repos.json  (GitHub API, already sorted by `pushed_at` desc)
 * Output: README.md with the marker block replaced
 * Env   : OWNER      — the GitHub login
 *         FEATURED   — comma-separated repos to exclude (hand-written cards)
 */

import { readFileSync, writeFileSync } from "node:fs";

const START = "<!-- AUTO:RECENT:START -->";
const END = "<!-- AUTO:RECENT:END -->";
const LIMIT = 3;

const owner = process.env.OWNER;
if (!owner) {
  console.error("OWNER environment variable is not set.");
  process.exit(1);
}

const featured = new Set(
  (process.env.FEATURED ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

const repos = JSON.parse(readFileSync("/tmp/repos.json", "utf8"));

/** Escape text before it lands inside an HTML table cell. */
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Escape pipes so a `|` in a description can't break the markdown table. */
const escapePipes = (value) => String(value ?? "").replaceAll("|", "\\|");

/** Truncate on a word boundary so cards stay a consistent height. */
const truncate = (value, max) => {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};

// The profile repo itself is never a "project".
const isProfileRepo = (repo) => repo.name === owner;

const candidates = repos
  .filter((repo) => !repo.fork && !repo.archived && !isProfileRepo(repo))
  .filter((repo) => !featured.has(repo.name))
  .slice(0, LIMIT);

function buildTable() {
  if (candidates.length === 0) {
    return `_No recently active projects found._`;
  }

  const header = [
    "| Project | Description | Language | Last commit |",
    "| :--- | :-- | :-- | --: |",
  ];

  const rows = candidates.map((repo) => {
    const description = repo.description?.trim();
    const descriptionCell = description
      ? escapePipes(truncate(description, 70))
      : "_No description yet._";

    return `| **[${escapeHtml(repo.name)}](${repo.html_url})** | ${descriptionCell} | ${escapeHtml(repo.language ?? "—")} | ${formatDate(repo.pushed_at)} |`;
  });

  return [...header, ...rows].join("\n");
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  // en-CA renders as YYYY-MM-DD, which is stable regardless of runner locale.
  return date.toLocaleDateString("en-CA");
}

const readme = readFileSync("README.md", "utf8");

if (!readme.includes(START) || !readme.includes(END)) {
  console.error(
    `README.md is missing the ${START} / ${END} markers. Nothing was changed.`,
  );
  process.exit(1);
}

const block = `${START}\n\n${buildTable()}\n\n${END}`;

// Replace only the text between the markers, leaving the rest intact.
const updated = readme.replace(
  new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`),
  block,
);

if (updated === readme) {
  console.log("Recently active projects are already up to date.");
} else {
  writeFileSync("README.md", updated);
  console.log(
    `Updated recently active projects: ${candidates.map((r) => r.name).join(", ")}`,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}