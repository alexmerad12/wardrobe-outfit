"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { MOOD_CONFIG, OCCASION_LABELS } from "@/lib/types";
import type { Mood, Occasion } from "@/lib/types";
import { useLocale } from "@/lib/i18n/use-locale";

const MOODS = Object.keys(MOOD_CONFIG) as Mood[];
const OCCASIONS = Object.keys(OCCASION_LABELS) as Occasion[];

export type OutfitDetails = {
  name: string | null;
  mood: Mood | null;
  occasion: Occasion | null;
  style_notes: string | null;
};

interface OutfitDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: OutfitDetails;
  submitting: boolean;
  onSubmit: (values: OutfitDetails) => void | Promise<void>;
}

// Lightweight create / edit dialog for saved outfits. Title stays the
// fast path; mood / occasion / notes are optional metadata that improves
// the AI's understanding of why the user liked the look.
export function OutfitDetailsDialog({
  open,
  onOpenChange,
  mode,
  initial,
  submitting,
  onSubmit,
}: OutfitDetailsDialogProps) {
  const { t, tMood } = useLocale();
  const tOccasion = (occ: Occasion) => t(`occasion.${occ}`);
  const [name, setName] = useState("");
  const [mood, setMood] = useState<Mood | "">("");
  const [occasion, setOccasion] = useState<Occasion | "">("");
  const [styleNotes, setStyleNotes] = useState("");

  // Reset to the latest initial values whenever the dialog opens — keeps
  // edit mode pre-filled and create mode empty.
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setMood(initial?.mood ?? "");
      setOccasion(initial?.occasion ?? "");
      setStyleNotes(initial?.style_notes ?? "");
    }
  }, [open, initial]);

  const handleSubmit = () => {
    onSubmit({
      name: name.trim().length > 0 ? name.trim().slice(0, 80) : null,
      mood: (mood || null) as Mood | null,
      occasion: (occasion || null) as Occasion | null,
      style_notes:
        styleNotes.trim().length > 0 ? styleNotes.trim().slice(0, 280) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? t("outfitDetails.createTitle")
              : t("outfitDetails.editTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("outfitDetails.nameLabel")}
            </label>
            <Input
              placeholder={t("wardrobe.nameOutfitPlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus={mode === "create"}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("outfitDetails.moodLabel")}
              </label>
              <Select
                value={mood}
                onValueChange={(v) => setMood(v as Mood | "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("outfitDetails.moodPlaceholder")}>
                    {(value) =>
                      value ? tMood(value as Mood, "label") : t("outfitDetails.moodPlaceholder")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MOODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {tMood(m, "label")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("outfitDetails.occasionLabel")}
              </label>
              <Select
                value={occasion}
                onValueChange={(v) => setOccasion(v as Occasion | "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("outfitDetails.occasionPlaceholder")}>
                    {(value) =>
                      value ? tOccasion(value as Occasion) : t("outfitDetails.occasionPlaceholder")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {OCCASIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {tOccasion(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("outfitDetails.notesLabel")}
            </label>
            <Textarea
              placeholder={t("outfitDetails.notesPlaceholder")}
              value={styleNotes}
              onChange={(e) => setStyleNotes(e.target.value)}
              maxLength={280}
              rows={3}
            />
            <p className="text-[10px] text-muted-foreground">
              {styleNotes.length}/280
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === "create" ? t("wardrobe.creating") : t("common.saving")}
              </>
            ) : mode === "create" ? (
              t("wardrobe.create")
            ) : (
              t("common.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
