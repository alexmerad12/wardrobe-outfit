"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SUBCATEGORY_OPTIONS, type ClothingItem, type Category } from "@/lib/types";
import { ClothingCard, ClothingCardSkeleton } from "@/components/clothing-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  OutfitDetailsDialog,
  type OutfitDetails,
} from "@/components/outfit-details-dialog";
import {
  Plus,
  Trash2,
  X,
  CheckSquare,
  CheckCheck,
  Combine,
  Archive,
  Search,
  Sparkles,
  Shirt,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useLocale } from "@/lib/i18n/use-locale";
import { useScrollDirection } from "@/lib/use-scroll-direction";
import { cn } from "@/lib/utils";
import {
  usePendingUploads,
  pendingErrorLabel,
  type PendingItem,
} from "@/lib/pending-uploads-context";
import { UploadPreviewImage } from "@/components/upload-preview-image";

const ALL_CATEGORIES: (Category | "all" | "favorites" | "stored")[] = [
  "all",
  "top",
  "bottom",
  "dress",
  "one-piece",
  "outerwear",
  "shoes",
  "bag",
  "accessory",
  "favorites",
  "stored",
];

export default function WardrobePage() {
  return (
    <Suspense>
      <WardrobePageInner />
    </Suspense>
  );
}

function WardrobePageInner() {
  const searchParams = useSearchParams();
  // Initial category honors ?category= in the URL so returning from an
  // item detail drops the user back on the tab they came from.
  const initialCategory = (() => {
    const c = searchParams.get("category");
    if (!c) return "all";
    return (ALL_CATEGORIES as readonly string[]).includes(c)
      ? (c as Category | "all" | "favorites" | "stored")
      : "all";
  })();
  // Subcategory drill-down also honors ?subcategory= so back-nav from
  // an item detail lands on the exact drilled view (e.g. tops/shirts).
  const initialSubcategory = searchParams.get("subcategory") ?? "all";
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category | "all" | "favorites" | "stored">(initialCategory);
  // Subcategory drill-down — "all" = show everything in the category.
  // Reset on user-driven category changes (handled in the effect below)
  // so switching tabs gives a clean view, but persisted on first mount
  // so back-nav from item detail keeps the drill-down.
  const [activeSubcategory, setActiveSubcategory] = useState<string>(initialSubcategory);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [creatingOutfit, setCreatingOutfit] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Welcome card visibility — defaults to dismissed so the card doesn't
  // flash for established users between mount and the localStorage read.
  // useEffect below flips it on for first-time users.
  const [welcomeDismissed, setWelcomeDismissed] = useState(true);
  const router = useRouter();
  const { t } = useLocale();
  // Ref to the active category pill so we can scroll it into view when
  // the page mounts on a non-default category (e.g. returning from an
  // item detail on the Shoes tab).
  const activeCategoryRef = useRef<HTMLButtonElement | null>(null);
  const scrollDir = useScrollDirection();

  const {
    items: pending,
    retry,
    dismiss,
    dismissAllFailed,
    clearReady,
    onItemSaved,
    setFabSuppressed,
  } = usePendingUploads();

  // Distinguish "fetch failed" from "wardrobe is empty": a network
  // failure used to leave items=[] and show an established user the
  // first-run empty state (audit P1). Only the INITIAL load flips to
  // the error screen — a failed background refetch (save events) keeps
  // showing the data we already have.
  const [loadFailed, setLoadFailed] = useState(false);
  const hasLoadedRef = useRef(false);

  const refetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/items");
      if (!res.ok) throw new Error(`/api/items ${res.status}`);
      const data = await res.json();
      setItems(data);
      hasLoadedRef.current = true;
      setLoadFailed(false);
    } catch (err) {
      console.error("Failed to fetch items:", err);
      if (!hasLoadedRef.current) setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    refetchItems().finally(() => setLoading(false));
  }, [refetchItems]);

  // Suppress the floating "+" while the true-empty card is on screen —
  // the card already carries the add CTAs and a second affordance
  // confused first-time users (beta feedback). Restored on unmount and
  // the moment the first item lands.
  const trueEmpty =
    !loading && !loadFailed && items.length === 0 && pending.length === 0;
  useEffect(() => {
    setFabSuppressed(trueEmpty);
    return () => setFabSuppressed(false);
  }, [trueEmpty, setFabSuppressed]);

  // Read welcome-card dismissal from localStorage on mount. If never
  // dismissed, show the card (auto-hide threshold is handled below by
  // the showWelcomeCard derived flag).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = localStorage.getItem("wardrobe-welcome-dismissed") === "true";
    setWelcomeDismissed(dismissed);
  }, []);

  function dismissWelcome() {
    setWelcomeDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("wardrobe-welcome-dismissed", "true");
    }
  }

  // Bring the active category pill into view whenever it changes (mount
  // with a non-default category, tapping a different tab, etc.) so the
  // user doesn't have to scroll the filter bar by hand.
  useEffect(() => {
    activeCategoryRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeCategory]);

  // User-driven category switch — reset subcategory to "all" so they
  // land on a clean view of the new tab. Kept off the effect so a
  // URL-restored drill-down (returning from item detail) isn't wiped
  // by Strict Mode's double-invoke or any synthetic state churn.
  function handleCategoryChange(cat: Category | "all" | "favorites" | "stored") {
    setActiveCategory(cat);
    if (cat !== activeCategory) setActiveSubcategory("all");
  }

  // Keep the URL in sync with the filter state so navigating to an item
  // and pressing back (either the app arrow or the browser back button)
  // returns the user to the same tab AND drilled subcategory.
  // router.replace avoids piling extra history entries.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (activeCategory !== "all") qs.set("category", activeCategory);
    if (activeSubcategory !== "all") qs.set("subcategory", activeSubcategory);
    const next = qs.toString() ? `/wardrobe?${qs.toString()}` : "/wardrobe";
    const currentCat = searchParams.get("category") ?? "all";
    const currentSub = searchParams.get("subcategory") ?? "all";
    if (currentCat !== activeCategory || currentSub !== activeSubcategory) {
      router.replace(next, { scroll: false });
    }
  }, [activeCategory, activeSubcategory, router, searchParams]);

  // Refetch the grid whenever a background upload saves, so fresh items
  // appear in place of their pending tiles.
  useEffect(() => {
    return onItemSaved(() => {
      void refetchItems();
    });
  }, [onItemSaved, refetchItems]);

  // Auto-nav on batch-complete lives in /wardrobe/uploading now — the
  // uploading page is where the user is for the duration of processing.
  // This page keeps the "Review your N uploads" CTA in the pending strip
  // as a manual fallback if something lands here with ready items.

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (
      !confirm(
        t(selected.size === 1 ? "wardrobe.confirmBulkDelete" : "wardrobe.confirmBulkDeletePlural", {
          count: selected.size,
        })
      )
    )
      return;

    setDeleting(true);
    try {
      const results = await Promise.all(
        Array.from(selected).map(async (id) => {
          const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
          return { id, ok: res.ok };
        })
      );
      // Only remove what the server actually deleted — HTTP failures
      // used to vanish items from the grid until the next refresh
      // resurrected them (audit P2).
      const deletedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
      setItems((prev) => prev.filter((item) => !deletedIds.has(item.id)));
      exitSelectMode();
      if (deletedIds.size < results.length) {
        alert(t("common.saveFailed"));
      }
    } catch (err) {
      console.error("Failed to delete items:", err);
      alert(t("common.saveFailed"));
    } finally {
      setDeleting(false);
    }
  }

  function openOutfitNameDialog() {
    if (selected.size < 2) return;
    setNameDialogOpen(true);
  }

  async function handleCreateOutfit(values: OutfitDetails) {
    if (selected.size < 2) return;
    setCreatingOutfit(true);
    try {
      const res = await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "default",
          name: values.name,
          item_ids: Array.from(selected),
          occasions: values.occasion ? [values.occasion] : [],
          seasons: [],
          rating: null,
          is_favorite: true,
          mood: values.mood,
          weather_temp: null,
          weather_condition: null,
          ai_reasoning: null,
          style_notes: values.style_notes,
          source: "manual",
        }),
      });
      if (!res.ok) throw new Error(`/api/outfits ${res.status}`);
      setNameDialogOpen(false);
      exitSelectMode();
      router.push("/outfits");
    } catch (err) {
      // Was completely silent — the dialog just sat there (audit P2).
      console.error("Failed to create outfit:", err);
      alert(t("common.saveFailed"));
    } finally {
      setCreatingOutfit(false);
    }
  }

  async function handleBulkStore(store: boolean) {
    try {
      const results = await Promise.all(
        Array.from(selected).map(async (id) => {
          const res = await fetch(`/api/items/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_stored: store }),
          });
          return { id, ok: res.ok };
        })
      );
      const updatedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
      setItems((prev) =>
        prev.map((item) =>
          updatedIds.has(item.id) ? { ...item, is_stored: store } : item
        )
      );
      exitSelectMode();
      if (updatedIds.size < results.length) {
        alert(t("common.saveFailed"));
      }
    } catch (err) {
      console.error("Failed to store items:", err);
      alert(t("common.saveFailed"));
    }
  }

  const storedCount = items.filter((i) => i.is_stored).length;
  const favoriteCount = items.filter((i) => i.is_favorite && !i.is_stored).length;
  // Sparse-wardrobe welcome card — only visible to first-time users
  // before they've built a real wardrobe. Auto-hides at >=5 active
  // items so it stops showing once they're past onboarding, and
  // respects manual dismissal via localStorage in case a user wants
  // it gone immediately.
  const activeItemCount = items.filter((i) => !i.is_stored).length;
  const showWelcomeCard =
    !loading && !welcomeDismissed && activeItemCount > 0 && activeItemCount < 5;

  const categoryFiltered =
    activeCategory === "stored"
      ? items.filter((item) => item.is_stored)
      : activeCategory === "favorites"
      ? items.filter((item) => item.is_favorite && !item.is_stored)
      : activeCategory === "all"
      ? items.filter((item) => !item.is_stored)
      : items.filter((item) => item.category === activeCategory && !item.is_stored);

  // Subcategory pill row: only show when a real category is active and
  // the user actually has multiple subcategories worth filtering by.
  // Derive the available subcategories from the items themselves so we
  // don't render empty pills for subcategories the user doesn't own.
  const availableSubcategories: string[] = (() => {
    if (activeCategory === "all" || activeCategory === "stored" || activeCategory === "favorites") return [];
    const seen = new Set<string>();
    for (const item of categoryFiltered) {
      if (item.subcategory) seen.add(item.subcategory);
    }
    // Sort by the canonical order in SUBCATEGORY_OPTIONS — without this
    // the pills render in upload-order (whichever item was added first
    // wins its subcategory's slot), which makes dresses show as e.g.
    // "Maxi / Midi / Mini" instead of the conventional small-to-large
    // "Mini / Midi / Maxi". Same fix applies to all categories.
    const canonical = SUBCATEGORY_OPTIONS[activeCategory as Category];
    if (!canonical) return Array.from(seen);
    const order = new Map(canonical.map((opt, i) => [opt.value as string, i]));
    return Array.from(seen).sort(
      (a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999)
    );
  })();

  const subcategoryFiltered =
    activeSubcategory === "all"
      ? categoryFiltered
      : categoryFiltered.filter((item) => item.subcategory === activeSubcategory);

  // Name search is applied after the category + subcategory filters so
  // users can narrow to "dresses → mini-dress" first and then type a
  // keyword. Empty query = no filter.
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = trimmedQuery
    ? subcategoryFiltered.filter((item) => item.name.toLowerCase().includes(trimmedQuery))
    : subcategoryFiltered;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      {/* Header */}
      {selectMode ? (
        // Stick the select-mode bar to the top so the bulk actions stay
        // reachable while scrolling through the grid. Negative -mx-4 + px-4
        // makes the frosted background extend to the viewport edges within
        // the page's max-width container. -mt-6 + pt-6 cancels the page's
        // top padding so the bar starts flush. min-h-[88px] keeps the bar
        // the same height as the normal header so the sticky offsets on
        // the category/subcategory strips below (top-[92px], top-[136px])
        // stay accurate — without this the strips dock 24px below the
        // shorter select bar with empty page bleeding through the gap.
        <div className="sticky top-[env(safe-area-inset-top)] z-30 -mx-4 -mt-6 mb-4 flex min-h-[88px] flex-col justify-center border-b bg-background px-4 pb-3 pt-6">
          <div className="flex items-center justify-between gap-2">
            {/* Left slot: exit + count + labeled Select-all button.
                Count uses muted text-color and no bold so it reads as
                passive status; the Select-all button stays a real
                button shape (icon + label, foreground color) so it
                reads as an action. ml-2 inserts an explicit gap
                between the count text and the button — without it
                they collapsed into one phrase ("3 selected — select
                all"); with it they're clearly two separate UI roles
                sitting on the same line. */}
            <div className="flex items-center gap-2 min-w-0">
              <Button size="icon" variant="ghost" onClick={exitSelectMode}>
                <X className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground truncate">
                {t("wardrobe.nSelected", { count: selected.size })}
              </span>
              {filteredItems.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-2 gap-1.5"
                  onClick={() => {
                    const visibleIds = filteredItems.map((i) => i.id);
                    const allVisibleSelected = visibleIds.every((id) =>
                      selected.has(id)
                    );
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (allVisibleSelected) {
                        visibleIds.forEach((id) => next.delete(id));
                      } else {
                        visibleIds.forEach((id) => next.add(id));
                      }
                      return next;
                    });
                  }}
                >
                  <CheckCheck className="h-4 w-4" />
                  {filteredItems.every((i) => selected.has(i.id))
                    ? t("wardrobe.deselectAll")
                    : t("wardrobe.selectAll")}
                </Button>
              )}
            </div>
            {/* Action group on the right — bulk operations. Icon-only
                with aria-labels + title tooltips so they fit on a
                375 px phone without crowding the count + Select-all
                pair on the left. */}
            <div className="flex gap-1.5 shrink-0">
              <Button
                size="icon"
                disabled={selected.size < 2 || creatingOutfit}
                onClick={openOutfitNameDialog}
                aria-label={t("wardrobe.outfit")}
                title={t("wardrobe.outfit")}
              >
                <Combine className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                disabled={selected.size === 0}
                onClick={() => handleBulkStore(activeCategory !== "stored")}
                aria-label={
                  activeCategory === "stored"
                    ? t("wardrobe.unstore")
                    : t("wardrobe.store")
                }
                title={
                  activeCategory === "stored"
                    ? t("wardrobe.unstore")
                    : t("wardrobe.store")
                }
              >
                <Archive className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={selected.size === 0 || deleting}
                onClick={handleBulkDelete}
                aria-label={t("common.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="sticky top-[env(safe-area-inset-top)] z-30 -mx-4 -mt-6 mb-4 border-b bg-background px-4 pb-3 pt-6">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate font-heading text-3xl font-medium tracking-tight">{t("wardrobe.title")}</h1>
              <p className="text-sm text-muted-foreground">
                <span className="font-heading">{items.filter((i) => !i.is_stored).length}</span> {items.filter((i) => !i.is_stored).length === 1 ? t("wardrobe.items") : t("wardrobe.itemsPlural")}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <>
              {items.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  aria-label={t("wardrobe.search")}
                  onClick={() => {
                    setSearchOpen((v) => {
                      if (v) setSearchQuery("");
                      return !v;
                    });
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}
              {items.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t("wardrobe.select")}
                  onClick={() => setSelectMode(true)}
                >
                  <CheckSquare className="h-4 w-4" />
                </Button>
              )}
              {/* Add button removed — superseded by the global FAB
                  (AddItemFab) which lives just above the bottom nav
                  on every screen. The header now keeps only the
                  context-specific affordances (Search, Select) so
                  Wardrobe doesn't double-up on the create action. */}
            </>
            </div>
          </div>
          {/* Collapsible search input — opens below the header when the
              search button is toggled on. Auto-clears when closed. */}
          {searchOpen && (
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("wardrobe.searchPlaceholder")}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label={t("common.cancel")}
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Category filters — sticky strip that hides on scroll-down
          and slides back into view on scroll-up so users can switch
          tabs without scrolling all the way to the top. Hidden entirely
          on an empty wardrobe — categories filter nothing when there's
          nothing to filter, and the strip competes with the empty-state
          welcome card for vertical space. */}
      {items.length > 0 && (
      <div
        className={cn(
          "sticky top-[calc(92px+env(safe-area-inset-top))] z-20 -mx-4 mb-4 flex gap-2 overflow-x-auto bg-background px-4 pb-2 pt-1 scrollbar-hide transition-transform duration-200",
          scrollDir === "down" ? "-translate-y-full" : "translate-y-0"
        )}
      >
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            ref={cat === activeCategory ? activeCategoryRef : undefined}
            onClick={() => handleCategoryChange(cat)}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {cat === "stored"
              ? `${t("categoryTab.stored")}${storedCount > 0 ? ` (${storedCount})` : ""}`
              : cat === "favorites"
              ? `${t("categoryTab.favorites")}${favoriteCount > 0 ? ` (${favoriteCount})` : ""}`
              : t(`categoryTab.${cat}`)}
          </button>
        ))}
      </div>
      )}

      {/* Subcategory drill-down pills — only visible when a real
          category is active and the user has at least 2 distinct
          subcategories worth filtering by. "All" stays the default
          so users can browse every item in the category by default. */}
      {availableSubcategories.length >= 2 && (
        <div
          className={cn(
            "sticky top-[calc(136px+env(safe-area-inset-top))] z-20 -mx-4 mb-4 flex gap-2 overflow-x-auto bg-background px-4 pb-2 pt-1 scrollbar-hide transition-transform duration-200",
            // -translate-y-[120px] moves the bar far enough up that
            // its bottom edge clears the header on scroll-down. The
            // category bar gets away with -translate-y-full because
            // it's only ~44px from the header; this bar is 80px
            // further down and its own height isn't enough.
            scrollDir === "down" ? "-translate-y-[120px]" : "translate-y-0"
          )}
        >
          <button
            onClick={() => setActiveSubcategory("all")}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeSubcategory === "all"
                ? "bg-foreground text-background"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {t("categoryTab.all")}
          </button>
          {availableSubcategories.map((sub) => (
            <button
              key={sub}
              onClick={() => setActiveSubcategory(sub)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeSubcategory === sub
                  ? "bg-foreground text-background"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {t(`subcategory.${sub}`)}
            </button>
          ))}
        </div>
      )}

      {/* Pending uploads (shown on the "all" view so they don't disappear
          when the user is filtering by category) */}
      {activeCategory === "all" && (
        <PendingStrip
          pending={pending}
          onRetry={retry}
          onDismiss={dismiss}
          onDismissAllFailed={dismissAllFailed}
          onStartReview={(firstId, restIds) => {
            clearReady();
            // Per-item wizard: lands on the first item in edit mode with
            // the remaining IDs chained via ?next=. Save & Next on each
            // page saves the edit and hops forward. Matches how the
            // single-item add flow edits one item, just repeated.
            const qs = new URLSearchParams({ edit: "1" });
            if (restIds.length > 0) qs.set("next", restIds.join(","));
            router.push(`/wardrobe/${firstId}?${qs.toString()}`);
          }}
        />
      )}

      {/* Sparse-wardrobe welcome card — teaches the wardrobe-specific
          actions a first-time user wouldn't know to look for (tap to
          edit, multi-select for bulk actions, the new category filters).
          Only on the "all" view so it doesn't fight the filter narrative,
          and only while activeItemCount is 1-4. */}
      {activeCategory === "all" && showWelcomeCard && (
        <div className="relative mb-4 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
          <button
            type="button"
            onClick={dismissWelcome}
            aria-label={t("common.dismiss")}
            className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="font-medium text-sm mb-2 pr-6">
            {t("wardrobe.welcomeTitle")}
          </p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-foreground/70">
            <li>• {t("wardrobe.welcomeTipTap")}</li>
            <li>• {t("wardrobe.welcomeTipSelect")}</li>
            <li>• {t("wardrobe.welcomeTipFilter")}</li>
          </ul>
        </div>
      )}

      {/* Items grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ClothingCardSkeleton key={i} />
          ))}
        </div>
      ) : loadFailed && items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">{t("common.loadFailed")}</p>
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              setLoadFailed(false);
              refetchItems().finally(() => setLoading(false));
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : filteredItems.length === 0 && pending.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-12 text-center">
          {/* Three different empty states:
              1. Wardrobe truly empty → invite to bulk-upload first items.
              2. "Stored" filter with nothing stored → teach the user how
                 to pack an item away (the storage feature is buried at
                 the bottom of the item edit form, easy to miss).
              3. Other filter with nothing matching → simple "no items". */}
          {items.length === 0 ? (
            <>
              <Shirt className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="font-heading text-lg mb-1.5">{t("wardrobe.empty")}</p>
              <p className="text-sm text-muted-foreground mb-5">
                {t("wardrobe.emptySubtitle")}
              </p>
              <Button
                className="gap-1.5"
                onClick={() => router.push("/wardrobe/add")}
              >
                <Plus className="h-4 w-4" />
                {t("wardrobe.addFirstItem")}
              </Button>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => router.push("/wardrobe/bulk")}
                  className="text-xs text-foreground/80 underline underline-offset-2"
                >
                  {t("home.uploadMany")}
                </button>
              </div>
              <div className="mt-7 pt-5 border-t border-muted-foreground/10 text-left">
                <p className="text-xs font-medium text-foreground mb-3">
                  {t("wardrobe.emptyPreviewTitle")}
                </p>
                <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <li>• {t("wardrobe.welcomeTipTap")}</li>
                  <li>• {t("wardrobe.welcomeTipSelect")}</li>
                  <li>• {t("wardrobe.welcomeTipFilter")}</li>
                </ul>
              </div>
            </>
          ) : activeCategory === "stored" ? (
            <div className="space-y-2">
              <p className="font-medium">{t("wardrobe.noneInStorageTitle")}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("wardrobe.noneInStorageHint")}
              </p>
            </div>
          ) : activeCategory === "favorites" ? (
            <div className="space-y-2">
              <p className="font-medium">{t("wardrobe.noneInFavoritesTitle")}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("wardrobe.noneInFavoritesHint")}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">{t("wardrobe.noneInCategory")}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filteredItems.map((item) => (
            <ClothingCard
              key={item.id}
              item={item}
              selectMode={selectMode}
              isSelected={selected.has(item.id)}
              onToggleSelect={() => toggleSelect(item.id)}
              fromCategory={activeCategory !== "all" ? activeCategory : undefined}
              fromSubcategory={activeSubcategory !== "all" ? activeSubcategory : undefined}
            />
          ))}
        </div>
      )}

      {/* Create-outfit details dialog. Shared with the favorites edit
          flow — same component, different mode. */}
      <OutfitDetailsDialog
        open={nameDialogOpen}
        onOpenChange={setNameDialogOpen}
        mode="create"
        submitting={creatingOutfit}
        onSubmit={handleCreateOutfit}
      />
    </div>
  );
}

const MAX_INLINE_TILES = 6;

function PendingStrip({
  pending,
  onRetry,
  onDismiss,
  onDismissAllFailed,
  onStartReview,
}: {
  pending: PendingItem[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onDismissAllFailed: () => void;
  onStartReview: (firstId: string, restIds: string[]) => void;
}) {
  const { t } = useLocale();
  // Ready items are shown separately as a "Review uploads" CTA, not as
  // tiles in the grid.
  const readySaved = pending.filter(
    (p) => p.stage === "ready" && p.savedItemId
  );
  const readyIds = readySaved
    .map((p) => p.savedItemId)
    .filter((id): id is string => Boolean(id));
  const inFlight = pending.filter((p) => p.stage !== "ready");
  if (pending.length === 0) return null;
  const processing = inFlight.filter((p) => p.stage !== "error").length;
  const errorCount = inFlight.length - processing;
  const visible = inFlight.slice(0, MAX_INLINE_TILES);
  const overflow = inFlight.length - visible.length;
  const firstError = pendingErrorLabel(
    inFlight.find((p) => p.stage === "error")?.error,
    t
  );

  function copyErrors() {
    const failed = pending.filter((p) => p.stage === "error");
    const dump = failed
      .map(
        (p, i) =>
          `${i + 1}. ${p.file.name} (${Math.round(p.file.size / 1024)} KB, ${p.file.type || "unknown"})\n   ${p.error ?? "Unknown error"}`
      )
      .join("\n\n");
    const summary = `Linette upload errors — ${failed.length} of ${pending.length} failed\n\n${dump}`;
    void navigator.clipboard?.writeText(summary);
  }

  return (
    <div className="mb-4 rounded-xl border border-border px-4 py-3 bg-muted/30">
      {/* Review CTA — shown prominently when there are just-saved items
          waiting to be reviewed. Clicking it steps through each item's
          edit form one at a time. */}
      {readyIds.length > 0 && (
        <button
          type="button"
          onClick={() => onStartReview(readyIds[0], readyIds.slice(1))}
          className="mb-3 flex w-full items-center justify-between gap-2 rounded-lg bg-foreground px-4 py-2.5 text-left text-background shadow-sm hover:bg-foreground/90 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium truncate">
              {t(
                readyIds.length === 1
                  ? "wardrobe.reviewUploads"
                  : "wardrobe.reviewUploadsPlural",
                { count: readyIds.length }
              )}
            </span>
          </div>
          <span className="text-sm shrink-0">→</span>
        </button>
      )}

      {inFlight.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="text-sm font-medium truncate">
                {processing > 0
                  ? t(processing === 1 ? "wardrobe.addingCount" : "wardrobe.addingCountPlural", { count: processing })
                  : t("wardrobe.someUploadsNeedAttention")}
                {errorCount > 0 && processing > 0 && ` · ${t("wardrobe.uploadFailedCount", { count: errorCount })}`}
              </span>
            </div>
            {inFlight.length > MAX_INLINE_TILES && (
              <Link
                href="/wardrobe/bulk"
                className="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                {t("wardrobe.viewAll")}
              </Link>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {visible.map((p) => (
              <PendingTile
                key={p.id}
                item={p}
                onRetry={() => onRetry(p.id)}
                onDismiss={() => onDismiss(p.id)}
              />
            ))}
            {overflow > 0 && (
              <Link
                href="/wardrobe/bulk"
                className="relative aspect-square overflow-hidden rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs font-medium hover:bg-muted/80"
              >
                +{overflow}
              </Link>
            )}
          </div>
        </>
      )}
      {firstError ? (
        <div className="mt-2 rounded-md bg-red-50 border border-red-200 px-2.5 py-1.5 text-xs text-red-800">
          <div>
            <span className="font-medium">{t("wardrobe.failed")} </span>
            <span className="break-words">{firstError}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={onDismissAllFailed}
              className="text-[11px] font-medium text-red-700 hover:text-red-900 underline"
            >
              {t("wardrobe.dismissAllFailed", { count: errorCount })}
            </button>
            <span className="text-red-400">·</span>
            <button
              type="button"
              onClick={copyErrors}
              className="text-[11px] font-medium text-red-700 hover:text-red-900 underline"
            >
              {t("wardrobe.copyErrorDetails")}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("wardrobe.keepUsingLinette")}
        </p>
      )}
    </div>
  );
}

function PendingTile({
  item,
  onRetry,
  onDismiss,
}: {
  item: PendingItem;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLocale();
  const isError = item.stage === "error";
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-card">
      <UploadPreviewImage
        src={item.previewUrl}
        className="h-full w-full object-contain opacity-70"
      />
      {isError ? (
        <button
          type="button"
          onClick={onRetry}
          className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-red-950/60 text-white"
          title={item.error ? t("wardrobe.tapToRetryWithError", { error: pendingErrorLabel(item.error, t) ?? "" }) : t("wardrobe.tapToRetry")}
        >
          <AlertCircle className="h-4 w-4" />
          <span className="text-[10px] font-medium">{t("wardrobe.retry")}</span>
        </button>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-4 w-4 animate-spin text-white" />
        </div>
      )}
      {isError && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-1 right-1 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
          title={t("wardrobe.removeFromList")}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
