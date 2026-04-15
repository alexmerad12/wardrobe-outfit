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
  Formality,
  Season,
  Occasion,
} from "@/lib/types";
import {
  CATEGORY_LABELS,
  SUBCATEGORY_OPTIONS,
  PATTERN_LABELS,
  MATERIAL_LABELS,
  FIT_LABELS,
  FORMALITY_LABELS,
  SEASON_LABELS,
  OCCASION_LABELS,
} from "@/lib/types";
import { hexToHSL } from "@/lib/color-engine";
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
import { Badge } from "@/components/ui/badge";
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
  const [pattern, setPattern] = useState<Pattern>("solid");
  const [material, setMaterial] = useState<Material>("cotton");
  const [fit, setFit] = useState<Fit>("regular");
  const [formality, setFormality] = useState<Formality>("casual");
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [warmthRating, setWarmthRating] = useState(3);
  const [rainAppropriate, setRainAppropriate] = useState(false);
  const [brand, setBrand] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
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

      if (!uploadRes.ok) throw new Error("Image upload failed");
      const { url: imageUrl } = await uploadRes.json();

      // Basic color placeholder
      const colors = [{ hex: "#888888", name: "Gray", percentage: 100 }];
      const dominant_color_hsl = hexToHSL("#888888");

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
          is_neutral: true,
          pattern,
          material,
          fit,
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
            capture="environment"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>

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

        {/* Material */}
        <div className="space-y-2">
          <Label>Material</Label>
          <Select
            value={material}
            onValueChange={(v) => setMaterial(v as Material)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(MATERIAL_LABELS) as [Material, string][]).map(
                ([m, label]) => (
                  <SelectItem key={m} value={m}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Pattern */}
        <div className="space-y-2">
          <Label>Pattern</Label>
          <Select
            value={pattern}
            onValueChange={(v) => setPattern(v as Pattern)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PATTERN_LABELS) as [Pattern, string][]).map(
                ([p, label]) => (
                  <SelectItem key={p} value={p}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
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
