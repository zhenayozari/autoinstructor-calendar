const TECHNICAL_NOTE_MARKERS = [
  "excel-migration:",
  "demo-excel-import",
  "instructor-schedule.xlsx",
  "excel-import|",
  "demo-sheet-import:",
];

const HEX_COLOR_TOKEN = /^#[0-9a-f]{6}$/i;

export function isTechnicalNote(note: string | null | undefined) {
  if (!note) return false;

  const normalized = note.trim().toLowerCase();

  if (
    TECHNICAL_NOTE_MARKERS.some((marker) =>
      normalized.includes(marker.toLowerCase()),
    )
  ) {
    return true;
  }

  const parts = note.split(/[|:]/).map((part) => part.trim());

  return parts.length >= 3 && parts.some((part) => HEX_COLOR_TOKEN.test(part));
}

export function getVisibleSlotNote(note: string | null | undefined) {
  return note && !isTechnicalNote(note) ? note : null;
}
