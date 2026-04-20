"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import "react-day-picker/style.css";

import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/use-locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps {
  value: string; // YYYY-MM-DD or "" for empty
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Safely build a Date from a YYYY-MM-DD string without timezone drift.
function parseIsoDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: DatePickerProps) {
  const { locale } = useLocale();
  const [open, setOpen] = React.useState(false);
  const selected = parseIsoDate(value);

  const localeTag = locale === "fr" ? "fr-FR" : "en-US";
  const displayFormat: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  };
  const display = selected
    ? selected.toLocaleDateString(localeTag, displayFormat)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          !display && "text-muted-foreground",
          className
        )}
      >
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-left">
          {display ?? placeholder ?? ""}
        </span>
      </PopoverTrigger>
      <PopoverContent className="p-2" align="start">
        <DayPicker
          mode="single"
          selected={selected}
          locale={locale === "fr" ? fr : undefined}
          onSelect={(d) => {
            if (d) {
              onChange(toIsoDate(d));
              setOpen(false);
            }
          }}
          showOutsideDays
          weekStartsOn={locale === "fr" ? 1 : 0}
        />
      </PopoverContent>
    </Popover>
  );
}
