import { create } from "zustand";
import {
  applyScanMessage,
  initialArenaState,
  type ArenaState,
  type ScanArenaMessage,
} from "@/lib/arena";
import { playDemo, type DemoOptions } from "@/lib/arena-demo";

/** ゲーム表示の状態。名簿とは別で、保存しない（ページを閉じたら消えてよい） */
type ArenaStore = {
  arena: ArenaState;
  demo: boolean;
  feed: (msg: ScanArenaMessage) => void;
  reset: () => void;
  startDemo: (opts?: DemoOptions & { intervalMs?: number }) => void;
  stopDemo: () => void;
};

let stopDemoFn: (() => void) | null = null;

export const useArena = create<ArenaStore>()((set, get) => ({
  arena: initialArenaState(),
  demo: false,
  feed: (msg) => set({ arena: applyScanMessage(get().arena, msg) }),
  reset: () => {
    get().stopDemo();
    set({ arena: initialArenaState() });
  },
  startDemo: (opts) => {
    get().stopDemo();
    set({ arena: initialArenaState(), demo: true });
    stopDemoFn = playDemo((msg) => get().feed(msg), {
      startAt: Date.now(), // 画面で見るデモは「いま」を起点にしてカウントダウンが動くようにする
      ...opts,
      onEnd: () => {
        stopDemoFn = null;
        set({ demo: false });
      },
    });
  },
  stopDemo: () => {
    if (stopDemoFn) stopDemoFn();
    stopDemoFn = null;
    if (get().demo) set({ demo: false });
  },
}));
