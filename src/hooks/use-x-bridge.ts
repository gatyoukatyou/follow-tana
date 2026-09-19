import { useEffect } from "react";
import { toast } from "sonner";
import { useRoster } from "@/lib/roster-store";
import { isValidHandle, normalizeHandle } from "@/lib/utils";
import { parseScanProfiles } from "@/lib/x-scan-script";

export function isAllowedXBridgeOrigin(origin: string, selfOrigin: string): boolean {
  return origin === "https://x.com" || origin === "https://twitter.com" || origin === selfOrigin;
}

export function parseXBridgeHandles(handles: unknown): string[] {
  if (!Array.isArray(handles)) return [];
  return [
    ...new Set(handles.map((h) => normalizeHandle(String(h))).filter(isValidHandle)),
  ];
}

export function useXBridge() {
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as {
        source?: string;
        type?: string;
        op?: string;
        stage?: string;
        handles?: unknown;
        profiles?: unknown;
        count?: number;
        scanned?: number;
        expected?: number;
        rl?: { remaining?: number; limit?: number; resetAt?: number };
      };
      if (!d || d.source !== "follow-tana") return;
      if (!isAllowedXBridgeOrigin(e.origin, window.location.origin)) return;
      const s = useRoster.getState();

      if (d.op === "Scan") {
        const snaps = parseScanProfiles(d.profiles);
        if (snaps.length) s.mergeProfiles(snaps);
        const n = Number(d.count) || snaps.length;
        const exp = Number(d.expected) || 0;
        const isInterval = d.type === "interval";
        s.setPull({
          status: d.type === "done" ? "done" : isInterval ? "idle" : "running",
          kind: "scan",
          count: n,
        });
        if (d.type === "done") {
          if (n > 0 && snaps.length === 0) {
            toast.message(
              `Xで ${n.toLocaleString("ja-JP")} 人調べましたが、最終投稿を取れませんでした。Xが止めている可能性があります。時間をおいてもう一度コードを貼ってください。`,
              { id: "x-scan", duration: 12_000 },
            );
          } else {
            toast.success(
              n > 0
                ? `Xで ${n.toLocaleString("ja-JP")} 人の生存確認が終わりました`
                : "生存確認が終わりました",
              { id: "x-scan" },
            );
          }
        } else if (isInterval) {
          // 枠回復待ち。この間は外す操作に進んでよい（待ち＝選ぶ時間の設計）
          toast.message(
            `検索枠を使い切りました（${(d.rl?.limit ?? 50).toLocaleString("ja-JP")}回/15分）。${n.toLocaleString("ja-JP")}人まで調べました。この間に外す人を選んでください。`,
            { id: "x-scan", duration: 10_000 },
          );
        } else {
          toast.loading(
            exp > 0
              ? `Xで調べています… ${n.toLocaleString("ja-JP")} / ${exp.toLocaleString("ja-JP")}人`
              : `Xで調べています… ${n.toLocaleString("ja-JP")}人`,
            { id: "x-scan" },
          );
        }
        return;
      }

      const handles = parseXBridgeHandles(d.handles);
      const snaps = parseScanProfiles(d.profiles);
      const n = handles.length || Number(d.count) || 0;

      if (d.stage === "scan") {
        if (d.op === "Followers") {
          if (handles.length) s.markFollowers(handles);
        } else if (handles.length) {
          s.addHandles(handles, "import");
        }
        if (snaps.length) s.mergeProfiles(snaps);
        const scanned = Number(d.scanned) || 0;
        const total = Number(d.count) || n;
        s.setPull({ status: "running", kind: "following", count: total });
        toast.loading(
          total > 0
            ? `最終投稿を調べています… ${scanned.toLocaleString("ja-JP")} / ${total.toLocaleString("ja-JP")}人`
            : "最終投稿を調べています…",
          { id: "x-pull" },
        );
        return;
      }

      if (d.op === "Unfollow") {
        if (handles.length) s.removePeople(handles);
        s.setPull({
          status: d.type === "done" ? "done" : "running",
          kind: "unfollow",
          count: n,
        });
        if (d.type === "done") {
          toast.success(
            n > 0
              ? `${n.toLocaleString("ja-JP")}人のフォローを外し、棚からも外しました`
              : "外せる人を見つけられませんでした",
            { id: "x-unfollow" },
          );
        } else {
          toast.loading(`Xで外しています… ${n.toLocaleString("ja-JP")}人`, { id: "x-unfollow" });
        }
        return;
      }
      if (d.type === "progress") {
        s.setPull({ status: "running", count: n });
        const exp = Number(d.expected) || 0;
        toast.loading(
          exp > 0
            ? `Xから取得中… ${n.toLocaleString("ja-JP")} / ${exp.toLocaleString("ja-JP")}人`
            : `Xから取得中… ${n.toLocaleString("ja-JP")}人`,
          { id: "x-pull" },
        );
        return;
      }
      if (d.type !== "done") return;
      if (handles.length === 0) {
        s.setPull({ status: "idle", count: 0 });
        toast.error("Xから人が取れませんでした。ログインとコンソール実行を確認してください。", {
          id: "x-pull",
        });
        return;
      }
      if (d.op === "Followers") {
        const marked = s.markFollowers(handles, { reconcile: true });
        s.setPull({ status: "done", kind: "followers", count: handles.length });
        toast.success(`フォロワー ${marked} 人を相互として更新しました`, { id: "x-pull" });
        return;
      }
      const added = s.addHandles(handles, "import");
      if (snaps.length) s.mergeProfiles(snaps);
      s.setPull({ status: "done", kind: "following", count: handles.length });
      toast.success(
        `${handles.length}人を取り込み、${added}人を追加しました。最終投稿はデスクの「生存確認」から調べてください。`,
        { id: "x-pull" },
      );
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
}
