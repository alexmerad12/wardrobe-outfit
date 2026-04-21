"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { uploadToSupabase } from "@/lib/upload-to-supabase";
import { usePendingUploads } from "@/lib/pending-uploads-context";
import type {
  ClothingItem,
  Category,
  Subcategory,
  Pattern,
  Material,
  Fit,
  BottomFit,
  Length,
  PantsLength,
  WaistStyle,
  WaistHeight,
  WaistClosure,
  ShoeHeight,
  HeelType,
  ShoeClosure,
  BeltPosition,
  BeltStyle,
  MetalFinish,
  Formality,
  Season,
  Occasion,
  Neckline,
  SleeveLength,
  Closure,
} from "@/lib/types";
import { useLocale } from "@/lib/i18n/use-locale";
import { useLabels } from "@/lib/i18n/use-labels";
import { getColorName } from "@/lib/color-engine";
import { FASHION_COLORS } from "@/lib/fashion-colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Heart,
  Trash2,
  Droplets,
  Thermometer,
  Pencil,
  Loader2,
  X,
  Camera,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { preloadBgRemoval, removeBg } from "@/lib/bg-removal";
import { toColorKey } from "@/lib/color-label";

export default function ItemDetailPage() {
  const { t } = useLocale();
  const labels = useLabels();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldAutoEdit = searchParams.get("edit") === "1";
  const { clearReady } = usePendingUploads();
  // Review wizard: /wardrobe/[id]?edit=1&next=id2,id3,id4 steps the user
  // through each newly-uploaded item. Save & Next advances to the head of
  // the list, carrying the rest along.
  const nextParam = searchParams.get("next") ?? "";
  const nextIds = nextParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hasNext = shouldAutoEdit && nextIds.length > 0;
  const [item, setItem] = useState<ClothingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("top");
  const [editSubcategory, setEditSubcategory] = useState<Subcategory | "">("");
  const [editFit, setEditFit] = useState<Fit>("regular");
  const [editBottomFit, setEditBottomFit] = useState<BottomFit>("regular");
  const [editLength, setEditLength] = useState<Length | null>(null);
  const [editPantsLength, setEditPantsLength] = useState<PantsLength | null>(null);
  const [editWaistStyle, setEditWaistStyle] = useState<WaistStyle | null>(null);
  const [editWaistHeight, setEditWaistHeight] = useState<WaistHeight>("mid");
  const [editWaistClosure, setEditWaistClosure] = useState<WaistClosure | null>(null);
  const [editBeltCompatible, setEditBeltCompatible] = useState(false);
  const [editLayering, setEditLayering] = useState(false);
  const [editShoeHeight, setEditShoeHeight] = useState<ShoeHeight>("low");
  const [editHeelType, setEditHeelType] = useState<HeelType>("flat");
  const [editShoeClosure, setEditShoeClosure] = useState<ShoeClosure | null>(null);
  const [editBeltStyle, setEditBeltStyle] = useState<BeltStyle | null>(null);
  const [editBeltPosition, setEditBeltPosition] = useState<BeltPosition>("waist");
  const [editMetalFinish, setEditMetalFinish] = useState<MetalFinish | null>(null);
  const [editNeckline, setEditNeckline] = useState<Neckline | null>(null);
  const [editSleeveLength, setEditSleeveLength] = useState<SleeveLength | null>(null);
  const [editClosure, setEditClosure] = useState<Closure | null>(null);
  const [editPatterns, setEditPatterns] = useState<Pattern[]>([]);
  const [editMaterials, setEditMaterials] = useState<Material[]>([]);
  const [editFormalities, setEditFormalities] = useState<Formality[]>(["casual"]);
  const [editSeasons, setEditSeasons] = useState<Season[]>([]);
  const [editOccasions, setEditOccasions] = useState<Occasion[]>([]);
  const [editWarmth, setEditWarmth] = useState(3);
  const [editRain, setEditRain] = useState(false);
  const [editStored, setEditStored] = useState(false);
  const [editBrand, setEditBrand] = useState("");
  const [editColors, setEditColors] = useState<{ hex: string; name: string; percentage: number }[]>([]);
  const [colorPickerValue, setColorPickerValue] = useState("#ffffff");
  const [showColorPalette, setShowColorPalette] = useState(false);

  useEffect(() => {
    async function fetchItem() {
      try {
        const res = await fetch(`/api/items/${params.id}`);
        if (res.ok) {
          setItem(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch item:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchItem();
  }, [params.id]);

  useEffect(() => {
    // Eagerly fetch the model weights so the first click is instant
    preloadBgRemoval();
  }, []);

  // When arriving from a freshly-processed upload (`?edit=1`), drop straight
  // into edit mode so users can correct any AI guesses in one tap.
  useEffect(() => {
    if (shouldAutoEdit && item && !editing) {
      startEditing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoEdit, item]);

  function startEditing() {
    if (!item) return;
    setEditName(item.name);
    setEditCategory(item.category);
    setEditSubcategory(item.subcategory ?? "");
    setEditFit(item.fit ?? "regular");
    setEditBottomFit(item.bottom_fit ?? "regular");
    setEditLength(item.length ?? null);
    setEditPantsLength(item.pants_length ?? null);
    setEditWaistStyle(item.waist_style ?? null);
    setEditWaistHeight(item.waist_height ?? "mid");
    setEditWaistClosure(item.waist_closure ?? null);
    setEditBeltCompatible(item.belt_compatible ?? false);
    setEditLayering(item.is_layering_piece ?? false);
    setEditShoeHeight(item.shoe_height ?? "low");
    setEditHeelType(item.heel_type ?? "flat");
    setEditShoeClosure(item.shoe_closure ?? null);
    setEditBeltStyle(item.belt_style ?? null);
    setEditBeltPosition(item.belt_position ?? "waist");
    setEditMetalFinish(item.metal_finish ?? null);
    setEditNeckline(item.neckline ?? null);
    setEditSleeveLength(item.sleeve_length ?? null);
    setEditClosure(item.closure ?? null);
    setEditPatterns(Array.isArray(item.pattern) ? item.pattern : [item.pattern]);
    setEditMaterials(Array.isArray(item.material) ? item.material : [item.material]);
    // Backwards compat: formality may be a single string on old items
    setEditFormalities(
      Array.isArray(item.formality)
        ? item.formality
        : [item.formality]
    );
    setEditSeasons(item.seasons);
    setEditOccasions(item.occasions);
    setEditWarmth(item.warmth_rating);
    setEditRain(item.rain_appropriate);
    setEditStored(item.is_stored ?? false);
    setEditBrand(item.brand ?? "");
    setEditColors([...item.colors]);
    setEditing(true);
  }

  // Helper booleans for EDIT mode visibility
  const editIsJeansTrousers = ["jeans", "trousers"].includes(editSubcategory);
  const editShowGenericFit =
    editCategory === "top" ||
    editCategory === "dress" ||
    editCategory === "outerwear" ||
    (editCategory === "bottom" && !editIsJeansTrousers);
  const editShowBottomFit = editCategory === "bottom" && editIsJeansTrousers;
  const editShowLength =
    (editCategory === "top" || editCategory === "outerwear") &&
    editSubcategory !== "crop-top";
  const editShowPantsLength =
    editCategory === "bottom" &&
    ["jeans", "trousers", "leggings", "sweatpants"].includes(editSubcategory);
  const editShowNeckline =
    ["top", "dress", "outerwear"].includes(editCategory) &&
    editSubcategory !== "hoodie" &&
    editSubcategory !== "cardigan";
  const editShowSleeveLength =
    ["top", "dress", "outerwear"].includes(editCategory) &&
    editSubcategory !== "tank-top";
  const editShowClosure =
    editCategory === "dress" ||
    editCategory === "outerwear" ||
    (editCategory === "top" && ["shirt", "blouse", "cardigan", "hoodie"].includes(editSubcategory));
  const editShowWaistStyle = ["top", "bottom", "dress", "outerwear"].includes(editCategory);
  const editShowWaistHeight = editCategory === "bottom" && editIsJeansTrousers;
  const editShowWaistClosure =
    editCategory === "bottom" &&
    ["jeans", "trousers", "leggings", "sweatpants"].includes(editSubcategory);
  const editShowBeltCompatible = ["top", "bottom", "dress", "outerwear"].includes(editCategory);
  const editShowLayeringPiece = editCategory === "top" || editCategory === "outerwear";
  const editShowShoeFields = editCategory === "shoes";
  const editShowBeltPosition = editCategory === "accessory" && editSubcategory === "belt";
  const editShowWarmth =
    !!editCategory &&
    editCategory !== "shoes" &&
    editCategory !== "accessory" &&
    editCategory !== "bag";

  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveEdit() {
    if (!item) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Upload new image if changed — via the same Supabase-tus path that
      // the pending bulk queue uses. (Was using the deleted /api/upload
      // Vercel-Blob endpoint, which is why Save Changes was silently
      // failing.)
      let imageUrl = item.image_url;
      if (newImageFile) {
        setUploadingImage(true);
        try {
          imageUrl = await uploadToSupabase(newImageFile);
        } finally {
          setUploadingImage(false);
        }
      }

      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          name: editName,
          category: editCategory,
          subcategory: editSubcategory || null,
          fit: editShowGenericFit ? editFit : null,
          bottom_fit: editShowBottomFit ? editBottomFit : null,
          length: editShowLength ? editLength : null,
          pants_length: editShowPantsLength ? editPantsLength : null,
          waist_style: editShowWaistStyle ? editWaistStyle : null,
          waist_height: editShowWaistHeight ? editWaistHeight : null,
          waist_closure: editShowWaistClosure ? editWaistClosure : null,
          belt_compatible: editBeltCompatible,
          is_layering_piece: editLayering,
          shoe_height: editShowShoeFields ? editShoeHeight : null,
          heel_type: editShowShoeFields ? editHeelType : null,
          shoe_closure: editShowShoeFields ? editShoeClosure : null,
          belt_position: editShowBeltPosition ? editBeltPosition : null,
          belt_style: editShowBeltPosition ? editBeltStyle : null,
          metal_finish: ["shoes", "accessory"].includes(editCategory) ? editMetalFinish : null,
          neckline: editShowNeckline ? editNeckline : null,
          sleeve_length: editShowSleeveLength ? editSleeveLength : null,
          closure: editShowClosure ? editClosure : null,
          pattern: editPatterns,
          material: editMaterials,
          formality: editFormalities,
          seasons: editSeasons,
          occasions: editOccasions,
          warmth_rating: editShowWarmth ? editWarmth : 3,
          rain_appropriate: editRain,
          is_stored: editStored,
          brand: editBrand || null,
          colors: editColors,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setItem(saved);
        setNewImageFile(null);
        setNewImagePreview(null);
        // Review wizard: if there are more items queued up, advance to
        // the next one. On the FINAL item the wizard exits by routing
        // back to /wardrobe — staying on an orphaned edit screen with
        // no clear exit was confusing users.
        if (hasNext) {
          const [head, ...rest] = nextIds;
          const qs = new URLSearchParams({ edit: "1" });
          if (rest.length > 0) qs.set("next", rest.join(","));
          router.push(`/wardrobe/${head}?${qs.toString()}`);
          return;
        }
        if (shouldAutoEdit) {
          // Wizard is done — clear the "Review your N uploads" strip
          // on /wardrobe so it doesn't linger after the user has
          // already reviewed every item.
          clearReady();
          router.push("/wardrobe");
          return;
        }
        setEditing(false);
      } else {
        const text = await res.text().catch(() => "");
        console.error("[edit] PATCH failed", res.status, text);
        setSaveError(
          text ? `Save failed (${res.status}): ${text.slice(0, 160)}` : `Save failed (${res.status})`
        );
      }
    } catch (err) {
      console.error("Failed to save:", err);
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function toggleArr<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
  }

  async function toggleFavorite() {
    if (!item) return;
    const newFav = !item.is_favorite;
    const res = await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: newFav }),
    });
    if (res.ok) {
      setItem({ ...item, is_favorite: newFav });
    }
  }

  async function deleteItem() {
    if (!item || !confirm(t("itemDetail.deleteConfirm"))) return;
    await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    router.push("/wardrobe");
  }

  async function runBgRemoval(source: Blob) {
    setRemovingBg(true);
    setBgError(null);
    try {
      const resultBlob = await removeBg(source);
      const file = new File([resultBlob], "bg-removed.png", { type: "image/png" });
      setNewImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setNewImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Background removal failed:", err);
      setBgError("Couldn't remove the background. You can keep the original or try again.");
    } finally {
      setRemovingBg(false);
    }
  }

  async function handleRemoveBackground() {
    // Works on either the new image or the current item image
    const sourceUrl = newImagePreview || item?.image_url;
    if (!sourceUrl) return;
    try {
      const response = await fetch(sourceUrl);
      const imageBlob = await response.blob();
      await runBgRemoval(imageBlob);
    } catch (err) {
      console.error("Background removal failed:", err);
      setBgError("Couldn't remove the background. You can keep the original or try again.");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 pt-4">
        <div className="h-8 w-8 animate-pulse rounded bg-muted mb-4" />
        <div className="aspect-square animate-pulse rounded-xl bg-muted mb-4" />
        <div className="h-6 w-48 animate-pulse rounded bg-muted mb-2" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-md px-4 pt-4 text-center">
        <p className="text-muted-foreground">{t("itemDetail.itemNotFound")}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/wardrobe")}>
          {t("itemDetail.backToWardrobe")}
        </Button>
      </div>
    );
  }

  // Helper booleans for VIEW mode visibility
  const viewIsJeansTrousers = ["jeans", "trousers"].includes(item.subcategory ?? "");
  const viewShowGenericFit =
    item.category === "top" ||
    item.category === "dress" ||
    item.category === "one-piece" ||
    item.category === "outerwear" ||
    (item.category === "bottom" && !viewIsJeansTrousers);
  const viewShowBottomFit = item.category === "bottom" && viewIsJeansTrousers;
  const viewShowShoeFields = item.category === "shoes";
  const viewShowBeltPosition = item.category === "accessory" && item.subcategory === "belt";
  const viewShowWarmth =
    item.category !== "shoes" &&
    item.category !== "accessory" &&
    item.category !== "bag";

  const subcatOptions = editCategory in labels.SUBCATEGORY_OPTIONS
    ? labels.SUBCATEGORY_OPTIONS[editCategory as Category]
    : [];

  // Format formality for view mode (handle both single string and array)
  const formalityDisplay = Array.isArray(item.formality)
    ? item.formality.map((f) => labels.FORMALITY[f]).join(", ")
    : labels.FORMALITY[item.formality];

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            // In wizard mode, X always exits back to the wardrobe.
            // Without this the user gets stuck on an edit form with
            // no navigation — X flipped editing off but they were
            // still on /wardrobe/[id]?edit=1 with nothing obvious to
            // tap except the bottom-nav tab.
            if (editing && shouldAutoEdit) {
              // Exiting the wizard early — same cleanup as Save on
              // the last item, so a stale review strip doesn't stay
              // on the wardrobe page.
              clearReady();
              router.push("/wardrobe");
              return;
            }
            if (editing) {
              setEditing(false);
              return;
            }
            router.back();
          }}
        >
          {editing ? <X className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
        </Button>
        <div className="flex gap-2">
          {!editing && (
            <>
              <Button variant="ghost" size="icon" onClick={startEditing}>
                <Pencil className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleFavorite}>
                <Heart className={cn("h-5 w-5", item.is_favorite && "fill-red-500 text-red-500")} />
              </Button>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={deleteItem}>
                <Trash2 className="h-5 w-5" />
              </Button>
            </>
          )}
          {editing && (
            <Button size="sm" onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {hasNext ? "Next" : t("itemDetail.save")}
            </Button>
          )}
        </div>
      </div>

      {/* Review wizard progress bar */}
      {hasNext && editing && (
        <div className="mb-3 rounded-lg bg-[#fdf2f4] border border-[#e8b4bc] px-3 py-2 text-xs text-[#7c2d3a]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Reviewing your upload</span>
            <span className="text-[#9b4050]/80">
              {nextIds.length} more to go
            </span>
          </div>
        </div>
      )}

      {/* Image */}
      <div className="relative aspect-square overflow-hidden rounded-xl bg-white mb-4">
        <Image src={newImagePreview || item.image_url} alt={item.name} fill className="object-contain" sizes="(max-width: 448px) 100vw, 448px" priority />
        {editing && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
          >
            <Camera className="h-8 w-8 text-white mb-1" />
            <span className="text-sm font-medium text-white">{t("itemDetail.changePhoto")}</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setNewImageFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setNewImagePreview(ev.target?.result as string);
            reader.readAsDataURL(file);
            // Auto-run the cutout — the preview above shows instantly, the
            // cutout replaces it when ready.
            void runBgRemoval(file);
          }}
        />
      </div>

      {/* View-mode actions */}
      {!editing && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            className="gap-2"
            onClick={() => router.push(`/suggest?item=${item.id}`)}
          >
            <Sparkles className="h-4 w-4" />
            {t("itemDetail.outfitWithThis")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={startEditing}
          >
            <Pencil className="h-4 w-4" />
            Edit details
          </Button>
        </div>
      )}

      {/* Remove background button - edit mode */}
      {editing && (
        <div className="mb-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleRemoveBackground}
            disabled={removingBg}
          >
            {removingBg ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("itemDetail.removingBackground")}
              </>
            ) : (
              t("itemDetail.removeBackground")
            )}
          </Button>
          {bgError && (
            <p className="mt-2 text-xs text-red-600 text-center">{bgError}</p>
          )}
        </div>
      )}

      {editing ? (
        /* ==================== EDIT MODE ==================== */
        <div className="space-y-5">
          {/* Name */}
          <div className="space-y-1">
            <Label>{t("addItem.name")}</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <Label>{t("addItem.category")}</Label>
            <Select value={editCategory} onValueChange={(v) => { setEditCategory(v as Category); setEditSubcategory(""); }}>
              <SelectTrigger>
                <SelectValue>
                  {(value) => (value ? labels.CATEGORY[value as Category] : null)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(labels.CATEGORY) as Category[]).map((c) => (
                  <SelectItem key={c} value={c}>{labels.CATEGORY[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subcategory */}
          {subcatOptions.length > 0 && (
            <div className="space-y-1">
              <Label>{t("addItem.type")}</Label>
              <Select value={editSubcategory} onValueChange={(v) => setEditSubcategory(v as Subcategory)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("addItem.selectType")}>
                    {(value) => {
                      const o = subcatOptions.find((opt) => opt.value === value);
                      return o ? o.label : t("addItem.selectType");
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {subcatOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Colors */}
          <div className="space-y-2">
            <Label>{t("addItem.colors")}</Label>
            <div className="flex flex-wrap gap-2">
              {editColors.map((color, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                  <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: color.hex }} />
                  <span className="text-xs font-medium">{t(`color.${toColorKey(color.name)}`)}</span>
                  <button type="button" onClick={() => setEditColors((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive text-xs ml-0.5">×</button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowColorPalette(!showColorPalette)}>
                {showColorPalette ? t("addItem.hidePalette") : t("addItem.colorPalette")}
              </Button>
              {showColorPalette && (
                <div className="rounded-lg border p-3 space-y-3 max-h-64 overflow-y-auto">
                  {FASHION_COLORS.map((group) => (
                    <div key={group.group}>
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">{t(`colorGroup.${group.group}`)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.colors.map((c) => (
                          <button key={c.hex + c.name} type="button" title={t(`color.${toColorKey(c.name)}`)} onClick={() => setEditColors((p) => [...p, { hex: c.hex, name: c.name, percentage: 0 }])} className="h-7 w-7 rounded-full border border-border hover:ring-2 hover:ring-primary transition-all" style={{ backgroundColor: c.hex }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Generic Fit - tops, dresses, outerwear, non-jeans/trousers bottoms */}
          {editShowGenericFit && (
            <div className="space-y-1">
              <Label>{t("addItem.howDoesItFit")}</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(labels.FIT) as Fit[]).map((f) => (
                  <button key={f} type="button" onClick={() => setEditFit(f)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editFit === f ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.FIT[f]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Fit - jeans and trousers only */}
          {editShowBottomFit && (
            <div className="space-y-1">
              <Label>{t("addItem.howDoesItFit")}</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(labels.BOTTOM_FIT) as BottomFit[]).map((f) => (
                  <button key={f} type="button" onClick={() => setEditBottomFit(f)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editBottomFit === f ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.BOTTOM_FIT[f]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Length */}
          {editShowLength && (
            <div className="space-y-1">
              <Label>{t("addItem.length")}</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(labels.LENGTH) as Length[]).map((l) => (
                  <button key={l} type="button" onClick={() => setEditLength(l)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editLength === l ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.LENGTH[l]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Pants Length - jeans, trousers, leggings, sweatpants */}
          {editShowPantsLength && (
            <div className="space-y-1">
              <Label>{t("addItem.length")}</Label>
              <div className="grid grid-cols-5 gap-2">
                {(Object.keys(labels.PANTS_LENGTH) as PantsLength[]).map((l) => (
                  <button key={l} type="button" onClick={() => setEditPantsLength(l)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editPantsLength === l ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.PANTS_LENGTH[l]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Waist Height - jeans and trousers only */}
          {editShowWaistHeight && (
            <div className="space-y-1">
              <Label>{t("addItem.waistHeight")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(labels.WAIST_HEIGHT) as WaistHeight[]).map((w) => (
                  <button key={w} type="button" onClick={() => setEditWaistHeight(w)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editWaistHeight === w ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.WAIST_HEIGHT[w]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Waist Closure - pants only */}
          {editShowWaistClosure && (
            <div className="space-y-1">
              <Label>{t("addItem.waistClosure")}</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(labels.WAIST_CLOSURE) as WaistClosure[]).map((c) => (
                  <button key={c} type="button" onClick={() => setEditWaistClosure(editWaistClosure === c ? null : c)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editWaistClosure === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.WAIST_CLOSURE[c]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Waist Style */}
          {editShowWaistStyle && (
            <div className="space-y-1">
              <Label>{t("addItem.waist")}</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(labels.WAIST_STYLE) as WaistStyle[]).map((w) => (
                  <button key={w} type="button" onClick={() => setEditWaistStyle(editWaistStyle === w ? null : w)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editWaistStyle === w ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.WAIST_STYLE[w]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Belt compatible + layering toggles */}
          {editShowBeltCompatible && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setEditBeltCompatible(!editBeltCompatible)} className={cn("h-5 w-5 rounded border-2 transition-colors", editBeltCompatible ? "border-primary bg-primary" : "border-muted-foreground/30")} />
                <Label className="cursor-pointer" onClick={() => setEditBeltCompatible(!editBeltCompatible)}>{t("addItem.worksWithBelt")}</Label>
              </div>
              {editShowLayeringPiece && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setEditLayering(!editLayering)} className={cn("h-5 w-5 rounded border-2 transition-colors", editLayering ? "border-primary bg-primary" : "border-muted-foreground/30")} />
                  <Label className="cursor-pointer" onClick={() => setEditLayering(!editLayering)}>{t("addItem.layeringPiece")}</Label>
                </div>
              )}
            </div>
          )}

          {/* Shoe Height - shoes only */}
          {editShowShoeFields && (
            <div className="space-y-1">
              <Label>{t("addItem.shoeHeight")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(labels.SHOE_HEIGHT) as ShoeHeight[]).map((h) => (
                  <button key={h} type="button" onClick={() => setEditShoeHeight(h)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editShoeHeight === h ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.SHOE_HEIGHT[h]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Heel Type - shoes only */}
          {editShowShoeFields && (
            <div className="space-y-1">
              <Label>{t("addItem.heelType")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(labels.HEEL_TYPE) as HeelType[]).map((h) => (
                  <button key={h} type="button" onClick={() => setEditHeelType(h)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editHeelType === h ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.HEEL_TYPE[h]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Shoe Closure - shoes only */}
          {editShowShoeFields && (
            <div className="space-y-1">
              <Label>{t("addItem.closure")}</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(labels.SHOE_CLOSURE) as ShoeClosure[]).map((c) => (
                  <button key={c} type="button" onClick={() => setEditShoeClosure(editShoeClosure === c ? null : c)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editShoeClosure === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.SHOE_CLOSURE[c]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Belt Style - belt subcategory only */}
          {editShowBeltPosition && (
            <div className="space-y-1">
              <Label>{t("addItem.beltStyle")}</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(labels.BELT_STYLE) as BeltStyle[]).map((b) => (
                  <button key={b} type="button" onClick={() => setEditBeltStyle(editBeltStyle === b ? null : b)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editBeltStyle === b ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.BELT_STYLE[b]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Belt Position - belt subcategory only */}
          {editShowBeltPosition && (
            <div className="space-y-1">
              <Label>{t("addItem.beltPosition")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(labels.BELT_POSITION) as BeltPosition[]).map((b) => (
                  <button key={b} type="button" onClick={() => setEditBeltPosition(b)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editBeltPosition === b ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.BELT_POSITION[b]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Metal Finish - shoes and accessories */}
          {["shoes", "accessory"].includes(editCategory) && (
            <div className="space-y-1">
              <Label>{t("addItem.metalFinish")}</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(labels.METAL_FINISH) as MetalFinish[]).map((m) => (
                  <button key={m} type="button" onClick={() => setEditMetalFinish(editMetalFinish === m ? null : m)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editMetalFinish === m ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.METAL_FINISH[m]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Neckline - hidden for hoodies, cardigans */}
          {editShowNeckline && (
            <div className="space-y-1">
              <Label>{t("addItem.neckline")}</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(labels.NECKLINE) as Neckline[]).map((n) => (
                  <button key={n} type="button" onClick={() => setEditNeckline(editNeckline === n ? null : n)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editNeckline === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.NECKLINE[n]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Sleeve Length - hidden for tank tops */}
          {editShowSleeveLength && (
            <div className="space-y-1">
              <Label>{t("addItem.sleeveLength")}</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(labels.SLEEVE_LENGTH) as SleeveLength[]).map((s) => (
                  <button key={s} type="button" onClick={() => setEditSleeveLength(editSleeveLength === s ? null : s)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editSleeveLength === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.SLEEVE_LENGTH[s]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Closure */}
          {editShowClosure && (
            <div className="space-y-1">
              <Label>{t("addItem.closure")}</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(labels.CLOSURE) as Closure[]).map((c) => (
                  <button key={c} type="button" onClick={() => setEditClosure(editClosure === c ? null : c)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editClosure === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.CLOSURE[c]}</button>
                ))}
              </div>
            </div>
          )}

          {/* Material */}
          <div className="space-y-1">
            <Label>{t("addItem.materialSelect")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.MATERIAL) as Material[]).map((m) => (
                <button key={m} type="button" onClick={() => setEditMaterials(toggleArr(editMaterials, m))} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editMaterials.includes(m) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.MATERIAL[m]}</button>
              ))}
            </div>
          </div>

          {/* Pattern */}
          <div className="space-y-1">
            <Label>{t("addItem.patternSelect")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.PATTERN) as Pattern[]).map((p) => (
                <button key={p} type="button" onClick={() => setEditPatterns(toggleArr(editPatterns, p))} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editPatterns.includes(p) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.PATTERN[p]}</button>
              ))}
            </div>
          </div>

          {/* Formality - multi-select toggle buttons */}
          <div className="space-y-1">
            <Label>{t("addItem.formality")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.FORMALITY) as Formality[]).map((f) => (
                <button key={f} type="button" onClick={() => setEditFormalities(toggleArr(editFormalities, f))} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editFormalities.includes(f) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.FORMALITY[f]}</button>
              ))}
            </div>
          </div>

          {/* Seasons */}
          <div className="space-y-1">
            <Label>{t("addItem.seasons")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.SEASON) as Season[]).map((s) => (
                <button key={s} type="button" onClick={() => setEditSeasons(toggleArr(editSeasons, s))} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editSeasons.includes(s) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.SEASON[s]}</button>
              ))}
            </div>
          </div>

          {/* Occasions */}
          <div className="space-y-1">
            <Label>{t("addItem.occasions")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.OCCASION) as Occasion[]).map((o) => (
                <button key={o} type="button" onClick={() => setEditOccasions(toggleArr(editOccasions, o))} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editOccasions.includes(o) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.OCCASION[o]}</button>
              ))}
            </div>
          </div>

          {/* Warmth - hidden for shoes, accessories, bags */}
          {editShowWarmth && (
            <div className="space-y-1">
              <Label>{t("addItem.warmth")}</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setEditWarmth(n)} className={cn("flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors", editWarmth === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{n}</button>
                ))}
              </div>
            </div>
          )}

          {/* Rain + Brand */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setEditRain(!editRain)} className={cn("h-5 w-5 rounded border-2 transition-colors", editRain ? "border-primary bg-primary" : "border-muted-foreground/30")} />
            <Label className="cursor-pointer" onClick={() => setEditRain(!editRain)}>{t("addItem.rainAppropriate")}</Label>
          </div>

          {/* Stored */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setEditStored(!editStored)} className={cn("h-5 w-5 rounded border-2 transition-colors", editStored ? "border-primary bg-primary" : "border-muted-foreground/30")} />
            <div>
              <Label className="cursor-pointer" onClick={() => setEditStored(!editStored)}>
                {editStored ? t("addItem.storedOn") : t("addItem.stored")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {editStored ? t("addItem.storedHintOn") : t("addItem.storedHint")}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label>{t("addItem.brand")}</Label>
            <Input value={editBrand} onChange={(e) => setEditBrand(e.target.value)} placeholder={t("addItem.brandPlaceholder")} />
          </div>

          <Button className="w-full h-12" onClick={saveEdit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : hasNext ? (
              `Save & Next (${nextIds.length} left)`
            ) : (
              t("itemDetail.saveChanges")
            )}
          </Button>
          {saveError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 break-words">
              {saveError}
            </div>
          )}
        </div>
      ) : (
        /* ==================== VIEW MODE ==================== */
        <>
          {/* Name & category */}
          <h1 className="text-xl font-bold mb-1">{item.name}</h1>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Badge variant="secondary">{labels.CATEGORY[item.category]}</Badge>
            {item.subcategory && <Badge variant="outline">{item.subcategory}</Badge>}
            {item.brand && <span className="text-sm text-muted-foreground">{item.brand}</span>}
            {item.is_layering_piece && <Badge variant="outline" className="text-[10px]">{t("itemDetail.layeringPiece")}</Badge>}
          </div>

          {/* Colors */}
          {item.colors.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-muted-foreground">{t("itemDetail.colors")}</span>
              <div className="flex gap-1.5">
                {item.colors.map((color, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: color.hex }} />
                    <span className="text-xs text-muted-foreground">{t(`color.${toColorKey(color.name)}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator className="my-4" />

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Generic Fit - tops, dresses, outerwear, non-jeans/trousers bottoms */}
            {viewShowGenericFit && item.fit && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.fit")}</p>
                  <p className="text-sm font-medium">{labels.FIT[item.fit]}</p>
                </CardContent>
              </Card>
            )}
            {/* Bottom Fit - jeans/trousers */}
            {viewShowBottomFit && item.bottom_fit && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.fit")}</p>
                  <p className="text-sm font-medium">{labels.BOTTOM_FIT[item.bottom_fit]}</p>
                </CardContent>
              </Card>
            )}
            {item.length && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.length")}</p>
                  <p className="text-sm font-medium">{labels.LENGTH[item.length]}</p>
                </CardContent>
              </Card>
            )}
            {item.pants_length && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.length")}</p>
                  <p className="text-sm font-medium">{labels.PANTS_LENGTH[item.pants_length]}</p>
                </CardContent>
              </Card>
            )}
            {/* Waist Height - jeans/trousers */}
            {viewIsJeansTrousers && item.waist_height && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("addItem.waistHeight")}</p>
                  <p className="text-sm font-medium">{labels.WAIST_HEIGHT[item.waist_height]}</p>
                </CardContent>
              </Card>
            )}
            {item.waist_closure && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("addItem.waistClosure")}</p>
                  <p className="text-sm font-medium">{labels.WAIST_CLOSURE[item.waist_closure]}</p>
                </CardContent>
              </Card>
            )}
            {item.waist_style && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.waist")}</p>
                  <p className="text-sm font-medium">
                    {labels.WAIST_STYLE[item.waist_style]}
                    {item.belt_compatible && ` ${t("itemDetail.beltFriendly")}`}
                  </p>
                </CardContent>
              </Card>
            )}
            {/* Shoe Height - shoes only */}
            {viewShowShoeFields && item.shoe_height && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("addItem.shoeHeight")}</p>
                  <p className="text-sm font-medium">{labels.SHOE_HEIGHT[item.shoe_height]}</p>
                </CardContent>
              </Card>
            )}
            {/* Heel Type - shoes only */}
            {viewShowShoeFields && item.heel_type && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.heelType")}</p>
                  <p className="text-sm font-medium">{labels.HEEL_TYPE[item.heel_type]}</p>
                </CardContent>
              </Card>
            )}
            {/* Shoe Closure */}
            {viewShowShoeFields && item.shoe_closure && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.closure")}</p>
                  <p className="text-sm font-medium">{labels.SHOE_CLOSURE[item.shoe_closure]}</p>
                </CardContent>
              </Card>
            )}
            {/* Belt Position - belt subcategory only */}
            {viewShowBeltPosition && item.belt_position && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("addItem.beltPosition")}</p>
                  <p className="text-sm font-medium">{labels.BELT_POSITION[item.belt_position]}</p>
                </CardContent>
              </Card>
            )}
            {/* Belt Style */}
            {viewShowBeltPosition && item.belt_style && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("addItem.beltStyle")}</p>
                  <p className="text-sm font-medium">{labels.BELT_STYLE[item.belt_style]}</p>
                </CardContent>
              </Card>
            )}
            {/* Metal Finish - shoes and accessories */}
            {item.metal_finish && item.metal_finish !== "none" && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.metal")}</p>
                  <p className="text-sm font-medium">{labels.METAL_FINISH[item.metal_finish]}</p>
                </CardContent>
              </Card>
            )}
            {item.neckline && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.neckline")}</p>
                  <p className="text-sm font-medium">{labels.NECKLINE[item.neckline]}</p>
                </CardContent>
              </Card>
            )}
            {item.sleeve_length && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.sleeves")}</p>
                  <p className="text-sm font-medium">{labels.SLEEVE_LENGTH[item.sleeve_length]}</p>
                </CardContent>
              </Card>
            )}
            {item.closure && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.closure")}</p>
                  <p className="text-sm font-medium">{labels.CLOSURE[item.closure]}</p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.material")}</p>
                <p className="text-sm font-medium">
                  {Array.isArray(item.material) ? item.material.map((m) => labels.MATERIAL[m]).join(", ") : labels.MATERIAL[item.material]}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.pattern")}</p>
                <p className="text-sm font-medium">
                  {Array.isArray(item.pattern) ? item.pattern.map((p) => labels.PATTERN[p]).join(", ") : labels.PATTERN[item.pattern]}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">{t("itemDetail.formality")}</p>
                <p className="text-sm font-medium">{formalityDisplay}</p>
              </CardContent>
            </Card>
          </div>

          {/* Warmth & Rain - warmth hidden for shoes, accessories, bags */}
          <div className="flex gap-3 mt-3">
            {viewShowWarmth && (
              <Card className="flex-1">
                <CardContent className="p-3 flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("itemDetail.warmth")}</p>
                    <p className="text-sm font-medium">{item.warmth_rating}/5</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="flex-1">
              <CardContent className="p-3 flex items-center gap-2">
                <Droplets className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{t("itemDetail.rainProof")}</p>
                  <p className="text-sm font-medium">{item.rain_appropriate ? t("common.yes") : t("common.no")}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Seasons */}
          {item.seasons.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">{t("addItem.seasons")}</p>
              <div className="flex flex-wrap gap-1.5">
                {item.seasons.map((s) => (
                  <Badge key={s} variant="outline">{labels.SEASON[s]}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Occasions */}
          {item.occasions.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground mb-2">{t("addItem.occasions")}</p>
              <div className="flex flex-wrap gap-1.5">
                {item.occasions.map((o) => (
                  <Badge key={o} variant="outline">{labels.OCCASION[o]}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Wear stats */}
          <Separator className="my-4" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("itemDetail.timesWorn")}</span>
            <span className="font-medium">{item.times_worn}</span>
          </div>
          {item.last_worn_date && (
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">{t("itemDetail.lastWorn")}</span>
              <span className="font-medium">{new Date(item.last_worn_date).toLocaleDateString()}</span>
            </div>
          )}
        </>
      )}

    </div>
  );
}
