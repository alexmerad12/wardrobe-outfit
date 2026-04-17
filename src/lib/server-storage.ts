import { kv } from "@vercel/kv";
import type {
  ClothingItem,
  Outfit,
  OutfitLog,
  UserPreferences,
} from "@/lib/types";

const KV_KEY = "wardrobe-data";

export interface TodayOutfit {
  outfit_id: string;
  item_ids: string[];
  name: string | null;
  reasoning: string | null;
  mood: string | null;
  occasion: string | null;
  weather_temp: number | null;
  weather_condition: string | null;
  is_favorite: boolean;
  date: string; // YYYY-MM-DD
}

export interface SavedTrip {
  id: string;
  destination: string;
  lat: number;
  lng: number;
  start_date: string;
  end_date: string;
  occasions: string;
  notes: string;
  packing_item_ids: string[];
  weather_summary: string | null;
  packing_tips: string | null;
  outfit_suggestions: { day: string; item_ids: string[]; note: string }[];
  created_at: string;
}

export interface AppData {
  items: ClothingItem[];
  outfits: Outfit[];
  logs: OutfitLog[];
  preferences: UserPreferences | null;
  today_outfit: TodayOutfit | null;
  recent_outfits: TodayOutfit[];
  trips: SavedTrip[];
}

function getDefaultData(): AppData {
  return {
    items: [],
    outfits: [],
    logs: [],
    preferences: null,
    today_outfit: null,
    recent_outfits: [],
    trips: [],
  };
}

export async function readData(): Promise<AppData> {
  try {
    const data = await kv.get<AppData>(KV_KEY);
    if (!data) {
      const defaultData = getDefaultData();
      await kv.set(KV_KEY, defaultData);
      return defaultData;
    }
    return data;
  } catch {
    return getDefaultData();
  }
}

export async function writeData(data: AppData): Promise<void> {
  try {
    await kv.set(KV_KEY, data);
  } catch (err) {
    console.error("Failed to write to KV:", err);
  }
}
