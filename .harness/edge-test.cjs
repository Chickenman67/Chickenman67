// Edge cases for the card generators. Each case mutates a fixture and
// asserts the pipeline either survives cleanly or fails loudly -- never
// emits malformed output or a NaN.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = process.argv[2];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edge-"));

let passed = 0;
let failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
};

// Copy the repo (minus .git) into an isolated dir so cases cannot collide.
const work = path.join(tmp, "repo");
fs.mkdirSync(work);
for (const entry of fs.readdirSync(repoRoot)) {
  if (entry === ".git" || entry === "node_modules") continue;
  fs.cpSync(path.join(repoRoot, entry), path.join(work, entry), {
    recursive: true,
  });
}

const runNode = (script, ...args) =>
  execFileSync(process.execPath, [path.join(work, script), ...args], {
    cwd: work,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const fixturePath = path.join(work, "data.raw.json");
const baseFixture = () => {
  runNode(".harness/fixture.cjs", fixturePath);
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
};

const write = (obj) =>
  fs.writeFileSync(fixturePath, JSON.stringify(obj), "utf8");

/** Runs the pipeline; returns {code, stdout} without throwing. */
function pipeline() {
  try {
    const stdout = runNode(".github/scripts/build-assets.mjs");
    runNode(".github/scripts/recent-projects.mjs");
    const validate = runNode(".github/scripts/validate.mjs");
    return { code: 0, stdout: `${stdout}${validate}` };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

const allAssets = () =>
  fs.readdirSync(path.join(work, "assets")).filter((f) => f.endsWith(".svg"));

/** No asset may contain a placeholder token or a zero dimension. */
function assetsAreClean() {
  for (const f of allAssets()) {
    const s = fs.readFileSync(path.join(work, "assets", f), "utf8");
    if (/undefined|NaN|\[object Object\]/.test(s)) return `placeholder in ${f}`;
    const w = s.match(/\bwidth="(\d+)"/);
    const h = s.match(/\bheight="(\d+)"/);
    if (!w || !h || w[1] === "0" || h[1] === "0") return `bad dims in ${f}`;
  }
  return null;
}

process.env.OWNER = "Chickenman67";
process.env.FEATURED = "featured-one";

// --- 1. Happy path baseline ------------------------------------------------
write(baseFixture());
let r = pipeline();
check("baseline pipeline succeeds", r.code === 0, r.stdout.slice(0, 200));
check("baseline emits no placeholders", assetsAreClean() === null, assetsAreClean() ?? "");

// --- 2. A repo with a nasty description (XML + emoji + quotes) -------------
{
  const f = baseFixture();
  f.data.user.repositories.nodes[0].description =
    'Ampersand & <script>alert("x")</script> \'quoted\' — 100% <b>bold</b> 🐍';
  write(f);
  r = pipeline();
  check("hostile description does not break the build", r.code === 0, r.stdout.slice(0, 300));
  check("hostile description still yields clean assets", assetsAreClean() === null, assetsAreClean() ?? "");
}

// --- 3. Very long repo name and description --------------------------------
{
  const f = baseFixture();
  f.data.user.repositories.nodes[0].name = "A".repeat(180);
  f.data.user.repositories.nodes[0].description = "word ".repeat(200);
  write(f);
  r = pipeline();
  check("very long name/description does not break the build", r.code === 0, r.stdout.slice(0, 300));
  check("very long text yields clean assets", assetsAreClean() === null, assetsAreClean() ?? "");
}

// --- 4. Zero contributions in the whole year -------------------------------
{
  const f = baseFixture();
  for (const w of f.data.user.contributionsCollection.contributionCalendar.weeks) {
    for (const d of w.contributionDays) d.contributionCount = 0;
  }
  f.data.user.contributionsCollection.contributionCalendar.totalContributions = 0;
  write(f);
  r = pipeline();
  check("empty contribution year does not crash", r.code === 0, r.stdout.slice(0, 300));
  check("empty year yields clean assets", assetsAreClean() === null, assetsAreClean() ?? "");
}

// --- 5. Single day of activity (degenerate snake path) ---------------------
{
  const f = baseFixture();
  for (const w of f.data.user.contributionsCollection.contributionCalendar.weeks) {
    for (const d of w.contributionDays) d.contributionCount = 0;
  }
  const weeks = f.data.user.contributionsCollection.contributionCalendar.weeks;
  weeks[5].contributionDays[2].contributionCount = 3;
  f.data.user.contributionsCollection.contributionCalendar.totalContributions = 3;
  write(f);
  r = pipeline();
  check("single-day activity does not crash", r.code === 0, r.stdout.slice(0, 300));
  check("single-day snake yields clean assets", assetsAreClean() === null, assetsAreClean() ?? "");
}

// --- 6. Every repo filtered out (no projects to show) ----------------------
{
  const f = baseFixture();
  for (const n of f.data.user.repositories.nodes) n.name = "featured-one";
  write(f);
  r = pipeline();
  check("all repos excluded does not crash", r.code === 0, r.stdout.slice(0, 300));
}

// --- 7. Missing `url` field: the original bug class ------------------------
{
  const f = baseFixture();
  for (const n of f.data.user.repositories.nodes) delete n.url;
  write(f);
  r = pipeline();
  check("missing url field does not produce empty hrefs", r.code === 0, r.stdout.slice(0, 300));
  const readme = fs.readFileSync(path.join(work, "README.md"), "utf8");
  const emptyHrefs = [...readme.matchAll(/<a href="([^"]*)"/g)].filter((m) => !m[1].trim());
  check("no empty hrefs when url is absent", emptyHrefs.length === 0, `${emptyHrefs.length} empty`);
}

// --- 8. Owner unset: derived URL must still be correct ---------------------
{
  const f = baseFixture();
  write(f);
  const prev = process.env.OWNER;
  delete process.env.OWNER;
  r = pipeline();
  process.env.OWNER = prev;
  check("pipeline survives an unset OWNER", r.code === 0, r.stdout.slice(0, 200));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);