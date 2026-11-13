// Local stand-in for Sentry's ingest: writes every request it receives to a
// JSONL file (headers + decoded body) and answers 200.
// Usage: node scripts/sentry-envelopes/recorder.mjs <port> <out.jsonl>
import { createServer } from "node:http";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

const [, , port = "9911", outFile] = process.argv;
if (!outFile) throw new Error("usage: recorder.mjs <port> <out.jsonl>");
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, "");

createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    let body = Buffer.concat(chunks);
    const encoding = String(req.headers["content-encoding"] ?? "");
    try {
      if (encoding.includes("gzip")) body = gunzipSync(body);
      else if (encoding.includes("deflate")) body = inflateSync(body);
      else if (encoding.includes("br")) body = brotliDecompressSync(body);
    } catch (error) {
      console.error("could not decode", encoding, error);
    }
    appendFileSync(
      outFile,
      JSON.stringify({ at: new Date().toISOString(), method: req.method, url: req.url, headers: req.headers, body: body.toString("utf8") }) + "\n"
    );
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end("{}");
  });
}).listen(Number(port), "127.0.0.1", () => console.log(`recording on 127.0.0.1:${port} -> ${outFile}`));
