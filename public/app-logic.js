// 画面(index.html)の、画面に触らない部分(日付・時間・距離・枠のまとめ・カレンダーの文など)。
// ブラウザでは window.AppLogic、Node のテスト(tests/app-logic.test.ts)では require で使う。
// ビルドなしで動くように、素の JavaScript で書く。DOM・localStorage・通信には触らないこと。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AppLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const pad2 = (n) => String(n).padStart(2, "0");

  // ---- 日付・時間 ----------------------------------------------------------
  /** "2026-11-14" の曜日(0=日)。端末のタイムゾーンに左右されないよう、日付文字列から直接作る */
  function weekday(d) {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  }
  /** "2026-11-14" → "11/14(土)" */
  function dateLabel(d) {
    const [, m, dd] = d.split("-").map(Number);
    return `${m}/${dd}(${WD[weekday(d)]})`;
  }
  /** 日本時間の「今日」と「いまの時刻(時)」 */
  function nowJst(ms) {
    const j = new Date((ms === undefined ? Date.now() : ms) + 9 * 3600e3);
    return { today: j.toISOString().slice(0, 10), hour: j.getUTCHours() + j.getUTCMinutes() / 60 };
  }
  /** 選べる日付。今日より前は出さない(データの更新前でも、今日から選べるように)。全部過去なら、そのまま */
  function visibleDates(allDates, today) {
    return allDates.some((d) => d >= today) ? allDates.filter((d) => d >= today) : allDates;
  }
  /** 9 → "9"、9.5 → "9:30"(枠のボタン用の短い書き方) */
  function hm(h) {
    const m = Math.round((h % 1) * 60);
    return Math.floor(h) + (m ? ":" + pad2(m) : "");
  }
  /** 9 → "9:00"、9.5 → "9:30" */
  function fmtT(h) {
    return Math.floor(h) + ":" + pad2(Math.round((h % 1) * 60));
  }

  // ---- 枠 ------------------------------------------------------------------
  /** 小さな形式(data2.json の v2)を、「1枠ごとの配列」に戻す */
  function expandV2(d) {
    const out = [];
    for (const [date, list] of Object.entries(d.byDate || {})) {
      for (const [ci, start, end, off, nw] of list) {
        const c = d.courts[ci];
        if (!c) continue;
        out.push({ date, site: c[0], facility: c[1], court: c[2], start, end, ...(off ? { offline: true } : {}), ...(nw ? { fresh: true } : {}) });
      }
    }
    return out;
  }
  /** 1つのコートの、1日の枠をまとめる。連続する枠(9-10, 10-11)は1つに。ネット予約の枠と、受付外(☎)の枠は分けて結合する */
  function mergeCourtSpans(ss) {
    const merged = [];
    for (const s of [...ss].sort((a, b) => a.start - b.start)) {
      const last = merged.filter((m) => !!m.offline === !!s.offline).pop();
      if (last && s.start <= last.end) {
        last.end = Math.max(last.end, s.end);
        last.fresh = last.fresh || !!s.fresh;
      } else merged.push({ start: s.start, end: s.end, offline: !!s.offline, fresh: !!s.fresh });
    }
    return merged.sort((a, b) => a.start - b.start || a.end - b.end);
  }
  /** 施設全体で、空いている時間帯をまとめる(どこかのコートが空いていれば空き)。[開始, 終了, すべて受付外か] */
  function mergeFacilitySpans(spans) {
    const sp = spans.map((x) => [x.start, x.end, !!x.offline]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b, off] of sp) {
      const l = merged[merged.length - 1];
      if (l && a <= l[1]) {
        l[1] = Math.max(l[1], b);
        l[2] = l[2] && off;
      } else merged.push([a, b, off]);
    }
    return merged;
  }
  /** 取得できなかったエリアの名前(city が "all" 以外なら、そのエリアだけ。日付つきの失敗は、dates に含まれるときだけ) */
  function failedAreas(failures, city, dates) {
    return [...new Set((failures || []).filter((f) => (city === "all" || f.s === city) && (!f.d || dates.includes(f.d))).map((f) => f.s))];
  }

  // ---- 距離 ----------------------------------------------------------------
  /** 2地点の直線距離(km) */
  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ---- 共有の文・カレンダー -------------------------------------------------
  /** LINE やメモに貼れる文。ネット予約の受付外(☎)の枠は、そう分かるようにして、電話番号も付ける */
  function shareText({ facility, court, date, spans, url, tel }) {
    const times = spans.map((x) => `${fmtT(x.start)}〜${fmtT(x.end)}${x.offline ? "(ネット予約外・電話)" : ""}`).join(" / ");
    const lines = ["【テニスコートの空き】", `${dateLabel(date)} ${facility} ${court}`, times];
    if (tel && spans.some((x) => x.offline)) lines.push("電話: " + tel);
    if (url) lines.push("予約サイト: " + url);
    return lines.join("\n");
  }
  /** "2026-11-08", 9.5 → "20261108T093000"(日本時間のまま。タイムゾーンは別に付ける) */
  function calStamp(date, h) {
    const m = Math.round(h * 60);
    return date.replace(/-/g, "") + "T" + pad2(Math.floor(m / 60)) + pad2(m % 60) + "00";
  }
  function googleCalUrl(ev) {
    const q = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates: calStamp(ev.date, ev.start) + "/" + calStamp(ev.date, ev.end), ctz: "Asia/Tokyo", details: ev.details, location: ev.location });
    return "https://calendar.google.com/calendar/render?" + q.toString();
  }
  /** iCalendar(.ics)。改行・カンマなどはエスケープし、75 バイトを超える行は折り返す。now は作成時刻(テストで固定できる) */
  function icsText(ev, now) {
    const esc = (t) => String(t).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
    const fold = (line) => {
      const out = [];
      let cur = "", bytes = 0;
      for (const ch of line) {
        const b = new TextEncoder().encode(ch).length;
        if (bytes + b > 74) { out.push(cur); cur = " "; bytes = 1; }
        cur += ch;
        bytes += b;
      }
      out.push(cur);
      return out.join("\r\n");
    };
    const stamp = (now || new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const uid = calStamp(ev.date, ev.start) + "-" + Math.abs([...ev.title].reduce((a, c) => (a * 31 + c.codePointAt(0)) | 0, 7)) + "@tennis-courts";
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//tennis-courts//ja", "CALSCALE:GREGORIAN",
      "BEGIN:VTIMEZONE", "TZID:Asia/Tokyo", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:JST", "END:STANDARD", "END:VTIMEZONE",
      "BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + stamp,
      "DTSTART;TZID=Asia/Tokyo:" + calStamp(ev.date, ev.start), "DTEND;TZID=Asia/Tokyo:" + calStamp(ev.date, ev.end),
      "SUMMARY:" + esc(ev.title), "LOCATION:" + esc(ev.location), "DESCRIPTION:" + esc(ev.details),
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(ev.title), "TRIGGER:-PT1H", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR", "",
    ].map(fold).join("\r\n");
  }

  return { WD, weekday, dateLabel, nowJst, visibleDates, hm, fmtT, expandV2, mergeCourtSpans, mergeFacilitySpans, failedAreas, haversineKm, shareText, calStamp, googleCalUrl, icsText };
});
