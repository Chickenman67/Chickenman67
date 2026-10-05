// Asserts each validator check actually fires. A check that silently never
// triggers is worse than no check at all, so every rule is exercised by
// breaking the artefact it is supposed to catch.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = process.argv[2];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "valneg-"));
const work = path.join(tmp, "repo");
fs.mkdirSync(work);
for (const entry of fs.readdirSync(repoRoot)) {
  if (entry === ".git" || entry === "node_modules") continue;
  fs.cpSync(path.join(repoRoot, entry), path.join(work, entry), { recursive: true });
}

const runNode = (script, ...args) =>
  execFileSync(process.execPath, [path.join(work, script), ...args], {
    cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });

// Build a known-good baseline to mutate.
process.env.OWNER = "Chickenman67";
process.env.FEATURED = "featured-one";
runNode(".harness/fixture.cjs", path.join(work, "data.raw.json"));
runNode(".github/scripts/build-assets.mjs");
runNode(".github/scripts/recent-projects.mjs");

const readmePath = path.join(work, "README.md");
const backup = fs.readFileSync(readmePath, "utf8");
const snapshot = new Map();
for (const f of fs.readdirSync(path.join(work, "assets"))) {
  snapshot.set(f, fs.readFileSync(path.join(work, "assets", f), "utf8"));
}

let passed = 0, failed = 0;
const restore = () => {
  fs.writeFileSync(readmePath, backup, "utf8");
  for (const [f, s] of snapshot) fs.writeFileSync(path.join(work, "assets", f), s, "utf8");
  for (const f of fs.readdirSync(path.join(work, "assets"))) {
    if (!snapshot.has(f)) fs.rmSync(path.join(work, "assets", f));
  }
};

const validate = () => {
  try { runNode(".github/scripts/validate.mjs"); return { code: 0, out: "" }; }
  catch (err) { return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` }; }
};

// expectClean: the baseline must pass, proving the mutation is what broke it.
const expectFail = (name, mutate, pattern) => {
  restore();
  mutate();
  const r = validate();
  const ok = r.code !== 0 && new RegExp(pattern, "i").test(r.out);
  if (ok) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name} (code=${r.code})\n${r.out.split("\n").map((l) => `         ${l}`).join("\n")}`); }
};

const expectPass = (name, mutate) => {
  restore();
  mutate();
  const r = validate();
  if (r.code === 0) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name} -- ${r.out.slice(0, 160)}`); }
};

// Baseline must be clean.
{
  restore();
  const r = validate();
  if (r.code === 0) { passed += 1; console.log("  PASS  baseline validates cleanly"); }
  else { failed += 1; console.log(`  FAIL  baseline -- ${r.out.slice(0, 200)}`); }
}

const editReadme = (fn) => () => fs.writeFileSync(readmePath, fn(backup), "utf8");
const editAsset = (name, fn) => () =>
  fs.writeFileSync(path.join(work, "assets", name), fn(snapshot.get(name)), "utf8");

expectFail("catches empty href",
  editReadme((s) => s.replace(/href="https:\/\/github\.com\/Chickenman67\/[^"]+"/, 'href=""')),
  "empty href");

expectFail("catches malformed href",
  editReadme((s) => s.replace(/href="https:\/\/github\.com\/Chickenman67\/[^"]+"/, 'href="ftp://nope/"')),
  "malformed href");

expectFail("catches missing asset",
  () => fs.rmSync(path.join(work, "assets", "project-light-1.svg")),
  "missing asset");

expectFail("catches orphan card",
  () => fs.copyFileSync(path.join(work, "assets", "project-light-1.svg"), path.join(work, "assets", "project-light-97.svg")),
  "never referenced");

expectFail("catches placeholder text",
  editAsset("project-light-1.svg", (s) => s.replace("</svg>", "<text>undefined</text></svg>")),
  "placeholder");

expectFail("catches NaN in output",
  editAsset("project-light-1.svg", (s) => s.replace("</svg>", "<text>NaN</text></svg>")),
  "placeholder");

expectFail("catches zero width",
  editAsset("project-light-1.svg", (s) => s.replace(/width="340"/, 'width="0"')),
  "zero or missing");

expectFail("catches unescaped ampersand",
  editAsset("project-light-1.svg", (s) => s.replace("</svg>", "<text>A & B</text></svg>")),
  "unescaped");

expectFail("catches missing xmlns",
  editAsset("project-light-1.svg", (s) => s.replace('xmlns="http://www.w3.org/2000/svg" ', "")),
  "xmlns");

// Remove only the FIRST dark source, so the check fires while leaving the
// other pictures valid -- removing them all would also orphan every card and
// bury the real assertion under unrelated noise.
expectFail("catches picture without source",
  editReadme((s) => s.replace(/<source media="\(prefers-color-scheme: dark\)"[^>]*>\s*/, "")),
  // The message reads "<picture> block N has no <source> override", so match
  // "override" rather than "source override" (which the angle brackets break).
  "override");

expectFail("catches alt/link mismatch",
  editReadme((s) => s.replace(/alt="Alpha"/, 'alt="SomethingElse"')),
  "does not match link target");

// A legitimately empty grid must NOT be an error. Strip the table, the links
// AND the now-orphaned card files together, so the only thing under test is
// whether an empty grid itself is accepted.
expectPass("empty grid is not an error", () => {
  fs.writeFileSync(
    readmePath,
    backup
      .replace(/<table>[\s\S]*?<\/table>/, "_No recent projects found._")
      .replace(/<img src="\.\/assets\/project-[^"]+"[^>]*>/g, ""),
    "utf8",
  );
  for (const f of fs.readdirSync(path.join(work, "assets"))) {
    if (/^project-(light|dark)-\d+\.svg$/.test(f)) {
      fs.rmSync(path.join(work, "assets", f));
    }
  }
});

restore();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);