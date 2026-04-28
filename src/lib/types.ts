// ============================================
// Database entity types
// ============================================

export type Category = "top" | "bottom" | "dress" | "one-piece" | "outerwear" | "shoes" | "bag" | "accessory";

export type Subcategory =
  // Tops
  | "t-shirt" | "blouse" | "shirt" | "tank-top" | "crop-top" | "sweater" | "hoodie" | "cardigan"
  // Bottoms
  | "jeans" | "trousers" | "shorts" | "skirt" | "skort" | "leggings" | "sweatpants"
  // Dresses
  | "mini-dress" | "midi-dress" | "maxi-dress"
  // One-piece (jumpsuits, overalls)
  | "jumpsuit" | "overalls"
  // Outerwear
  | "jacket" | "coat" | "blazer" | "vest" | "windbreaker" | "puffer" | "bomber" | "denim-jacket" | "leather-jacket" | "trench-coat" | "peacoat" | "parka"
  // Shoes
  | "sneakers" | "boots" | "combat-boots" | "western-boots" | "chelsea-boots" | "ankle-boots" | "knee-boots" | "heels" | "sandals" | "flats" | "ballet-flats" | "loafers" | "mules" | "espadrilles"
  // Bags
  | "handbag" | "backpack" | "tote" | "clutch" | "crossbody"
  // Accessories
  | "belt" | "scarf" | "hat";

export type Pattern = "solid" | "striped" | "plaid" | "floral" | "graphic" | "polka-dot" | "animal-print" | "camo" | "abstract" | "embellished" | "other";

export type Material = "cotton" | "denim" | "wool" | "silk" | "leather" | "knit" | "polyester" | "linen" | "canvas" | "cashmere" | "chiffon" | "corduroy" | "faux-fur" | "faux-leather" | "faux-suede" | "flannel" | "fleece" | "fur-shearling" | "jersey" | "lace" | "mesh" | "modal" | "nylon" | "patent-leather" | "rayon-viscose" | "rubber" | "satin" | "sheer" | "spandex" | "suede" | "tencel" | "tulle" | "tweed" | "twill" | "velvet" | "other";

export type Fit = "slim" | "regular" | "loose" | "oversized";

export type BottomFit = "skinny" | "slim" | "straight" | "regular" | "wide-leg" | "flared" | "bootcut" | "tapered";

export type Length = "cropped" | "regular" | "long" | "extra-long";

export type PantsLength = "capri" | "ankle-crop" | "ankle" | "full" | "extra-long";

export type WaistStyle = "elastic" | "fitted" | "relaxed" | "belted";

export type WaistHeight = "high" | "mid" | "low";

export type WaistClosure = "button-zip" | "elastic" | "drawstring" | "tie" | "hook-eye" | "pull-on" | "side-zip" | "other";

export type ShoeClosure = "laces" | "velcro" | "slip-on" | "zip" | "buckle" | "elastic" | "strap" | "other";

export type BeltStyle = "plain" | "studded" | "perforated" | "woven" | "braided" | "chain" | "embellished" | "other";

export type ShoeHeight = "low" | "ankle" | "mid" | "knee" | "over-knee";

export type HeelType = "flat" | "low-heel" | "mid-heel" | "high-heel" | "platform" | "wedge";

export type BeltPosition = "waist" | "hips" | "both";

export type MetalFinish = "silver" | "gold" | "rose-gold" | "chrome" | "matte-silver" | "matte-gold" | "brass" | "bronze" | "gunmetal" | "mixed" | "none";

export type BagSize = "clutch" | "small" | "medium" | "large" | "tote";

export type BagTexture =
  | "smooth"
  | "woven"
  | "quilted"
  | "pebbled"
  | "croc-embossed"
  | "snake-embossed"
  | "fringed"
  | "other";

export type HatTexture =
  | "felt"
  | "straw"
  | "knit"
  | "canvas"
  | "leather"
  | "velvet"
  | "other";

export type HatSilhouette =
  | "baseball"
  | "trucker"
  | "bucket"
  | "fedora"
  | "beret"
  | "beanie"
  | "pillbox"
  | "headband"
  | "sun-hat"
  | "other";


