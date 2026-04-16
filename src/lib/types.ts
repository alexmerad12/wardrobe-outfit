// ============================================
// Database entity types
// ============================================

export type Category = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "bag" | "accessory";

export type Subcategory =
  // Tops
  | "t-shirt" | "blouse" | "shirt" | "tank-top" | "crop-top" | "sweater" | "hoodie" | "cardigan"
  // Bottoms
  | "jeans" | "trousers" | "shorts" | "skirt" | "leggings" | "sweatpants"
  // Dresses
  | "mini-dress" | "midi-dress" | "maxi-dress" | "jumpsuit"
  // Outerwear
  | "jacket" | "coat" | "blazer" | "vest" | "windbreaker"
  // Shoes
  | "sneakers" | "boots" | "heels" | "sandals" | "flats" | "loafers"
  // Bags
  | "handbag" | "backpack" | "tote" | "clutch" | "crossbody"
  // Accessories
  | "belt" | "scarf" | "hat" | "jewelry" | "sunglasses" | "watch";

export type Pattern = "solid" | "striped" | "plaid" | "floral" | "graphic" | "polka-dot" | "animal-print" | "camo" | "abstract" | "embroidery" | "other";

export type Material = "cotton" | "denim" | "wool" | "silk" | "polyester" | "leather" | "linen" | "knit" | "satin" | "velvet" | "other";

export type Fit = "slim" | "regular" | "loose" | "oversized";

export type Formality = "very-casual" | "casual" | "smart-casual" | "business-casual" | "formal";

export type Season = "spring" | "summer" | "fall" | "winter";

export type Occasion = "work" | "casual" | "date" | "sport" | "outdoor" | "travel" | "party" | "formal";

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
  pattern: Pattern | Pattern[];
  material: Material | Material[];
  fit: Fit;
  formality: Formality;
  seasons: Season[];
  occasions: Occasion[];
  warmth_rating: number; // 1-5
  rain_appropriate: boolean;
  brand: string | null;
  times_worn: number;
  last_worn_date: string | null;
  is_favorite: boolean;
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

export interface UserPreferences {
  user_id: string;
  location: { lat: number; lng: number; city: string } | null;
  temperature_sensitivity: TemperatureSensitivity;
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
  work: "Work",
  casual: "Casual",
  date: "Date Night",
  sport: "Sport",
  outdoor: "Outdoor",
  travel: "Travel",
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

export const MATERIAL_LABELS: Record<Material, string> = {
  cotton: "Cotton",
  denim: "Denim",
  wool: "Wool",
  silk: "Silk",
  polyester: "Polyester",
  leather: "Leather",
  linen: "Linen",
  knit: "Knit",
  satin: "Satin",
  velvet: "Velvet",
  other: "Other",
};

export const PATTERN_LABELS: Record<Pattern, string> = {
  solid: "Solid",
  striped: "Striped",
  plaid: "Plaid",
  floral: "Floral",
  graphic: "Graphic / Print",
  "polka-dot": "Polka Dot",
  "animal-print": "Animal Print",
  camo: "Camo",
  abstract: "Abstract",
  embroidery: "Embroidery",
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
    { value: "leggings", label: "Leggings" },
    { value: "sweatpants", label: "Sweatpants" },
  ],
  dress: [
    { value: "mini-dress", label: "Mini Dress" },
    { value: "midi-dress", label: "Midi Dress" },
    { value: "maxi-dress", label: "Maxi Dress" },
    { value: "jumpsuit", label: "Jumpsuit" },
  ],
  outerwear: [
    { value: "jacket", label: "Jacket" },
    { value: "coat", label: "Coat" },
    { value: "blazer", label: "Blazer" },
    { value: "vest", label: "Vest" },
    { value: "windbreaker", label: "Windbreaker" },
  ],
  shoes: [
    { value: "sneakers", label: "Sneakers" },
    { value: "boots", label: "Boots" },
    { value: "heels", label: "Heels" },
    { value: "sandals", label: "Sandals" },
    { value: "flats", label: "Flats" },
    { value: "loafers", label: "Loafers" },
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
    { value: "jewelry", label: "Jewelry" },
    { value: "sunglasses", label: "Sunglasses" },
    { value: "watch", label: "Watch" },
  ],
};
