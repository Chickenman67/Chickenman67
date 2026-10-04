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
  headerSvg,
} from "./cards.mjs";

/**
 * `data.raw.json` is the untouched GraphQL response. Everything the cards
 * need is derived from it here, so the workflow stays a thin shell.
 */
const raw = JSON.parse(readFileSync("data.raw.json", "utf8")).data.user;

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
const projects = repos
  .filter((repo) => repo.name !== owner)
  .slice(0, 6)
  .map((repo) => ({
    name: repo.name,
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

/* ---- header ------------------------------------------------------ */

write(
  "header.svg",
  headerSvg({
    lines: [
      "> automation scripts & pipelines",
      "> file viewers & readers",
      "> web apps & weekend experiments",
      "> python / js / ts / html / wolfram",
    ],
    colors: ["#58a6ff", "#a371f7", "#3fb950", "#f0883e"],
  }),
);

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

for (const mode of ["light", "dark"]) {
  for (const repo of projects) {
    write(
      `project-${mode}-${repo.name}.svg`,
      projectCard({
        mode,
        name: repo.name,
        description: repo.description,
        language: repo.language,
        languageColor: repo.languageColor,
        stars: repo.stars,
      }),
    );
  }
}

console.log(
  `Built ${written.length} assets — ${data.totalContributions} contributions, ` +
    `${data.totalRepos} repos, ${data.totalStars} stars, streak ${data.currentStreak}/${data.longestStreak}`,
);