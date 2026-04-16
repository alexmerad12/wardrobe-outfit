"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import type {
  ClothingItem,
  Category,
  Subcategory,
  Pattern,
  Material,
  Fit,
  Length,
  WaistStyle,
  Formality,
  Season,
  Occasion,
} from "@/lib/types";
import {
  CATEGORY_LABELS,
  SUBCATEGORY_OPTIONS,
  FIT_LABELS,
  LENGTH_LABELS,
  WAIST_STYLE_LABELS,
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
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [item, setItem] = useState<ClothingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("top");
  const [editSubcategory, setEditSubcategory] = useState<Subcategory | "">("");
  const [editFit, setEditFit] = useState<Fit>("regular");
  const [editLength, setEditLength] = useState<Length | null>(null);
  const [editWaistStyle, setEditWaistStyle] = useState<WaistStyle | null>(null);
  const [editBeltCompatible, setEditBeltCompatible] = useState(false);
  const [editLayering, setEditLayering] = useState(false);
  const [editPatterns, setEditPatterns] = useState<Pattern[]>([]);
  const [editMaterials, setEditMaterials] = useState<Material[]>([]);
  const [editFormality, setEditFormality] = useState<Formality>("casual");
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
    setEditFit(item.fit);
    setEditLength(item.length ?? null);
    setEditWaistStyle(item.waist_style ?? null);
    setEditBeltCompatible(item.belt_compatible ?? false);
    setEditLayering(item.is_layering_piece ?? false);
    setEditPatterns(Array.isArray(item.pattern) ? item.pattern : [item.pattern]);
    setEditMaterials(Array.isArray(item.material) ? item.material : [item.material]);
    setEditFormality(item.formality);
    setEditSeasons(item.seasons);
    setEditOccasions(item.occasions);
    setEditWarmth(item.warmth_rating);
    setEditRain(item.rain_appropriate);
    setEditBrand(item.brand ?? "");
    setEditColors([...item.colors]);
    setEditing(true);
  }

  async function saveEdit() {
    if (!item) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          category: editCategory,
          subcategory: editSubcategory || null,
          fit: editFit,
          length: ["top", "bottom", "dress", "outerwear"].includes(editCategory) ? editLength : null,
          waist_style: ["top", "bottom", "dress", "outerwear"].includes(editCategory) ? editWaistStyle : null,
          belt_compatible: editBeltCompatible,
          is_layering_piece: editLayering,
          pattern: editPatterns,
          material: editMaterials,
          formality: editFormality,
          seasons: editSeasons,
          occasions: editOccasions,
          warmth_rating: editWarmth,
          rain_appropriate: editRain,
          brand: editBrand || null,
          colors: editColors,
        }),
      });
      if (res.ok) {
        setItem(await res.json());
        setEditing(false);
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

  const subcatOptions = editCategory in SUBCATEGORY_OPTIONS
    ? SUBCATEGORY_OPTIONS[editCategory as Category]
    : [];

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
        <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="(max-width: 448px) 100vw, 448px" priority />
      </div>

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

          {/* Fit */}
          <div className="space-y-1">
            <Label>Fit</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(FIT_LABELS) as [Fit, string][]).map(([f, label]) => (
                <button key={f} type="button" onClick={() => setEditFit(f)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editFit === f ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
              ))}
            </div>
          </div>

          {/* Length */}
          {["top", "bottom", "dress", "outerwear"].includes(editCategory) && (
            <div className="space-y-1">
              <Label>Length</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(LENGTH_LABELS) as [Length, string][]).map(([l, label]) => (
                  <button key={l} type="button" onClick={() => setEditLength(l)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editLength === l ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Waist */}
          {["top", "bottom", "dress", "outerwear"].includes(editCategory) && (
            <div className="space-y-1">
              <Label>Waist</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(WAIST_STYLE_LABELS) as [WaistStyle, string][]).map(([w, label]) => (
                  <button key={w} type="button" onClick={() => setEditWaistStyle(editWaistStyle === w ? null : w)} className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition-colors", editWaistStyle === w ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Toggles row */}
          {["top", "bottom", "dress", "outerwear"].includes(editCategory) && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setEditBeltCompatible(!editBeltCompatible)} className={cn("h-5 w-5 rounded border-2 transition-colors", editBeltCompatible ? "border-primary bg-primary" : "border-muted-foreground/30")} />
                <Label className="cursor-pointer" onClick={() => setEditBeltCompatible(!editBeltCompatible)}>Works with a belt</Label>
              </div>
              {["top", "outerwear"].includes(editCategory) && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setEditLayering(!editLayering)} className={cn("h-5 w-5 rounded border-2 transition-colors", editLayering ? "border-primary bg-primary" : "border-muted-foreground/30")} />
                  <Label className="cursor-pointer" onClick={() => setEditLayering(!editLayering)}>Layering piece</Label>
                </div>
              )}
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

          {/* Formality */}
          <div className="space-y-1">
            <Label>Formality</Label>
            <Select value={editFormality} onValueChange={(v) => setEditFormality(v as Formality)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(FORMALITY_LABELS) as [Formality, string][]).map(([f, label]) => (
                  <SelectItem key={f} value={f}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {/* Warmth */}
          <div className="space-y-1">
            <Label>Warmth</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setEditWarmth(n)} className={cn("flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors", editWarmth === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{n}</button>
              ))}
            </div>
          </div>

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
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Fit</p>
                <p className="text-sm font-medium">{FIT_LABELS[item.fit]}</p>
              </CardContent>
            </Card>
            {item.length && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Length</p>
                  <p className="text-sm font-medium">{LENGTH_LABELS[item.length]}</p>
                </CardContent>
              </Card>
            )}
            {item.waist_style && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Waist</p>
                  <p className="text-sm font-medium">
                    {WAIST_STYLE_LABELS[item.waist_style]}
                    {item.belt_compatible && " · Belt-friendly"}
                  </p>
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
                <p className="text-sm font-medium">{FORMALITY_LABELS[item.formality]}</p>
              </CardContent>
            </Card>
          </div>

          {/* Warmth & Rain */}
          <div className="flex gap-3 mt-3">
            <Card className="flex-1">
              <CardContent className="p-3 flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Warmth</p>
                  <p className="text-sm font-medium">{item.warmth_rating}/5</p>
                </div>
              </CardContent>
            </Card>
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
