import { kv } from "@vercel/kv";
import type {
  ClothingItem,
  Outfit,
  OutfitLog,
  UserPreferences,
} from "@/lib/types";

const KV_KEY = "wardrobe-data";

export interface AppData {
  items: ClothingItem[];
  outfits: Outfit[];
  logs: OutfitLog[];
  preferences: UserPreferences | null;
}

function getDefaultData(): AppData {
  return {
    items: [],
    outfits: [],
    logs: [],
    preferences: null,
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
