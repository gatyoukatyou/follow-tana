import { isValidHandle, normalizeHandle } from "@/lib/utils";
import type { ProfileSnapshot } from "@/lib/types";

const SCAN = `(() => {
  const TARGETS = __TARGETS__;
  const handles = [];
  const seen = {};
  TARGETS.forEach((h) => {
    const v = String(h || "").replace(/^@/, "");
    const k = v.toLowerCase();
    if (v && !seen[k] && /^[A-Za-z0-9_]{1,15}$/.test(v)) {
      seen[k] = 1;
      handles.push(v);
    }
  });
  if (handles.length === 0) {
    alert("フォロー棚: 調べる人がいません。");
    return;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cookie = (n) => {
    const m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  };
  const loggedIn =
    !!cookie("ct0") ||
    /(?:^|; )twid=/.test(document.cookie) ||
    !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"]');
  if (!loggedIn) {
    alert("Xにログインしてから、フォロー一覧のページでこのコードを実行してください。");
    return;
  }
  if (!confirm("フォロー棚: " + handles.length + "人の最終投稿を調べます。よろしいですか？")) return;
  const BEARER = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  let done = 0;
  const send = (type, profiles) => {
    const payload = {
      source: "follow-tana",
      type: type,
      op: "Scan",
      count: done,
      expected: handles.length,
      profiles: profiles || [],
    };
    try { if (window.opener) window.opener.postMessage(payload, "*"); } catch (e) {}
    document.title = "確認 " + done + "/" + handles.length + "人";
    return payload;
  };
  const headers = () => ({
    authorization: BEARER,
    "x-csrf-token": cookie("ct0"),
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-active-user": "yes",
  });
  const twDate = (s) => {
    const t = Date.parse(s || "");
    return Number.isFinite(t) ? t : null;
  };
  const rowOf = (u) => {
    const tc = Number(u.statuses_count || 0) || 0;
    const joined = twDate(u.created_at);
    const st = u.status;
    let lp = st ? twDate(st.created_at) : null;
    let lt = st ? String(st.text || st.full_text || "").slice(0, 180) : "";
    if (lp == null && tc === 0) {
      lp = joined;
      lt = "投稿なし";
    }
    return {
      h: u.screen_name || "",
      id: String(u.id_str || u.id || ""),
      n: u.name || "",
      bio: String(u.description || "").slice(0, 400),
      av: String(u.profile_image_url_https || "").replace("_normal", "_bigger"),
      fl: Number(u.followers_count || 0) || 0,
      fg: Number(u.friends_count || 0) || 0,
      tc: tc,
      vf: !!u.verified,
      k: !!u.protected,
      j: joined,
      lp: lp,
      lt: lt,
    };
  };
  const waitVisible = async () => {
    if (!document.hidden) return;
    document.title = "前面に戻す 確認 " + done + "/" + handles.length + "人";
    await new Promise((r) => {
      const on = () => {
        if (!document.hidden) {
          document.removeEventListener("visibilitychange", on);
          r();
        }
      };
      document.addEventListener("visibilitychange", on);
    });
  };
  const lookup = async (chunk) => {
    const url =
      "https://x.com/i/api/1.1/users/lookup.json?include_entities=false&screen_name=" +
      encodeURIComponent(chunk.join(","));
    let res = await fetch(url, { method: "GET", credentials: "include", headers: headers() });
    if (res.status === 429) {
      await sleep(12000);
      res = await fetch(url, { method: "GET", credentials: "include", headers: headers() });
    }
    return res;
  };
  (async () => {
    const BATCH = 100;
    for (let i = 0; i < handles.length; i += BATCH) {
      await waitVisible();
      const chunk = handles.slice(i, i + BATCH);
      try {
        const res = await lookup(chunk);
        if (res.status === 401 || res.status === 403) {
          alert("フォロー棚: Xがこの調べ方を拒みました。ログインし直してから、もう一度コードを貼ってください。");
          send("done", []);
          return;
        }
        const got = {};
        if (res.ok) {
          const body = await res.json();
          const list = Array.isArray(body) ? body : [];
          const profiles = [];
          list.forEach((u) => {
            const row = rowOf(u);
            if (!row.h) return;
            got[row.h.toLowerCase()] = 1;
            profiles.push(row);
          });
          chunk.forEach((h) => {
            if (!got[h.toLowerCase()]) profiles.push({ h: h, miss: true });
          });
          done += chunk.length;
          send("progress", profiles);
        } else {
          const profiles = chunk.map((h) => ({ h: h, miss: true }));
          done += chunk.length;
          send("progress", profiles);
        }
      } catch (e) {
        done += chunk.length;
        send("progress", chunk.map((h) => ({ h: h, miss: true })));
      }
      await sleep(700);
    }
    send("done", []);
    alert("フォロー棚: " + handles.length + "人の生存確認が終わりました。元のタブに戻ってください。");
  })();
})();`;

export type ScanRow = {
  h?: string;
  id?: string;
  n?: string;
  bio?: string;
  av?: string;
  fl?: number;
  fg?: number;
  tc?: number;
  vf?: boolean;
  k?: boolean;
  j?: number | null;
  lp?: number | null;
  lt?: string;
  miss?: boolean;
};

export function scanRowToSnapshot(row: ScanRow): ProfileSnapshot | null {
  const handle = normalizeHandle(String(row.h || ""));
  if (!isValidHandle(handle)) return null;
  if (row.miss) {
    return {
      handle,
      userId: "",
      name: "",
      bio: "",
      avatarUrl: "",
      followers: 0,
      following: 0,
      tweetCount: 0,
      verified: false,
      protected: false,
      website: "",
      location: "",
      joinedAt: null,
      lastPostAt: null,
      lastPostText: "",
      lookupFailed: true,
    };
  }
  return {
    handle,
    userId: String(row.id || ""),
    name: String(row.n || ""),
    bio: String(row.bio || ""),
    avatarUrl: String(row.av || ""),
    followers: Number(row.fl || 0) || 0,
    following: Number(row.fg || 0) || 0,
    tweetCount: Number(row.tc || 0) || 0,
    verified: Boolean(row.vf),
    protected: Boolean(row.k),
    website: "",
    location: "",
    joinedAt: typeof row.j === "number" && Number.isFinite(row.j) ? row.j : null,
    lastPostAt: typeof row.lp === "number" && Number.isFinite(row.lp) ? row.lp : null,
    lastPostText: String(row.lt || ""),
    lookupFailed: false,
  };
}

export function parseScanProfiles(raw: unknown): ProfileSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileSnapshot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const snap = scanRowToSnapshot(row as ScanRow);
    if (snap) out.push(snap);
  }
  return out;
}

export function buildScanScript(handles: string[]): string {
  const payload = JSON.stringify(
    handles.map((h) => h.replace(/^@/, "")).filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h)),
  );
  return SCAN.split("__TARGETS__").join(payload);
}
