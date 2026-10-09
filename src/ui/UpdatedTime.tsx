import { useEffect, useState } from 'react';
import { formatUpdated } from './format';

/**
 * "Data updated …": UTC in the prerendered HTML, then the visitor's own time zone. The first render may not
 * depend on the visitor's clock or zone (it must match the HTML built earlier), so it never adds the year.
 */
export function UpdatedTime({ iso }: { iso: string }) {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  return <p className="updated">Data updated {formatUpdated(iso, local ? {} : { timeZone: 'UTC', locale: 'en-US', now: new Date(iso) })}</p>;
}
