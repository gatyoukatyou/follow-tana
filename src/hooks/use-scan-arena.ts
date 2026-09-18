import { useEffect } from "react";
import { isAllowedXBridgeOrigin } from "@/hooks/use-x-bridge";
import { parseArenaMessage, type ScanArenaMessage } from "@/lib/arena";
import { useArena } from "@/lib/arena-store";

/**
 * postMessage の1件をゲーム用メッセージにする。
 * use-x-bridge と同じ origin 検証をし、生存確認（op:"Scan"）以外は捨てる。
 */
export function arenaMessageFromEvent(
  e: { data: unknown; origin: string },
  selfOrigin: string,
): ScanArenaMessage | null {
  if (!isAllowedXBridgeOrigin(e.origin, selfOrigin)) return null;
  return parseArenaMessage(e.data);
}

/**
 * 生存確認スクリプトからの message をゲーム表示に流す。
 * use-x-bridge（名簿更新）とは独立に同じ message を聞くので、名簿側の処理は変えない。
 * デモ再生中は X からの message を無視する。
 */
export function useScanArena() {
  const feed = useArena((s) => s.feed);
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (useArena.getState().demo) return;
      const msg = arenaMessageFromEvent(e, window.location.origin);
      if (msg) feed(msg);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [feed]);
  return useArena((s) => s.arena);
}
