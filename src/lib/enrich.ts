import type { ProfileSnapshot } from "@/lib/types";
import { LOOKUP_BATCH, lookupXProfiles } from "@/lib/x-lookup";

export async function enrichInBatches(
  handles: string[],
  mergeProfiles: (snaps: ProfileSnapshot[]) => number,
  onProgress?: (done: number, total: number) => void,
  shouldStop?: () => boolean,
) {
  const unique = [...new Set(handles)];
  let done = 0;
  for (let i = 0; i < unique.length; i += LOOKUP_BATCH) {
    if (shouldStop?.()) return done;
    const chunk = unique.slice(i, i + LOOKUP_BATCH);
    try {
      const res = await lookupXProfiles({ data: { handles: chunk } });
      mergeProfiles(res.profiles);
    } catch {
      /* keep going — next chunk */
    }
    done += chunk.length;
    onProgress?.(done, unique.length);
  }
  return done;
}
