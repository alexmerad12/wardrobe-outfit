// Runtime allowlists for every enum a clothing item can take. Must mirror
// the union types in types.ts exactly — the DB column types depend on it.
//
// Central source of truth so the analyze route, the sanitise helper, and
// any future validation all agree on what's valid. If you add a value to
// a type in types.ts, add it here too.

export const CATEGORIES = [
  "top",
  "bottom",
  "dress",
  "one-piece",
  "outerwear",
  "shoes",
  "bag",
  "accessory",
] as const;

export const SUBCATEGORIES = [
  // Tops
  "t-shirt",
  "blouse",
  "shirt",
  "tank-top",
  "crop-top",
  "sweater",
  "hoodie",
  "cardigan",
  // Bottoms
  "jeans",
  "trousers",
  "shorts",
  "skirt",
  "leggings",
  "sweatpants",
  // Dresses
  "mini-dress",
  "midi-dress",
  "maxi-dress",
  "jumpsuit",
  // Outerwear
  "jacket",
  "coat",
  "blazer",
  "vest",
  "windbreaker",
  "puffer",
  "bomber",
  "denim-jacket",
  "leather-jacket",
  "trench-coat",
  "peacoat",
  "parka",
  // Shoes
  "sneakers",
  "boots",
  "combat-boots",
  "western-boots",
  "chelsea-boots",
  "ankle-boots",
  "knee-boots",
  "heels",
  "sandals",
  "flats",
  "ballet-flats",
  "loafers",
  "mules",
  "espadrilles",
  // Bags
  "handbag",
  "backpack",
  "tote",
  "clutch",
  "crossbody",
  // Accessories
  "belt",
  "scarf",
  "hat",
  "jewelry",
  "sunglasses",
  "watch",
] as const;

export const PATTERNS = [
  "solid",
  "striped",
  "plaid",
  "floral",
  "graphic",
  "polka-dot",
  "animal-print",
  "camo",
  "abstract",
  "embroidery",
  "other",
] as const;

export const MATERIALS = [
  // Most common
  "cotton",
  "denim",
  "wool",
  "silk",
  "leather",
  "knit",
  "polyester",
  "linen",
  // Rest alphabetical
  "canvas",
  "cashmere",
  "chiffon",
  "corduroy",
  "faux-fur",
  "faux-leather",
  "faux-suede",
  "flannel",
  "fleece",
  "fur-shearling",
  "jersey",
  "lace",
  "mesh",
  "modal",
  "nylon",
  "patent-leather",
  "rayon-viscose",
  "rubber",
  "satin",
  "sheer",
  "spandex",
  "suede",
  "tencel",
  "tulle",
  "tweed",
  "twill",
  "velvet",
  "other",
] as const;

export const FITS = ["slim", "regular", "loose", "oversized"] as const;

export const BOTTOM_FITS = [
  "skinny",
  "slim",
  "straight",
  "regular",
  "wide-leg",
  "flared",
  "bootcut",
  "tapered",
] as const;

export const LENGTHS = ["cropped", "regular", "long", "extra-long"] as const;

export const PANTS_LENGTHS = [
  "capri",
  "ankle-crop",
  "ankle",
  "full",
  "extra-long",
] as const;

export const WAIST_STYLES = ["elastic", "fitted", "relaxed", "belted"] as const;

export const WAIST_HEIGHTS = ["high", "mid", "low"] as const;

export const WAIST_CLOSURES = [
  "button-zip",
  "elastic",
  "drawstring",
  "tie",
  "hook-eye",
  "pull-on",
  "side-zip",
  "other",
] as const;

export const SHOE_HEIGHTS = ["low", "ankle", "mid", "knee", "over-knee"] as const;

export const HEEL_TYPES = [
  "flat",
  "low-heel",
  "mid-heel",
  "high-heel",
  "platform",
  "wedge",
] as const;

export const SHOE_CLOSURES = [
  "laces",
  "velcro",
  "slip-on",
  "zip",
  "buckle",
  "elastic",
  "strap",
  "other",
] as const;

export const BELT_STYLES = [
  "plain",
  "studded",
  "perforated",
  "woven",
  "braided",
  "chain",
  "embellished",
  "other",
] as const;

export const METAL_FINISHES = [
  "silver",
  "gold",
  "rose-gold",
  "chrome",
  "matte-silver",
  "matte-gold",
  "brass",
  "bronze",
  "gunmetal",
  "mixed",
  "none",
] as const;

export const BAG_SIZES = [
  "clutch",
  "small",
  "medium",
  "large",
  "tote",
] as const;

export const NECKLINES = [
  "crew",
  "v-neck",
  "scoop",
  "square",
  "boat",
  "turtleneck",
  "mock-neck",
  "halter",
  "one-shoulder",
  "off-shoulder",
  "asymmetric",
  "collared",
  "henley",
  "cowl",
  "sweetheart",
  "other",
] as const;

export const SLEEVE_LENGTHS = [
  "strapless",
  "spaghetti",
  "thin-strap",
  "wide-strap",
  "sleeveless",
  "cap",
  "short",
  "elbow",
  "three-quarter",
  "long",
  "other",
] as const;

export const CLOSURES = [
  "pullover",
  "full-button",
  "partial-button",
  "zipper",
  "wrap-tie",
  "snap",
  "hook-eye",
  "open-drape",
  "other",
] as const;

export const FORMALITIES = [
  "very-casual",
  "casual",
  "smart-casual",
  "business-casual",
  "formal",
] as const;

export const SEASONS = ["spring", "summer", "fall", "winter"] as const;

export const OCCASIONS = [
  "work",
  "casual",
  "brunch",
  "dinner-out",
  "hangout",
  "date",
  "sport",
  "outdoor",
  "travel",
  "party",
  "formal",
  "at-home",
] as const;
