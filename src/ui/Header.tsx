import { useState } from 'react';
import { UpdatedTime } from './UpdatedTime';

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
      <p className="intro">
        {`Live standings and projections for the ${season} Race to the WTA Finals: who has qualified, who is out, and what each player still needs. Pick results for the remaining tournaments to see how the race could finish, then share your scenario.`}
      </p>
      <UpdatedTime iso={lastUpdated} />
      <div className="actions">
        <button type="button" onClick={share}>{copied ? 'Link copied' : 'Share'}</button>
        <button type="button" onClick={onReset}>Reset</button>
      </div>
    </header>
  );
}
