import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// A SENSOR, not a contract test: it asserts a standard held to whatever the
// brief is, so it carries forward into next week's repo (see spec/README.md).
//
// What it catches, and why it exists. Three separate rounds of this prototype
// were rebuilt only to discover the version being replaced had never run:
// `drawOhno` had no caller at all, `drawRhythm` had no caller at all, and a
// rewritten climber module was never wired into `main.ts`. Every one of them
// typechecked, built, and passed the whole test suite. `check` was green
// through all three, because typecheck+build+vitest cannot see that nothing
// calls a thing.
//
// So this runs against SOURCE, not `dist/`: the bundler tree-shakes dead code
// out, which is precisely why the built site looked fine while a round was
// missing. Two assertions — no module unreachable from the entry point, and no
// exported symbol nothing else references.
const SRC = resolve("src");

// The entry point is whatever index.html loads; everything must hang off it.
const ENTRY = (() => {
  const html = readFileSync(resolve("index.html"), "utf8");
  const src = /<script[^>]+src="([^"]+\.ts)"/.exec(html)?.[1];
  if (!src) throw new Error("index.html loads no TypeScript entry point");
  return resolve(src.replace(/^\.\//, ""));
})();

function sources(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

const files = sources();
const text = new Map(files.map((path) => [path, readFileSync(path, "utf8")]));
const show = (path: string) => relative(resolve("."), path).split(sep).join("/");

// Relative import/export specifiers only — bare specifiers are dependencies,
// not our modules. Covers `import … from`, `export … from`, and side-effect
// `import "./x.ts"`.
const SPECIFIER = /(?:from|import)\s*["'](\.[^"']+)["']/g;

function importsOf(path: string): string[] {
  const body = text.get(path) ?? "";
  return [...body.matchAll(SPECIFIER)]
    .map((match) => match[1])
    .filter((spec) => spec.endsWith(".ts"))
    .map((spec) => resolve(dirname(path), spec));
}

describe("sensor: every module is reachable", () => {
  it("index.html's entry point exists", () => {
    expect(text.has(ENTRY)).toBe(true);
  });

  // Walk the graph from the entry the way the browser does.
  const reached = new Set<string>();
  const queue = [ENTRY];
  while (queue.length > 0) {
    const path = queue.pop() as string;
    if (reached.has(path) || !text.has(path)) continue;
    reached.add(path);
    queue.push(...importsOf(path));
  }

  it("no module under src/ is orphaned from the entry point", () => {
    const orphans = files.filter((path) => !reached.has(path)).map(show);
    expect(orphans).toEqual([]);
  });
});

describe("sensor: every export is used", () => {
  // Named exports, by the forms this codebase actually uses. `export default`
  // and `export * from` name nothing locally, so there is nothing to check.
  const DECLARED =
    /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  const LISTED = /^export\s*\{([^}]*)\}(?!\s*from)/gm;

  function exportsOf(path: string): string[] {
    const body = text.get(path) ?? "";
    const named = [...body.matchAll(DECLARED)].map((match) => match[1]);
    const listed = [...body.matchAll(LISTED)].flatMap((match) =>
      match[1]
        .split(",")
        .map((part) => part.split(/\sas\s/).pop()?.trim() ?? "")
        .map((part) => part.replace(/^type\s+/, "")),
    );
    return [...new Set([...named, ...listed])].filter(Boolean);
  }

  // Dead means referenced NOWHERE: not from another module, and not even
  // inside its own file beyond the declaration itself. That is the exact shape
  // the three real failures had — `drawOhno`, `drawRhythm` and a whole round's
  // audio cues sat exported, compiled and never once called.
  //
  // A symbol exported but used only within its own file is merely over-exported.
  // That is tidiness, not a missing round, and this sensor stays quiet about it:
  // a sensor that cries wolf gets muted, and then it is not a sensor.
  //
  // Word-boundary matching over source text, deliberately not resolving which
  // import a mention came from — a smoke alarm for code nothing reaches, not a
  // linker.
  const elsewhere = new Map<string, string>();
  for (const path of [...files, ...sources(resolve("spec"))]) {
    elsewhere.set(path, text.get(path) ?? readFileSync(path, "utf8"));
  }

  function referenced(name: string, path: string): boolean {
    const word = new RegExp(`\\b${name}\\b`, "g");
    for (const [other, body] of elsewhere) {
      const hits = (body.match(word) ?? []).length;
      // In the declaring file the declaration itself is one free mention.
      if (hits > (other === path ? 1 : 0)) return true;
    }
    return false;
  }

  for (const path of files) {
    const names = exportsOf(path);
    if (names.length === 0) continue;

    it(`${show(path)} exports nothing dead`, () => {
      const dead = names.filter((name) => !referenced(name, path));
      expect(dead).toEqual([]);
    });
  }
});
