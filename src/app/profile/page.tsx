"use client";

import { useState, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { TemperatureSensitivity } from "@/lib/types";
import { MapPin, Thermometer, Loader2 } from "lucide-react";

export default function ProfilePage() {
  const [city, setCity] = useState("");
  const [tempSensitivity, setTempSensitivity] =
    useState<TemperatureSensitivity>("normal");
  const [saving, setSaving] = useState(false);
  const [itemCount, setItemCount] = useState(0);
  const [outfitCount, setOutfitCount] = useState(0);

  useEffect(() => {
    async function loadProfile() {
      try {
        const [prefsRes, itemsRes, outfitsRes] = await Promise.all([
          fetch("/api/preferences"),
          fetch("/api/items"),
          fetch("/api/outfits"),
        ]);

        if (prefsRes.ok) {
          const prefs = await prefsRes.json();
          if (prefs) {
            setCity(prefs.location?.city ?? "");
            setTempSensitivity(prefs.temperature_sensitivity ?? "normal");
          }
        }

        if (itemsRes.ok) {
          const items = await itemsRes.json();
          setItemCount(items.length);
        }

        if (outfitsRes.ok) {
          const outfits = await outfitsRes.json();
          setOutfitCount(outfits.length);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
    }
    loadProfile();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "default",
          location: city ? { city, lat: 0, lng: 0 } : null,
          temperature_sensitivity: tempSensitivity,
          preferred_styles: [],
          favorite_colors: [],
          avoided_colors: [],
        }),
      });
    } catch (err) {
      console.error("Failed to save preferences:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Profile</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{itemCount}</p>
            <p className="text-sm text-muted-foreground">Wardrobe Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{outfitCount}</p>
            <p className="text-sm text-muted-foreground">Saved Outfits</p>
          </CardContent>
        </Card>
      </div>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Location */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              City (for weather)
            </Label>
            <Input
              placeholder="e.g. Paris, New York"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          <Separator />

          {/* Temperature sensitivity */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Thermometer className="h-3.5 w-3.5" />
              Temperature sensitivity
            </Label>
            <Select
              value={tempSensitivity}
              onValueChange={(v) =>
                setTempSensitivity(v as TemperatureSensitivity)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="runs-hot">I run hot</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="runs-cold">I run cold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
