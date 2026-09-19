import { useEffect, useState } from "react";

/** ゲーム表示のオン／オフ。この端末だけの好みなので localStorage（読めなくても動く） */
const ARENA_PREF_KEY = "ft:arena";

export function readArenaPref(): boolean {
  try {
    return localStorage.getItem(ARENA_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeArenaPref(on: boolean) {
  try {
    if (on) localStorage.setItem(ARENA_PREF_KEY, "1");
    else localStorage.removeItem(ARENA_PREF_KEY);
  } catch {
    /* 保存できなくても表示はできる */
  }
}

export function useArenaPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(readArenaPref());
  }, []);
  return [
    on,
    (next) => {
      setOn(next);
      writeArenaPref(next);
    },
  ];
}