export type ScarfFunction = "decorative" | "functional";

export type SkirtLength = "mini" | "knee-length" | "midi" | "maxi";

export type DressSilhouette =
  | "a-line"
  | "sheath"
  | "bodycon"
  | "wrap"
  | "slip"
  | "fit-and-flare"
  | "shift"
  | "empire"
  | "mermaid";

export type ToeShape =
  | "round"
  | "almond"
  | "pointed"
  | "square"
  | "peep-toe"
  | "open-toe";

export type Neckline = "crew" | "v-neck" | "scoop" | "square" | "boat" | "turtleneck" | "mock-neck" | "halter" | "one-shoulder" | "off-shoulder" | "asymmetric" | "collared" | "henley" | "cowl" | "sweetheart" | "other";

export type SleeveLength = "strapless" | "spaghetti" | "thin-strap" | "wide-strap" | "sleeveless" | "cap" | "short" | "elbow" | "three-quarter" | "long" | "other";

export type Closure = "pullover" | "full-button" | "partial-button" | "zipper" | "wrap-tie" | "snap" | "hook-eye" | "open-drape" | "other";

export type Formality = "very-casual" | "casual" | "smart-casual" | "business-casual" | "formal";

export type Season = "spring" | "summer" | "fall" | "winter";

export type Occasion = "work" | "casual" | "brunch" | "dinner-out" | "date" | "outdoor" | "travel" | "party" | "formal" | "at-home";

export type Mood = "energized" | "confident" | "playful" | "cozy" | "chill" | "bold" | "period" | "sad";

export type TemperatureSensitivity = "runs-hot" | "normal" | "runs-cold";

// ============================================
// Color types
// ============================================

export interface ExtractedColor {
  hex: string;
  name: string;
  percentage: number;
}

export interface HSLColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

// ============================================
// Main entities
// ============================================

export interface ClothingItem {
  id: string;
  user_id: string;
  image_url: string;
  thumbnail_url: string | null;
  name: string;
  category: Category;
  subcategory: Subcategory | null;
  colors: ExtractedColor[];
  dominant_color_hsl: HSLColor | null;
  is_neutral: boolean;
  neckline: Neckline | null;
  sleeve_length: SleeveLength | null;
  closure: Closure | null;
  pattern: Pattern | Pattern[];
  material: Material | Material[];
  fit: Fit | null;
  bottom_fit: BottomFit | null;
  length: Length | null;
  pants_length: PantsLength | null;
  waist_style: WaistStyle | null;
  waist_height: WaistHeight | null;
  waist_closure: WaistClosure | null;
  belt_position: BeltPosition | null;
  is_layering_piece: boolean;
  shoe_height: ShoeHeight | null;
  heel_type: HeelType | null;
  shoe_closure: ShoeClosure | null;
  belt_style: BeltStyle | null;
  metal_finish: MetalFinish | null;
  bag_size: BagSize | null;
  bag_texture: BagTexture | null;
  bag_metal_finish: MetalFinish | null;
  hat_texture: HatTexture | null;
  hat_silhouette: HatSilhouette | null;
  scarf_function: ScarfFunction | null;
  skirt_length: SkirtLength | null;
  dress_silhouette: DressSilhouette | null;
  toe_shape: ToeShape | null;
  formality: Formality | Formality[];
  seasons: Season[];
  occasions: Occasion[];
  warmth_rating: number; // 1-5
  brand: string | null;
  times_worn: number;
  last_worn_date: string | null;
  is_favorite: boolean;
  is_stored: boolean;
  created_at: string;
}

export interface Outfit {
  id: string;
  user_id: string;
  name: string | null;
  item_ids: string[];
  occasions: Occasion[];
  seasons: Season[];
  rating: number | null; // 1-5
  is_favorite: boolean;
  mood: Mood | null;
  weather_temp: number | null;
  weather_condition: string | null;
  ai_reasoning: string | null;
  styling_tip: string | null;
  style_notes: string | null;
  source: "ai" | "manual";
  created_at: string;
  // Joined data (not in DB)
  items?: ClothingItem[];
}

