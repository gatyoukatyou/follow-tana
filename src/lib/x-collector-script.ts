const COLLECTOR = `(() => {
  const OP = "__OP__";
  const skip = /^(home|explore|search|settings|i|compose|notifications|messages|jobs|lists|bookmarks|communities|premium|login|signup|tos|privacy|following|followers|verified|topics|connect|grok|about|intent|share|hashtag|searcher|flow)$/i;
  const handles = new Map();
  let cursor = null;
  let template = null;
  let expected = 0;
  let hiddenPause = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitVisible = async () => {
    if (!document.hidden) return false;
    hiddenPause = true;
    document.title = "前面に戻す 棚 " + handles.size + "人";
    console.log("フォロー棚: タブが裏です。前面に戻すと再開します。");
    await new Promise((r) => {
      const on = () => {
        if (!document.hidden) {
          document.removeEventListener("visibilitychange", on);
          r();
        }
      };
      document.addEventListener("visibilitychange", on);
    });
    hiddenPause = false;
    return true;
  };
  const add = (h) => {
    if (!h || skip.test(h) || !/^[A-Za-z0-9_]{1,15}$/.test(h)) return;
    const k = h.toLowerCase();
    if (!handles.has(k)) handles.set(k, h);
  };
  const cookie = (n) => {
    const m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  };
  const readExpected = () => {
    const sel = OP === "Followers" ? 'a[href$="/followers"]' : 'a[href$="/following"]';
    document.querySelectorAll(sel).forEach((a) => {
      const t = String(a.getAttribute("title") || a.textContent || "").replace(/[,\\s]/g, "");
      const m = t.match(/(\\d+)/);
      if (m) {
        const n = Number(m[1]);
        if (n > 50 && n > expected) expected = n;
      }
    });
    return expected;
  };
  const fromDom = () => {
    const roots = document.querySelectorAll('[data-testid="UserCell"], [data-testid="cellInnerDiv"]');
    const scope = roots.length ? Array.from(roots) : [document];
    scope.forEach((root) => {
      root.querySelectorAll('a[href^="/"]').forEach((a) => {
        const m = String(a.getAttribute("href") || "").match(/^\\/([A-Za-z0-9_]{1,15})(?:$|[/?#])/);
        if (m) add(m[1]);
      });
    });
  };
  const takeCursor = (n) => {
    if (!n || typeof n !== "object") return;
    const id = String(n.entryId || "");
    const type = n.cursorType || (n.content && n.content.cursorType) || "";
    const val = n.value || (n.content && n.content.value) || (n.content && n.content.itemContent && n.content.itemContent.value);
    if (typeof val === "string" && val && (/cursor-bottom/i.test(id) || /^(Bottom|ShowMore)$/i.test(type))) {
      cursor = val;
    }
  };
  const takeUser = (n) => {
    if (!n || typeof n !== "object") return;
    const sn = n.screen_name || n.username || (n.core && n.core.screen_name) || (n.legacy && n.legacy.screen_name);
    const hasId = n.rest_id || n.id_str || n.__typename === "User" || n.legacy || n.core;
    if (typeof sn === "string" && hasId) add(sn);
  };
  const absorb = (data) => {
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) {
        n.forEach(walk);
        return;
      }
      takeCursor(n);
      takeUser(n);
      const ur = n.user_results || n.user_result || n.userResults;
      if (ur && ur.result) takeUser(ur.result);
      Object.values(n).forEach(walk);
    };
    walk(data);
  };
  const list = () => Array.from(handles.values());
  const report = (type) => {
    const payload = { source: "follow-tana", type: type, op: OP, handles: list(), count: handles.size, expected: expected };
    try { if (window.opener) window.opener.postMessage(payload, "*"); } catch (e) {}
    const exp = expected ? "/" + expected : "";
    if (hiddenPause) document.title = "前面に戻す 棚 " + handles.size + exp + "人";
    else document.title = "棚 " + handles.size + exp + "人";
    console.log("フォロー棚", type, handles.size, expected ? "目安 " + expected : "");
    return payload;
  };
  const loggedIn =
    /(?:^|; )(ct0|twid)=/.test(document.cookie) ||
    !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"], [data-testid="UserCell"]');
  if (!loggedIn) {
    alert("Xにログインしてから、フォロー一覧のページでこのコードを実行してください。");
    return;
  }
  const isHit = (url, init) => {
    const u = String(url || "");
    const body = init && typeof init.body === "string" ? init.body : "";
    if (u.indexOf("/" + OP) !== -1) return true;
    return body.indexOf('"operationName":"' + OP + '"') !== -1;
  };
  const orig = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const hit = isHit(url, init);
    if (hit) {
      template = { url: url, method: (init && init.method) || "GET", headers: init && init.headers, body: init && init.body };
    }
    const res = await orig.apply(this, arguments);
    if (hit) {
      try { absorb(await res.clone().json()); report("progress"); } catch (e) {}
    }
    return res;
  };
  readExpected();
  fromDom();
  report("progress");
  const buildInit = (body) => {
    const h = new Headers(template.headers || undefined);
    const ct0 = cookie("ct0");
    if (ct0) h.set("x-csrf-token", ct0);
    const init = { credentials: "include", method: template.method || "GET", headers: h };
    if (body) init.body = body;
    else if (template.body) init.body = template.body;
    return init;
  };
  const pageOnce = async () => {
    if (!template || !cursor) return "no-cursor";
    const prev = cursor;
    let url = template.url;
    let body = template.body && typeof template.body === "string" ? template.body : null;
    try {
      const u = new URL(url, location.origin);
      if (u.searchParams.has("variables")) {
        const vars = JSON.parse(u.searchParams.get("variables"));
        vars.cursor = prev;
        u.searchParams.set("variables", JSON.stringify(vars));
        url = u.toString();
      }
    } catch (e) {}
    if (body) {
      try {
        const b = JSON.parse(body);
        if (b.variables) b.variables.cursor = prev;
        body = JSON.stringify(b);
      } catch (e) {}
    }
    let res;
    for (let attempt = 0; attempt < 6; attempt++) {
      try { res = await orig(url, buildInit(body)); } catch (e) {
        await sleep(2000);
        continue;
      }
      if (res.status === 429) {
        document.title = "制限待ち… " + handles.size;
        await sleep(15000 + attempt * 5000);
        continue;
      }
      if (!res.ok) {
        await sleep(1200);
        continue;
      }
      cursor = null;
      try { absorb(await res.json()); } catch (e) { cursor = prev; return "bad-json"; }
      report("progress");
      if (!cursor || cursor === prev) return "end";
      return "ok";
    }
    cursor = prev;
    return "fail";
  };
  const replay = async () => {
    if (!template || !cursor) return 0;
    let pages = 0;
    while (pages < 800) {
      if (await waitVisible()) continue;
      const st = await pageOnce();
      if (st !== "ok") break;
      pages += 1;
      await sleep(180);
    }
    return pages;
  };
  const scrollMore = async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const col = document.querySelector('[data-testid="primaryColumn"]');
    if (col) col.scrollTop = col.scrollHeight;
    fromDom();
    readExpected();
  };
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
  const scanLastPosts = async () => {
    if (OP !== "Following") return 0;
    const all = list();
    if (all.length === 0) return 0;
    const BEARER = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
    const headers = () => ({
      authorization: BEARER,
      "x-csrf-token": cookie("ct0"),
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
    });
    let scanned = 0;
    const sendScan = (profiles) => {
      const payload = {
        source: "follow-tana",
        type: "progress",
        op: OP,
        stage: "scan",
        handles: scanned === 0 ? all : [],
        profiles: profiles || [],
        count: all.length,
        scanned: scanned,
        expected: expected,
      };
      try { if (window.opener) window.opener.postMessage(payload, "*"); } catch (e) {}
      document.title = "確認 " + scanned + "/" + all.length + "人";
    };
    sendScan([]);
    const BATCH = 100;
    for (let i = 0; i < all.length; i += BATCH) {
      await waitVisible();
      const chunk = all.slice(i, i + BATCH);
      const url =
        "https://x.com/i/api/1.1/users/lookup.json?include_entities=false&screen_name=" +
        encodeURIComponent(chunk.join(","));
      try {
        let res = await orig(url, { method: "GET", credentials: "include", headers: headers() });
        if (res.status === 429) {
          document.title = "制限待ち… 確認 " + scanned + "/" + all.length;
          await sleep(12000);
          res = await orig(url, { method: "GET", credentials: "include", headers: headers() });
        }
        if (res.status === 401 || res.status === 403) {
          alert("フォロー棚: 名簿は取れましたが、最終投稿の一括取得をXが拒みました。デスクの「生存確認」からもう一度調べてください。");
          return scanned;
        }
        const got = {};
        const profiles = [];
        if (res.ok) {
          const body = await res.json();
          const listU = Array.isArray(body) ? body : [];
          listU.forEach((u) => {
            const row = rowOf(u);
            if (!row.h) return;
            got[row.h.toLowerCase()] = 1;
            profiles.push(row);
          });
        }
        chunk.forEach((h) => {
          if (!got[h.toLowerCase()]) profiles.push({ h: h, miss: true });
        });
        scanned += chunk.length;
        sendScan(profiles);
      } catch (e) {
        scanned += chunk.length;
        sendScan(chunk.map((h) => ({ h: h, miss: true })));
      }
      await sleep(700);
    }
    return scanned;
  };
  (async () => {
    for (let i = 0; i < 20 && !template; i++) {
      await waitVisible();
      await scrollMore();
      await sleep(450);
    }
    await replay();
    let idle = 0;
    let last = handles.size;
    let t0 = Date.now();
    while (idle < 24 && Date.now() - t0 < 25 * 60 * 1000) {
      if (await waitVisible()) {
        idle = 0;
        t0 = Date.now();
        continue;
      }
      readExpected();
      if (expected && handles.size >= expected) break;
      await scrollMore();
      if (template && cursor) await replay();
      await sleep(700);
      if (document.hidden) continue;
      if (handles.size === last) idle += 1;
      else { idle = 0; last = handles.size; report("progress"); }
    }
    await waitVisible();
    fromDom();
    readExpected();
    report("progress");
    const scanned = await scanLastPosts();
    const payload = report("done");
    const text = payload.handles.map((h) => "@" + h).join("\\n");
    try { await navigator.clipboard.writeText(text); } catch (e) {}
    try {
      const blob = new Blob([JSON.stringify(payload.handles)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = OP.toLowerCase() + "-handles.json";
      a.click();
    } catch (e) {}
    window.fetch = orig;
    const note = expected && payload.handles.length < expected
      ? "（プロフィールは約" + expected + "人。足りなければ同じコードをもう一度貼ってください）"
      : "";
    const scanNote = OP === "Following"
      ? (scanned > 0 ? "最終投稿も調べました。" : "最終投稿はデスクの「生存確認」から調べてください。")
      : "";
    alert("フォロー棚: " + payload.handles.length + "人を取得しました。" + scanNote + note + "元のタブに戻ってください。");
  })();
})();`;

export function buildCollectorScript(kind: "following" | "followers"): string {
  const op = kind === "followers" ? "Followers" : "Following";
  return COLLECTOR.split("__OP__").join(op);
}

export function collectorBookmarklet(kind: "following" | "followers"): string {
  return `javascript:${encodeURIComponent(buildCollectorScript(kind))}`;
}