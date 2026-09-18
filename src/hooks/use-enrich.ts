import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { SCAN_BATCH, countToScan, handlesToScan } from "@/lib/filter-sort";
import { enrichInBatches } from "@/lib/enrich";
import { useRoster } from "@/lib/roster-store";

export function useEnrich() {
  const [enriching, setEnriching] = useState(false);
  const [enrichDone, setEnrichDone] = useState(0);
  const [enrichTotal, setEnrichTotal] = useState(0);
  const enrichStop = useRef(false);
  const enrichingRef = useRef(false);

  const runEnrich = useCallback(async () => {
    if (enrichingRef.current) {
      enrichStop.current = true;
      return;
    }
    const start = useRoster.getState();
    const frozenSelected = start.selected.slice();
    const total = countToScan(start.people, frozenSelected);
    if (total === 0) {
      toast.message("確認する人がいません");
      return;
    }
    enrichStop.current = false;
    enrichingRef.current = true;
    setEnriching(true);
    setEnrichDone(0);
    setEnrichTotal(total);
    if (start.filters.activity === "unknown") {
      start.setFilter({ activity: "any" });
    }
    start.setSort("last-asc");
    const attempted = new Set<string>();
    let done = 0;
    try {
      while (!enrichStop.current) {
        const s = useRoster.getState();
        const next = handlesToScan(s.people, frozenSelected, SCAN_BATCH).filter(
          (h) => !attempted.has(h.toLowerCase()),
        );
        if (next.length === 0) break;
        for (const h of next) attempted.add(h.toLowerCase());
        await enrichInBatches(next, s.mergeProfiles, undefined, () => enrichStop.current);
        done += next.length;
        setEnrichDone(done);
      }
      if (enrichStop.current) {
        toast.message(`生存確認を止めました（${done.toLocaleString("ja-JP")}人まで）`);
      } else {
        toast.success(`生存確認 ${done.toLocaleString("ja-JP")}人が完了しました`, { duration: 8000 });
      }
    } catch {
      toast.error("生存確認に失敗しました");
    } finally {
      enrichingRef.current = false;
      setEnriching(false);
      setEnrichDone(0);
      setEnrichTotal(0);
    }
  }, []);

  return { enriching, enrichDone, enrichTotal, runEnrich };
}
