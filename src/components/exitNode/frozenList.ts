/**
 * The picker's list is frozen while it is open: rows must not shuffle under
 * the pointer on every health update. Only two things re-freeze it: a change
 * of membership, and a latency arriving for an exit for the first time (the
 * quick probes start when the list opens, and a first result is what "Best"
 * is for).
 */
export interface RefreezeVerdict {
  refreeze: boolean;
  /** The measured set to remember, so each first measurement counts once. */
  known: ReadonlySet<string>;
}

export function refreezeNeeded(
  frozenIds: readonly string[],
  nextIds: readonly string[],
  measuredIds: readonly string[],
  known: ReadonlySet<string>,
): RefreezeVerdict {
  const prev = new Set(frozenIds);
  const membershipChanged = prev.size !== nextIds.length ||
    nextIds.some((id) => !prev.has(id));
  const newlyMeasured = measuredIds.some((id) => !known.has(id));
  return {
    refreeze: membershipChanged || newlyMeasured,
    known: newlyMeasured ? new Set(measuredIds) : known,
  };
}
