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
      // title属性・aria-label・本文のどれに数字が来ても拾う（XのUI変更に強く）
      const candidates = [
        a.getAttribute("title"),
        a.getAttribute("aria-label"),
        a.textContent,
      ];
      const t = candidates.map((c) => String(c || "")).join(" ").replace(/[,\\s]/g, "");
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
  // ---- XHR フック（v4実測：Xの通信は全てXHR。fetchフックは一度も捕まえられない） ----
  // Following/Followers の UserBy 通信を全文で読み、template も XHR 型から奪う。
  let xhrTemplate = null;
  let fetchTemplate = null;
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send, XH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ft = { url: String(url || ""), headers: {} };
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__ft) this.__ft.headers[String(k).toLowerCase()] = String(v);
    return XH.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const ft = this.__ft;
    if (ft && (ft.url.indexOf("/" + OP) !== -1)) {
      const xhr = this;
      if (!xhrTemplate && !new URL(ft.url, location.origin).searchParams.get("cursor")) {
        // 型（GET + ヘッダ + variables）を奪う。cursor 無しの1ページ目のみ。
        try {
          xhrTemplate = {
            url: ft.url,
            headers: Object.assign({}, ft.headers),
          };
          console.log("フォロー棚: XHR型を捕捉しました", ft.url.slice(0, 120));
        } catch (e) {}
      }
      xhr.addEventListener("load", () => {
        try { absorb(JSON.parse(xhr.responseText)); report("progress"); } catch (e) {}
      });
    }
    return XS.apply(this, arguments);
  };
  const restore = () => { XMLHttpRequest.prototype.open = XO; XMLHttpRequest.prototype.send = XS; XMLHttpRequest.prototype.setRequestHeader = XH; };
  // fetchフックも併用（Xの実装が戻る場合に備えて）。
  const orig = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const hit = isHit(url, init);
    if (hit && !fetchTemplate) {
      fetchTemplate = { url: url, method: (init && init.method) || "GET", headers: init && init.headers, body: init && init.body };
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
    const src = xhrTemplate || template;
    const h = new Headers(src.headers || undefined);
    const ct0 = cookie("ct0");
    if (ct0) h.set("x-csrf-token", ct0);
    const init = { credentials: "include", method: (src.method || "GET"), headers: h };
    if (body) init.body = body;
    else if (src.body) init.body = src.body;
    return init;
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
  // （scanLastPosts は旧v1.1 API依存のため削除。最終投稿はデスクの「生存確認」に一本化）

  (async () => {
    for (let i = 0; i < 20 && !(xhrTemplate || template); i++) {
      await waitVisible();
      await scrollMore();
      await sleep(450);
    }
    let idle = 0;
    let last = handles.size;
    let t0 = Date.now();
    while (idle < 24 && Date.now() - t0 < 15 * 60 * 1000) {
      if (await waitVisible()) {
        idle = 0;
        t0 = Date.now();
        continue;
      }
      readExpected();
      if (expected && handles.size >= expected) break;
      await scrollMore();
      // X自身がスクロールで次ページを発行する（署名はX）。応答はXHRフックで全文読む。
      await sleep(900);
      if (document.hidden) continue;
      if (handles.size === last) idle += 1;
      else { idle = 0; last = handles.size; report("progress"); }
    }
    await waitVisible();
    fromDom();
    readExpected();
    report("progress");
    // 旧v1.1 API（users/lookup・show）は消滅。最終投稿はデスクの「生存確認」（SearchTimeline方式）に一本化。
    const scanned = 0;
    const found = 0;
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
    restore();
    const note = expected && payload.handles.length < expected
      ? "（プロフィールは約" + expected + "人。足りなければ同じコードをもう一度貼ってください）"
      : "";
    alert("フォロー棚: " + payload.handles.length + "人を取得しました。" + note + "最終投稿はデスクの「生存確認」から調べてください。元のタブに戻ってください。");
  })();
})();`;

export function buildCollectorScript(kind: "following" | "followers"): string {
  const op = kind === "followers" ? "Followers" : "Following";
  return COLLECTOR.split("__OP__").join(op);
}

export function collectorBookmarklet(kind: "following" | "followers"): string {
  return `javascript:${encodeURIComponent(buildCollectorScript(kind))}`;
}