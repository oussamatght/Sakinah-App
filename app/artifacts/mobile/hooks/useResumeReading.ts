import { useEffect, useState } from "react";
import { getReadingPosition } from "@/lib/storage";

/**
 * "أكمل وردك" logic (fix 9):
 *  - No saved position yet (first use) → open Al-Fatihah instead of an empty
 *    invalid position (which rendered the generic error screen).
 *  - Saved position → validate surahId (1..114) before routing; anything
 *    corrupt falls back to Al-Fatihah too.
 *  - The reader itself already handles per-surah fetch failure with a retry
 *    (same code path as opening from the Quran tab — the two are synchronized).
 */
export type ResumeTarget = {
  surahId: number;
  surahName?: string;
  ayahNumber?: number;
} | null;

export function useResumeReading(): ResumeTarget {
  const [target, setTarget] = useState<ResumeTarget>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const position = await getReadingPosition();
        if (!active) return;
        if (
          position &&
          Number.isInteger(position.surahId) &&
          position.surahId >= 1 &&
          position.surahId <= 114
        ) {
          setTarget({
            surahId: position.surahId,
            surahName: position.surahName,
            ayahNumber: position.ayahNumber,
          });
        } else {
          // No position / corrupt position → Al-Fatihah, never an empty open.
          setTarget({ surahId: 1, surahName: "الفاتحة", ayahNumber: 1 });
        }
      } catch {
        if (active) setTarget({ surahId: 1, surahName: "الفاتحة", ayahNumber: 1 });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return target;
}