export interface OutfitLog {
  id: string;
  user_id: string;
  outfit_id: string | null;
  worn_date: string;
  weather_snapshot: WeatherSnapshot | null;
  mood: Mood | null;
  occasion: Occasion | null;
  loved_it: boolean;
  notes: string | null;
}

export type TemperatureUnit = "auto" | "celsius" | "fahrenheit";

export type Language = "auto" | "en" | "fr";

export type Gender = "woman" | "man" | "not-specified";

export interface UserPreferences {
  user_id: string;
  location: { lat: number; lng: number; city: string } | null;
  temperature_sensitivity: TemperatureSensitivity;
  temperature_unit: TemperatureUnit;
  language: Language;
  gender: Gender;
  preferred_styles: string[];
  favorite_colors: string[];
  avoided_colors: string[];
}

// ============================================
// Weather
// ============================================

export interface WeatherSnapshot {
  temp: number;
  feels_like: number;
  condition: string;
  humidity: number;
  wind_speed: number;
  precipitation_probability: number;
  uv_index: number;
}

export interface WeatherData extends WeatherSnapshot {
  location: string;
  icon: string;
}

// ============================================
// Outfit suggestion
// ============================================

export interface OutfitSuggestion {
  items: ClothingItem[];
  score: number;
  reasoning: string;
  color_harmony: string; // e.g. "analogous", "complementary"
  mood_match: string;
}

// ============================================
// UI helpers
// ============================================

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Top",
  bottom: "Bottom",
  dress: "Dress",
  "one-piece": "One-piece",
  outerwear: "Outerwear",
  shoes: "Shoes",
  bag: "Bag",
  accessory: "Accessory",
};

export const MOOD_CONFIG: Record<Mood, { emoji: string; label: string; description: string }> = {
  energized: { emoji: "⚡", label: "Energized", description: "Bright & bold" },
  confident: { emoji: "💪", label: "Confident", description: "Sharp & polished" },
  playful: { emoji: "🎨", label: "Playful", description: "Fun & colorful" },
  cozy: { emoji: "☁️", label: "Cozy", description: "Soft & warm" },
  chill: { emoji: "😌", label: "Chill", description: "Relaxed & easy" },
  bold: { emoji: "🔥", label: "Bold", description: "Statement looks" },
  period: { emoji: "🌙", label: "Comfort Day", description: "Comfy & stretchy" },
  sad: { emoji: "🫂", label: "Need a Hug", description: "Cozy or uplifting" },
};

export const OCCASION_LABELS: Record<Occasion, string> = {
  "at-home": "At Home",
  casual: "Casual",
  brunch: "Brunch",
  outdoor: "Outdoor",
  travel: "Travel",
  "dinner-out": "Dinner Out",
  work: "Work",
  date: "Date Night",
  party: "Party",
  formal: "Formal Event",
};

export const SEASON_LABELS: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
};

export const FIT_LABELS: Record<Fit, string> = {
  slim: "Slim / Fitted",
  regular: "Regular",
  loose: "Loose",
  oversized: "Oversized",
};

export const BOTTOM_FIT_LABELS: Record<BottomFit, string> = {
  skinny: "Skinny",
  slim: "Slim",
  straight: "Straight",
  regular: "Regular",
  tapered: "Tapered",
  "wide-leg": "Wide Leg",
  flared: "Flared",
  bootcut: "Bootcut",
};

export const LENGTH_LABELS: Record<Length, string> = {
  cropped: "Cropped",
  regular: "Regular",
  long: "Long",
  "extra-long": "Tunic / Extra Long",
};

export const PANTS_LENGTH_LABELS: Record<PantsLength, string> = {
  capri: "Capri",
  "ankle-crop": "Ankle Crop",
  ankle: "Ankle",
  full: "Full Length",
  "extra-long": "Extra Long",
};

