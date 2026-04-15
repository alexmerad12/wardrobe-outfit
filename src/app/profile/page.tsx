"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
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
import type { TemperatureSensitivity, UserPreferences } from "@/lib/types";
import { LogOut, MapPin, Thermometer, Loader2 } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [tempSensitivity, setTempSensitivity] =
    useState<TemperatureSensitivity>("normal");
  const [saving, setSaving] = useState(false);
  const [itemCount, setItemCount] = useState(0);
  const [outfitCount, setOutfitCount] = useState(0);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setEmail(user.email ?? "");

      // Load preferences
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (prefs) {
        setCity((prefs as UserPreferences).location?.city ?? "");
        setTempSensitivity(
          (prefs as UserPreferences).temperature_sensitivity ?? "normal"
        );
      }

      // Load counts
      const { count: items } = await supabase
        .from("clothing_items")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      const { count: outfits } = await supabase
        .from("outfits")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      setItemCount(items ?? 0);
      setOutfitCount(outfits ?? 0);
    }
    loadProfile();
  }, [router]);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase.from("user_preferences").upsert({
      user_id: user.id,
      location: city ? { city, lat: 0, lng: 0 } : null,
      temperature_sensitivity: tempSensitivity,
    });

    setSaving(false);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
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
          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} disabled />
          </div>

          <Separator />

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

      {/* Sign out */}
      <Button
        variant="outline"
        className="w-full mt-4 text-destructive hover:text-destructive"
        onClick={handleSignOut}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
}
