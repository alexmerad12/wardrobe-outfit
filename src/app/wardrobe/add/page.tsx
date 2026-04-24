"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { ClothingItem } from "@/lib/types";
import type {
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
  BagSize,
  DressSilhouette,
  ToeShape,
  Neckline,
  SleeveLength,
  Closure,
  Formality,
  Season,
  Occasion,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/use-locale";
import { useLabels } from "@/lib/i18n/use-labels";
import { hexToHSL, isNeutralColor, getColorName, dedupeColors } from "@/lib/color-engine";
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
import { Camera, Upload, ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toColorKey } from "@/lib/color-label";
import { preloadBgRemoval, removeBg } from "@/lib/bg-removal";
import { analyzeItem, type AutoFillResult } from "@/lib/analyze-item";
import { MAX_BATCH, usePendingUploads } from "@/lib/pending-uploads-context";

export default function AddItemPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLocale();
  const labels = useLabels();
  const { addFiles: addPending } = usePendingUploads();

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removingBg, setRemovingBg] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [subcategory, setSubcategory] = useState<Subcategory | "">("");
  const [patterns, setPatterns] = useState<Pattern[]>(["solid"]);
  const [materials, setMaterials] = useState<Material[]>(["cotton"]);
  const [fit, setFit] = useState<Fit>("regular");
  const [neckline, setNeckline] = useState<Neckline | null>(null);
  const [sleeveLength, setSleeveLength] = useState<SleeveLength | null>(null);
  const [closure, setClosure] = useState<Closure | null>(null);
  const [bottomFit, setBottomFit] = useState<BottomFit>("regular");
  const [length, setLength] = useState<Length>("regular");
  const [pantsLength, setPantsLength] = useState<PantsLength>("full");
  const [waistStyle, setWaistStyle] = useState<WaistStyle | null>(null);
  const [waistHeight, setWaistHeight] = useState<WaistHeight>("mid");
  const [waistClosure, setWaistClosure] = useState<WaistClosure | null>(null);
  const [beltCompatible, setBeltCompatible] = useState(false);
  const [isLayeringPiece, setIsLayeringPiece] = useState(false);
  const [shoeHeight, setShoeHeight] = useState<ShoeHeight>("low");
  const [heelType, setHeelType] = useState<HeelType>("flat");
  const [shoeClosure, setShoeClosure] = useState<ShoeClosure | null>(null);
  const [beltStyle, setBeltStyle] = useState<BeltStyle | null>(null);
  const [beltPosition, setBeltPosition] = useState<BeltPosition>("waist");
  const [metalFinish, setMetalFinish] = useState<MetalFinish | null>(null);
  const [bagSize, setBagSize] = useState<BagSize | null>(null);
  const [dressSilhouette, setDressSilhouette] = useState<DressSilhouette | null>(null);
  const [toeShape, setToeShape] = useState<ToeShape | null>(null);
  const [formalities, setFormalities] = useState<Formality[]>(["casual"]);
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
  const [showColorPalette, setShowColorPalette] = useState(false);
  const [detectingColors, setDetectingColors] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI auto-fill state
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillApplied, setAutoFillApplied] = useState(false);
  const autoFillAppliedForRef = useRef<File | null>(null);

  // Background upload — starts uploading to Supabase as soon as the image is
  // settled (post-bg-removal), so by the time the user hits Save the image
  // is usually already there and the click feels instant.
  const uploadPromiseRef = useRef<Promise<string> | null>(null);

  // Duplicate detection
  const [existingItems, setExistingItems] = useState<ClothingItem[]>([]);
  useEffect(() => {
    fetch("/api/items").then((r) => r.ok ? r.json() : []).then(setExistingItems).catch(() => {});
  }, []);

  useEffect(() => {
    // Eagerly fetch the model weights so the first click is instant
    preloadBgRemoval();
  }, []);

  async function uploadImage(file: File): Promise<string> {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) throw new Error("Not signed in");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${session.user.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("clothing-images")
      .upload(path, file, { contentType: file.type });
    if (uploadError) throw new Error(uploadError.message);

    return supabase.storage.from("clothing-images").getPublicUrl(path).data.publicUrl;
  }

  // Start uploading the final image in the background. When bg removal
  // completes, imageFile updates to the cleaned version and this refires —
  // we just replace the promise; the earlier upload continues to Supabase
  // but its URL is ignored.
  useEffect(() => {
    if (!imageFile || removingBg) return;
    uploadPromiseRef.current = uploadImage(imageFile).catch((err) => {
      console.error("Background image upload failed:", err);
      throw err;
    });
  }, [imageFile, removingBg]);

  // AI auto-fill: once per image, send it to Claude and pre-fill the form.
  // Runs in parallel with upload + bg removal — same image, different jobs.
  useEffect(() => {
    if (!imageFile || removingBg) return;
    if (autoFillAppliedForRef.current === imageFile) return;
    const target = imageFile;
    setAutoFilling(true);
    analyzeItem(target)
      .then((result) => {
        if (imageFile !== target) return; // user swapped photos
        autoFillAppliedForRef.current = target;
        applyAutoFill(result);
        setAutoFillApplied(true);
      })
      .catch((err) => {
        console.error("Auto-fill failed:", err);
      })
      .finally(() => {
        if (imageFile === target) setAutoFilling(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFile, removingBg]);

  function applyAutoFill(r: AutoFillResult) {
    // Never overwrite a name the user has already typed.
    if (r.name && !name.trim()) setName(r.name);
    if (r.category) setCategory(r.category);
    if (r.subcategory) setSubcategory(r.subcategory);
    if (r.pattern?.length) setPatterns(r.pattern);
    if (r.material?.length) setMaterials(r.material);
    if (r.fit) setFit(r.fit);
    if (r.bottom_fit) setBottomFit(r.bottom_fit);
    if (r.length) setLength(r.length);
    if (r.pants_length) setPantsLength(r.pants_length);
    if (r.waist_style) setWaistStyle(r.waist_style);
    if (r.waist_height) setWaistHeight(r.waist_height);
    if (r.waist_closure) setWaistClosure(r.waist_closure);
    if (r.neckline) setNeckline(r.neckline);
    if (r.sleeve_length) setSleeveLength(r.sleeve_length);
    if (r.closure) setClosure(r.closure);
    if (r.shoe_height) setShoeHeight(r.shoe_height);
    if (r.heel_type) setHeelType(r.heel_type);
    if (r.shoe_closure) setShoeClosure(r.shoe_closure);
    if (r.belt_style) setBeltStyle(r.belt_style);
    if (r.metal_finish) setMetalFinish(r.metal_finish);
    if (r.bag_size) setBagSize(r.bag_size);
    if (r.dress_silhouette) setDressSilhouette(r.dress_silhouette);
    if (r.toe_shape) setToeShape(r.toe_shape);
    if (r.formality?.length) setFormalities(r.formality);
    if (r.seasons?.length) setSeasons(r.seasons);
    if (r.occasions?.length) setOccasions(r.occasions);
    if (typeof r.warmth_rating === "number") {
      // Round AI-suggested warmth to nearest 0.5 step (matches the slider's
      // increments so the UI and the value agree after autofill).
      setWarmthRating(Math.max(1, Math.min(5, Math.round(r.warmth_rating * 2) / 2)));
    }
    if (typeof r.rain_appropriate === "boolean") setRainAppropriate(r.rain_appropriate);
    if (typeof r.is_layering_piece === "boolean") setIsLayeringPiece(r.is_layering_piece);
    if (typeof r.belt_compatible === "boolean") setBeltCompatible(r.belt_compatible);

    // Only use AI colors if local corner-sampling hasn't already found some.
    if (r.colors?.length && detectedColors.length === 0) {
      const perSlice = Math.round(100 / r.colors.length);
      const aiColors = r.colors.map((c) => ({
        hex: c.hex,
        name: c.name,
        percentage: perSlice,
      }));
      setDetectedColors(dedupeColors(aiColors).slice(0, 3));
    }
  }

  const similarItems = useMemo(() => {
    if (!category || !name || name.length < 2) return [];
    return existingItems.filter((item) => {
      // Same category
      if (item.category !== category) return false;
      // Same subcategory if set
      if (subcategory && item.subcategory && item.subcategory !== subcategory) return false;
      // Similar name (case-insensitive partial match)
      const nameLower = name.toLowerCase();
      const itemLower = item.name.toLowerCase();
      if (itemLower.includes(nameLower) || nameLower.includes(itemLower)) return true;
      // Same subcategory counts as similar
      if (subcategory && item.subcategory === subcategory) return true;
      return false;
    }).slice(0, 3);
  }, [category, subcategory, name, existingItems]);

  // Helpers for category-specific logic
  const isJeansTrousers = ["jeans", "trousers"].includes(subcategory);
  const showGenericFit =
    category === "top" ||
    category === "dress" ||
    category === "one-piece" ||
    category === "outerwear" ||
    (category === "bottom" && !isJeansTrousers);
  const showBottomFit = category === "bottom" && isJeansTrousers;
  // Length: for tops and outerwear. Bottoms use pants_length instead (except skirts use generic).
  const showLength =
    (category === "top" || category === "outerwear") &&
    subcategory !== "crop-top";
  // PantsLength: for jeans, trousers, leggings, sweatpants
  const showPantsLength =
    category === "bottom" &&
    ["jeans", "trousers", "leggings", "sweatpants"].includes(subcategory);
  const showWaistStyle = ["top", "bottom", "dress", "one-piece", "outerwear"].includes(category as string);
  const showWaistHeight = category === "bottom" && isJeansTrousers;
  // Waist Closure: for all pants (jeans, trousers, leggings, sweatpants)
  const showWaistClosure =
    category === "bottom" &&
    ["jeans", "trousers", "leggings", "sweatpants"].includes(subcategory);
  const showBeltCompatible =
    category === "top" ||
    category === "bottom" ||
    category === "dress" ||
    category === "one-piece" ||
    category === "outerwear";
  const showLayeringPiece = category === "top" || category === "outerwear";
  const showShoeFields = category === "shoes";
  const showBeltPosition = category === "accessory" && subcategory === "belt";
  const showWarmth =
    !!category &&
    category !== "bag" &&
    (category !== "accessory" || subcategory === "scarf");
  const showMetalFinish =
    !!category && ["shoes", "accessory"].includes(category) && subcategory !== "scarf";
  // Neckline: hide for hoodies (hooded) and cardigans (open front)
  const showNeckline =
    ["top", "dress", "one-piece", "outerwear"].includes(category as string) &&
    subcategory !== "hoodie" &&
    subcategory !== "cardigan";
  // Sleeve length: hide for tank tops (always straps/sleeveless by nature)
  const showSleeveLength =
    ["top", "dress", "one-piece", "outerwear"].includes(category as string) &&
    subcategory !== "tank-top";
  // Closure: only for tops/outerwear where there's an actual opening,
  // and for dresses (wrap dress, button-up, zipper, etc.)
  const showClosure =
    category === "dress" ||
    category === "one-piece" ||
    category === "outerwear" ||
    (category === "top" && ["shirt", "blouse", "cardigan", "hoodie"].includes(subcategory));

  function extractColorsFromImage(dataUrl: string) {
    setDetectingColors(true);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);

      // Step 1: Sample the 4 corners to detect background color
      const cornerSize = Math.round(size * 0.12);
      const corners = [
        ctx.getImageData(0, 0, cornerSize, cornerSize).data,
        ctx.getImageData(size - cornerSize, 0, cornerSize, cornerSize).data,
        ctx.getImageData(0, size - cornerSize, cornerSize, cornerSize).data,
        ctx.getImageData(size - cornerSize, size - cornerSize, cornerSize, cornerSize).data,
      ];

      const bgBuckets: Record<string, number> = {};
      for (const cornerData of corners) {
        for (let i = 0; i < cornerData.length; i += 4) {
          const r = Math.round(cornerData[i] / 32) * 32;
          const g = Math.round(cornerData[i + 1] / 32) * 32;
          const b = Math.round(cornerData[i + 2] / 32) * 32;
          const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
          bgBuckets[hex] = (bgBuckets[hex] || 0) + 1;
        }
      }

      // Top 3 most common corner colors = background
      const backgroundColors = new Set(
        Object.entries(bgBuckets)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([hex]) => hex)
      );

      // Helper to check if a color is "close enough" to any background color
      function isBackgroundColor(hex: string): boolean {
        if (backgroundColors.has(hex)) return true;
        // Also check if it's within a tight range of any background color
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        for (const bgHex of backgroundColors) {
          const br = parseInt(bgHex.slice(1, 3), 16);
          const bg = parseInt(bgHex.slice(3, 5), 16);
          const bb = parseInt(bgHex.slice(5, 7), 16);
          const dist = Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
          if (dist < 40) return true;
        }
        return false;
      }

      // Step 2: Sample center 50% with background filtered out
      const margin = Math.round(size * 0.25);
      const innerSize = size - margin * 2;
      const centerData = ctx.getImageData(margin, margin, innerSize, innerSize).data;

      const buckets: Record<string, number> = {};
      let validPixels = 0;
      for (let i = 0; i < centerData.length; i += 4) {
        const r = Math.round(centerData[i] / 32) * 32;
        const g = Math.round(centerData[i + 1] / 32) * 32;
        const b = Math.round(centerData[i + 2] / 32) * 32;
        const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        if (isBackgroundColor(hex)) continue;
        buckets[hex] = (buckets[hex] || 0) + 1;
        validPixels++;
      }

      const sorted = Object.entries(buckets)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const colors = sorted.map(([hex, count]) => ({
        hex,
        name: getColorName(hex),
        percentage: validPixels > 0 ? Math.round((count / validPixels) * 100) : 0,
      }));

      // Merge perceptually-near-identical shades (e.g. two slightly different
      // oranges end up as one "Orange" rather than two confusingly similar
      // chips in the UI), then cap at the top 3 distinct colors.
      const deduped = dedupeColors(colors).slice(0, 3);
      setDetectedColors(deduped);
      setDetectingColors(false);
    };
    img.src = dataUrl;
  }

  async function runBgRemoval(source: File) {
    setRemovingBg(true);
    setBgError(null);
    try {
      const blob = await removeBg(source);
      const cleaned = new File([blob], source.name.replace(/\.[^.]+$/, "") + ".png", {
        type: "image/png",
      });
      setImageFile(cleaned);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setImagePreview(dataUrl);
        extractColorsFromImage(dataUrl);
      };
      reader.readAsDataURL(cleaned);
    } catch (err) {
      console.error("Background removal failed:", err);
      setBgError("Couldn't remove the background. You can keep the original or try again.");
    } finally {
      setRemovingBg(false);
    }
  }

  function handleRemoveBackground() {
    if (!imageFile) return;
    void runBgRemoval(imageFile);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Multi-select from the library → user clearly wants bulk, hand it
    // off to the background queue and show them the full-screen
    // processing page (same flow as the main + picker).
    if (files.length > 1) {
      const result = addPending(files);
      if (result.rejected > 0) {
        alert(
          `Only ${MAX_BATCH} items at a time. ${result.rejected} photo${result.rejected === 1 ? "" : "s"} not added — finish this batch, then pick another.`
        );
      }
      if (result.accepted > 0) {
        router.push("/wardrobe/uploading");
      } else {
        router.push("/wardrobe");
      }
      return;
    }

    const file = files[0];

    // Reset per-image state so auto-fill re-runs for the new photo
    autoFillAppliedForRef.current = null;
    setAutoFillApplied(false);

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImagePreview(dataUrl);
      extractColorsFromImage(dataUrl);
    };
    reader.readAsDataURL(file);

    // Auto-remove the background — matches how Photoroom/Stitch Fix flows
    // work. The preview above shows instantly; the cutout replaces it when
    // ready.
    void runBgRemoval(file);
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

  function toggleFormality(f: Formality) {
    setFormalities((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
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
      setError(t("addItem.photoRequired"));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Hot path: image already uploaded in background while the user was
      // filling out the form — just await the existing promise (usually
      // resolves immediately). If nothing was in flight, or the background
      // upload failed, upload inline as a fallback.
      let imageUrl: string;
      try {
        imageUrl = await (uploadPromiseRef.current ?? uploadImage(imageFile));
      } catch {
        imageUrl = await uploadImage(imageFile);
      }

      const allColors = [...manualColors, ...detectedColors];
      const colors = allColors.length > 0
        ? allColors
        : [{ hex: "#888888", name: "Gray", percentage: 100 }];
      const dominantHex = colors[0].hex;
      const dominant_color_hsl = hexToHSL(dominantHex);

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
          fit: showGenericFit ? fit : null,
          bottom_fit: showBottomFit ? bottomFit : null,
          length: showLength ? length : null,
          pants_length: showPantsLength ? pantsLength : null,
          waist_style: showWaistStyle ? waistStyle : null,
          waist_height: showWaistHeight ? waistHeight : null,
          waist_closure: showWaistClosure ? waistClosure : null,
          belt_compatible: beltCompatible,
          is_layering_piece: isLayeringPiece,
          shoe_height: showShoeFields ? shoeHeight : null,
          heel_type: showShoeFields ? heelType : null,
          shoe_closure: showShoeFields ? shoeClosure : null,
          belt_position: showBeltPosition ? beltPosition : null,
          belt_style: showBeltPosition ? beltStyle : null,
          neckline: showNeckline ? neckline : null,
          sleeve_length: showSleeveLength ? sleeveLength : null,
          closure: showClosure ? closure : null,
          metal_finish: showMetalFinish ? metalFinish : null,
          bag_size: category === "bag" ? bagSize : null,
          dress_silhouette: category === "dress" ? dressSilhouette : null,
          toe_shape: category === "shoes" ? toeShape : null,
          formality: formalities,
          seasons,
          occasions,
          warmth_rating: showWarmth ? warmthRating : 3,
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
    category && category in labels.SUBCATEGORY_OPTIONS
      ? labels.SUBCATEGORY_OPTIONS[category as Category]
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
        <h1 className="font-heading text-2xl font-medium tracking-tight">{t("addItem.title")}</h1>
      </div>

      {/* Bulk upload shortcut — visible before user picks a photo, so the
          "I have 30 items to add" crowd doesn't slog through one form at a
          time. */}
      {!imagePreview && (
        <button
          type="button"
          onClick={() => router.push("/wardrobe/bulk")}
          className="mb-5 w-full rounded-xl border border-[#e8b4bc] bg-[#fdf2f4] px-4 py-3 text-left transition-colors hover:bg-[#f9e3e7]"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 shrink-0 text-[#7c2d3a]" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[#7c2d3a]">
                Got a bunch of photos? Bulk upload
              </p>
              <p className="text-xs text-[#9b4050]/80">
                AI tags each one automatically — just drop them in and walk away.
              </p>
            </div>
          </div>
        </button>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photo upload */}
        {imagePreview ? (
          <div
            onClick={() => libraryInputRef.current?.click()}
            className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 overflow-hidden"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white">
              <Image
                src={imagePreview}
                alt="Preview"
                fill
                className="object-contain"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity hover:opacity-100">
                <p className="text-sm font-medium text-white">
                  {t("addItem.tapToChange")}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/10 py-10 transition-colors hover:border-muted-foreground/50 hover:bg-muted/20"
              >
                <Camera className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Take photo</span>
              </button>
              <button
                type="button"
                onClick={() => libraryInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/10 py-10 transition-colors hover:border-muted-foreground/50 hover:bg-muted/20"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Choose photo(s)</span>
                <span className="text-[10px] text-muted-foreground">
                  Up to 5 at once
                </span>
              </button>
            </div>
            {/* Same tips shown on the uploading page, here too — the
                manual-add flow bypasses that page entirely when the
                user picks only one photo, so they'd never see the
                guidance otherwise. */}
            <div className="mt-4 rounded-lg bg-[#fdf2f4] border border-[#e8b4bc] px-3 py-2.5 text-xs text-[#7c2d3a]">
              <p className="font-medium mb-1">Tips for clean backgrounds</p>
              <ul className="space-y-0.5 text-[#9b4050]/90">
                <li>• One item per photo, fully visible (no cropped edges)</li>
                <li>• Flat surface for tops, pants, knits — bed, table, floor</li>
                <li>• Hanger for coats, blazers, dresses, long skirts</li>
                <li>• Good light, no strong shadows</li>
              </ul>
            </div>
          </>
        )}
        {/* Camera: single shot, no capture attribute lets desktop fall back */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleImageChange}
        />
        {/* Library: multi-select — if more than one, the handler hands them
            off to the pending-uploads queue and redirects to /wardrobe. */}
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageChange}
        />
        {/* Legacy ref kept to avoid touching callers — unused in render */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />

        {/* Unified status bar — shows the whole pipeline (bg removal + AI
            pre-fill) as one clear progress message so the user always knows
            what's happening instead of watching a silent form. */}
        {imagePreview && (removingBg || autoFilling || autoFillApplied) && (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-[#fdf2f4] border border-[#e8b4bc] px-3 py-2.5 text-xs text-[#7c2d3a]">
            {removingBg || autoFilling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {removingBg && autoFilling
                ? "Cleaning up the photo and reading the details…"
                : removingBg
                ? "Removing the background…"
                : autoFilling
                ? "Reading the details with AI…"
                : "Pre-filled by AI — review and tweak anything below"}
            </span>
          </div>
        )}

        {/* Retry affordance — only appears if bg removal actually failed.
            The auto-trigger handles the happy path silently, so there's no
            redundant "Remove background" button cluttering the form. */}
        {imagePreview && bgError && (
          <div className="space-y-2">
            <p className="text-xs text-red-600 text-center">{bgError}</p>
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
                  Trying again…
                </>
              ) : (
                "Try removing background again"
              )}
            </Button>
          </div>
        )}

        {/* Colors (when image is present or colors detected) */}
        {(detectedColors.length > 0 || detectingColors || manualColors.length > 0) && (
          <div className="space-y-3">
            <Label>{t("addItem.colors")}</Label>
            {detectingColors ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("addItem.analyzingColors")}
              </div>
            ) : (
              <>
                {detectedColors.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">{t("addItem.detectedColors")}</p>
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
                          <span className="text-xs font-medium">{t(`color.${toColorKey(color.name)}`)}</span>
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

                {manualColors.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">{t("addItem.manualColors")}</p>
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
                          <span className="text-xs font-medium">{t(`color.${toColorKey(color.name)}`)}</span>
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
                              <button
                                key={c.hex + c.name}
                                type="button"
                                title={t(`color.${toColorKey(c.name)}`)}
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

        {/* Colors (when no image yet) */}
        {!imagePreview && detectedColors.length === 0 && (
          <div className="space-y-2">
            <Label>{t("addItem.colors")}</Label>
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
                  <span className="text-xs font-medium">{t(`color.${toColorKey(color.name)}`)}</span>
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
                {showColorPalette ? t("addItem.hidePalette") : t("addItem.colorPalette")}
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
          <Label htmlFor="name">{t("addItem.name")}</Label>
          <Input
            id="name"
            placeholder={t("addItem.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {/* Duplicate warning */}
        {similarItems.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-semibold text-amber-800 mb-1.5">{t("addItem.similar")}</p>
            <div className="flex gap-2">
              {similarItems.map((item) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted/30 flex-shrink-0">
                    <Image src={item.image_url} alt={item.name} fill className="object-contain p-0.5" sizes="40px" />
                  </div>
                  <p className="text-[11px] text-amber-700 leading-tight">{item.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category */}
        <div className="space-y-2">
          <Label>{t("addItem.category")}</Label>
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v as Category);
              setSubcategory("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("addItem.selectCategory")}>
                {(value) => (value ? labels.CATEGORY[value as Category] : t("addItem.selectCategory"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(labels.CATEGORY) as Category[]).map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {labels.CATEGORY[cat]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Subcategory */}
        {subcategoryOptions.length > 0 && (
          <div className="space-y-2">
            <Label>{t("addItem.type")}</Label>
            <Select
              value={subcategory}
              onValueChange={(v) => setSubcategory(v as Subcategory)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("addItem.selectType")}>
                  {(value) => {
                    const opt = subcategoryOptions.find((o) => o.value === value);
                    return opt ? opt.label : t("addItem.selectType");
                  }}
                </SelectValue>
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

        {/* Details - only shown once category is picked */}
        {category && <>

        {/* Generic Fit - tops, dresses, outerwear, non-jeans/trousers bottoms */}
        {category && showGenericFit && (
          <div className="space-y-2">
            <Label>{t("addItem.howDoesItFit")}</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(labels.FIT) as Fit[]).map((f) => (
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
                  {labels.FIT[f]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Neckline - tops, dresses, outerwear (hidden for hoodies, cardigans) */}
        {showNeckline && (
          <div className="space-y-2">
            <Label>{t("addItem.neckline")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.NECKLINE) as Neckline[]).map((n) => (
                <button key={n} type="button" onClick={() => setNeckline(neckline === n ? null : n)} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", neckline === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.NECKLINE[n]}</button>
              ))}
            </div>
          </div>
        )}

        {/* Sleeve Length - tops, dresses, outerwear (hidden for tank tops) */}
        {showSleeveLength && (
          <div className="space-y-2">
            <Label>{t("addItem.sleeveLength")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.SLEEVE_LENGTH) as SleeveLength[]).map((s) => (
                <button key={s} type="button" onClick={() => setSleeveLength(sleeveLength === s ? null : s)} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", sleeveLength === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.SLEEVE_LENGTH[s]}</button>
              ))}
            </div>
          </div>
        )}

        {/* Closure - tops, dresses, outerwear */}
        {showClosure && (
          <div className="space-y-2">
            <Label>{t("addItem.closure")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.CLOSURE) as Closure[]).map((c) => (
                <button key={c} type="button" onClick={() => setClosure(closure === c ? null : c)} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", closure === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.CLOSURE[c]}</button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Fit - jeans and trousers only */}
        {category && showBottomFit && (
          <div className="space-y-2">
            <Label>{t("addItem.howDoesItFit")}</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(labels.BOTTOM_FIT) as BottomFit[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setBottomFit(f)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    bottomFit === f
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.BOTTOM_FIT[f]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Length - tops, bottoms, dresses, outerwear */}
        {category && showLength && (
          <div className="space-y-2">
            <Label>{t("addItem.length")}</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(labels.LENGTH) as Length[]).map((l) => (
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
                  {labels.LENGTH[l]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pants Length - jeans, trousers, leggings, sweatpants */}
        {showPantsLength && (
          <div className="space-y-2">
            <Label>{t("addItem.length")}</Label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(labels.PANTS_LENGTH) as PantsLength[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setPantsLength(l)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    pantsLength === l
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.PANTS_LENGTH[l]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Waist Height - jeans and trousers only */}
        {category && showWaistHeight && (
          <div className="space-y-2">
            <Label>{t("addItem.waistHeight")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(labels.WAIST_HEIGHT) as WaistHeight[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWaistHeight(w)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    waistHeight === w
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.WAIST_HEIGHT[w]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Waist Closure - pants only */}
        {showWaistClosure && (
          <div className="space-y-2">
            <Label>{t("addItem.waistClosure")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.WAIST_CLOSURE) as WaistClosure[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setWaistClosure(waistClosure === c ? null : c)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    waistClosure === c
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.WAIST_CLOSURE[c]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Waist Style - tops, bottoms, dresses, outerwear */}
        {category && showWaistStyle && (
          <div className="space-y-2">
            <Label>{t("addItem.waist")}</Label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(labels.WAIST_STYLE) as WaistStyle[]).map((w) => (
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
                  {labels.WAIST_STYLE[w]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Belt compatible toggle - tops, bottoms, dresses, outerwear */}
        {category && showBeltCompatible && (
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
              {t("addItem.worksWithBelt")}
            </Label>
          </div>
        )}

        {/* Layering piece toggle - tops and outerwear */}
        {category && showLayeringPiece && (
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
                {t("addItem.layeringPiece")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("addItem.layeringHint")}
              </p>
            </div>
          </div>
        )}

        {/* Shoe Height - shoes only */}
        {category && showShoeFields && (
          <div className="space-y-2">
            <Label>{t("addItem.shoeHeight")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(labels.SHOE_HEIGHT) as ShoeHeight[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setShoeHeight(h)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    shoeHeight === h
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.SHOE_HEIGHT[h]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Heel Type - shoes only */}
        {category && showShoeFields && (
          <div className="space-y-2">
            <Label>{t("addItem.heelType")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(labels.HEEL_TYPE) as HeelType[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHeelType(h)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    heelType === h
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.HEEL_TYPE[h]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Shoe Closure - shoes only */}
        {category && showShoeFields && (
          <div className="space-y-2">
            <Label>{t("addItem.closure")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.SHOE_CLOSURE) as ShoeClosure[]).map((c) => (
                <button key={c} type="button" onClick={() => setShoeClosure(shoeClosure === c ? null : c)} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", shoeClosure === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.SHOE_CLOSURE[c]}</button>
              ))}
            </div>
          </div>
        )}

        {/* Belt Style - belt subcategory only */}
        {category && showBeltPosition && (
          <div className="space-y-2">
            <Label>{t("addItem.beltStyle")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.BELT_STYLE) as BeltStyle[]).map((b) => (
                <button key={b} type="button" onClick={() => setBeltStyle(beltStyle === b ? null : b)} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", beltStyle === b ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.BELT_STYLE[b]}</button>
              ))}
            </div>
          </div>
        )}

        {/* Belt Position - belt subcategory only */}
        {category && showBeltPosition && (
          <div className="space-y-2">
            <Label>{t("addItem.beltPosition")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(labels.BELT_POSITION) as BeltPosition[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBeltPosition(b)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    beltPosition === b
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.BELT_POSITION[b]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Metal Finish - shoes & accessories (excluding scarf) */}
        {showMetalFinish && (
          <div className="space-y-2">
            <Label>{t("addItem.metalFinish")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.METAL_FINISH) as MetalFinish[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetalFinish(metalFinish === m ? null : m)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    metalFinish === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.METAL_FINISH[m]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bag Size - only for bags */}
        {category === "bag" && (
          <div className="space-y-2">
            <Label>{t("addItem.bagSize")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.BAG_SIZE) as BagSize[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBagSize(bagSize === b ? null : b)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    bagSize === b
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.BAG_SIZE[b]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dress Silhouette - only for dresses */}
        {category === "dress" && (
          <div className="space-y-2">
            <Label>{t("addItem.dressSilhouette")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.DRESS_SILHOUETTE) as DressSilhouette[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDressSilhouette(dressSilhouette === s ? null : s)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    dressSilhouette === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.DRESS_SILHOUETTE[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Toe Shape - only for shoes */}
        {category === "shoes" && (
          <div className="space-y-2">
            <Label>{t("addItem.toeShape")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.TOE_SHAPE) as ToeShape[]).map((ts) => (
                <button
                  key={ts}
                  type="button"
                  onClick={() => setToeShape(toeShape === ts ? null : ts)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    toeShape === ts
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.TOE_SHAPE[ts]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Material */}
        <div className="space-y-2">
          <Label>{t("addItem.materialSelect")}</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(labels.MATERIAL) as Material[]).map((m) => (
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
                {labels.MATERIAL[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Pattern */}
        <div className="space-y-2">
          <Label>{t("addItem.patternSelect")}</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(labels.PATTERN) as Pattern[]).map((p) => (
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
                {labels.PATTERN[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Formality - multi-select toggle buttons */}
        <div className="space-y-2">
          <Label>{t("addItem.formality")}</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(labels.FORMALITY) as Formality[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => toggleFormality(f)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  formalities.includes(f)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                )}
              >
                {labels.FORMALITY[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Seasons */}
        <div className="space-y-2">
          <Label>{t("addItem.seasons")}</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(labels.SEASON) as Season[]).map((s) => (
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
                {labels.SEASON[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Occasions */}
        <div className="space-y-2">
          <Label>{t("addItem.occasions")}</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(labels.OCCASION) as Occasion[]).map((o) => (
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
                {labels.OCCASION[o]}
              </button>
            ))}
          </div>
        </div>

        {/* Warmth Rating - hidden for shoes, bags, non-scarf accessories */}
        {category && showWarmth && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label>{t("addItem.warmth")}</Label>
              <span className="text-sm font-semibold tabular-nums text-primary">
                {warmthRating.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={0.5}
              value={warmthRating}
              onChange={(e) => setWarmthRating(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label={t("addItem.warmth")}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            </div>
          </div>
        )}

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
          <div>
            <Label className="cursor-pointer" onClick={() => setRainAppropriate(!rainAppropriate)}>
              {t("addItem.rainAppropriate")}
            </Label>
            <p className="text-xs text-muted-foreground">{t("addItem.rainAppropriateHint")}</p>
          </div>
        </div>

        {/* Brand (optional) */}
        <div className="space-y-2">
          <Label htmlFor="brand">{t("addItem.brand")}</Label>
          <Input
            id="brand"
            placeholder={t("addItem.brandPlaceholder")}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </div>

        </>}

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
              {t("common.saving")}
            </>
          ) : (
            t("addItem.submit")
          )}
        </Button>
      </form>
    </div>
  );
}