export const WAIST_STYLE_LABELS: Record<WaistStyle, string> = {
  elastic: "Elastic",
  fitted: "Fitted",
  relaxed: "Relaxed",
  belted: "Belted",
};

export const WAIST_HEIGHT_LABELS: Record<WaistHeight, string> = {
  high: "High Waist",
  mid: "Mid Waist",
  low: "Low Waist",
};

// Hybrid order: common first, rest alphabetical.
export const WAIST_CLOSURE_LABELS: Record<WaistClosure, string> = {
  "button-zip": "Button & Zip",
  elastic: "Elastic",
  drawstring: "Drawstring",
  tie: "Tie",
  "hook-eye": "Hook & Eye",
  "pull-on": "Pull-on",
  "side-zip": "Side Zip",
  other: "Other",
};

export const SHOE_HEIGHT_LABELS: Record<ShoeHeight, string> = {
  low: "Low",
  ankle: "Ankle",
  mid: "Mid-Calf",
  knee: "Knee-High",
  "over-knee": "Over-Knee",
};

export const HEEL_TYPE_LABELS: Record<HeelType, string> = {
  flat: "Flat",
  "low-heel": "Low Heel",
  "mid-heel": "Mid Heel",
  "high-heel": "High Heel",
  platform: "Platform",
  wedge: "Wedge",
};

// Hybrid order: common first, rest alphabetical.
export const SHOE_CLOSURE_LABELS: Record<ShoeClosure, string> = {
  laces: "Laces",
  "slip-on": "Slip-on",
  zip: "Zipper",
  strap: "Strap",
  buckle: "Buckle",
  elastic: "Elastic",
  velcro: "Velcro",
  other: "Other",
};

export const BELT_POSITION_LABELS: Record<BeltPosition, string> = {
  waist: "Waist",
  hips: "Hips",
  both: "Both",
};

// Hybrid order: common first (plain covers ~70% of belts), rest alphabetical.
export const BELT_STYLE_LABELS: Record<BeltStyle, string> = {
  plain: "Plain",
  chain: "Chain",
  embellished: "Embellished",
  woven: "Woven",
  braided: "Braided",
  perforated: "Perforated / Cutouts",
  studded: "Studded",
  other: "Other",
};

// Hybrid order: the 5 finishes that cover ~99% of styling decisions at
// the top, niche finishes (matte / chrome / brass / bronze / gunmetal)
// at the tail in alphabetical order.
export const METAL_FINISH_LABELS: Record<MetalFinish, string> = {
  silver: "Silver",
  gold: "Gold",
  "rose-gold": "Rose Gold",
  mixed: "Mixed Metals",
  none: "None",
  brass: "Brass",
  bronze: "Bronze",
  chrome: "Chrome",
  gunmetal: "Gunmetal",
  "matte-gold": "Matte Gold",
  "matte-silver": "Matte Silver",
};

export const BAG_SIZE_LABELS: Record<BagSize, string> = {
  clutch: "Clutch",
  small: "Small",
  medium: "Medium",
  large: "Large",
  tote: "Tote",
};

export const BAG_TEXTURE_LABELS: Record<BagTexture, string> = {
  smooth: "Smooth",
  woven: "Woven",
  quilted: "Quilted",
  pebbled: "Pebbled",
  "croc-embossed": "Croc-embossed",
  "snake-embossed": "Snake-embossed",
  fringed: "Fringed",
  other: "Other",
};

export const HAT_TEXTURE_LABELS: Record<HatTexture, string> = {
  felt: "Felt",
  straw: "Straw",
  knit: "Knit",
  canvas: "Canvas",
  leather: "Leather",
  velvet: "Velvet",
  other: "Other",
};

export const HAT_SILHOUETTE_LABELS: Record<HatSilhouette, string> = {
  baseball: "Baseball cap",
  trucker: "Trucker cap",
  bucket: "Bucket hat",
  fedora: "Fedora",
  beret: "Beret",
  beanie: "Beanie",
  pillbox: "Pillbox",
  headband: "Headband",
  "sun-hat": "Sun hat",
  other: "Other",
};

