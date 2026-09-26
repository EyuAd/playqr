import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, analyticsCSV } from "../shared/csv.js";
test("CSV correctly escapes delimiters, quotes and newlines", () => {
  assert.equal(csvCell('A,"B"\nC'), '"A,""B""\nC"');
});
test("CSV neutralizes spreadsheet formulas including leading whitespace", () => {
  for (const value of ["=SUM(1,2)", " +123", "-1", "@SUM(A1)", "\t=1", "\n=1"])
    assert.ok(csvCell(value).startsWith("\"'"));
});
test("analytics export contains selected rows and no private owner key", () => {
  const csv = analyticsCSV(
    { code: "abc", title: "My apps", owner_hash: "secret" },
    [
      {
        day: "2026-09-26",
        device: "Android",
        browser: "Chrome",
        country: "KE",
        count: 2,
      },
    ],
    "7",
  );
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"KE","2"'));
  assert.equal(csv.includes("secret"), false);
  assert.equal(analyticsCSV({ code: "abc" }, [], "30").split("\r\n").length, 2);
});

