"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import type {
  Category,
  ClothingItem,
  Material,
  Pattern,
  Subcategory,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/use-locale";
import { useLabels } from "@/lib/i18n/use-labels";
import { CATEGORY_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

// Post-upload review page — Acloset-style.
//
// After a bulk upload finishes, the user lands here with ?ids=a,b,c,... . We
// fetch each item, render an editable card per item (image + name +
// category + subcategory + colors preview), and let the user tap through
// the whole batch at once. One big Save button at the bottom commits
// every edited field in a single flat Promise.all of PATCH requests.
//
// Deeper attributes (fit, material, pattern, neckline, etc.) live behind
// a per-card "Edit all details" link that takes the user to
// /wardrobe/[id] — that's the full form. Keeping the review page focused
// on the three fields people actually correct (name, category,
// subcategory) makes a 10-item batch scannable in 20 seconds.

type Edit = {
  name?: string;
  category?: Category;
  subcategory?: Subcategory | null;
  material?: Material[];
  pattern?: Pattern[];
};

// Common-case quick-pick shortcuts. If the AI picked something outside
// this list the user can still use "Edit all details" for the full set,
// but 95% of corrections fall into these.
const QUICK_MATERIALS: Material[] = [
  "cotton",
  "denim",
  "leather",
  "knit",
  "wool",
  "polyester",
  "linen",
];
const QUICK_PATTERNS: Pattern[] = [
  "solid",
  "striped",
  "plaid",
  "floral",
  "graphic",
  "polka-dot",
];

export default function ReviewBatchPageRoute() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-xl px-4 pt-6">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      }
    >
      <ReviewBatchPage />
    </Suspense>
  );
}

function ReviewBatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const labels = useLabels();
  const rawIds = searchParams.get("ids") ?? "";
  const ids = useMemo(
    () =>
      rawIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [rawIds]
  );

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            const res = await fetch(`/api/items/${id}`);
            if (!res.ok) return null;
            return (await res.json()) as ClothingItem;
          })
        );
        if (!cancelled) {
          setItems(results.filter((x): x is ClothingItem => Boolean(x)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (ids.length > 0) loadAll();
    else setLoading(false);
    return () => {
      cancelled = true;
    };
  }, [ids]);

  function patchEdit(id: string, changes: Partial<Edit>) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...changes } }));
  }

  async function saveAll() {
    if (Object.keys(edits).length === 0) {
      router.push("/wardrobe");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const results = await Promise.all(
        Object.entries(edits).map(async ([id, changes]) => {
          if (!changes.name || !changes.name.trim()) {
            // Don't blank out a name on save.
            delete changes.name;
          }
          const body: Record<string, unknown> = {};
          if (changes.name !== undefined) body.name = changes.name.trim();
          if (changes.category !== undefined) body.category = changes.category;
          if (changes.subcategory !== undefined) {
            body.subcategory = changes.subcategory || null;
          }
          // Empty arrays mean "user ended up with nothing selected" — skip
          // the field so we don't override their intent with a default
          // they didn't pick. (The chip toggle also prevents this path in
          // the common case.)
          if (changes.material !== undefined && changes.material.length > 0) {
            body.material = changes.material;
          }
          if (changes.pattern !== undefined && changes.pattern.length > 0) {
            body.pattern = changes.pattern;
          }
          try {
            const res = await fetch(`/api/items/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            return { id, ok: res.ok };
          } catch {
            return { id, ok: false };
          }
        })
      );
      const failedIds = results.filter((r) => !r.ok).map((r) => r.id);
      if (failedIds.length > 0) {
        // Keep only the failed items in `edits` so pressing Save again
        // retries just those. Clear the successful ones — they don't
        // need to be PATCHed a second time.
        setEdits((prev) => {
          const next: typeof prev = {};
          for (const id of failedIds) {
            if (prev[id]) next[id] = prev[id];
          }
          return next;
        });
        setError(
          `${failedIds.length} item${failedIds.length === 1 ? "" : "s"} failed to save. Press Save again to retry those.`
        );
        setSaving(false);
        return;
      }
      router.push("/wardrobe");
    } catch (err) {
      console.error("[review] saveAll failed", err);
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-6">
        <p className="text-sm text-muted-foreground">
          Nothing to review. Head back to your wardrobe.
        </p>
        <Button className="mt-4" onClick={() => router.push("/wardrobe")}>
          Go to wardrobe
        </Button>
      </div>
    );
  }

  const hasEdits = Object.keys(edits).length > 0;

  return (
    <div className="mx-auto max-w-xl px-4 pt-4 pb-36">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/wardrobe")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading text-2xl font-medium tracking-tight">Review your uploads</h1>
          <p className="text-xs text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} — tweak anything
            that looks off, then save.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          const draft = edits[item.id] ?? {};
          const effectiveName = draft.name ?? item.name;
          const effectiveCategory = (draft.category ?? item.category) as Category;
          // Important: once the user has explicitly cleared the subcategory
          // (draft.subcategory === null), we want to render the cleared
          // state — NOT fall back to the server value. `??` would do that,
          // so check for `undefined` explicitly.
          const effectiveSub =
            draft.subcategory !== undefined
              ? draft.subcategory ?? ""
              : item.subcategory ?? "";
          // Legacy items may have a scalar or an undefined material/pattern,
          // so normalise to a cleaned array (strip falsy values) to keep
          // the chip row from rendering an "undefined ×" pill.
          const normalize = <T,>(v: unknown): T[] => {
            if (Array.isArray(v)) return v.filter(Boolean) as T[];
            if (v) return [v as T];
            return [];
          };
          const effectiveMaterials: Material[] =
            draft.material ?? normalize<Material>(item.material);
          const effectivePatterns: Pattern[] =
            draft.pattern ?? normalize<Pattern>(item.pattern);
          // Chip toggle: adding is always safe; removing refuses to empty
          // the list — material/pattern can't be blank in the schema, and
          // silently defaulting the user back to "cotton" would override
          // their intent. Last chip stays selected; user must pick a
          // replacement first.
          function toggleMaterial(m: Material) {
            const has = effectiveMaterials.includes(m);
            if (has && effectiveMaterials.length === 1) return;
            patchEdit(item.id, {
              material: has
                ? effectiveMaterials.filter((x) => x !== m)
                : [...effectiveMaterials, m],
            });
          }
          function togglePattern(p: Pattern) {
            const has = effectivePatterns.includes(p);
            if (has && effectivePatterns.length === 1) return;
            patchEdit(item.id, {
              pattern: has
                ? effectivePatterns.filter((x) => x !== p)
                : [...effectivePatterns, p],
            });
          }
          const subOptions =
            effectiveCategory && effectiveCategory in labels.SUBCATEGORY_OPTIONS
              ? labels.SUBCATEGORY_OPTIONS[effectiveCategory]
              : [];
          return (
            <div
              key={item.id}
              className="rounded-xl border bg-card p-3 flex gap-3"
            >
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                <Image
                  src={item.image_url}
                  alt={effectiveName}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Name</Label>
                  <Input
                    value={effectiveName}
                    onChange={(e) => patchEdit(item.id, { name: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      Category
                    </Label>
                    <Select
                      value={effectiveCategory}
                      onValueChange={(v) =>
                        patchEdit(item.id, {
                          category: v as Category,
                          subcategory: null,
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue>
                          {(value) =>
                            value ? labels.CATEGORY[value as Category] : null
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                          <SelectItem key={c} value={c}>
                            {labels.CATEGORY[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      Subcategory
                    </Label>
                    <Select
                      value={effectiveSub || "__none__"}
                      onValueChange={(v) =>
                        patchEdit(item.id, {
                          subcategory: v === "__none__" ? null : (v as Subcategory),
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue>
                          {(value) =>
                            value && value !== "__none__"
                              ? subOptions.find((o) => o.value === value)?.label ??
                                value
                              : "—"
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {subOptions.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Material quick-picks. Extra selections (silk, lace,
                    etc.) live behind "Edit all details". */}
                <div>
                  <Label className="text-[11px] text-muted-foreground">Material</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {/* Any AI-chosen materials not in the quick list get
                        rendered up front so the user can see them. */}
                    {effectiveMaterials
                      .filter((m) => !QUICK_MATERIALS.includes(m))
                      .map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => toggleMaterial(m)}
                          className="rounded-full bg-foreground text-white px-2 py-0.5 text-[11px]"
                        >
                          {m} ×
                        </button>
                      ))}
                    {QUICK_MATERIALS.map((m) => {
                      const on = effectiveMaterials.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => toggleMaterial(m)}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] border transition-colors",
                            on
                              ? "bg-foreground text-white border-foreground"
                              : "bg-background text-muted-foreground border-muted-foreground/30 hover:border-foreground hover:text-foreground"
                          )}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pattern quick-picks */}
                <div>
                  <Label className="text-[11px] text-muted-foreground">Pattern</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {effectivePatterns
                      .filter((p) => !QUICK_PATTERNS.includes(p))
                      .map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePattern(p)}
                          className="rounded-full bg-foreground text-white px-2 py-0.5 text-[11px]"
                        >
                          {p} ×
                        </button>
                      ))}
                    {QUICK_PATTERNS.map((p) => {
                      const on = effectivePatterns.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePattern(p)}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] border transition-colors",
                            on
                              ? "bg-foreground text-white border-foreground"
                              : "bg-background text-muted-foreground border-muted-foreground/30 hover:border-foreground hover:text-foreground"
                          )}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color chips (preview-only) + deep-edit escape hatch. */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex items-center gap-1">
                    {item.colors.slice(0, 3).map((c, i) => (
                      <span
                        key={i}
                        className="h-3.5 w-3.5 rounded-full border"
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    ))}
                  </div>
                  <Link
                    href={`/wardrobe/${item.id}?edit=1`}
                    className="ml-auto text-[11px] text-foreground hover:underline inline-flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit all details
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="fixed bottom-20 inset-x-4 max-w-xl sm:static sm:mt-6 sm:inset-auto">
        <Button
          size="lg"
          className="w-full h-12 shadow-lg sm:shadow-none"
          onClick={saveAll}
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : hasEdits ? (
            `Save ${Object.keys(edits).length} change${Object.keys(edits).length === 1 ? "" : "s"}`
          ) : (
            t("bulk.goToWardrobe")
          )}
        </Button>
      </div>
    </div>
  );
}
