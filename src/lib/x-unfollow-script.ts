const UNFOLLOW = `(() => {
  const TARGETS = __TARGETS__;
  const want = new Map();
  TARGETS.forEach((t) => {
    const h = String(t.h || "").replace(/^@/, "");
    if (h) want.set(h.toLowerCase(), t);
  });
  if (want.size === 0) {
    alert("フォロー棚: 外す人がいません。");
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
  if (!confirm("フォロー棚: " + want.size + "人のフォローを外します。よろしいですか？")) return;
  // X Web クライアントの公開アプリキー。秘密情報ではない。
  // 認証は利用者自身の Cookie（ct0 / auth_token）で行われる。
  // 無効化された場合は DOM 経路にフォールバックする。
  const BEARER = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const done = [];
  const fail = [];
  const send = (type) => {
    const payload = { source: "follow-tana", type: type, op: "Unfollow", handles: done.slice(), fail: fail.slice(), count: done.length };
    try { if (window.opener) window.opener.postMessage(payload, "*"); } catch (e) {}
    document.title = "外し " + done.length + "/" + (done.length + want.size) + "人";
    return payload;
  };
  const headers = () => ({
    authorization: BEARER,
    "x-csrf-token": cookie("ct0"),
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-active-user": "yes",
    "content-type": "application/x-www-form-urlencoded",
  });
  const apiUnfollow = async (t) => {
    const body = t.id
      ? "user_id=" + encodeURIComponent(t.id)
      : "screen_name=" + encodeURIComponent(t.h);
    const res = await fetch("https://x.com/i/api/1.1/friendships/destroy.json", {
      method: "POST",
      credentials: "include",
      headers: headers(),
      body: body,
    });
    return res;
  };
  const cellHandle = (cell) => {
    const a = cell.querySelector('a[href^="/"]');
    if (!a) return "";
    const m = String(a.getAttribute("href") || "").match(/^\\/([A-Za-z0-9_]{1,15})(?:$|[/?#])/);
    return m ? m[1] : "";
  };
  const clickUnfollowIn = async (cell) => {
    const btn = cell.querySelector('[data-testid$="-unfollow"]');
    if (!btn) return false;
    btn.click();
    for (let i = 0; i < 8; i++) {
      await sleep(150);
      const ok = document.querySelector('[data-testid="confirmationSheetConfirm"]');
      if (ok) { ok.click(); break; }
    }
    for (let i = 0; i < 12; i++) {
      await sleep(200);
      if (!cell.isConnected) return true;
      if (cell.querySelector('[data-testid$="-follow"]')) return true;
    }
    return false;
  };
  const fromDom = async () => {
    const cells = document.querySelectorAll('[data-testid="UserCell"]');
    for (const cell of cells) {
      const h = cellHandle(cell);
      const key = h.toLowerCase();
      if (!want.has(key)) continue;
      const t = want.get(key);
      try {
        const clicked = await clickUnfollowIn(cell);
        if (clicked) {
          done.push(t.h);
          want.delete(key);
          send("progress");
          await sleep(1400 + Math.floor(Math.random() * 500));
        }
      } catch (e) {}
      if (want.size === 0) break;
    }
  };
  (async () => {
    const remaining = [...want.values()];
    let apiOk = 0;
    for (const t of remaining) {
      let res;
      try { res = await apiUnfollow(t); } catch (e) { continue; }
      if (res.status === 429) {
        document.title = "制限待ち…";
        await sleep(40000);
        try { res = await apiUnfollow(t); } catch (e) { break; }
        if (res.status === 429) break;
      }
      if (res.status === 401 || res.status === 403) break;
      if (res.ok) {
        const key = String(t.h).toLowerCase();
        want.delete(key);
        done.push(t.h);
        apiOk += 1;
        send("progress");
        await sleep(1500 + Math.floor(Math.random() * 400));
      }
    }
    if (want.size === 0) {
      send("done");
      alert("フォロー棚: " + done.length + "人のフォローを外しました。元のタブに戻ってください。");
      return;
    }
    if (!/\\/following\\/?$/.test(location.pathname)) {
      [...want.values()].forEach((t) => fail.push(t.h));
      send("done");
      alert("残り" + want.size + "人はフォロー一覧で外します。開いたらコードをもう一度貼ってください。");
      location.href = "https://x.com/__OWNER__/following";
      return;
    }
    send("progress");
    let idle = 0;
    let last = want.size;
    const t0 = Date.now();
    await fromDom();
    while (want.size > 0 && idle < 10 && Date.now() - t0 < 12 * 60 * 1000) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const col = document.querySelector('[data-testid="primaryColumn"]');
      if (col) col.scrollTop = col.scrollHeight;
      await sleep(600);
      await fromDom();
      if (want.size === last) idle += 1;
      else { idle = 0; last = want.size; }
    }
    [...want.values()].forEach((t) => fail.push(t.h));
    send("done");
    alert("フォロー棚: " + done.length + "人を外しました。" + (fail.length ? fail.length + "人は見つかりませんでした。" : "") + "元のタブに戻ってください。");
  })();
})();`;

export type UnfollowTarget = { handle: string; userId?: string };

export function buildUnfollowScript(targets: UnfollowTarget[], ownerHandle: string): string {
  const payload = JSON.stringify(
    targets.map((t) => ({
      h: t.handle.replace(/^@/, ""),
      id: t.userId && /^\d+$/.test(t.userId) ? t.userId : "",
    })),
  );
  return UNFOLLOW.split("__TARGETS__").join(payload).split("__OWNER__").join(ownerHandle.replace(/^@/, ""));
}