export const SCARF_FUNCTION_LABELS: Record<ScarfFunction, string> = {
  decorative: "Decorative",
  functional: "Functional (warmth)",
};

export const SKIRT_LENGTH_LABELS: Record<SkirtLength, string> = {
  mini: "Mini",
  "knee-length": "Knee-length",
  midi: "Midi",
  maxi: "Maxi",
};

// Silhouette = the overall shape / cut of a dress. Used by the outfit
// engine to match dresses to body type, occasion, and weather.
export const DRESS_SILHOUETTE_LABELS: Record<DressSilhouette, string> = {
  "a-line": "A-Line",
  sheath: "Sheath",
  bodycon: "Bodycon",
  wrap: "Wrap",
  "fit-and-flare": "Fit-and-Flare",
  slip: "Slip",
  shift: "Shift",
  empire: "Empire Waist",
  mermaid: "Mermaid",
};

export const TOE_SHAPE_LABELS: Record<ToeShape, string> = {
  round: "Round",
  almond: "Almond",
  pointed: "Pointed",
  square: "Square",
  "peep-toe": "Peep-Toe",
  "open-toe": "Open-Toe",
};

// Hybrid order: most common necklines first, rest alphabetical.
export const NECKLINE_LABELS: Record<Neckline, string> = {
  crew: "Crew Neck",
  "v-neck": "V-Neck",
  scoop: "Scoop Neck",
  collared: "Collared",
  turtleneck: "Turtleneck",
  asymmetric: "Asymmetric",
  boat: "Boat Neck",
  cowl: "Cowl Neck",
  halter: "Halter",
  henley: "Henley",
  "mock-neck": "Mock Neck",
  "off-shoulder": "Off Shoulder",
  "one-shoulder": "One Shoulder",
  square: "Square Neck",
  sweetheart: "Sweetheart",
  other: "Other",
};

// Hybrid order: everyday sleeve lengths first (short / long / 3/4 /
// sleeveless), strap variants (less frequently needed) grouped at the tail.
export const SLEEVE_LENGTH_LABELS: Record<SleeveLength, string> = {
  short: "Short Sleeve",
  long: "Long Sleeve",
  "three-quarter": "3/4 Sleeve",
  sleeveless: "Sleeveless",
  cap: "Cap Sleeve",
  elbow: "Elbow",
  strapless: "Strapless",
  spaghetti: "Spaghetti Strap",
  "thin-strap": "Thin Strap",
  "wide-strap": "Wide Strap",
  other: "Other",
};

export const CLOSURE_LABELS: Record<Closure, string> = {
  pullover: "Pullover (no closure)",
  "full-button": "Full Button-up",
  "partial-button": "Partial Buttons",
  zipper: "Zipper",
  "wrap-tie": "Wrap / Tie",
  snap: "Snap",
  "hook-eye": "Hook & Eye",
  "open-drape": "Open / Drape",
  other: "Other",
};

// Hybrid order: the most commonly tagged materials first (one tap row),
// rest alphabetical. Keeps scan-speed for new users and known values.
export const MATERIAL_LABELS: Record<Material, string> = {
  // Most common (quick picks)
  cotton: "Cotton",
  denim: "Denim",
  wool: "Wool",
  silk: "Silk",
  leather: "Leather",
  knit: "Knit",
  polyester: "Polyester",
  linen: "Linen",
  // Rest alphabetical
  canvas: "Canvas",
  cashmere: "Cashmere",
  chiffon: "Chiffon",
  corduroy: "Corduroy",
  "faux-fur": "Faux Fur",
  "faux-leather": "Faux Leather",
  "faux-suede": "Faux Suede",
  flannel: "Flannel",
  fleece: "Fleece",
  "fur-shearling": "Fur / Shearling",
  jersey: "Jersey",
  lace: "Lace",
  mesh: "Mesh",
  modal: "Modal",
  nylon: "Nylon",
  "patent-leather": "Patent Leather",
  "rayon-viscose": "Rayon / Viscose",
  rubber: "Rubber",
  satin: "Satin",
  sheer: "Sheer",
  spandex: "Spandex",
  suede: "Suede",
  tencel: "Tencel",
  tulle: "Tulle",
  tweed: "Tweed",
  twill: "Twill",
  velvet: "Velvet",
  other: "Other",
};

