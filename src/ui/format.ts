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

/** The update time in the visitor's time zone (or `timeZone`), naming the zone; the year only when it isn't this year. */
export function formatUpdated(iso: string, options: { timeZone?: string; locale?: string; now?: Date } = {}): string {
  const { timeZone, locale, now = new Date() } = options;
  const date = new Date(iso);
  const yearOf = (d: Date) => new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(d);
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(yearOf(date) === yearOf(now) ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  })
    .format(date)
    .replace(/\u202f/g, ' '); // newer ICU puts a narrow no-break space before AM/PM
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

/** A simulated chance as shown: whole percent, capped at >99% and <1% (the simulation never proves anything). */
export function formatChance(p: number): string {
  if (p >= 0.995) return '>99%';
  if (p < 0.005) return '<1%';
  return `${Math.round(p * 100)}%`;
}

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Sep 30 – Oct 11". */
export function formatDates(t: { startDate: string; endDate: string }): string {
  return `${day.format(new Date(`${t.startDate}T00:00:00Z`))} – ${day.format(new Date(`${t.endDate}T00:00:00Z`))}`;
}
