/**
 * 奈良スーパーアプリ(nsa.pref.nara.jp / Salesforce LWR)のゲスト画面が使っている
 * 施設別の空きデータ(Apex `getResultList`)を取得して、プロジェクト共通の形に変換する。
 *
 * - ゲスト(ログインなし)で画面が呼んでいる通信と同じもの。認証トークン・Cookie は不要
 *   (必要なのは content-type だけ)。1施設につき1回のPOSTで全日付分が返る。
 * - 規約上、ゲスト閲覧データの自動取得を禁じる記載は確認できなかった(個別規約は未確認)。
 *   低頻度(定期更新で施設ごとに1回)で使うこと。
 *
 * レスポンスの読み方(2026-11 時点・実データから推定):
 *   equResultList        コート(設備)の一覧
 *   rsvSlotResultList    予約できる1時間枠。日付 + 開始/終了。時刻は "Z" 付きの UTC で、+9時間が日本時間
 *                        (00:00Z = 9:00)。実データでは 9:00〜17:00 の枠になる
 *   rsvItemResultList    予約の明細。枠IDを持つ = その枠には予約が入っている
 *   → 「空き」= 枠があって、予約の明細がないもの。※画面との突き合わせは未了(README 参照)
 */
import { isPlayingSpace, type CourtAvailability, type Slot } from "./kashikan";

export const NSA_ENDPOINT =
  "https://nsa.pref.nara.jp/fre/webruntime/api/apex/execute?language=ja&asGuest=true&htmlEncode=false";

/** `getResultList` を呼ぶ Apex クラス(画面が使っているもの) */
const APEX_CLASS = "@udd/01p5i00000X9eij";

export interface NaraSuperAppRequest {
  namespace: "";
  classname: string;
  method: "getResultList";
  isContinuation: false;
  params: {
    buildingId: string;
    facilityId: string;
    isForStaff: false;
    rsvId: null;
  };
  cacheable: false;
}

export interface NsaEquipment {
  Id: string;
  Name: string; // 例: "テニスコートＡ"
  MaxUseCount__c: number;
}

export interface NsaSlot {
  Id: string;
  FRE_EquipmentId__c: string;
  ReservationSlotType__c: string; // "一般利用"
  ReservationSlotDate__c: string; // "2026-11-14"
  ReservationSlotStartDateTimeF__c: string; // "2026-11-14T00:00:00.000Z"
  ReservationSlotEndDateTimeF__c: string;
}

export interface NsaItem {
  FRE_EquipmentId__c: string;
  FRE_ReservationSlotId__c: string;
  ReservationMethod__c: string;
  expr1: number;
}

export interface NaraSuperAppResponse {
  returnValue: {
    buildingRecord: {
      Id: string;
      Name: string; // 建物名
      FRE_FacilitiesId__c: string;
      FRE_FacilitiesId__r?: { Name: string }; // 施設名(あれば建物名より優先)
    };
    equResultList: NsaEquipment[];
    isInquiryOnly: boolean;
    rsvItemResultList: NsaItem[];
    rsvSlotResultList: NsaSlot[];
    isSuccess: boolean;
    messages: unknown[];
  };
}

