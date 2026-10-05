// End-to-end test of the retry loop against a real bare remote.
// Usage: node retry-test.cjs <repoRoot> <scratchRoot>
// Creates a remote, seeds it, starts a "bot" checkout, injects a competing
// human commit mid-flight, and asserts the bot still lands its work.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.argv[2];
const scratch = process.argv[3];

const LEGACY = process.env.LEGACY_REBASE === "1";

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });

const git = (cwd, ...args) => run("git", args, { cwd }).trim();

/** Run node against a script, resolving the interpreter explicitly. */
const runNode = (cwd, script, ...args) =>
  run(process.execPath, [script, ...args], { cwd }).trim();

/** The pre-fix strategy, kept only so a regression cannot pass unnoticed. */
function legacyLoop(bot, remote, branch) {
  const b = (...args) =>
    run("git", ["-C", bot, "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      encoding: "utf8",
    }).trim();
  b("add", "assets", "README.md");
  if (b("diff", "--cached", "--quiet")) return 0;
  b("commit", "--quiet", "-m", "chore: refresh profile cards");
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      b("push", "origin", `HEAD:${branch}`);
      return 0;
    } catch {
      b("pull", "--rebase", "--autostash", "origin", branch);
    }
  }
  return 1;
}

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

fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(scratch, { recursive: true });

const remote = path.join(scratch, "remote.git");
git(scratch, "init", "--quiet", "--bare", remote);

// The seed commits run before retry.sh sets any identity, and CI starts with
// no user.name/user.email configured, so set them per-invocation here.
const seedGit = (...args) =>
  git(scratch, "-c", "user.name=t", "-c", "user.email=t@t", ...args);

// Seed the remote from the current working tree.
const seed = path.join(scratch, "seed");
git(scratch, "clone", "--quiet", remote, seed);
for (const entry of fs.readdirSync(repoRoot)) {
  if (entry === ".git" || entry === "node_modules") continue;
  fs.cpSync(path.join(repoRoot, entry), path.join(seed, entry), {
    recursive: true,
  });
}
// Only track what the workflow would actually commit.
seedGit("-C", seed, "add", "-A");
seedGit("-C", seed, "commit", "--quiet", "-m", "seed");
// Perturb the generated assets so the bot's rebuild produces a real diff.
fs.appendFileSync(path.join(seed, "assets", "stats-dark.svg"), "\n<!-- seed -->\n");
seedGit("-C", seed, "add", "-A");
seedGit("-C", seed, "commit", "--quiet", "-m", "seed: perturb generated asset");
git(seed, "push", "--quiet", "origin", "master");

// --- Scenario: remote moves between the bot's checkout and its push -------
const bot = path.join(scratch, "bot");
git(scratch, "clone", "--quiet", remote, bot);

// The bot has data and will produce a commit. Note the generated changes are
// deliberately left UNCOMMITTED here: the retry script owns the commit, so
// pre-committing would make the loop take the "no changes" path and never
// exercise the rejection/rebuild branch at all.
const fixture = path.join(scratch, "data.raw.json");
runNode(repoRoot, path.join(repoRoot, ".harness", "fixture.cjs"), fixture);
fs.copyFileSync(fixture, path.join(bot, "data.raw.json"));
process.env.OWNER = "Chickenman67";
process.env.FEATURED = "featured-one";
runNode(bot, path.join(bot, ".github/scripts/build-assets.mjs"));
runNode(bot, path.join(bot, ".github/scripts/recent-projects.mjs"));

// A human pushes WHILE the bot holds a stale checkout.
const human = path.join(scratch, "human");
git(scratch, "clone", "--quiet", remote, human);
fs.appendFileSync(path.join(human, "README.md"), "\n<!-- human edit -->\n");
const humanGit = (...args) =>
  git(scratch, "-C", human, "-c", "user.name=human", "-c", "user.email=h@h", ...args);
humanGit("add", "README.md");
humanGit("commit", "--quiet", "-m", "human edit");
humanGit("push", "--quiet", "origin", "master");

// The bot now runs the real workflow loop.
let exit = 0;
let output = "";
if (LEGACY) {
  try {
    legacyLoop(bot, remote, "master");
  } catch (err) {
    exit = 1;
    output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
} else {
  try {
    output = run("bash", [path.join(repoRoot, ".harness", "retry.sh"), bot, remote, "master"], {
      cwd: bot,
    });
  } catch (err) {
    exit = err.status ?? 1;
    output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
}
check("retry loop exits 0 after a rejected push", exit === 0, `exit=${exit} output=${output.trim()}`);

// The scenario is only meaningful if the first push really was rejected.
check("first push was actually rejected", /Push rejected on attempt 1/.test(output), output.trim());

const remoteLog = git(remote, "log", "--oneline", "-6").split("\n");
check("bot work is on the remote", remoteLog.some((l) => l.includes("refresh profile cards")), remoteLog.join(" | "));
check("human commit is preserved", remoteLog.some((l) => l.includes("human edit")), remoteLog.join(" | "));

// History must be linear with no conflict markers left behind.
const content = fs.readFileSync(path.join(human, "README.md"), "utf8");
git(bot, "fetch", "--quiet", "origin", "master");
const remoteReadme = run("git", ["show", "origin/master:README.md"], { cwd: bot });
check("no conflict markers in committed README", !/^<{7}|^={7}|^>{7}/m.test(remoteReadme));
check("bot output present after reset", /project-light-1\.svg/.test(remoteReadme));

// The working tree must be clean afterwards.
const status = git(bot, "status", "--porcelain");
check("bot worktree clean after run", status === "", status);
check("no stray data.raw.json committed", !remoteReadme.includes("data.raw.json"));

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);