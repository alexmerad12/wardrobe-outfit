// Used by .github/workflows/android.yml when the Gradle build fails:
// pulls the reason out of the build log and prints it as an error
// annotation, which shows at the top of the run (and through GitHub's API)
// without anyone having to read the full log.
//
//   node scripts/android/annotate-failure.mjs <gradle log file>
import fs from "node:fs";

const file = process.argv[2];
const log = file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const lines = log.split(/\r?\n/);

// Compiler and resource errors, then Gradle's own summary.
const picked = [];
for (const line of lines) {
  if (/(^|\s)(error:|e: |ERROR:|AAPT: error|FAILED$)/.test(line) || /: error: /.test(line)) picked.push(line.trim());
}
const start = lines.findIndex((line) => line.startsWith("* What went wrong:"));
if (start !== -1) {
  const end = lines.findIndex((line, index) => index > start && line.startsWith("* Try:"));
  picked.push(...lines.slice(start, end === -1 ? start + 25 : end).map((line) => line.trimEnd()));
}
const unique = [...new Set(picked.filter(Boolean))];
const text = (unique.length ? unique.join("\n") : lines.slice(-40).join("\n") || "no build log was written").slice(0, 3500);

// Workflow commands take one line: escape the rest.
const escaped = text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
console.log(`::error title=Android build failed::${escaped}`);
