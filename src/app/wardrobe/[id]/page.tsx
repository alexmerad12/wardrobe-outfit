"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
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
  BeltPosition,
  MetalFinish,
  Formality,
  Season,
  Occasion,
  Neckline,
  SleeveLength,
  Closure,
} from "@/lib/types";
import {
  CATEGORY_LABELS,
  SUBCATEGORY_OPTIONS,
  FIT_LABELS,
  BOTTOM_FIT_LABELS,
  LENGTH_LABELS,
  PANTS_LENGTH_LABELS,
  WAIST_STYLE_LABELS,
  WAIST_HEIGHT_LABELS,
  WAIST_CLOSURE_LABELS,
  SHOE_HEIGHT_LABELS,
  HEEL_TYPE_LABELS,
  BELT_POSITION_LABELS,
  METAL_FINISH_LABELS,
  NECKLINE_LABELS,
  SLEEVE_LENGTH_LABELS,
  CLOSURE_LABELS,
  MATERIAL_LABELS,
  PATTERN_LABELS,
  FORMALITY_LABELS,
  SEASON_LABELS,
  OCCASION_LABELS,
} from "@/lib/types";
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

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [item, setItem] = useState<ClothingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
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
    ["top", "dress", "outerwear"].includes(editCategory) &&
    editSubcategory !== "tank-top";
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

  async function saveEdit() {
    if (!item) return;
    setSaving(true);
    try {
      // Upload new image if changed
      let imageUrl = item.image_url;
      if (newImageFile) {
        setUploadingImage(true);
        const blob = await upload(
          `clothing/${Date.now()}-${newImageFile.name}`,
          newImageFile,
          { access: "public", handleUploadUrl: "/api/upload" }
        );
        imageUrl = blob.url;
        setUploadingImage(false);
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
          belt_position: editShowBeltPosition ? editBeltPosition : null,
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
          brand: editBrand || null,
          colors: editColors,
        }),
      });
      if (res.ok) {
        setItem(await res.json());
        setEditing(false);
        setNewImageFile(null);
        setNewImagePreview(null);
      }
    } catch (err) {
      console.error("Failed to save:", err);
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
    if (!item || !confirm("Delete this item from your wardrobe?")) return;
    await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    router.push("/wardrobe");
  }

  async function handleRemoveBackground() {
    // Works on either the new image or the current item image
    const sourceUrl = newImagePreview || item?.image_url;
    if (!sourceUrl) return;
    setRemovingBg(true);
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      // Fetch the image as a blob
      const response = await fetch(sourceUrl);
      const imageBlob = await response.blob();
      const resultBlob = await removeBackground(imageBlob);
      const file = new File([resultBlob], "bg-removed.png", { type: "image/png" });
      setNewImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setNewImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Background removal failed:", err);
    } finally {
      setRemovingBg(false);
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
        <p className="text-muted-foreground">Item not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/wardrobe")}>
          Back to Wardrobe
        </Button>
      </div>
    );
  }

  // Helper booleans for VIEW mode visibility
  const viewIsJeansTrousers = ["jeans", "trousers"].includes(item.subcategory ?? "");
  const viewShowGenericFit =
    item.category === "top" ||
    item.category === "dress" ||
    item.category === "outerwear" ||
    (item.category === "bottom" && !viewIsJeansTrousers);
  const viewShowBottomFit = item.category === "bottom" && viewIsJeansTrousers;
  const viewShowShoeFields = item.category === "shoes";
  const viewShowBeltPosition = item.category === "accessory" && item.subcategory === "belt";
  const viewShowWarmth =
    item.category !== "shoes" &&
    item.category !== "accessory" &&
    item.category !== "bag";

  const subcatOptions = editCategory in SUBCATEGORY_OPTIONS
    ? SUBCATEGORY_OPTIONS[editCategory as Category]
    : [];

  // Format formality for view mode (handle both single string and array)
  const formalityDisplay = Array.isArray(item.formality)
    ? item.formality.map((f) => FORMALITY_LABELS[f]).join(", ")
    : FORMALITY_LABELS[item.formality];

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => editing ? setEditing(false) : router.back()}>
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
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Image */}
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted/30 mb-4">
        <Image src={newImagePreview || item.image_url} alt={item.name} fill className="object-cover" sizes="(max-width: 448px) 100vw, 448px" priority />
        {editing && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
          >
            <Camera className="h-8 w-8 text-white mb-1" />
            <span className="text-sm font-medium text-white">Change photo</span>
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
          }}
        />
      </div>

      {/* Outfit with this - view mode */}
      {!editing && (
        <Button
          type="button"
          className="w-full mb-4 gap-2"
          onClick={() => router.push(`/suggest?item=${item.id}`)}
        >
          <Sparkles className="h-4 w-4" />
          Outfit with this
        </Button>
      )}

      {/* Remove background button - edit mode */}
      {editing && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full mb-4"
          onClick={handleRemoveBackground}
          disabled={removingBg}
        >
          {removingBg ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Removing background...
            </>
          ) : (
            "Remove background"
          )}
        </Button>
      )}

      {editing ? (
        /* ==================== EDIT MODE ==================== */
        <div className="space-y-5">
          {/* Name */}
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={editCategory} onValueChange={(v) => { setEditCategory(v as Category); setEditSubcategory(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subcategory */}
          {subcatOptions.length > 0 && (
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={editSubcategory} onValueChange={(v) => setEditSubcategory(v as Subcategory)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
            <Label>Colors</Label>
            <div className="flex flex-wrap gap-2">
              {editColors.map((color, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                  <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: color.hex }} />
                  <span className="text-xs font-medium">{color.name}</span>
                  <button type="button" onClick={() => setEditColors((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive text-xs ml-0.5">×</button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowColorPalette(!showColorPalette)}>
                {showColorPalette ? "Hide palette" : "Color palette"}
              </Button>
              {showColorPalette && (
                <div className="rounded-lg border p-3 space-y-3 max-h-64 overflow-y-auto">
                  {FASHION_COLORS.map((group) => (
                    <div key={group.group}>
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">{group.group}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.colors.map((c) => (
                          <button key={c.hex + c.name} type="button" title={c.name} onClick={() => setEditColors((p) => [...p, { hex: c.hex, name: c.name, percentage: 0 }])} className="h-7 w-7 rounded-full border border-border hover:ring-2 hover:ring-primary transition-all" style={{ backgroundColor: c.hex }} />
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
              <Label>Fit</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(FIT_LABELS) as [Fit, string][]).map(([f, label]) => (
                  <button key={f} type="button" onClick={() => setEditFit(f)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editFit === f ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Fit - jeans and trousers only */}
          {editShowBottomFit && (
            <div className="space-y-1">
              <Label>Fit</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(BOTTOM_FIT_LABELS) as [BottomFit, string][]).map(([f, label]) => (
                  <button key={f} type="button" onClick={() => setEditBottomFit(f)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editBottomFit === f ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Length */}
          {editShowLength && (
            <div className="space-y-1">
              <Label>Length</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(LENGTH_LABELS) as [Length, string][]).map(([l, label]) => (
                  <button key={l} type="button" onClick={() => setEditLength(l)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editLength === l ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Pants Length - jeans, trousers, leggings, sweatpants */}
          {editShowPantsLength && (
            <div className="space-y-1">
              <Label>Length</Label>
              <div className="grid grid-cols-5 gap-2">
                {(Object.entries(PANTS_LENGTH_LABELS) as [PantsLength, string][]).map(([l, label]) => (
                  <button key={l} type="button" onClick={() => setEditPantsLength(l)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editPantsLength === l ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Waist Height - jeans and trousers only */}
          {editShowWaistHeight && (
            <div className="space-y-1">
              <Label>Waist Height</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(WAIST_HEIGHT_LABELS) as [WaistHeight, string][]).map(([w, label]) => (
                  <button key={w} type="button" onClick={() => setEditWaistHeight(w)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editWaistHeight === w ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Waist Closure - pants only */}
          {editShowWaistClosure && (
            <div className="space-y-1">
              <Label>Waist Closure</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(WAIST_CLOSURE_LABELS) as [WaistClosure, string][]).map(([c, label]) => (
                  <button key={c} type="button" onClick={() => setEditWaistClosure(editWaistClosure === c ? null : c)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editWaistClosure === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Waist Style */}
          {editShowWaistStyle && (
            <div className="space-y-1">
              <Label>Waist</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(WAIST_STYLE_LABELS) as [WaistStyle, string][]).map(([w, label]) => (
                  <button key={w} type="button" onClick={() => setEditWaistStyle(editWaistStyle === w ? null : w)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editWaistStyle === w ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Belt compatible + layering toggles */}
          {editShowBeltCompatible && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setEditBeltCompatible(!editBeltCompatible)} className={cn("h-5 w-5 rounded border-2 transition-colors", editBeltCompatible ? "border-primary bg-primary" : "border-muted-foreground/30")} />
                <Label className="cursor-pointer" onClick={() => setEditBeltCompatible(!editBeltCompatible)}>Works with a belt</Label>
              </div>
              {editShowLayeringPiece && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setEditLayering(!editLayering)} className={cn("h-5 w-5 rounded border-2 transition-colors", editLayering ? "border-primary bg-primary" : "border-muted-foreground/30")} />
                  <Label className="cursor-pointer" onClick={() => setEditLayering(!editLayering)}>Layering piece</Label>
                </div>
              )}
            </div>
          )}

          {/* Shoe Height - shoes only */}
          {editShowShoeFields && (
            <div className="space-y-1">
              <Label>Shoe Height</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(SHOE_HEIGHT_LABELS) as [ShoeHeight, string][]).map(([h, label]) => (
                  <button key={h} type="button" onClick={() => setEditShoeHeight(h)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editShoeHeight === h ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Heel Type - shoes only */}
          {editShowShoeFields && (
            <div className="space-y-1">
              <Label>Heel Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(HEEL_TYPE_LABELS) as [HeelType, string][]).map(([h, label]) => (
                  <button key={h} type="button" onClick={() => setEditHeelType(h)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editHeelType === h ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Belt Position - belt subcategory only */}
          {editShowBeltPosition && (
            <div className="space-y-1">
              <Label>Belt Position</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(BELT_POSITION_LABELS) as [BeltPosition, string][]).map(([b, label]) => (
                  <button key={b} type="button" onClick={() => setEditBeltPosition(b)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editBeltPosition === b ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Metal Finish - shoes and accessories */}
          {["shoes", "accessory"].includes(editCategory) && (
            <div className="space-y-1">
              <Label>Metal Finish</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(METAL_FINISH_LABELS) as [MetalFinish, string][]).map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setEditMetalFinish(editMetalFinish === m ? null : m)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editMetalFinish === m ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Neckline - hidden for hoodies, cardigans */}
          {editShowNeckline && (
            <div className="space-y-1">
              <Label>Neckline</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(NECKLINE_LABELS) as [Neckline, string][]).map(([n, label]) => (
                  <button key={n} type="button" onClick={() => setEditNeckline(editNeckline === n ? null : n)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editNeckline === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Sleeve Length - hidden for tank tops */}
          {editShowSleeveLength && (
            <div className="space-y-1">
              <Label>Sleeve Length</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(SLEEVE_LENGTH_LABELS) as [SleeveLength, string][]).map(([s, label]) => (
                  <button key={s} type="button" onClick={() => setEditSleeveLength(editSleeveLength === s ? null : s)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editSleeveLength === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Closure */}
          {editShowClosure && (
            <div className="space-y-1">
              <Label>Closure</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(CLOSURE_LABELS) as [Closure, string][]).map(([c, label]) => (
                  <button key={c} type="button" onClick={() => setEditClosure(editClosure === c ? null : c)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editClosure === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Material */}
          <div className="space-y-1">
            <Label>Material</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(MATERIAL_LABELS) as [Material, string][]).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setEditMaterials(toggleArr(editMaterials, m))} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editMaterials.includes(m) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
              ))}
            </div>
          </div>

          {/* Pattern */}
          <div className="space-y-1">
            <Label>Pattern</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(PATTERN_LABELS) as [Pattern, string][]).map(([p, label]) => (
                <button key={p} type="button" onClick={() => setEditPatterns(toggleArr(editPatterns, p))} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editPatterns.includes(p) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
              ))}
            </div>
          </div>

          {/* Formality - multi-select toggle buttons */}
          <div className="space-y-1">
            <Label>Formality</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(FORMALITY_LABELS) as [Formality, string][]).map(([f, label]) => (
                <button key={f} type="button" onClick={() => setEditFormalities(toggleArr(editFormalities, f))} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editFormalities.includes(f) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
              ))}
            </div>
          </div>

          {/* Seasons */}
          <div className="space-y-1">
            <Label>Seasons</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(SEASON_LABELS) as [Season, string][]).map(([s, label]) => (
                <button key={s} type="button" onClick={() => setEditSeasons(toggleArr(editSeasons, s))} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editSeasons.includes(s) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
              ))}
            </div>
          </div>

          {/* Occasions */}
          <div className="space-y-1">
            <Label>Occasions</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(OCCASION_LABELS) as [Occasion, string][]).map(([o, label]) => (
                <button key={o} type="button" onClick={() => setEditOccasions(toggleArr(editOccasions, o))} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", editOccasions.includes(o) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
              ))}
            </div>
          </div>

          {/* Warmth - hidden for shoes, accessories, bags */}
          {editShowWarmth && (
            <div className="space-y-1">
              <Label>Warmth</Label>
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
            <Label className="cursor-pointer" onClick={() => setEditRain(!editRain)}>Rain appropriate</Label>
          </div>

          <div className="space-y-1">
            <Label>Brand (optional)</Label>
            <Input value={editBrand} onChange={(e) => setEditBrand(e.target.value)} placeholder="e.g. Zara, Nike" />
          </div>

          <Button className="w-full h-12" onClick={saveEdit} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Changes"}
          </Button>
        </div>
      ) : (
        /* ==================== VIEW MODE ==================== */
        <>
          {/* Name & category */}
          <h1 className="text-xl font-bold mb-1">{item.name}</h1>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Badge variant="secondary">{CATEGORY_LABELS[item.category]}</Badge>
            {item.subcategory && <Badge variant="outline">{item.subcategory}</Badge>}
            {item.brand && <span className="text-sm text-muted-foreground">{item.brand}</span>}
            {item.is_layering_piece && <Badge variant="outline" className="text-[10px]">Layering piece</Badge>}
          </div>

          {/* Colors */}
          {item.colors.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-muted-foreground">Colors:</span>
              <div className="flex gap-1.5">
                {item.colors.map((color, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: color.hex }} />
                    <span className="text-xs text-muted-foreground">{color.name}</span>
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
                  <p className="text-xs text-muted-foreground mb-0.5">Fit</p>
                  <p className="text-sm font-medium">{FIT_LABELS[item.fit]}</p>
                </CardContent>
              </Card>
            )}
            {/* Bottom Fit - jeans/trousers */}
            {viewShowBottomFit && item.bottom_fit && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Fit</p>
                  <p className="text-sm font-medium">{BOTTOM_FIT_LABELS[item.bottom_fit]}</p>
                </CardContent>
              </Card>
            )}
            {item.length && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Length</p>
                  <p className="text-sm font-medium">{LENGTH_LABELS[item.length]}</p>
                </CardContent>
              </Card>
            )}
            {item.pants_length && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Length</p>
                  <p className="text-sm font-medium">{PANTS_LENGTH_LABELS[item.pants_length]}</p>
                </CardContent>
              </Card>
            )}
            {/* Waist Height - jeans/trousers */}
            {viewIsJeansTrousers && item.waist_height && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Waist Height</p>
                  <p className="text-sm font-medium">{WAIST_HEIGHT_LABELS[item.waist_height]}</p>
                </CardContent>
              </Card>
            )}
            {item.waist_closure && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Waist Closure</p>
                  <p className="text-sm font-medium">{WAIST_CLOSURE_LABELS[item.waist_closure]}</p>
                </CardContent>
              </Card>
            )}
            {item.waist_style && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Waist</p>
                  <p className="text-sm font-medium">
                    {WAIST_STYLE_LABELS[item.waist_style]}
                    {item.belt_compatible && " \u00b7 Belt-friendly"}
                  </p>
                </CardContent>
              </Card>
            )}
            {/* Shoe Height - shoes only */}
            {viewShowShoeFields && item.shoe_height && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Shoe Height</p>
                  <p className="text-sm font-medium">{SHOE_HEIGHT_LABELS[item.shoe_height]}</p>
                </CardContent>
              </Card>
            )}
            {/* Heel Type - shoes only */}
            {viewShowShoeFields && item.heel_type && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Heel Type</p>
                  <p className="text-sm font-medium">{HEEL_TYPE_LABELS[item.heel_type]}</p>
                </CardContent>
              </Card>
            )}
            {/* Belt Position - belt subcategory only */}
            {viewShowBeltPosition && item.belt_position && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Belt Position</p>
                  <p className="text-sm font-medium">{BELT_POSITION_LABELS[item.belt_position]}</p>
                </CardContent>
              </Card>
            )}
            {/* Metal Finish - shoes and accessories */}
            {item.metal_finish && item.metal_finish !== "none" && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Metal Finish</p>
                  <p className="text-sm font-medium">{METAL_FINISH_LABELS[item.metal_finish]}</p>
                </CardContent>
              </Card>
            )}
            {item.neckline && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Neckline</p>
                  <p className="text-sm font-medium">{NECKLINE_LABELS[item.neckline]}</p>
                </CardContent>
              </Card>
            )}
            {item.sleeve_length && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Sleeves</p>
                  <p className="text-sm font-medium">{SLEEVE_LENGTH_LABELS[item.sleeve_length]}</p>
                </CardContent>
              </Card>
            )}
            {item.closure && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Closure</p>
                  <p className="text-sm font-medium">{CLOSURE_LABELS[item.closure]}</p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Material</p>
                <p className="text-sm font-medium">
                  {Array.isArray(item.material) ? item.material.map((m) => MATERIAL_LABELS[m]).join(", ") : MATERIAL_LABELS[item.material]}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Pattern</p>
                <p className="text-sm font-medium">
                  {Array.isArray(item.pattern) ? item.pattern.map((p) => PATTERN_LABELS[p]).join(", ") : PATTERN_LABELS[item.pattern]}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Formality</p>
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
                    <p className="text-xs text-muted-foreground">Warmth</p>
                    <p className="text-sm font-medium">{item.warmth_rating}/5</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="flex-1">
              <CardContent className="p-3 flex items-center gap-2">
                <Droplets className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Rain-proof</p>
                  <p className="text-sm font-medium">{item.rain_appropriate ? "Yes" : "No"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Seasons */}
          {item.seasons.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">Seasons</p>
              <div className="flex flex-wrap gap-1.5">
                {item.seasons.map((s) => (
                  <Badge key={s} variant="outline">{SEASON_LABELS[s]}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Occasions */}
          {item.occasions.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground mb-2">Occasions</p>
              <div className="flex flex-wrap gap-1.5">
                {item.occasions.map((o) => (
                  <Badge key={o} variant="outline">{OCCASION_LABELS[o]}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Wear stats */}
          <Separator className="my-4" />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Times worn</span>
            <span className="font-medium">{item.times_worn}</span>
          </div>
          {item.last_worn_date && (
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Last worn</span>
              <span className="font-medium">{new Date(item.last_worn_date).toLocaleDateString()}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
