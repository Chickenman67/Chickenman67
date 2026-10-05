// Proves the generators are a pure function of the input. The workflow's
// rejected-push retry rebuilds from scratch and relies on this: if output
// varied run to run, the rebuilt commit would differ from the discarded one
// and the retry would produce churn instead of a clean recovery.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const repoRoot = process.argv[2];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "det-"));
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

process.env.OWNER = "Chickenman67";
process.env.FEATURED = "featured-one";
runNode(".harness/fixture.cjs", path.join(work, "data.raw.json"));

const fingerprint = () => {
  const assets = fs.readdirSync(path.join(work, "assets")).sort();
  const h = crypto.createHash("sha256");
  for (const f of assets) h.update(f).update(fs.readFileSync(path.join(work, "assets", f)));
  h.update(fs.readFileSync(path.join(work, "README.md")));
  return h.digest("hex");
};

runNode(".github/scripts/build-assets.mjs");
runNode(".github/scripts/recent-projects.mjs");
const first = fingerprint();

runNode(".github/scripts/build-assets.mjs");
runNode(".github/scripts/recent-projects.mjs");
const second = fingerprint();

// A third pass must also be stable.
runNode(".github/scripts/build-assets.mjs");
runNode(".github/scripts/recent-projects.mjs");
const third = fingerprint();

let failed = 0;
const check = (name, cond) => {
  if (cond) { console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}`); }
};

check("run 2 produces byte-identical output", first === second);
check("run 3 produces byte-identical output", second === third);
console.log(`\n  sha256: ${first.slice(0, 16)}...`);

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);