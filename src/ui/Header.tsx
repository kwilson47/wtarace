import { useState } from 'react';
import { formatUpdated } from './format';

interface Props {
  season: number;
  lastUpdated: string;
  onReset: () => void;
}

export function Header({ season, lastUpdated, onReset }: Props) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link to share your scenario:', window.location.href);
    }
  }

  return (
    <header className="header">
      <h1>Race to the WTA Finals {season}</h1>
      <p className="updated">Data updated {formatUpdated(lastUpdated)}</p>
      <div className="actions">
        <button type="button" onClick={share}>{copied ? 'Link copied' : 'Share'}</button>
        <button type="button" onClick={onReset}>Reset</button>
      </div>
    </header>
  );
}