// Hybrid order: solid dominates (~80% of items), then common prints,
// then alphabetical tail.
export const PATTERN_LABELS: Record<Pattern, string> = {
  solid: "Solid",
  striped: "Striped",
  floral: "Floral",
  plaid: "Plaid",
  graphic: "Graphic / Print",
  abstract: "Abstract",
  "animal-print": "Animal Print",
  camo: "Camo",
  embellished: "Embellished",
  "polka-dot": "Polka Dot",
  other: "Other",
};

export const FORMALITY_LABELS: Record<Formality, string> = {
  "very-casual": "Very Casual",
  casual: "Casual",
  "smart-casual": "Smart Casual",
  "business-casual": "Business Casual",
  formal: "Formal",
};

export const SUBCATEGORY_OPTIONS: Record<Category, { value: Subcategory; label: string }[]> = {
  top: [
    { value: "t-shirt", label: "T-Shirt" },
    { value: "blouse", label: "Blouse" },
    { value: "shirt", label: "Shirt" },
    { value: "tank-top", label: "Tank Top" },
    { value: "crop-top", label: "Crop Top" },
    { value: "sweater", label: "Sweater" },
    { value: "hoodie", label: "Hoodie" },
    { value: "cardigan", label: "Cardigan" },
  ],
  bottom: [
    { value: "jeans", label: "Jeans" },
    { value: "trousers", label: "Trousers" },
    { value: "shorts", label: "Shorts" },
    { value: "skirt", label: "Skirt" },
    { value: "skort", label: "Skort" },
    { value: "leggings", label: "Leggings" },
    { value: "sweatpants", label: "Sweatpants" },
  ],
  dress: [
    { value: "mini-dress", label: "Mini Dress" },
    { value: "midi-dress", label: "Midi Dress" },
    { value: "maxi-dress", label: "Maxi Dress" },
  ],
  "one-piece": [
    { value: "jumpsuit", label: "Jumpsuit" },
    { value: "overalls", label: "Overalls" },
  ],
  outerwear: [
    { value: "jacket", label: "Jacket" },
    { value: "coat", label: "Coat" },
    { value: "blazer", label: "Blazer" },
    { value: "vest", label: "Vest" },
    { value: "puffer", label: "Puffer Jacket" },
    { value: "bomber", label: "Bomber Jacket" },
    { value: "denim-jacket", label: "Denim Jacket" },
    { value: "leather-jacket", label: "Leather Jacket" },
    { value: "trench-coat", label: "Trench Coat" },
    { value: "peacoat", label: "Peacoat" },
    { value: "parka", label: "Parka" },
    { value: "windbreaker", label: "Windbreaker" },
  ],
  shoes: [
    { value: "sneakers", label: "Sneakers" },
    { value: "boots", label: "Boots" },
    { value: "ankle-boots", label: "Ankle Boots" },
    { value: "combat-boots", label: "Combat Boots" },
    { value: "western-boots", label: "Western Boots" },
    { value: "chelsea-boots", label: "Chelsea Boots" },
    { value: "knee-boots", label: "Knee-High Boots" },
    { value: "heels", label: "Heels" },
    { value: "sandals", label: "Sandals" },
    { value: "flats", label: "Flats" },
    { value: "ballet-flats", label: "Ballet Flats" },
    { value: "loafers", label: "Loafers" },
    { value: "mules", label: "Mules" },
    { value: "espadrilles", label: "Espadrilles" },
  ],
  bag: [
    { value: "handbag", label: "Handbag" },
    { value: "backpack", label: "Backpack" },
    { value: "tote", label: "Tote" },
    { value: "clutch", label: "Clutch" },
    { value: "crossbody", label: "Crossbody" },
  ],
  accessory: [
    { value: "belt", label: "Belt" },
    { value: "scarf", label: "Scarf" },
    { value: "hat", label: "Hat" },
  ],
};
