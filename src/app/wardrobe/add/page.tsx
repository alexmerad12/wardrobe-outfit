"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type {
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
  PATTERN_LABELS,
  LENGTH_LABELS,
  WAIST_STYLE_LABELS,
  MATERIAL_LABELS,
  FIT_LABELS,
  FORMALITY_LABELS,
  SEASON_LABELS,
  OCCASION_LABELS,
} from "@/lib/types";
import { hexToHSL, isNeutralColor, getColorName } from "@/lib/color-engine";
import { FASHION_COLORS } from "@/lib/fashion-colors";
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
import { Camera, Upload, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AddItemPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [subcategory, setSubcategory] = useState<Subcategory | "">("");
  const [patterns, setPatterns] = useState<Pattern[]>(["solid"]);
  const [materials, setMaterials] = useState<Material[]>(["cotton"]);
  const [fit, setFit] = useState<Fit>("regular");
  const [length, setLength] = useState<Length>("regular");
  const [waistStyle, setWaistStyle] = useState<WaistStyle | null>(null);
  const [beltCompatible, setBeltCompatible] = useState(false);
  const [isLayeringPiece, setIsLayeringPiece] = useState(false);
  const [formality, setFormality] = useState<Formality>("casual");
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [warmthRating, setWarmthRating] = useState(3);
  const [rainAppropriate, setRainAppropriate] = useState(false);
  const [brand, setBrand] = useState("");

  const [detectedColors, setDetectedColors] = useState<
    { hex: string; name: string; percentage: number }[]
  >([]);
  const [manualColors, setManualColors] = useState<
    { hex: string; name: string; percentage: number }[]
  >([]);
  const [colorPickerValue, setColorPickerValue] = useState("#ffffff");
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [detectingColors, setDetectingColors] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function extractColorsFromImage(dataUrl: string) {
    setDetectingColors(true);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 64; // sample at low res for speed
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      // Count colors by bucketing into 16-step bins
      const buckets: Record<string, number> = {};
      const totalPixels = size * size;
      for (let i = 0; i < data.length; i += 4) {
        const r = Math.round(data[i] / 32) * 32;
        const g = Math.round(data[i + 1] / 32) * 32;
        const b = Math.round(data[i + 2] / 32) * 32;
        const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        buckets[hex] = (buckets[hex] || 0) + 1;
      }

      // Sort by frequency, take top 5
      const sorted = Object.entries(buckets)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const colors = sorted.map(([hex, count]) => ({
        hex,
        name: getColorName(hex),
        percentage: Math.round((count / totalPixels) * 100),
      }));

      setDetectedColors(colors);
      setDetectingColors(false);
    };
    img.src = dataUrl;
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImagePreview(dataUrl);
      extractColorsFromImage(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function togglePattern(p: Pattern) {
    setPatterns((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function toggleMaterial(m: Material) {
    setMaterials((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  }

  function toggleSeason(season: Season) {
    setSeasons((prev) =>
      prev.includes(season)
        ? prev.filter((s) => s !== season)
        : [...prev, season]
    );
  }

  function toggleOccasion(occasion: Occasion) {
    setOccasions((prev) =>
      prev.includes(occasion)
        ? prev.filter((o) => o !== occasion)
        : [...prev, occasion]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!imageFile || !category || !name) {
      setError("Please add a photo, name, and category");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Upload image via API
      const formData = new FormData();
      formData.append("file", imageFile);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.error || "Image upload failed");
      }
      const { url: imageUrl } = await uploadRes.json();

      // Manual colors first, then detected, fallback to gray
      const allColors = [...manualColors, ...detectedColors];
      const colors = allColors.length > 0
        ? allColors
        : [{ hex: "#888888", name: "Gray", percentage: 100 }];
      const dominantHex = colors[0].hex;
      const dominant_color_hsl = hexToHSL(dominantHex);

      // Save item via API
      const itemRes = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "default",
          image_url: imageUrl,
          thumbnail_url: null,
          name,
          category,
          subcategory: subcategory || null,
          colors,
          dominant_color_hsl,
          is_neutral: isNeutralColor(dominantHex),
          pattern: patterns,
          material: materials,
          fit,
          length: ["top", "bottom", "dress", "outerwear"].includes(category) ? length : null,
          waist_style: ["top", "bottom", "dress", "outerwear"].includes(category) ? waistStyle : null,
          belt_compatible: beltCompatible,
          is_layering_piece: isLayeringPiece,
          formality,
          seasons,
          occasions,
          warmth_rating: warmthRating,
          rain_appropriate: rainAppropriate,
          brand: brand || null,
          is_favorite: false,
        }),
      });

      if (!itemRes.ok) throw new Error("Failed to save item");

      router.push("/wardrobe");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  const subcategoryOptions =
    category && category in SUBCATEGORY_OPTIONS
      ? SUBCATEGORY_OPTIONS[category as Category]
      : [];

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Add New Item</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photo upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors",
            imagePreview
              ? "border-primary/30 bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          )}
        >
          {imagePreview ? (
            <div className="relative aspect-square w-full overflow-hidden rounded-xl">
              <Image
                src={imagePreview}
                alt="Preview"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity hover:opacity-100">
                <p className="text-sm font-medium text-white">
                  Tap to change photo
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-12">
              <div className="flex gap-3">
                <Camera className="h-8 w-8 text-muted-foreground" />
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">
                Take a photo or upload
              </p>
              <p className="text-xs text-muted-foreground">
                Best results with plain background
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>

        {/* Colors */}
        {(detectedColors.length > 0 || detectingColors || manualColors.length > 0) && (
          <div className="space-y-3">
            <Label>Colors</Label>
            {detectingColors ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing colors...
              </div>
            ) : (
              <>
                {/* Detected colors with remove button */}
                {detectedColors.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Auto-detected</p>
                    <div className="flex flex-wrap gap-2">
                      {detectedColors.map((color, i) => (
                        <div
                          key={`detected-${i}`}
                          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
                        >
                          <span
                            className="h-4 w-4 rounded-full border border-border"
                            style={{ backgroundColor: color.hex }}
                          />
                          <span className="text-xs font-medium">{color.name}</span>
                          <button
                            type="button"
                            onClick={() => setDetectedColors((prev) => prev.filter((_, j) => j !== i))}
                            className="text-muted-foreground hover:text-destructive text-xs ml-0.5"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual colors */}
                {manualColors.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Manual</p>
                    <div className="flex flex-wrap gap-2">
                      {manualColors.map((color, i) => (
                        <div
                          key={`manual-${i}`}
                          className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1"
                        >
                          <span
                            className="h-4 w-4 rounded-full border border-border"
                            style={{ backgroundColor: color.hex }}
                          />
                          <span className="text-xs font-medium">{color.name}</span>
                          <button
                            type="button"
                            onClick={() => setManualColors((prev) => prev.filter((_, j) => j !== i))}
                            className="text-muted-foreground hover:text-destructive text-xs ml-0.5"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add color manually */}
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
                              <button
                                key={c.hex + c.name}
                                type="button"
                                title={c.name}
                                onClick={() => {
                                  setManualColors((prev) => [...prev, { hex: c.hex, name: c.name, percentage: 0 }]);
                                }}
                                className="h-7 w-7 rounded-full border border-border hover:ring-2 hover:ring-primary transition-all"
                                style={{ backgroundColor: c.hex }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Add color if no image yet */}
        {!imagePreview && detectedColors.length === 0 && (
          <div className="space-y-2">
            <Label>Colors</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {manualColors.map((color, i) => (
                <div
                  key={`manual-${i}`}
                  className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1"
                >
                  <span
                    className="h-4 w-4 rounded-full border border-border"
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="text-xs font-medium">{color.name}</span>
                  <button
                    type="button"
                    onClick={() => setManualColors((prev) => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive text-xs ml-0.5"
                  >
                    ×
                  </button>
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
                          <button key={c.hex + c.name} type="button" title={c.name} onClick={() => setManualColors((prev) => [...prev, { hex: c.hex, name: c.name, percentage: 0 }])} className="h-7 w-7 rounded-full border border-border hover:ring-2 hover:ring-primary transition-all" style={{ backgroundColor: c.hex }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="e.g. Blue denim jacket"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v as Category);
              setSubcategory("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Subcategory */}
        {subcategoryOptions.length > 0 && (
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={subcategory}
              onValueChange={(v) => setSubcategory(v as Subcategory)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {subcategoryOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Fit */}
        <div className="space-y-2">
          <Label>How does it fit?</Label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.entries(FIT_LABELS) as [Fit, string][]).map(([f, label]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFit(f)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                  fit === f
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Length - only for tops, bottoms, dresses, outerwear */}
        {category && ["top", "bottom", "dress", "outerwear"].includes(category) && (
          <div className="space-y-2">
            <Label>Length</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(LENGTH_LABELS) as [Length, string][]).map(([l, label]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLength(l)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    length === l
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Waist style - only for tops, bottoms, dresses, outerwear */}
        {category && ["top", "bottom", "dress", "outerwear"].includes(category) && (
          <div className="space-y-2">
            <Label>Waist</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(WAIST_STYLE_LABELS) as [WaistStyle, string][]).map(([w, label]) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWaistStyle(waistStyle === w ? null : w)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    waistStyle === w
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Belt compatible toggle */}
        {category && ["top", "bottom", "dress", "outerwear"].includes(category) && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setBeltCompatible(!beltCompatible)}
              className={cn(
                "h-5 w-5 rounded border-2 transition-colors",
                beltCompatible
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/30"
              )}
            />
            <Label className="cursor-pointer" onClick={() => setBeltCompatible(!beltCompatible)}>
              Works with a belt
            </Label>
          </div>
        )}

        {/* Layering piece toggle - for tops and outerwear */}
        {category && ["top", "outerwear"].includes(category) && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsLayeringPiece(!isLayeringPiece)}
              className={cn(
                "h-5 w-5 rounded border-2 transition-colors",
                isLayeringPiece
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/30"
              )}
            />
            <div>
              <Label className="cursor-pointer" onClick={() => setIsLayeringPiece(!isLayeringPiece)}>
                Layering piece
              </Label>
              <p className="text-xs text-muted-foreground">
                Worn over another top (vest, cardigan, open shirt...)
              </p>
            </div>
          </div>
        )}

        {/* Material */}
        <div className="space-y-2">
          <Label>Material (select all that apply)</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(MATERIAL_LABELS) as [Material, string][]).map(
              ([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMaterial(m)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    materials.includes(m)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>

        {/* Pattern */}
        <div className="space-y-2">
          <Label>Pattern (select all that apply)</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(PATTERN_LABELS) as [Pattern, string][]).map(
              ([p, label]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePattern(p)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    patterns.includes(p)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>

        {/* Formality */}
        <div className="space-y-2">
          <Label>Formality</Label>
          <Select
            value={formality}
            onValueChange={(v) => setFormality(v as Formality)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(FORMALITY_LABELS) as [Formality, string][]).map(
                ([f, label]) => (
                  <SelectItem key={f} value={f}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Seasons */}
        <div className="space-y-2">
          <Label>Seasons (select all that apply)</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(SEASON_LABELS) as [Season, string][]).map(
              ([s, label]) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSeason(s)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    seasons.includes(s)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>

        {/* Occasions */}
        <div className="space-y-2">
          <Label>Occasions (select all that apply)</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(OCCASION_LABELS) as [Occasion, string][]).map(
              ([o, label]) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => toggleOccasion(o)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    occasions.includes(o)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>

        {/* Warmth Rating */}
        <div className="space-y-2">
          <Label>Warmth (1 = very light, 5 = heavy winter)</Label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setWarmthRating(n)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                  warmthRating === n
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Rain appropriate */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRainAppropriate(!rainAppropriate)}
            className={cn(
              "h-5 w-5 rounded border-2 transition-colors",
              rainAppropriate
                ? "border-primary bg-primary"
                : "border-muted-foreground/30"
            )}
          />
          <Label className="cursor-pointer" onClick={() => setRainAppropriate(!rainAppropriate)}>
            Rain appropriate
          </Label>
        </div>

        {/* Brand (optional) */}
        <div className="space-y-2">
          <Label htmlFor="brand">Brand (optional)</Label>
          <Input
            id="brand"
            placeholder="e.g. Zara, Nike"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          className="w-full h-12 text-base"
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Add to Wardrobe"
          )}
        </Button>
      </form>
    </div>
  );
}
