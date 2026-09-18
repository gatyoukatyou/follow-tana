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

  const stopEnrich = useCallback(() => {
    enrichStop.current = true;
  }, []);

  const runEnrich = useCallback(async () => {
    if (enrichingRef.current) return;
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
    // 一覧の見た目を変えずに調べる。終わったら元に戻す。
    const prevActivity = start.filters.activity;
    const prevSort = start.sort;
    const touchedView = prevActivity === "unknown";
    if (touchedView) {
      start.setFilter({ activity: "any" });
    }
    const skip = new Set<string>();
    let done = 0;
    let merged = 0;
    try {
      while (!enrichStop.current) {
        const s = useRoster.getState();
        const next = handlesToScan(s.people, frozenSelected, SCAN_BATCH, skip);
        if (next.length === 0) break;
        for (const h of next) skip.add(h.toLowerCase());
        // 直列で1バッチずつ。並列に割ると外部取得の同時接続が倍増し429を招く。
        const r = await enrichInBatches(next, s.mergeProfiles, undefined, () => enrichStop.current);
        if (enrichStop.current) break;
        done += r.done;
        merged += r.merged;
        setEnrichDone(done);
      }
      if (enrichStop.current) {
        toast.message(`生存確認を止めました（${done.toLocaleString("ja-JP")}人まで）`);
      } else if (merged === 0 && done > 0) {
        toast.message(
          `生存確認 ${done.toLocaleString("ja-JP")}人を試しましたが、情報を更新できませんでした。時間をおいてもう一度押してください。`,
          { duration: 8000 },
        );
      } else {
        toast.success(`生存確認 ${done.toLocaleString("ja-JP")}人が完了しました`, { duration: 8000 });
      }
    } catch {
      toast.error("生存確認に失敗しました");
    } finally {
      if (touchedView) {
        useRoster.getState().setFilter({ activity: prevActivity });
      }
      useRoster.getState().setSort(prevSort);
      enrichingRef.current = false;
      setEnriching(false);
      setEnrichDone(0);
      setEnrichTotal(0);
    }
  }, []);

  return { enriching, enrichDone, enrichTotal, runEnrich, stopEnrich };
}
