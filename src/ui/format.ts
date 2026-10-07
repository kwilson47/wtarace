export function flagEmoji(country: string): string {
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function formatPoints(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatDelta(n: number): string {
  if (n > 0) return `+${formatPoints(n)}`;
  if (n < 0) return `−${formatPoints(-n)}`;
  return '0';
}

export function formatUpdated(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

const CATEGORY_LABELS: Record<string, string> = {
  GS: 'Grand Slam',
  WTA1000C: 'WTA 1000',
  WTA1000: 'WTA 1000',
  WTA500: 'WTA 500',
  WTA250: 'WTA 250',
  WTA125: 'WTA 125',
};

/** Fan-facing event type; combined and WTA-only 1000s both read "WTA 1000". */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
