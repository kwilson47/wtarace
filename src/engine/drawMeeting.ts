/**
 * The round in which two players at these draw positions would meet, counted from the top (1 = final,
 * 2 = semifinal, …). Halves, quarters and eighths are equal blocks of the official draw order.
 */
export function meetingFromTop(a: number, b: number, drawSize: number): number {
  for (let j = 1; ; j++) {
    const block = drawSize / 2 ** j;
    if (Math.floor((a - 1) / block) !== Math.floor((b - 1) / block)) return j;
    if (block <= 1) return j + 1;
  }
}
