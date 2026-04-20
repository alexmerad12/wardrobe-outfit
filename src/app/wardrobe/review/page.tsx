"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import type {
  Category,
  ClothingItem,
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
import { CATEGORY_LABELS, SUBCATEGORY_OPTIONS } from "@/lib/types";

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
};

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
          const body: Record<string, unknown> = {};
          if (changes.name !== undefined) body.name = changes.name;
          if (changes.category !== undefined) body.category = changes.category;
          if (changes.subcategory !== undefined) {
            body.subcategory = changes.subcategory || null;
          }
          const res = await fetch(`/api/items/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          return { id, ok: res.ok };
        })
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setError(`${failed.length} item${failed.length === 1 ? "" : "s"} failed to save`);
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
          <h1 className="text-xl font-semibold">Review your uploads</h1>
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
          const effectiveSub = draft.subcategory ?? item.subcategory ?? "";
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
                {/* Color chips (preview-only in this view). Deeper edits
                    go through the full per-item form. */}
                <div className="flex items-center gap-2">
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
                    className="ml-auto text-[11px] text-[#7c2d3a] hover:underline inline-flex items-center gap-1"
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
