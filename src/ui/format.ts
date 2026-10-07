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
