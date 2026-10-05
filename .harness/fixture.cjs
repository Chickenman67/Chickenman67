// Builds a minimal but structurally faithful data.raw.json for offline tests.
// Shaped exactly like the GraphQL response build-assets.mjs consumes.
const fs = require("node:fs");

const weeks = [];
// 20 weeks, activity only in the back half, so the crop logic is exercised.
for (let w = 0; w < 20; w += 1) {
  const days = [];
  for (let d = 0; d < 7; d += 1) {
    const active = w >= 10 && (d + w) % 3 !== 0;
    days.push({
      date: `2026-01-${String(d + 1).padStart(2, "0")}`,
      contributionCount: active ? (d + w) % 9 : 0,
    });
  }
  weeks.push({ contributionDays: days });
}

const mkRepo = (name, description, language, stars) => ({
  name,
  description,
  isFork: false,
  isArchived: false,
  stargazerCount: stars,
  url: `https://github.com/Chickenman67/${name}`,
  primaryLanguage: language ? { name: language, color: "#3178c6" } : null,
});

const payload = {
  data: {
    user: {
      followers: { totalCount: 3 },
      repositories: {
        totalCount: 9,
        nodes: [
          mkRepo("Alpha", "First project", "JavaScript", 3),
          mkRepo("Beta", "", "Python", 0),          // no description
          mkRepo("Gamma", "Third project", null, 1), // no language
          mkRepo("Delta", "Fourth project", "JavaScript", 0),
          mkRepo("Epsilon", "Fifth project", "Python", 2),
          mkRepo("Zeta", "Sixth project", "TypeScript", 0),
          mkRepo("Eta", "Seventh project", "HTML", 0),
          mkRepo("featured-one", "Excluded via FEATURED", "Python", 9),
          mkRepo("Chickenman67", "The profile itself", "JavaScript", 0),
        ],
      },
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: 431,
          weeks,
        },
      },
    },
  },
};

fs.writeFileSync(process.argv[2] || "data.raw.json", JSON.stringify(payload));
console.log("fixture written");