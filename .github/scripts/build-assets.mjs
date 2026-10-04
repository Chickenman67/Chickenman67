#!/usr/bin/env node
/**
 * Builds every SVG asset used by the profile README.
 *
 * Run inside GitHub Actions after `data.json` has been written by the
 * workflow's GraphQL step. Everything here is derived from that snapshot,
 * so a network hiccup never leaves a half-written card behind: the files
 * are only written once all of them have been generated successfully.
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import {
  statsCard,
  languagesCard,
  activityCard,
  projectCard,
  snakeSvg,
  heroSvg,
} from "./cards.mjs";

/**
 * `data.raw.json` is the untouched GraphQL response. Everything the cards
 * need is derived from it here, so the workflow stays a thin shell.
 */
const raw = JSON.parse(readFileSync("data.raw.json", "utf8")).data.user;

/** How many project cards to render. Matches the table in the README. */
const SLOTS = 6;

/** Forks and archived repos are not "real" projects. */
const repos = raw.repositories.nodes.filter(
  (repo) => !repo.isFork && !repo.isArchived,
);

/**
 * Language share is measured across the user's own repositories.
 * A repo with no detected language (empty or binary-only) still counts in
 * the denominator, which keeps the percentages honest.
 */
const byLanguage = new Map();
for (const repo of repos) {
  const language = repo.primaryLanguage;
  if (!language) continue;
  const entry = byLanguage.get(language.name) ?? {
    name: language.name,
    color: language.color,
    count: 0,
  };
  entry.count += 1;
  byLanguage.set(language.name, entry);
}

const languages = [...byLanguage.values()]
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  .slice(0, 5)
  .map((language) => ({
    name: language.name,
    color: language.color,
    percent: (language.count / repos.length) * 100,
  }));

const calendar = raw.contributionsCollection.contributionCalendar;

/** Walk the calendar backwards to measure the current streak. */
function measureStreaks(days) {
  let longest = 0;
  let run = 0;
  for (const day of days) {
    run = day.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  let current = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].contributionCount > 0) current += 1;
    else break;
  }
  return { current, longest };
}

const allDays = calendar.weeks.flatMap((week) => week.contributionDays);
const { current, longest } = measureStreaks(allDays);

/** The profile repository itself is not a project. */
const owner = process.env.OWNER ?? "";

/**
 * Repositories already given a hand-written spot elsewhere on the page.
 * Read from the same environment variable the README updater uses, so both
 * halves of the project grid always agree.
 */
const featured = new Set(
  (process.env.FEATURED ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

// `repositories` is already ordered by most recently pushed. Repos with a
// description are preferred over empty ones — a card reading "No
// description yet" six times in a row looks broken, not minimal — and
// recency breaks the tie within each group.
const ordered = [...repos].sort((a, b) => {
  const described = (repo) => (repo.description?.trim() ? 0 : 1);
  return described(a) - described(b);
});

const projects = ordered
  .filter((repo) => repo.name !== owner && !featured.has(repo.name))
  .slice(0, SLOTS)
  .map((repo) => ({
    name: repo.name,
    // GraphQL calls this field `url` (the REST API calls it `html_url`).
    // It is also derived here so a project can never end up with an empty
    // href just because the query changed shape.
    url: repo.url ?? `https://github.com/${owner}/${repo.name}`,
    description: repo.description,
    language: repo.primaryLanguage?.name ?? null,
    languageColor: repo.primaryLanguage?.color ?? null,
    stars: repo.stargazerCount,
  }));

const data = {
  totalContributions: calendar.totalContributions,
  totalRepos: raw.repositories.totalCount,
  totalStars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
  followers: raw.followers.totalCount,
  currentStreak: current,
  longestStreak: longest,
  languages,
  projects,
};

mkdirSync("assets", { recursive: true });

// Shared handoff file: recent-projects.mjs reads this so the links in the
// README always match the cards rendered here.
writeFileSync(".projects.json", JSON.stringify(projects, null, 2), "utf8");

/** Map a raw contribution count onto GitHub's five-step colour scale. */
function level(count) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

const written = [];
function write(name, contents) {
  writeFileSync(`assets/${name}`, contents, "utf8");
  written.push(name);
}

/* ---- hero banner -------------------------------------------------- */

write(
  "hero.svg",
  heroSvg({
    name: "Kevin Lu",
    tagline: "I build small tools that do one job properly.",
  }),
);

// A second banner for phones. The wide one has a fixed aspect ratio, so
// scaling it to a ~370px column shrinks the tagline to roughly 4px. This
// variant is taller with proportionally larger type and stays legible.
write(
  "hero-narrow.svg",
  heroSvg({
    name: "Kevin Lu",
    tagline: "I build small tools that do one job properly.",
    narrow: true,
  }),
);

/* ---- snake ------------------------------------------------------- */

// The snake visits every day that had at least one contribution, walking
// the calendar in reading order. The full grid is drawn underneath so the
// snake has something to visibly consume.
const snakePath = [];
const snakeAll = [];
calendar.weeks.forEach((week, col) => {
  week.contributionDays.forEach((day, row) => {
    const point = { col, row, level: level(day.contributionCount) };
    snakeAll.push(point);
    if (day.contributionCount > 0) snakePath.push(point);
  });
});

for (const mode of ["light", "dark"]) {
  write(
    `snake-${mode}.svg`,
    snakeSvg({
      mode,
      cells: {
        cols: calendar.weeks.length,
        grid: snakePath,
        all: snakeAll,
        counts: snakePath.length,
      },
      totalContributions: calendar.totalContributions,
    }),
  );
}

/* ---- stats + languages ------------------------------------------ */

const stats = {
  title: "GitHub Stats",
  totalContributions: data.totalContributions,
  totalRepos: data.totalRepos,
  totalStars: data.totalStars,
  followers: data.followers,
};

for (const mode of ["light", "dark"]) {
  write(`stats-${mode}.svg`, statsCard({ mode, stats }));
  write(`top-langs-${mode}.svg`, languagesCard({ mode, languages }));
}

/* ---- activity graph --------------------------------------------- */

const weeks = calendar.weeks.map((week) => ({
  days: week.contributionDays.map((day) => ({
    count: day.contributionCount,
    level: level(day.contributionCount),
  })),
}));

for (const mode of ["light", "dark"]) {
  write(
    `activity-${mode}.svg`,
    activityCard({
      mode,
      weeks,
      totalContributions: data.totalContributions,
      currentStreak: data.currentStreak,
      longestStreak: data.longestStreak,
    }),
  );
}

/* ---- project cards ---------------------------------------------- */

// Card files are written to fixed, numbered slots (project-light-1.svg)
// rather than per-repository names. That lets the README reference them
// once and stay correct as the repository list changes every day.
for (const mode of ["light", "dark"]) {
  projects.forEach((repo, index) => {
    write(
      `project-${mode}-${index + 1}.svg`,
      projectCard({
        mode,
        name: repo.name,
        description: repo.description,
        language: repo.language,
        languageColor: repo.languageColor,
        stars: repo.stars,
      }),
    );
  });
}

console.log(
  `Built ${written.length} assets — ${data.totalContributions} contributions, ` +
    `${data.totalRepos} repos, ${data.totalStars} stars, streak ${data.currentStreak}/${data.longestStreak}`,
);