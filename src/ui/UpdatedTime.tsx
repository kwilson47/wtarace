import { useEffect, useState } from 'react';
import { formatUpdated } from './format';

/** "Data updated …": UTC in the prerendered HTML (the same for everyone), then the visitor's own time zone. */
export function UpdatedTime({ iso }: { iso: string }) {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  return <p className="updated">Data updated {formatUpdated(iso, local ? {} : { timeZone: 'UTC', locale: 'en-US' })}</p>;
}
