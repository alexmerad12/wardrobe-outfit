// Checks the Google Play listing texts kept in docs/play-store-listing.md
// against Google's limits (title 30 characters, short description 80,
// full description 4,000) and prints each count. Run it after any edit:
//
//   node scripts/android/listing-check.mjs
//
// It also refuses the punctuation the owner's copy never uses (long
// dashes, semicolons), so a draft can't slip one in.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const doc = fs.readFileSync(path.join(root, "docs", "play-store-listing.md"), "utf8").replace(/\r\n/g, "\n");
const LIMITS = { title: 30, short: 80, full: 4000 };

const blocks = [...doc.matchAll(/<!-- listing:(\w+):(\w+) -->\n([\s\S]*?)\n<!-- \/listing -->/g)];
let bad = 0;
const seen = new Set();
for (const [, language, kind, raw] of blocks) {
  const text = raw.trim();
  const length = [...text].length;
  const limit = LIMITS[kind];
  const problems = [];
  if (!limit) problems.push(`unknown kind "${kind}"`);
  else if (length > limit) problems.push(`${length - limit} over the limit`);
  if (length === 0) problems.push("empty");
  if (/[—–;]/.test(text)) problems.push("contains a long dash or a semicolon");
  if (kind !== "full" && text.includes("\n")) problems.push("must be one line");
  seen.add(`${language}:${kind}`);
  if (problems.length) bad++;
  console.log(`${problems.length ? "FAIL" : "ok  "}  ${language} ${kind}: ${length} of ${limit ?? "?"} characters${problems.length ? ` (${problems.join(", ")})` : ""}`);
}
for (const language of ["en", "fr"]) {
  for (const kind of Object.keys(LIMITS)) {
    if (!seen.has(`${language}:${kind}`)) {
      bad++;
      console.log(`FAIL  ${language} ${kind}: missing from the document`);
    }
  }
}
process.exit(bad ? 1 : 0);