/** 生データを1回で取得する。施設ごとに1回呼べば全日付分が含まれる */
export async function fetchNaraSuperAppRaw(buildingId: string, facilityId: string): Promise<NaraSuperAppResponse> {
  const body: NaraSuperAppRequest = {
    namespace: "",
    classname: APEX_CLASS,
    method: "getResultList",
    isContinuation: false,
    params: { buildingId, facilityId, isForStaff: false, rsvId: null },
    cacheable: false,
  };
  const res = await fetch(NSA_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      // ブラウザを装わず、個人用ツールであることを示す
      "user-agent": "tennis-court-finder (personal use; low frequency)",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${NSA_ENDPOINT} -> HTTP ${res.status}`);
  const json = (await res.json()) as NaraSuperAppResponse;
  if (!json.returnValue?.isSuccess) throw new Error("奈良スーパーアプリ: isSuccess=false");
  return json;
}

const JST_MS = 9 * 3600e3;
/** "2026-11-14T00:00:00.000Z" → 日本時間の「時」(9, 9.5 など) */
const jstHour = (iso: string) => {
  const d = new Date(Date.parse(iso) + JST_MS);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

/** 全角英数(テニスコートＡ)を半角にそろえる。奈良市・生駒市・木津川市の表記と合わせるため */
const norm = (s: string) => s.normalize("NFKC").trim();

/** データに含まれる日付の一覧(昇順) */
export function listNaraSuperAppDates(raw: NaraSuperAppResponse): string[] {
  return [...new Set(raw.returnValue.rsvSlotResultList.map((s) => s.ReservationSlotDate__c))].sort();
}

/**
 * 指定日の空きを共通型に変換する。
 * mark: 予約の明細がない枠 = "○"、ある枠 = "×"
 */
export function parseNaraSuperApp(raw: NaraSuperAppResponse, date: string): CourtAvailability[] {
  const { buildingRecord, equResultList, rsvSlotResultList, rsvItemResultList } = raw.returnValue;
  const reserved = new Set(rsvItemResultList.map((i) => i.FRE_ReservationSlotId__c));
  const out: CourtAvailability[] = [];
  for (const eq of equResultList) {
    const slots: Slot[] = rsvSlotResultList
      .filter((s) => s.FRE_EquipmentId__c === eq.Id && s.ReservationSlotDate__c === date)
      .map((s) => ({
        start: jstHour(s.ReservationSlotStartDateTimeF__c),
        end: jstHour(s.ReservationSlotEndDateTimeF__c),
        mark: reserved.has(s.Id) ? "×" : "○",
      }))
      .sort((a, b) => a.start - b.start);
    if (slots.length) out.push({ facility: norm(buildingRecord.FRE_FacilitiesId__r?.Name ?? buildingRecord.Name), court: norm(eq.Name), slots });
  }
  return out;
}

// ---- 施設一覧(ゲストでも取れる getTopInfo)から、テニス対応の建物を自動で拾う ----

const TOP_APEX_CLASS = "@udd/01p5i00000X9ekk";

export interface NsaTarget {
  municipality: string; // 例: "橿原市"(画面のエリア名に使う)
  facilityName: string;
  facilityId: string;
  buildingName: string;
  buildingId: string;
}

export interface NaraSuperAppTopResponse {
  returnValue: {
    facilitiesResultList: {
      facilityId: string;
      facilityName: string;
      municipality: string;
      buildingList: { buildingId: string; buildingName: string; purposeUseList?: string[] }[];
    }[];
  };
}

export async function fetchNaraSuperAppTop(): Promise<NaraSuperAppTopResponse> {
  const res = await fetch(NSA_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "user-agent": "tennis-court-finder (personal use; low frequency)",
    },
    body: JSON.stringify({ namespace: "", classname: TOP_APEX_CLASS, method: "getTopInfo", isContinuation: false, cacheable: false }),
  });
  if (!res.ok) throw new Error(`${NSA_ENDPOINT} -> HTTP ${res.status}`);
  return (await res.json()) as NaraSuperAppTopResponse;
}

/** 「利用目的」に purpose(既定: テニス)を含む建物を、施設一覧から取り出す(純粋関数) */
export function pickNaraSuperAppTargets(top: NaraSuperAppTopResponse, purpose = "テニス"): NsaTarget[] {
  const out: NsaTarget[] = [];
  for (const f of top.returnValue.facilitiesResultList) {
    for (const b of f.buildingList) {
      if ((b.purposeUseList ?? []).includes(purpose)) {
        out.push({
          municipality: f.municipality,
          facilityName: f.facilityName,
          facilityId: f.facilityId,
          buildingName: b.buildingName,
          buildingId: b.buildingId,
        });
      }
    }
  }
  return out;
}

/**
 * 建物の「利用目的」はテニスでも、体育館や会議室などが同居している。
 * 施設名 + 設備名に テニス/庭球/オムニ/クレー を含むものだけをテニスコートとみなす。
 * (「バドミントンコート」「多目的コート」などは対象外)
 */
export const isNsaTennisCourt = (c: CourtAvailability) => /テニス|庭球|オムニ|クレー/.test(c.facility + c.court);

/** 奈良スーパーアプリの、施設(建物)ごとの予約画面のURL。ゲストでも開ける(予約にはログインが必要) */
export const nsaReservationUrl = (facilityId: string, buildingId: string) =>
  `https://nsa.pref.nara.jp/fre/rsvApplication?retType=0&facilitiesId=${encodeURIComponent(facilityId)}&buildingId=${encodeURIComponent(buildingId)}`;

/**
 * 利用目的に「テニス」を含む建物の中で、表示する設備(コート)を決める。
 * - 設備名に テニス/庭球/オムニ/クレー を含むものがあれば、それだけ(体育館や会議室が同居している建物)
 * - なければ(体育館・競技場だけの建物)、会議室・研修室・トレーニング室などの「部屋」を除いたものを、すべて表示する。
 *   画面は「テニスで検索して出る施設」は全部テニスの扱い、というユーザーの方針に合わせたもの。gym=true は、その場合
 */
export const isNsaPlayableSpace = (c: CourtAvailability) => isPlayingSpace(c);

export function nsaCourtFilter(raw: NaraSuperAppResponse): { pred: (c: CourtAvailability) => boolean; gym: boolean } {
  const b = raw.returnValue.buildingRecord;
  const facility = b.FRE_FacilitiesId__r?.Name ?? b.Name;
  const named = raw.returnValue.equResultList.some((e) => isNsaTennisCourt({ facility, court: e.Name, slots: [] }));
  return named ? { pred: isNsaTennisCourt, gym: false } : { pred: isNsaPlayableSpace, gym: true };
}
