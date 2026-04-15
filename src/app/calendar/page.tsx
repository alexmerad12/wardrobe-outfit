"use client";

import { useState, useEffect } from "react";
import type { OutfitLog } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [logs, setLogs] = useState<OutfitLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  useEffect(() => {
    async function fetchLogs() {
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${daysInMonth}`;

      try {
        const res = await fetch(`/api/logs?start=${startDate}&end=${endDate}`);
        if (res.ok) {
          setLogs(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      }
    }
    fetchLogs();
  }, [year, month, daysInMonth]);

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function getLogForDay(day: number): OutfitLog | undefined {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return logs.find((l) => l.worn_date === dateStr);
  }

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight mb-6">
        Outfit Calendar
      </h1>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">
          {MONTHS[month]} {year}
        </h2>
        <Button variant="ghost" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Calendar grid */}
      <Card>
        <CardContent className="p-3">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((day) => (
              <div
                key={day}
                className="text-center text-xs font-medium text-muted-foreground py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const log = getLogForDay(day);
              const isToday = isCurrentMonth && day === today.getDate();
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className={cn(
                    "relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors",
                    isToday && "ring-2 ring-primary",
                    log && "bg-primary/10",
                    log?.loved_it && "bg-pink-50",
                    selectedDate === dateStr && "bg-primary/20",
                    !log && "hover:bg-muted"
                  )}
                >
                  <span className={cn("text-sm", isToday && "font-bold")}>
                    {day}
                  </span>
                  {log?.loved_it && (
                    <Heart className="h-2.5 w-2.5 fill-red-400 text-red-400" />
                  )}
                  {log && !log.loved_it && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected day detail */}
      {selectedDate && (
        <div className="mt-4">
          <Card>
            <CardContent className="p-4">
              {(() => {
                const log = logs.find((l) => l.worn_date === selectedDate);
                if (log) {
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {log.loved_it && (
                          <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                        )}
                      </div>
                      {log.mood && (
                        <p className="text-sm text-muted-foreground">
                          Mood: {log.mood}
                        </p>
                      )}
                      {log.occasion && (
                        <p className="text-sm text-muted-foreground">
                          Occasion: {log.occasion}
                        </p>
                      )}
                      {log.notes && (
                        <p className="text-sm text-muted-foreground">
                          {log.notes}
                        </p>
                      )}
                    </div>
                  );
                }
                return (
                  <div className="text-center py-2">
                    <p className="text-sm text-muted-foreground">
                      No outfit logged for this day
                    </p>
                    <Button variant="outline" size="sm" className="mt-2">
                      Log Outfit
                    </Button>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{logs.length}</p>
            <p className="text-xs text-muted-foreground">Days logged</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">
              {logs.filter((l) => l.loved_it).length}
            </p>
            <p className="text-xs text-muted-foreground">Loved outfits</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">
              {new Set(logs.map((l) => l.mood).filter(Boolean)).size}
            </p>
            <p className="text-xs text-muted-foreground">Mood variety</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
