/**
 * 「いつでも貸館」(PASTORALE 社 / k6.p-kashikan.jp) 系の公共施設予約サイトから
 * テニスコートの空き状況を取得する。ログイン不要の「目的で検索」画面を使う。
 */

export interface Slot {
  /** 開始時刻(時) */
  start: number;
  /** 終了時刻(時) */
  end: number;
  /** 〇=空き / ×=予約済み / その他の記号(抽選・休止など)はそのまま */
  mark: string;
}

export interface CourtAvailability {
  facility: string;
  court: string;
  slots: Slot[];
  /** どの目的コード(035=硬式テニス など)の検索で出たか。公式サイトの検索結果を同じ条件で開くために使う */
  code?: string;
}

export interface KashikanSite {
  id: string;
  name: string;
  /** 例: https://k6.p-kashikan.jp/nara-city/index.php */
  url: string;
}

const FIRST_HOUR = 9;
// 硬式テニス・軟式テニスの目的コード(奈良市)。サイトごとに異なるので config で上書き可能にする。
export const DEFAULT_PURPOSE = { type: "7", codes: ["035", "036"] };

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();

/** 検索結果 HTML を施設・コート・時間帯ごとの空きに変換する(純粋関数) */
export function parseAvailability(html: string): CourtAvailability[] {
  const result: CourtAvailability[] = [];
  const areas = html.split('<div class="koma-area">').slice(1);
  for (const area of areas) {
    const facility = decode(area.match(/<h3[^>]*>(.*?)<\/h3>/s)?.[1] ?? "");
    const rows = area.match(/<table class="koma-table"[^>]*>[\s\S]*?<\/table>/g) ?? [];
    for (const row of rows) {
      const court = row.match(/<td[^>]*class="name"[^>]*>(.*?)<\/td>/s);
      if (!court) continue; // ヘッダ行
      let hour = FIRST_HOUR;
      const slots: Slot[] = [];
      const cells = row.matchAll(/<td\b([^>]*?)>([\s\S]*?)<\/td>/g);
      for (const c of cells) {
        const attrs = c[1];
        if (/class="name"/.test(attrs)) continue;
        const width = attrs.match(/width:(\d+)px/);
        if (!width) continue;
        // 1時間 = 49px。複数時間にまたがるセルは 49 + 50*(n-1) px
        const hours = Math.max(1, Math.round((Number(width[1]) + 1) / 50));
        // 予約操作できるセルには '09001200' 形式の時間枠が入っている。あればそちらを優先
        const range = attrs.match(/'(\d{2})(\d{2})(\d{2})(\d{2})'/);
        const start = range ? Number(range[1]) + Number(range[2]) / 60 : hour;
        const end = range ? Number(range[3]) + Number(range[4]) / 60 : hour + hours;
        slots.push({ start, end, mark: decode(c[2]) });
        hour += hours;
      }
      result.push({ facility, court: decode(court[1]), slots });
    }
  }
  return result;
}

/**
 * 「利用目的 = テニス」で検索した結果は、すべてテニスの扱い(球技場・運動場・庭球場なども含む)。
 * ただし、会議室・研修室・トレーニング室などの「部屋」は、コートではないので除く。
 */
const NOT_A_PLAYING_SPACE = /会議|研修|トレーニング|控室|更衣|和室|作法|調理|視聴覚|本部|事務|ロッカー|倉庫|談話|ホール|ロビー/;
export const isPlayingSpace = (c: { court: string }) => !NOT_A_PLAYING_SPACE.test(c.court);
export const isTennisCourt = (c: CourtAvailability) => isPlayingSpace(c);

// 〇(U+3007) / ○(U+25CB) / ◯(U+25EF) の表記ゆれを吸収する
export const isOpen = (s: Slot) => /^[\u3007\u25cb\u25ef]$/.test(s.mark);

async function request(url: string, body: URLSearchParams, cookie: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body,
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res;
}

/** 指定日(YYYY-MM-DD)・目的コードの空きを取得する */
export async function fetchDay(
  site: KashikanSite,
  date: string,
  purpose = DEFAULT_PURPOSE,
): Promise<CourtAvailability[]> {
  const [y, m, d] = date.split("-");
  const top = await fetch(site.url);
  const cookie = (top.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const out: CourtAvailability[] = [];
  for (const code of purpose.codes) {
    const body = new URLSearchParams({
      op: "srch_mkt",
      UseYM: `${y}${m}`,
      UseDay: String(Number(d)),
      UseDate: `${y}${m}${d}`,
      Type: purpose.type,
      MokutekiCode: code,
      disp_span: "0",
      searchBtn: "",
    });
    const res = await request(site.url, body, cookie);
    out.push(...parseAvailability(await res.text()).map((c) => ({ ...c, code })));
  }
  // 硬式・軟式で同じコートが重複するので統合
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.facility}/${c.court}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}
