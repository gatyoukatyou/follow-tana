import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { enableRosterPersist } from "@/lib/idb-storage";
import { getOwnerHandle } from "@/lib/owner";
import { useRoster } from "@/lib/roster-store";

/** rehydrate が解決も拒否もしない場合の打ち切り時間。無限ローディングにしない。 */
const HYDRATE_TIMEOUT_MS = 10_000;

export function useRosterHydrate(onNeedOwner: () => void): boolean {
  const [hydrated, setHydrated] = useState(false);
  const onNeedOwnerRef = useRef(onNeedOwner);
  onNeedOwnerRef.current = onNeedOwner;

  useEffect(() => {
    let settled = false;
    const succeed = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // repair による set() を保存対象にするため、先に永続化を有効化する
      enableRosterPersist();
      useRoster.getState().ensureSeeded();
      const repaired = useRoster.getState().repairMassFalseDead();
      setHydrated(true);
      if (repaired > 0) {
        toast.message(
          `${repaired.toLocaleString("ja-JP")}人は調べ損ねだったので未確認に戻しました。生存確認からXで調べ直してください。`,
          { duration: 12_000 },
        );
      }
      if (!getOwnerHandle()) onNeedOwnerRef.current();
    };
    const giveUp = () => {
      if (settled) return;
      settled = true;
      console.warn("[follow-tana] roster rehydrate timed out; continuing with starter roster");
      enableRosterPersist();
      useRoster.getState().ensureSeeded();
      setHydrated(true);
      if (!getOwnerHandle()) onNeedOwnerRef.current();
    };
    const timer = setTimeout(giveUp, HYDRATE_TIMEOUT_MS);
    void Promise.resolve(useRoster.persist.rehydrate()).then(succeed, giveUp);
    return () => clearTimeout(timer);
  }, []);

  return hydrated;
}