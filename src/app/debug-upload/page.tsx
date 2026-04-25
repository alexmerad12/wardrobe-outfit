"use client";

import { useState, useRef } from "react";
import { downscaleImage, flattenOntoWhite } from "@/lib/image-utils";
import { removeBg } from "@/lib/bg-removal";
import { analyzeItem } from "@/lib/analyze-item";

type Level = "info" | "ok" | "warn" | "error";
type LogEntry = { ts: number; level: Level; step: string; detail?: string };

// Diagnostic page. The bulk pipeline keeps failing with "Upload network
// error, no bytes sent" on the user's Samsung even after every plausible
// blind fix. This page makes the exact failure point visible on-device:
// each pipeline step writes a verbose line to a terminal-style log,
// errors include progressEvents/lastLoaded/readyState/onLine, and three
// buttons isolate file content vs. connection vs. XHR-vs-fetch.
//
// Reachable at /debug-upload. Auth-gated like the rest of the app
// (the upload endpoint requires a signed-in user). Hidden from the
// bottom nav; nothing links to it.

export default function DebugUploadPage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const t0Ref = useRef<number>(0);

  const append = (level: Level, step: string, detail?: string) => {
    const ts = performance.now() - t0Ref.current;
    const entry: LogEntry = { ts, level, step, detail };
    setLog((prev) => [...prev, entry]);
    // Mirror to console for chrome://inspect users.
    // eslint-disable-next-line no-console
    console.log(
      `[debug-upload ${(ts / 1000).toFixed(2)}s] ${level.toUpperCase()} ${step}${detail ? ` — ${detail}` : ""}`
    );
  };

  function logDeviceInfo() {
    append("info", "user-agent", navigator.userAgent);
    append("info", "online", String(navigator.onLine));
    const conn = (navigator as unknown as { connection?: { effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean } }).connection;
    if (conn) {
      append(
        "info",
        "connection",
        `effectiveType=${conn.effectiveType ?? "?"} rtt=${conn.rtt ?? "?"}ms downlink=${conn.downlink ?? "?"}Mbps saveData=${conn.saveData ?? "?"}`
      );
    } else {
      append("info", "connection", "navigator.connection unavailable");
    }
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    if (mem) append("info", "device-memory", `${mem} GB`);
    const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    if (perfMem) {
      append(
        "info",
        "heap",
        `used=${(perfMem.usedJSHeapSize / 1e6).toFixed(1)}MB limit=${(perfMem.jsHeapSizeLimit / 1e6).toFixed(1)}MB`
      );
    }
  }

  // Verbose XHR upload that captures everything the production helper
  // throws away: progress event count, lastLoaded byte count, readyState
  // at error time, navigator.onLine at error time, elapsed ms.
  function xhrUpload(file: File, label: string): Promise<void> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      let progressEvents = 0;
      let lastLoaded = 0;
      const sendT0 = performance.now();

      xhr.open("POST", "/api/upload", true);
      xhr.timeout = 60_000;

      xhr.upload.onloadstart = () => {
        append("info", `${label} upload.loadstart`, "browser fired loadstart");
      };
      xhr.upload.onprogress = (e) => {
        progressEvents++;
        if (e.lengthComputable) lastLoaded = e.loaded;
        if (progressEvents === 1) {
          append("ok", `${label} first-progress`, `loaded=${e.loaded} total=${e.total}`);
        }
      };

      xhr.onload = () => {
        const elapsed = Math.round(performance.now() - sendT0);
        if (xhr.status >= 200 && xhr.status < 300) {
          append(
            "ok",
            `${label} HTTP ${xhr.status}`,
            `elapsed=${elapsed}ms body=${xhr.responseText.slice(0, 300)}`
          );
        } else {
          append(
            "error",
            `${label} HTTP ${xhr.status}`,
            `elapsed=${elapsed}ms body=${xhr.responseText.slice(0, 300)}`
          );
        }
        resolve();
      };
      xhr.onerror = () => {
        const elapsed = Math.round(performance.now() - sendT0);
        append(
          "error",
          `${label} XHR.onerror`,
          `progressEvents=${progressEvents} lastLoaded=${lastLoaded} elapsed=${elapsed}ms readyState=${xhr.readyState} onLine=${navigator.onLine}`
        );
        resolve();
      };
      xhr.ontimeout = () => {
        const elapsed = Math.round(performance.now() - sendT0);
        append(
          "error",
          `${label} XHR.ontimeout`,
          `progressEvents=${progressEvents} lastLoaded=${lastLoaded} elapsed=${elapsed}ms`
        );
        resolve();
      };
      xhr.onabort = () => {
        append("error", `${label} XHR.onabort`, "");
        resolve();
      };

      const body = new FormData();
      body.append("file", file);

      append("info", `${label} xhr.send`, `bytes=${file.size} type=${file.type}`);
      xhr.send(body);
    });
  }

  async function fetchUpload(file: File, label: string): Promise<void> {
    const sendT0 = performance.now();
    const body = new FormData();
    body.append("file", file);
    append("info", `${label} fetch.send`, `bytes=${file.size} type=${file.type}`);
    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const text = await res.text();
      const elapsed = Math.round(performance.now() - sendT0);
      append(
        res.ok ? "ok" : "error",
        `${label} HTTP ${res.status}`,
        `elapsed=${elapsed}ms body=${text.slice(0, 300)}`
      );
    } catch (err) {
      const elapsed = Math.round(performance.now() - sendT0);
      append(
        "error",
        `${label} fetch threw`,
        `elapsed=${elapsed}ms onLine=${navigator.onLine} err=${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`
      );
    }
  }

  async function runFullPipeline(file: File) {
    setLog([]);
    t0Ref.current = performance.now();
    setRunning(true);
    try {
      logDeviceInfo();
      append("info", "file", `name=${file.name} size=${file.size} type=${file.type} lastModified=${file.lastModified}`);

      try {
        const bm = await createImageBitmap(file);
        append("ok", "decode", `${bm.width}×${bm.height}`);
        bm.close();
      } catch (err) {
        append("error", "decode failed", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      }

      let downscaled: Blob;
      try {
        downscaled = await downscaleImage(file, 1280);
        append("ok", "downscale", `${downscaled.size} bytes type=${downscaled.type}`);
      } catch (err) {
        append("error", "downscale failed", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
        return;
      }

      const baseName = file.name.replace(/\.[^.]+$/, "") || "item";
      const downscaledFile = new File([downscaled], `${baseName}.jpg`, { type: "image/jpeg" });

      let cleaned: Blob | null = null;
      try {
        cleaned = await removeBg(downscaledFile);
        append("ok", "bg-removal", cleaned ? `${cleaned.size} bytes` : "returned null (model declined)");
      } catch (err) {
        append("warn", "bg-removal threw", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      }

      let finalFile = downscaledFile;
      if (cleaned) {
        try {
          const flat = await flattenOntoWhite(cleaned, 1280, 0.88);
          finalFile = new File([flat], `${baseName}.jpg`, { type: "image/jpeg" });
          append("ok", "flatten", `${finalFile.size} bytes`);
        } catch (err) {
          append("warn", "flatten failed", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
        }
      }

      await xhrUpload(finalFile, "upload");
      append("info", "pipeline complete", "");
    } finally {
      setRunning(false);
    }
  }

  async function runDummyXhr() {
    setLog([]);
    t0Ref.current = performance.now();
    setRunning(true);
    try {
      logDeviceInfo();
      const dummy = new File([new Uint8Array(100)], "dummy.jpg", { type: "image/jpeg" });
      append("info", "dummy", "100-byte zero-filled blob — isolates the connection from file content");
      await xhrUpload(dummy, "dummy-xhr");
    } finally {
      setRunning(false);
    }
  }

  async function runDummyFetch() {
    setLog([]);
    t0Ref.current = performance.now();
    setRunning(true);
    try {
      logDeviceInfo();
      const dummy = new File([new Uint8Array(100)], "dummy.jpg", { type: "image/jpeg" });
      append("info", "dummy", "100-byte zero-filled blob via fetch — XHR-vs-fetch comparison");
      await fetchUpload(dummy, "dummy-fetch");
    } finally {
      setRunning(false);
    }
  }

  // Exactly mirrors processItemOnce: downscale → Promise.all([removeBg,
  // analyzeItem]) → flatten → upload. If this fails where button 1
  // succeeds, the parallel analyze+bg-removal interaction with the
  // subsequent upload is the cause.
  const bulkSimRef = useRef<HTMLInputElement>(null);
  async function runBulkSim(file: File) {
    setLog([]);
    t0Ref.current = performance.now();
    setRunning(true);
    try {
      logDeviceInfo();
      append("info", "file", `name=${file.name} size=${file.size} type=${file.type}`);

      let downscaled: Blob;
      try {
        downscaled = await downscaleImage(file, 1600);
        append("ok", "downscale", `${downscaled.size} bytes`);
      } catch (err) {
        append("error", "downscale failed", String(err));
        return;
      }

      const baseName = file.name.replace(/\.[^.]+$/, "") || "item";
      const downscaledFile = new File([downscaled], `${baseName}.jpg`, { type: "image/jpeg" });

      append("info", "parallel", "starting Promise.all([removeBg, analyzeItem]) — exactly like bulk pipeline");
      const parT0 = performance.now();
      const [cleanedOrNull, attrsRaw] = await Promise.all([
        removeBg(downscaledFile)
          .then((r) => {
            append("ok", "bg-removal done", r ? `${r.size} bytes after ${Math.round(performance.now() - parT0)}ms` : `null after ${Math.round(performance.now() - parT0)}ms`);
            return r;
          })
          .catch((err) => {
            append("warn", "bg-removal threw", String(err));
            return null;
          }),
        analyzeItem(downscaledFile)
          .then((r) => {
            append("ok", "analyze done", `keys=${Object.keys(r).length} after ${Math.round(performance.now() - parT0)}ms`);
            return r;
          })
          .catch((err) => {
            append("warn", "analyze threw", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
            return {};
          }),
      ]);
      append("info", "parallel done", `attrs keys=${Object.keys(attrsRaw).length} cleaned=${cleanedOrNull ? "yes" : "no"}`);

      let finalFile = downscaledFile;
      if (cleanedOrNull) {
        try {
          const flat = await flattenOntoWhite(cleanedOrNull, 1280, 0.88);
          finalFile = new File([flat], `${baseName}.jpg`, { type: "image/jpeg" });
          append("ok", "flatten", `${finalFile.size} bytes`);
        } catch (err) {
          append("warn", "flatten failed", String(err));
        }
      }

      await xhrUpload(finalFile, "upload");
      append("info", "bulk-sim complete", "");
    } finally {
      setRunning(false);
    }
  }

  function handleBulkSimFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void runBulkSim(file);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void runFullPipeline(file);
  }

  function copyLog() {
    const text = log
      .map(
        (l) =>
          `[${(l.ts / 1000).toFixed(2)}s] ${l.level.toUpperCase()} ${l.step}${l.detail ? `\n    ${l.detail}` : ""}`
      )
      .join("\n");
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text).then(
        () => alert("Copied to clipboard"),
        () => alert(text)
      );
    } else {
      alert(text);
    }
  }

  const colorFor = (level: Level) =>
    level === "error"
      ? "text-red-400"
      : level === "warn"
        ? "text-yellow-400"
        : level === "ok"
          ? "text-green-400"
          : "text-blue-300";

  return (
    <div className="min-h-screen bg-black text-white p-3 font-mono text-xs">
      <div className="max-w-2xl mx-auto space-y-3">
        <h1 className="text-base font-bold">Upload Diagnostic</h1>
        <p className="text-gray-400 leading-relaxed">
          Three tests, picking one button at a time. Real pipeline runs every step the bulk page would
          (decode → downscale → bg-removal → flatten → upload). Dummy tests skip file processing and
          POST a 100-byte blob — same endpoint, no real content. XHR vs. fetch comparison reveals
          whether the issue is XHR-specific.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={running}
            className="px-3 py-2 bg-white text-black font-medium rounded disabled:opacity-50"
          >
            {running ? "Running..." : "1. Pick photo (full pipeline)"}
          </button>
          <button
            onClick={runDummyXhr}
            disabled={running}
            className="px-3 py-2 border border-white/40 rounded disabled:opacity-50"
          >
            2. Dummy 100B via XHR
          </button>
          <button
            onClick={runDummyFetch}
            disabled={running}
            className="px-3 py-2 border border-white/40 rounded disabled:opacity-50"
          >
            3. Dummy 100B via fetch
          </button>
          <button
            onClick={() => bulkSimRef.current?.click()}
            disabled={running}
            className="px-3 py-2 border border-yellow-400/60 text-yellow-300 rounded disabled:opacity-50"
          >
            4. Bulk-path simulation
          </button>
          <button
            onClick={copyLog}
            disabled={log.length === 0}
            className="px-3 py-2 border border-white/40 rounded disabled:opacity-50"
          >
            Copy log
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <input ref={bulkSimRef} type="file" accept="image/*" className="hidden" onChange={handleBulkSimFile} />
        <div className="border border-white/20 rounded p-3 bg-black overflow-auto whitespace-pre-wrap break-words leading-relaxed min-h-[200px]">
          {log.length === 0 ? (
            <span className="text-gray-500">No log yet. Tap a button above.</span>
          ) : (
            log.map((l, i) => (
              <div key={i} className={colorFor(l.level)}>
                [{(l.ts / 1000).toFixed(2)}s] {l.level.toUpperCase()} {l.step}
                {l.detail && <div className="pl-4 text-gray-400 break-all">{l.detail}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
