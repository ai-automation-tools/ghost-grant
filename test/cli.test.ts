import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/run.ts";

function capture(argv: string[]) {
  let out = "";
  let err = "";
  const code = run(argv, { out: (s) => (out += s), err: (s) => (err += s) });
  return { code, out, err };
}

test("--version prints the package version", () => {
  const r = capture(["--version"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^\d+\.\d+\.\d+\n$/);
});

test("no arguments prints help", () => {
  const r = capture([]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Usage:/);
});

test("a planned command says it isn't built yet", () => {
  const r = capture(["check", "--mock"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /not built yet/);
});

test("an unknown command fails with help on stderr", () => {
  const r = capture(["revoke"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Unknown command: revoke/);
});
