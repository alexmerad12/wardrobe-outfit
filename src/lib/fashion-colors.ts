// Curated fashion color palette organized by family
export interface FashionColor {
  hex: string;
  name: string;
}

export const FASHION_COLORS: { group: string; colors: FashionColor[] }[] = [
  {
    group: "Whites & Creams",
    colors: [
      { hex: "#FFFFFF", name: "White" },
      { hex: "#FAF9F6", name: "Off-White" },
      { hex: "#FFFDD0", name: "Cream" },
      { hex: "#F5F5DC", name: "Beige" },
      { hex: "#FFF8E7", name: "Ivory" },
      { hex: "#FAEBD7", name: "Antique White" },
      { hex: "#E8DCC8", name: "Ecru" },
    ],
  },
  {
    group: "Grays & Blacks",
    colors: [
      { hex: "#000000", name: "Black" },
      { hex: "#1C1C1C", name: "Jet Black" },
      { hex: "#36454F", name: "Charcoal" },
      { hex: "#808080", name: "Gray" },
      { hex: "#A9A9A9", name: "Dark Gray" },
      { hex: "#C0C0C0", name: "Silver" },
      { hex: "#D3D3D3", name: "Light Gray" },
      { hex: "#B2BEB5", name: "Ash" },
    ],
  },
  {
    group: "Browns & Tans",
    colors: [
      { hex: "#D2B48C", name: "Tan" },
      { hex: "#C19A6B", name: "Camel" },
      { hex: "#8B7355", name: "Taupe" },
      { hex: "#6F4E37", name: "Coffee" },
      { hex: "#8B4513", name: "Saddle Brown" },
      { hex: "#A0522D", name: "Sienna" },
      { hex: "#3C1414", name: "Dark Brown" },
      { hex: "#DEB887", name: "Sand" },
      { hex: "#C3B091", name: "Khaki" },
      { hex: "#F4A460", name: "Sandy Brown" },
    ],
  },
  {
    group: "Reds",
    colors: [
      { hex: "#FF0000", name: "Red" },
      { hex: "#DC143C", name: "Crimson" },
      { hex: "#8B0000", name: "Dark Red" },
      { hex: "#800020", name: "Burgundy" },
      { hex: "#722F37", name: "Wine" },
      { hex: "#C41E3A", name: "Cardinal" },
      { hex: "#E34234", name: "Vermillion" },
      { hex: "#FF6B6B", name: "Coral Red" },
      { hex: "#CD5C5C", name: "Indian Red" },
      { hex: "#BC8F8F", name: "Rosy Brown" },
    ],
  },
  {
    group: "Pinks",
    colors: [
      { hex: "#FFC0CB", name: "Pink" },
      { hex: "#FFB6C1", name: "Light Pink" },
      { hex: "#FF69B4", name: "Hot Pink" },
      { hex: "#FF1493", name: "Deep Pink" },
      { hex: "#DB7093", name: "Pale Violet Red" },
      { hex: "#E8B4B8", name: "Dusty Rose" },
      { hex: "#F2D2D7", name: "Blush" },
      { hex: "#C54B6C", name: "Raspberry" },
      { hex: "#E0B0FF", name: "Mauve" },
      { hex: "#FBCCE7", name: "Baby Pink" },
    ],
  },
  {
    group: "Oranges & Peaches",
    colors: [
      { hex: "#FF8C00", name: "Dark Orange" },
      { hex: "#FF7F50", name: "Coral" },
      { hex: "#E2725B", name: "Terracotta" },
      { hex: "#CC5500", name: "Burnt Orange" },
      { hex: "#E27D60", name: "Salmon" },
      { hex: "#FFDAB9", name: "Peach" },
      { hex: "#ED9121", name: "Carrot" },
      { hex: "#D2691E", name: "Rust" },
      { hex: "#F28C28", name: "Tangerine" },
    ],
  },
  {
    group: "Yellows & Golds",
    colors: [
      { hex: "#FFD700", name: "Gold" },
      { hex: "#E4A010", name: "Mustard" },
      { hex: "#FFDB58", name: "Saffron" },
      { hex: "#F0E68C", name: "Pale Yellow" },
      { hex: "#FFFACD", name: "Lemon Chiffon" },
      { hex: "#DAA520", name: "Goldenrod" },
      { hex: "#FADA5E", name: "Canary" },
      { hex: "#F5DEB3", name: "Wheat" },
      { hex: "#CFB53B", name: "Old Gold" },
    ],
  },
  {
    group: "Greens",
    colors: [
      { hex: "#228B22", name: "Forest Green" },
      { hex: "#355E3B", name: "Hunter Green" },
      { hex: "#556B2F", name: "Olive" },
      { hex: "#8FBC8F", name: "Sage" },
      { hex: "#ACE1AF", name: "Celadon" },
      { hex: "#3CB371", name: "Emerald" },
      { hex: "#2E8B57", name: "Sea Green" },
      { hex: "#90EE90", name: "Mint" },
      { hex: "#013220", name: "Dark Green" },
      { hex: "#808000", name: "Olive Drab" },
      { hex: "#AFE1AF", name: "Pistachio" },
    ],
  },
  {
    group: "Blues",
    colors: [
      { hex: "#000080", name: "Navy" },
      { hex: "#00008B", name: "Dark Blue" },
      { hex: "#4169E1", name: "Royal Blue" },
      { hex: "#1E90FF", name: "Dodger Blue" },
      { hex: "#87CEEB", name: "Sky Blue" },
      { hex: "#B0E0E6", name: "Powder Blue" },
      { hex: "#5F9EA0", name: "Cadet Blue" },
      { hex: "#008080", name: "Teal" },
      { hex: "#4682B4", name: "Steel Blue" },
      { hex: "#E0F0FF", name: "Ice Blue" },
      { hex: "#6495ED", name: "Cornflower" },
      { hex: "#191970", name: "Midnight Blue" },
    ],
  },
  {
    group: "Purples & Lavenders",
    colors: [
      { hex: "#800080", name: "Purple" },
      { hex: "#4B0082", name: "Indigo" },
      { hex: "#7B68EE", name: "Medium Slate Blue" },
      { hex: "#E6E6FA", name: "Lavender" },
      { hex: "#DDA0DD", name: "Plum" },
      { hex: "#9966CC", name: "Amethyst" },
      { hex: "#8B008B", name: "Dark Magenta" },
      { hex: "#9370DB", name: "Medium Purple" },
      { hex: "#663399", name: "Rebecca Purple" },
      { hex: "#7851A9", name: "Royal Purple" },
      { hex: "#C8A2C8", name: "Lilac" },
    ],
  },
  {
    group: "Denim",
    colors: [
      { hex: "#6F8FAF", name: "Light Wash" },
      { hex: "#4A6FA5", name: "Medium Wash" },
      { hex: "#2B4570", name: "Dark Wash" },
      { hex: "#1B2A4A", name: "Raw Denim" },
      { hex: "#191970", name: "Indigo Denim" },
    ],
  },
];

// Flat list for search
export const ALL_FASHION_COLORS: FashionColor[] = FASHION_COLORS.flatMap(
  (g) => g.colors
);
