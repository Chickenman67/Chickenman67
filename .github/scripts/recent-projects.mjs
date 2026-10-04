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

const START = "<!-- AUTO:PROJECTS:START -->";
const END = "<!-- AUTO:PROJECTS:END -->";

/**
 * The ordered project list is produced by build-assets.mjs, which also
 * renders the card images. Consuming that same file guarantees the links
 * and the pictures can never drift apart.
 */
const projects = JSON.parse(readFileSync(".projects.json", "utf8"));

/** Escape text before it lands inside an HTML attribute. */
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * Builds the project grid. Card images live in fixed numbered slots, so
 * this block only has to keep the links in step with that ordering.
 */
function buildGrid() {
  if (projects.length === 0) {
    return `_No recent projects found._`;
  }

  const cells = projects.map(
    (repo, index) => `  <td valign="top" width="50%">
    <a href="${escapeHtml(repo.url)}">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="./assets/project-dark-${index + 1}.svg">
        <img src="./assets/project-light-${index + 1}.svg" alt="${escapeHtml(repo.name)}" width="340" />
      </picture>
    </a>
  </td>`,
  );

  // Pad to an even number so the table never ends with a half row.
  while (cells.length % 2 !== 0) cells.push("  <td></td>");

  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(`<tr>\n${cells[i]}\n${cells[i + 1]}\n</tr>`);
  }

  return `<table>
${rows.join("\n")}
</table>`;
}

const readme = readFileSync("README.md", "utf8");

if (!readme.includes(START) || !readme.includes(END)) {
  console.error(
    `README.md is missing the ${START} / ${END} markers. Nothing was changed.`,
  );
  process.exit(1);
}

const block = `${START}\n\n${buildGrid()}\n\n${END}`;

// Replace only the text between the markers, leaving the rest intact.
const updated = readme.replace(
  new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`),
  block,
);

if (updated === readme) {
  console.log("Project grid is already up to date.");
} else {
  writeFileSync("README.md", updated);
  console.log(`Updated project grid: ${projects.map((p) => p.name).join(", ")}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}