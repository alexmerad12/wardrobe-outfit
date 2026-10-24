"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
  BagTexture,
  HatSilhouette,
  ScarfFunction,
  SkirtLength,
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
import { analyzeItem, type AutoFillResult } from "@/lib/analyze-item";
import { convertHeicToJpeg, isHeicFileDeep } from "@/lib/heic-convert";
import { MAX_BATCH, usePendingUploads } from "@/lib/pending-uploads-context";
import { getPreferences } from "@/lib/preferences-client";

export default function AddItemPage() {
  const router = useRouter();
  const { addFiles } = usePendingUploads();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const { t, locale } = useLocale();
  const labels = useLabels();
  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  // Original pre-bg-removal photo, kept around so AI analyze always sees
  // the full-context image (the bg-removed PNG strips the surroundings
  // and Gemini Vision misclassifies sparse silhouettes — the bulk pipeline
  // already does this; single-add was sending the cleaned image instead).
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
  // belt_compatible is no longer a manual flag — derived from
  // silhouette / fit / waist_style at suggest time. DB column kept
  // for legacy compatibility; we just don't write to it from here
  // anymore (always false on new items).
  const [isLayeringPiece, setIsLayeringPiece] = useState(false);
  const [shoeHeight, setShoeHeight] = useState<ShoeHeight>("low");
  const [heelType, setHeelType] = useState<HeelType>("flat");
  const [shoeClosure, setShoeClosure] = useState<ShoeClosure | null>(null);
  const [beltStyle, setBeltStyle] = useState<BeltStyle | null>(null);
  const [beltPosition, setBeltPosition] = useState<BeltPosition>("waist");
  const [metalFinish, setMetalFinish] = useState<MetalFinish | null>(null);
  const [bagSize, setBagSize] = useState<BagSize | null>(null);
  const [bagTexture, setBagTexture] = useState<BagTexture | null>(null);
  const [hatSilhouette, setHatSilhouette] = useState<HatSilhouette | null>(null);
  const [scarfFunction, setScarfFunction] = useState<ScarfFunction | null>(null);
  const [skirtLength, setSkirtLength] = useState<SkirtLength | null>(null);
  const [bagMetalFinish, setBagMetalFinish] = useState<MetalFinish | null>(null);
  const [userGender, setUserGender] = useState<"woman" | "man" | "not-specified">("woman");
  const [dressSilhouette, setDressSilhouette] = useState<DressSilhouette | null>(null);
  const [toeShape, setToeShape] = useState<ToeShape | null>(null);
  const [formalities, setFormalities] = useState<Formality[]>(["casual"]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [warmthRating, setWarmthRating] = useState(3);
  // rain_appropriate is no longer asked of the user — derived from material
  // + subcategory by the AI stylist's rain-intelligence rules.
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

  // Image pipeline, started the moment a photo is picked: upload the
  // original, then cut out the background on the server (/api/items/
  // normalize, self-hosted model). Resolves to the URL the item is saved
  // with: the clean cutout, or the raw upload if the cutout failed. By the
  // time the user has checked the form, Save usually has nothing to wait on.
  const imagePromiseRef = useRef<Promise<string> | null>(null);
  // Bumped per photo so a slow result for a replaced photo is ignored.
  const imageGenerationRef = useRef(0);

  // Pull the user's gender preference once on mount. Used to gate
  // feminine-specific fields (skirt_length, dress_silhouette) when the
  // user is on Track B (men's logic).
  useEffect(() => {
    getPreferences()
      .then((p) => {
        if (p?.gender === "man" || p?.gender === "woman" || p?.gender === "not-specified") {
          setUserGender(p.gender);
        }
      })
      .catch(() => {});
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

  function startImageProcessing(file: File): Promise<string> {
    const generation = ++imageGenerationRef.current;
    const isCurrent = () => generation === imageGenerationRef.current;
    setRemovingBg(true);
    setBgError(null);
    const promise = (async () => {
      const rawUrl = await uploadImage(file);
      const pathMatch = rawUrl.match(/\/object\/public\/clothing-images\/(.+)$/);
      if (!pathMatch) return rawUrl;
      try {
        const res = await fetch("/api/items/normalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourcePath: pathMatch[1] }),
        });
        if (!res.ok) throw new Error(`normalize ${res.status}`);
        const normalized = (await res.json()) as { url?: string; bgRemoved?: boolean };
        const url = normalized.url ?? rawUrl;
        if (isCurrent()) {
          if (normalized.bgRemoved === false) setBgError(t("addItem.bgRemovalFailed"));
          // Swap the preview to the clean photo and read colours from it:
          // with the background gone there's nothing to filter out.
          const blob = await fetch(url).then((r) => r.blob());
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (!isCurrent()) return;
            const dataUrl = ev.target?.result as string;
            setImagePreview(dataUrl);
            extractColorsFromImage(dataUrl);
          };
          reader.readAsDataURL(blob);
        }
        return url;
      } catch (err) {
        console.warn("[add-item] background removal failed, keeping the original photo:", err);
        if (isCurrent()) setBgError(t("addItem.bgRemovalFailed"));
        return rawUrl;
      }
    })();
    promise
      .catch((err) => console.error("[add-item] photo upload failed:", err))
      .finally(() => {
        if (isCurrent()) setRemovingBg(false);
      });
    imagePromiseRef.current = promise;
    return promise;
  }

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
    if (r.bag_texture) setBagTexture(r.bag_texture);
    if (r.hat_silhouette) setHatSilhouette(r.hat_silhouette);
    if (r.scarf_function) setScarfFunction(r.scarf_function);
    if (r.skirt_length) setSkirtLength(r.skirt_length);
    if (r.bag_metal_finish) setBagMetalFinish(r.bag_metal_finish);
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
    // rain_appropriate intentionally not consumed from autofill anymore.
    if (typeof r.is_layering_piece === "boolean") setIsLayeringPiece(r.is_layering_piece);
    // belt_compatible field deprecated — no longer consumed from autofill.

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

  // AI auto-fill: once per ORIGINAL photo, send the full photo (more
  // context than the cut-out) to Gemini and pre-fill the form. Started from
  // the photo-pick handler, in parallel with background removal. A result
  // for a photo the user already replaced is ignored (the old effect's
  // "swapped photos" check compared two values from the same closure, so
  // it never fired).
  const autoFillGenerationRef = useRef(0);
  function startAutoFill(file: File) {
    if (autoFillAppliedForRef.current === file) return;
    const generation = ++autoFillGenerationRef.current;
    setAutoFilling(true);
    analyzeItem(file, locale)
      .then((result) => {
        if (generation !== autoFillGenerationRef.current) return;
        autoFillAppliedForRef.current = file;
        applyAutoFill(result);
        setAutoFillApplied(true);
      })
      .catch((err) => {
        console.error("Auto-fill failed:", err);
      })
      .finally(() => {
        if (generation === autoFillGenerationRef.current) setAutoFilling(false);
      });
  }

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
  // PantsLength: for jeans, trousers, leggings, sweatpants — and for
  // jumpsuits + overalls, which have the same leg-cuff styling concern
  // as trousers (and short denim overalls / cropped jumpsuits exist).
  const showPantsLength =
    (category === "bottom" &&
      ["jeans", "trousers", "leggings", "sweatpants"].includes(subcategory)) ||
    (category === "one-piece" && ["jumpsuit", "overalls"].includes(subcategory));
  // Waist style: where it actually means something. On tops only on
  // shirt/blouse (peplum, fitted, elastic-waist blouse). On outerwear
  // only on belted-style coats (trench, peacoat). Bottoms / dresses /
  // jumpsuit always have a meaningful waist.
  const showWaistStyle =
    category === "bottom" ||
    category === "dress" ||
    (category === "top" && ["shirt", "blouse"].includes(subcategory)) ||
    (category === "one-piece" && subcategory === "jumpsuit") ||
    (category === "outerwear" && ["trench-coat", "peacoat"].includes(subcategory));
  const showWaistHeight = category === "bottom" && isJeansTrousers;
  // Waist Closure: for all pants (jeans, trousers, leggings, sweatpants)
  const showWaistClosure =
    category === "bottom" &&
    ["jeans", "trousers", "leggings", "sweatpants"].includes(subcategory);
  const showLayeringPiece = category === "top" || category === "outerwear";
  const showShoeFields = category === "shoes";
  // Shoe height (low / ankle / mid / knee / over-knee) only varies on
  // boots — every other shoe type is "low" by definition.
  const showShoeHeight =
    category === "shoes" &&
    ["boots", "combat-boots", "western-boots", "chelsea-boots", "ankle-boots", "knee-boots"].includes(subcategory);
  const showBeltPosition = category === "accessory" && subcategory === "belt";
  const showWarmth =
    !!category &&
    category !== "bag" &&
    (category !== "accessory" || subcategory === "scarf");
  // Metal finish: shoes (buckles / zippers) + belt buckle.
  // Hide on hat, scarf where hardware isn't a styling driver.
  const showMetalFinish =
    category === "shoes" ||
    (category === "accessory" && subcategory === "belt");
  const showMaterial = true;
  const showHatSilhouette = category === "accessory" && subcategory === "hat";
  const showScarfFunction = category === "accessory" && subcategory === "scarf";
  const showSkirtLength =
    category === "bottom" && subcategory === "skirt" && userGender !== "man";
  const showBagMetalFinish = category === "bag";
  // Hide feminine-specific fields when the user is on the men's track.
  const showDressSilhouette = category === "dress" && userGender !== "man";
  // Neckline: hide for hoodies (hooded), cardigans (open front), and
  // overalls (the bib isn't a neckline — it's the underneath top that
  // determines the visual neckline).
  const showNeckline =
    ["top", "dress", "one-piece", "outerwear"].includes(category as string) &&
    subcategory !== "hoodie" &&
    subcategory !== "cardigan" &&
    subcategory !== "overalls";
  // Sleeve length: hide for tank tops and overalls (both sleeveless
  // by nature — overalls are bib + shoulder straps).
  const showSleeveLength =
    ["top", "dress", "one-piece", "outerwear"].includes(category as string) &&
    subcategory !== "tank-top" &&
    subcategory !== "overalls";
  // Closure: only for tops/outerwear where there's an actual opening,
  // and for dresses (wrap dress, button-up, zipper, etc.). Overalls
  // have side buttons but it's a minor detail with no styling impact.
  const showClosure =
    category === "dress" ||
    (category === "one-piece" && subcategory !== "overalls") ||
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

  // Retry button (only shown after a failed cutout): run the whole image
  // pipeline again for the current photo.
  function handleRemoveBackground() {
    if (!imageFile) return;
    void startImageProcessing(imageFile).catch(() => {});
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Multi-photo selection → hand off to the bulk pipeline. Single-photo
    // stays here for review/edit with AI pre-fill.
    if (files.length > 1) {
      const result = addFiles(files);
      if (result.rejected > 0) {
        // Same translated message as the + button (it was English here).
        alert(t("wardrobe.batchCapAlert", { max: MAX_BATCH, count: result.rejected }));
      }
      if (result.accepted > 0) {
        router.push("/wardrobe/bulk");
      }
      e.target.value = "";
      return;
    }

    let file = files[0];

    // HEIC → JPEG client-side. Chrome can't render HEIC in <img> from
    // a blob URL, so without this the preview shows a broken icon and
    // every downstream canvas operation fails on the same source.
    // Magic-byte check catches Samsung/Android share-sheet pickers that
    // strip the MIME type and fudge the filename to .jpg.
    if (await isHeicFileDeep(file)) {
      try {
        file = await convertHeicToJpeg(file);
      } catch (err) {
        console.error("HEIC conversion failed:", err);
        setError(t("addItem.heicReadFailed"));
        return;
      }
    }

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

    // Background removal starts now, on the server: the optimistic
    // preview above is the raw photo and swaps to the clean cutout as
    // soon as it's ready, while the AI pre-fill runs in parallel.
    void startImageProcessing(file).catch(() => {});
    startAutoFill(file);
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
      // Usually already settled: the upload + cutout started when the photo
      // was picked. The promise only rejects if the UPLOAD itself failed
      // (cutout failures resolve to the raw photo), so retry once inline.
      let imageUrl: string;
      try {
        imageUrl = await (imagePromiseRef.current ?? startImageProcessing(imageFile));
      } catch {
        imageUrl = await startImageProcessing(imageFile);
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
          material: showMaterial ? materials : [],
          fit: showGenericFit ? fit : null,
          bottom_fit: showBottomFit ? bottomFit : null,
          length: showLength ? length : null,
          pants_length: showPantsLength ? pantsLength : null,
          waist_style: showWaistStyle ? waistStyle : null,
          waist_height: showWaistHeight ? waistHeight : null,
          waist_closure: showWaistClosure ? waistClosure : null,
          is_layering_piece: isLayeringPiece,
          shoe_height: showShoeHeight ? shoeHeight : null,
          heel_type: showShoeFields ? heelType : null,
          shoe_closure: showShoeFields ? shoeClosure : null,
          belt_position: showBeltPosition ? beltPosition : null,
          belt_style: showBeltPosition ? beltStyle : null,
          neckline: showNeckline ? neckline : null,
          sleeve_length: showSleeveLength ? sleeveLength : null,
          closure: showClosure ? closure : null,
          metal_finish: showMetalFinish ? metalFinish : null,
          bag_size: category === "bag" ? bagSize : null,
          bag_texture: category === "bag" ? bagTexture : null,
          hat_silhouette: showHatSilhouette ? hatSilhouette : null,
          scarf_function: showScarfFunction ? scarfFunction : null,
          skirt_length: showSkirtLength ? skirtLength : null,
          bag_metal_finish: showBagMetalFinish ? bagMetalFinish : null,
          dress_silhouette: showDressSilhouette ? dressSilhouette : null,
          toe_shape: category === "shoes" ? toeShape : null,
          formality: formalities,
          seasons,
          occasions,
          warmth_rating: showWarmth ? warmthRating : 3,
          // rain_appropriate not sent — DB column has default false; new
          // automated rain logic uses material + subcategory instead.
          brand: brand || null,
          is_favorite: false,
        }),
      });

      if (!itemRes.ok) throw new Error("Failed to save item");

      router.push("/wardrobe");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("addItem.somethingWentWrong"));
      setSaving(false);
    }
  }

  // Skort is a women's-track subcategory — hide it from men's selection.
  const subcategoryOptions = (() => {
    if (!category || !(category in labels.SUBCATEGORY_OPTIONS)) return [];
    const all = labels.SUBCATEGORY_OPTIONS[category as Category];
    if (userGender === "man" && category === "bottom") {
      return all.filter((o) => o.value !== "skort" && o.value !== "skirt");
    }
    return all;
  })();

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          // Back goes to /wardrobe (not browser history) so the user
          // lands on the grid where the pending-upload tile is already
          // visible — they see their upload is in-flight instead of
          // ending up wherever they came from with no feedback.
          onClick={() => router.push("/wardrobe")}
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-heading text-2xl font-medium tracking-tight">{t("addItem.title")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photo upload */}
        {imagePreview ? (
          <div
            onClick={() => libraryInputRef.current?.click()}
            className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 overflow-hidden"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-photo">
              <Image
                src={imagePreview}
                alt={t("bulk.altClothingItem")}
                fill
                className="object-contain"
              />
              {/* Always visible: a phone has no hover (the hover-only
                  overlay hid "change the photo" on mobile). */}
              <div className="absolute inset-0 flex items-end justify-center pb-3 transition-colors hover:bg-black/20">
                <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-2 text-sm font-medium text-white">
                  <Camera className="h-4 w-4" />
                  {t("addItem.tapToChange")}
                </span>
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
                <span className="text-sm font-medium">{t("wardrobe.takePhoto")}</span>
              </button>
              <button
                type="button"
                onClick={() => libraryInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/10 py-10 transition-colors hover:border-muted-foreground/50 hover:bg-muted/20"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">{t("wardrobe.chooseFromLibrary")}</span>
              </button>
            </div>
            {/* Same tips shown on the uploading page, here too — the
                manual-add flow bypasses that page entirely when the
                user picks only one photo, so they'd never see the
                guidance otherwise. */}
            <div className="mt-4 border-t border-b border-border py-3">
              <p className="editorial-label mb-2">{t("wardrobe.photoTipsTitle")}</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• {t("wardrobe.photoTipOneItem")}</li>
                <li>• {t("wardrobe.photoTipFlat")}</li>
                <li>• {t("wardrobe.photoTipHanger")}</li>
                <li>• {t("wardrobe.photoTipLight")}</li>
                <li>• {t("wardrobe.photoTipBatch")}</li>
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
            off to the pending-uploads queue and redirects to /wardrobe/bulk. */}
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
          <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 border border-border px-3 py-2.5 text-xs text-muted-foreground">
            {removingBg || autoFilling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {removingBg && autoFilling
                ? t("addItem.statusCleaningAndReading")
                : removingBg
                ? t("addItem.statusRemovingBg")
                : autoFilling
                ? t("addItem.statusReadingDetails")
                : t("addItem.statusPrefilledDone")}
            </span>
          </div>
        )}

        {/* Retry affordance — only appears if bg removal actually failed.
            The auto-trigger handles the happy path silently, so there's no
            redundant "Remove background" button cluttering the form. */}
        {imagePreview && bgError && (
          <div className="space-y-2">
            <p className="text-xs text-red-600 dark:text-red-400 text-center">{bgError}</p>
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
                  {t("addItem.tryingAgain")}
                </>
              ) : (
                t("addItem.tryRemovingBgAgain")
              )}
            </Button>
          </div>
        )}

        {/* Photo first (owner's call, 2026-10-24): the form appears once
            a photo is picked and Linette has read it, already filled in.
            While she reads, the photo and the status line above are all
            there is; if the read fails the form appears empty to fill. */}
        {imagePreview && !autoFilling && (<>

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
                            className="h-4 w-4 rounded-full border border-swatch"
                            style={{ backgroundColor: color.hex }}
                          />
                          <span className="text-xs font-medium">{t(`color.${toColorKey(color.name)}`)}</span>
                          <button
                            type="button"
                            aria-label={t("common.remove")}
                            onClick={() => setDetectedColors((prev) => prev.filter((_, j) => j !== i))}
                            className="-my-1 -mr-1.5 ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm text-muted-foreground hover:text-destructive pointer-coarse:-my-3.5 pointer-coarse:-mr-3.5 pointer-coarse:h-11 pointer-coarse:w-11"
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
                            className="h-4 w-4 rounded-full border border-swatch"
                            style={{ backgroundColor: color.hex }}
                          />
                          <span className="text-xs font-medium">{t(`color.${toColorKey(color.name)}`)}</span>
                          <button
                            type="button"
                            aria-label={t("common.remove")}
                            onClick={() => setManualColors((prev) => prev.filter((_, j) => j !== i))}
                            className="-my-1 -mr-1.5 ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm text-muted-foreground hover:text-destructive pointer-coarse:-my-3.5 pointer-coarse:-mr-3.5 pointer-coarse:h-11 pointer-coarse:w-11"
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
                                className="h-7 w-7 rounded-full border border-swatch hover:ring-2 hover:ring-primary transition-all"
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
                    "tap-h rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
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
                <button key={n} type="button" onClick={() => setNeckline(neckline === n ? null : n)} className={cn("tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", neckline === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.NECKLINE[n]}</button>
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
                <button key={s} type="button" onClick={() => setSleeveLength(sleeveLength === s ? null : s)} className={cn("tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", sleeveLength === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.SLEEVE_LENGTH[s]}</button>
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
                <button key={c} type="button" onClick={() => setClosure(closure === c ? null : c)} className={cn("tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", closure === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.CLOSURE[c]}</button>
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
                    "tap-h rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
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
                    "tap-h rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
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
                    "tap-h rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
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
                    "tap-h rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
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
                    "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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
                    "tap-h rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
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

        {/* (Belt compatibility is now derived from silhouette / fit /
            waist_style — no manual flag needed.) */}

        {/* Layering piece toggle - tops and outerwear */}
        {category && showLayeringPiece && (
          <div className="flex items-center gap-3">
            {/* A real checkbox for screen readers, with a 44 px tap area
                around the 20 px box (the padding is cancelled by the
                negative margin, so the layout doesn't move). */}
            <button
              type="button"
              role="checkbox"
              aria-checked={isLayeringPiece}
              aria-label={t("addItem.layeringPiece")}
              onClick={() => setIsLayeringPiece(!isLayeringPiece)}
              className="-m-3 inline-flex shrink-0 items-center justify-center p-3"
            >
              <span
                className={cn(
                  "h-5 w-5 rounded border-2 transition-colors",
                  isLayeringPiece
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/30"
                )}
              />
            </button>
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

        {/* Shoe Height - boots only */}
        {showShoeHeight && (
          <div className="space-y-2">
            <Label>{t("addItem.shoeHeight")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(labels.SHOE_HEIGHT) as ShoeHeight[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setShoeHeight(h)}
                  className={cn(
                    "tap-h rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
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
                    "tap-h rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
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
                <button key={c} type="button" onClick={() => setShoeClosure(shoeClosure === c ? null : c)} className={cn("tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", shoeClosure === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.SHOE_CLOSURE[c]}</button>
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
                <button key={b} type="button" onClick={() => setBeltStyle(beltStyle === b ? null : b)} className={cn("tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", beltStyle === b ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>{labels.BELT_STYLE[b]}</button>
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
                    "tap-h rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
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
                    "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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
                    "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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

        {/* Bag Texture - only for bags */}
        {category === "bag" && (
          <div className="space-y-2">
            <Label>{t("addItem.bagTexture")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.BAG_TEXTURE) as BagTexture[]).map((tx) => (
                <button
                  key={tx}
                  type="button"
                  onClick={() => setBagTexture(bagTexture === tx ? null : tx)}
                  className={cn(
                    "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    bagTexture === tx
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.BAG_TEXTURE[tx]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dress Silhouette - only for dresses (Track A only) */}
        {showDressSilhouette && (
          <div className="space-y-2">
            <Label>{t("addItem.dressSilhouette")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.DRESS_SILHOUETTE) as DressSilhouette[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDressSilhouette(dressSilhouette === s ? null : s)}
                  className={cn(
                    "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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

        {/* Hat Silhouette - only for accessory/hat */}
        {showHatSilhouette && (
          <div className="space-y-2">
            <Label>{t("addItem.hatSilhouette")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.HAT_SILHOUETTE) as HatSilhouette[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setHatSilhouette(hatSilhouette === s ? null : s)}
                  className={cn(
                    "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    hatSilhouette === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.HAT_SILHOUETTE[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scarf Function - only for accessory/scarf */}
        {showScarfFunction && (
          <div className="space-y-2">
            <Label>{t("addItem.scarfFunction")}</Label>
            <div className="flex gap-2">
              {(Object.keys(labels.SCARF_FUNCTION) as ScarfFunction[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScarfFunction(scarfFunction === s ? null : s)}
                  className={cn(
                    "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    scarfFunction === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.SCARF_FUNCTION[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Skirt Length - only for bottom/skirt (Track A only) */}
        {showSkirtLength && (
          <div className="space-y-2">
            <Label>{t("addItem.skirtLength")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.SKIRT_LENGTH) as SkirtLength[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSkirtLength(skirtLength === s ? null : s)}
                  className={cn(
                    "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    skirtLength === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  {labels.SKIRT_LENGTH[s]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bag Metal Finish - only for bags */}
        {showBagMetalFinish && (
          <div className="space-y-2">
            <Label>{t("addItem.bagMetalFinish")}</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(labels.METAL_FINISH) as MetalFinish[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setBagMetalFinish(bagMetalFinish === m ? null : m)}
                  className={cn(
                    "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    bagMetalFinish === m
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
                    "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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
        {showMaterial && (
        <div className="space-y-2">
          <Label>{t("addItem.materialSelect")}</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(labels.MATERIAL) as Material[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleMaterial(m)}
                className={cn(
                  "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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
        )}

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
                  "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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
                  "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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
                  "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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
                  "tap-h rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
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
              className="tap-h w-full accent-primary"
              aria-label={t("addItem.warmth")}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
            </div>
          </div>
        )}

        {/* Rain-appropriate is now derived automatically from material
            + subcategory by the AI stylist (Material-Intelligence rule).
            No user toggle. */}

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

        </>)}

        {/* Error — outside the photo-first gate: a photo that can't be
            read (HEIC) reports here before there is any preview. */}
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Submit */}
        {imagePreview && !autoFilling && (
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
        )}
      </form>
    </div>
  );
}
