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
        handles?: unknown;
        profiles?: unknown;
        count?: number;
        expected?: number;
      };
      if (!d || d.source !== "follow-tana") return;
      if (!isAllowedXBridgeOrigin(e.origin, window.location.origin)) return;
      const s = useRoster.getState();

      if (d.op === "Scan") {
        const snaps = parseScanProfiles(d.profiles);
        if (snaps.length) s.mergeProfiles(snaps);
        const n = Number(d.count) || snaps.length;
        const exp = Number(d.expected) || 0;
        s.setPull({
          status: d.type === "done" ? "done" : "running",
          kind: "scan",
          count: n,
        });
        if (d.type === "done") {
          toast.success(
            n > 0
              ? `Xで ${n.toLocaleString("ja-JP")} 人の生存確認が終わりました`
              : "生存確認が終わりました",
            { id: "x-scan" },
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
      const n = handles.length || Number(d.count) || 0;
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
        const marked = s.markFollowers(handles);
        s.setPull({ status: "done", kind: "followers", count: handles.length });
        toast.success(`フォロワー ${marked} 人を照合し、相互を更新しました`, { id: "x-pull" });
        return;
      }
      const added = s.addHandles(handles, "import");
      s.setPull({ status: "done", kind: "following", count: handles.length });
      toast.success(
        `${handles.length}人を取り込み、${added}人を追加しました。生存確認を押すと最終投稿を調べます。`,
        { id: "x-pull" },
      );
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
}
