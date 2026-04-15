import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WeatherWidget } from "@/components/weather-widget";
import { Sparkles, Plus, Shirt } from "lucide-react";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-medium tracking-tight">
          Good morning!
        </h1>
        <p className="text-muted-foreground mt-0.5">
          Let&apos;s find your perfect outfit today.
        </p>
      </div>

      {/* Weather */}
      <div className="mb-6">
        <WeatherWidget />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 mb-8">
        <Link href="/suggest">
          <Button className="w-full h-14 text-base gap-2" size="lg">
            <Sparkles className="h-5 w-5" />
            What should I wear today?
          </Button>
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/wardrobe/add">
            <Button
              variant="outline"
              className="w-full h-12 gap-2"
              size="lg"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </Button>
          </Link>
          <Link href="/wardrobe">
            <Button
              variant="outline"
              className="w-full h-12 gap-2"
              size="lg"
            >
              <Shirt className="h-4 w-4" />
              My Wardrobe
            </Button>
          </Link>
        </div>
      </div>

      {/* Recent outfits section - placeholder */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Outfits</h2>
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 text-center">
          <p className="text-muted-foreground text-sm">
            Your outfit history will appear here.
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            Start by adding items to your wardrobe!
          </p>
        </div>
      </div>
    </div>
  );
}
