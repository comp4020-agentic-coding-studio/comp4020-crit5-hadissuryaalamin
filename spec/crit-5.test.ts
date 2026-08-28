import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, resolve, sep } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Contract tests for C5, "A game".
// https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/05-game/
//
// These answer THIS WEEK'S published spec, so they retire with it (spec/README.md
// draws the line). They run against the BUILT site, like the invariants do.
//
// Not everything in the spec belongs here. Left to the crit, deliberately:
//   - "a stranger can pick it up and reach an ending inside five minutes"
//   - "you can account for how you directed, grounded and corrected the work"
//   - "one change you made came from playing the finished game" (PROCESS.md's job)
//   - "deployed and live at its public GitHub Pages URL" (check:evidence + CI)
// And "it can be lost" is pinned by the focused rule test, not by grepping the
// bundle for the word "lose" - see the last describe block.

const DIST = resolve("dist");
const ROOT = resolve(".");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const shipped = files(DIST).map((path) =>
  relative(DIST, path).split(sep).join("/"),
);

const pages = shipped
  .filter((name) => name.endsWith(".html"))
  .map((name) => ({
    name,
    html: readFileSync(join(DIST, name), "utf8"),
  }));

// ---------------------------------------------------------------------------
// spec: "it teaches itself: no instructions anywhere, on screen or off - the
// opening screen invites the first move, and play teaches whatever comes next"
//
// The no-tutorial rule is the one thing the brief says you cannot fake. A person
// still has to judge whether the opening screen affords the first move; what a
// test can do is catch the failure mode - words that explain the game instead of
// the game explaining itself. Naming the game is allowed. Telling the player
// which key to press is not.
// ---------------------------------------------------------------------------
const INSTRUCTIONAL: RegExp[] = [
  /how\s*[-\s]?to\s*[-\s]?play/i,
  /\binstructions?\b/i,
  /\btutorial\b/i,
  /\bcontrols\s*:/i,
  /\bhow it works\b/i,
  /press\b[^.!?]{0,24}\bto\b/i,
  /\buse (?:the )?(?:arrow|wasd|mouse|spacebar|space bar)\b/i,
  /(?:click|tap|hold)\b[^.!?]{0,24}\bto (?:start|play|begin|jump|move|shoot|fire|aim)\b/i,
  /\b(?:arrow keys|wasd)\b[^.!?]{0,24}\bto\b/i,
  /\bobjective\s*:/i,
  /\bgoal\s*:/i,
  /\byour aim is\b/i,
];

function offend(text: string): string[] {
  return INSTRUCTIONAL.filter((re) => re.test(text)).map((re) => re.source);
}

describe("C5: it teaches itself", () => {
  for (const { name, html } of pages) {
    it(`${name} shows the player no instructions`, () => {
      // Visible copy only - an aria-label or a comment is not on screen, but a
      // <p> telling the player to press SPACE is exactly what this forbids.
      const text =
        new JSDOM(html).window.document.body?.textContent?.replace(
          /\s+/g,
          " ",
        ) ?? "";
      expect(
        offend(text),
        `${name} explains itself in words; the opening screen has to do that work instead`,
      ).toEqual([]);
    });
  }

  for (const script of shipped.filter((name) => name.endsWith(".js"))) {
    it(`${script} renders no instructional copy`, () => {
      // Catches text the game injects at runtime, which never appears in the
      // built HTML and so slips past the check above.
      const source = readFileSync(join(DIST, script), "utf8");
      expect(
        offend(source),
        `${script} carries instructional copy; play has to teach whatever comes next`,
      ).toEqual([]);
    });
  }

  it("the README does not stand in for a tutorial either", () => {
    // "no instructions anywhere, on screen or off" - the brief names the README.
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    expect(
      offend(readme),
      "the README explains how to play; off-screen instructions are still instructions",
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// brief: "Keep it static: a client-side game or a Twine-style branching story
// needs no backend, and it ships straight to GitHub Pages."
// ---------------------------------------------------------------------------
describe("C5: it stands alone", () => {
  for (const { name, html } of pages) {
    it(`${name} loads nothing from another origin`, () => {
      const doc = new JSDOM(html).window.document;
      const remote = [
        ...doc.querySelectorAll("script[src], link[href], img[src]"),
      ]
        .map((el) => el.getAttribute("src") ?? el.getAttribute("href") ?? "")
        .filter((url) => /^(?:https?:)?\/\//i.test(url));
      expect(
        remote,
        `${name} pulls from a CDN; the site has to stand alone, and CI runs a link check`,
      ).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// spec: "the repo shows the process - commits that grew with the work, a process
// overview in PROCESS.md, and the week's reflection in reflections/crit-5.md"
//
// Commit history is for a person to read. The two documents are checkable, and
// checkable means "actually written", not "the file exists".
// ---------------------------------------------------------------------------
describe("C5: the repo shows the process", () => {
  it("reflections/crit-5.md is written", () => {
    const path = join(ROOT, "reflections", "crit-5.md");
    expect(existsSync(path), "this week's reflection is named crit-5.md").toBe(
      true,
    );
    const words = readFileSync(path, "utf8").trim().split(/\s+/).length;
    expect(words, "the reflection is still a stub").toBeGreaterThan(150);
  });

  it("PROCESS.md is no longer the shipped template", () => {
    // The template ships ~500 words of guidance, so a word count goes green on
    // a file nobody touched. That is C4's lesson about asking what a green
    // check actually read. Diff against the blob the repo was created with.
    const first = execFileSync("git", ["rev-list", "--max-parents=0", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/)[0];
    const template = execFileSync("git", ["show", `${first}:PROCESS.md`], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const current = readFileSync(join(ROOT, "PROCESS.md"), "utf8");
    // Compare CR-insensitively; the repo checks out with core.autocrlf.
    const norm = (text: string) =>
      text.split(String.fromCharCode(13)).join("").trim();
    expect(
      norm(current),
      "PROCESS.md is still the template the repo shipped with",
    ).not.toBe(norm(template));
  });
});

// ---------------------------------------------------------------------------
// spec: "one rule of the game has a focused automated test"
// spec: "it can be lost: a wrong move is possible, and play ends somewhere"
//
// This is the one line the template cannot write for you, because the rule is
// whatever mechanic gets chosen. It goes in its own file so it stays focused,
// and so a green run here cannot be mistaken for a green run there - C4 taught
// that a test which reads everything proves nothing.
//
// The rule test must exercise the game's own logic (import the module and call
// it), not grep the bundle for a word. At minimum it has to demonstrate that a
// wrong move is possible and that play reaches an ending.
//
// This starts RED. It goes green when the mechanic exists and its rule is under
// test - not before.
// ---------------------------------------------------------------------------
describe("C5: one rule is under focused test", () => {
  const ruleTests = readdirSync(join(ROOT, "spec")).filter(
    (name) => name.endsWith(".test.ts") && name.startsWith("rule-"),
  );

  it("a spec/rule-*.test.ts exists", () => {
    expect(
      ruleTests,
      "name it spec/rule-<mechanic>.test.ts so it is obvious which rule it pins",
    ).not.toEqual([]);
  });

  it("the rule test imports the game's own logic", () => {
    for (const name of ruleTests) {
      const source = readFileSync(join(ROOT, "spec", name), "utf8");
      expect(
        /^\s*import\b[^;]*\sfrom\s+["']\.\.\//m.test(source),
        `${name} has to import the game module and call it - a test that only reads dist/ proves nothing`,
      ).toBe(true);
    }
  });
});
