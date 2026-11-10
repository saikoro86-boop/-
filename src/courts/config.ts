/**
 * config/ の設定ファイルを、読むと同時に検査する。
 * 書き間違い(必須項目の抜け、型の違い)は、取得を始める前に、どのファイルのどこかを示して止める。
 * 検査していない項目(メモなど)は、そのまま通す(looseObject)。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const str = z.string().min(1);
const url = z.string().regex(/^https?:\/\//, "http(s):// で始まる URL にしてください");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD にしてください");

// ---- courts.json(対象サイト) ----
const contact = z.looseObject({
  match: str,
  tel: str,
  hours: z.string().optional(),
  via: z.string().optional(),
  unconfirmed: z.boolean().optional(),
});
const kashikanSite = z.looseObject({
  type: z.literal("kashikan"),
  id: str,
  name: str,
  url,
  offlineMarks: z.array(z.string()).optional(),
  contacts: z.array(contact).optional(),
  fallbackContact: z.looseObject({ label: str, tel: str }).optional(),
});
const linkSite = z.looseObject({
  type: z.literal("link"),
  id: str,
  name: str,
  entryUrl: url,
  facilities: z.array(z.looseObject({ name: str, hint: z.string().optional() })),
});
const nsaSite = z.looseObject({
  type: z.literal("nsa"),
  id: str,
  name: str,
  targets: z.array(z.looseObject({ facilityId: str, buildingId: str, note: z.string().optional() })),
});
const nsaAutoSite = z.looseObject({ type: z.literal("nsa-auto"), id: str, name: str, purpose: z.string().optional() });

const courtsConfig = z.looseObject({
  sites: z.array(z.discriminatedUnion("type", [kashikanSite, linkSite, nsaSite, nsaAutoSite])),
  purpose: z.looseObject({ type: str, codes: z.array(str).min(1) }),
  days: z.number().int().min(1).max(90),
});
export type CourtsConfig = z.infer<typeof courtsConfig>;
export type SiteConfig = CourtsConfig["sites"][number];
export type KashikanConfig = z.infer<typeof kashikanSite>;
export type LinkConfig = z.infer<typeof linkSite>;
export type NsaConfig = z.infer<typeof nsaSite>;
export type NsaAutoConfig = z.infer<typeof nsaAutoSite>;

// ---- fees.json(料金。公式の資料で確かめたものだけ。出典・確認日・裏付けが必須) ----
const feeSource = z.looseObject({ label: str, url });
const night = z.looseObject({
  unit: z.number().positive(),
  court: z.number().nonnegative(),
  light: z.number().nonnegative(),
  from: z.number(),
  fromSummer: z.number().optional(),
  months: z.array(z.number().int().min(1).max(12)).optional(),
  note: z.string().optional(),
});
const fee = z.looseObject({
  site: str,
  match: str,
  summary: str,
  lines: z.array(str).min(1),
  source: feeSource,
  checkedAt: date,
  crossCheck: z.looseObject({
    status: z.enum(["match", "conflict"]),
    checkedAt: date,
    sources: z.array(z.looseObject({ label: str, url, note: z.string().optional() })).min(1),
  }),
  night: night.optional(),
});
const feesConfig = z.looseObject({
  fees: z.array(fee),
  links: z.array(z.looseObject({ site: str, match: str, url })),
});
export type FeesConfig = z.infer<typeof feesConfig>;

// ---- そのほか ----
const coordsConfig = z.looseObject({
  coords: z.record(str, z.looseObject({ lat: z.number().min(20).max(46), lng: z.number().min(122).max(154), src: str, ref: str })),
});
const courtInfoConfig = z.looseObject({
  info: z.record(
    str,
    z.looseObject({
      surfaces: z.array(z.enum(["omni", "clay", "hard"])),
      indoor: z.boolean(),
      nighter: z.boolean().nullable(),
      src: str,
      ref: z.string(), // 施設の種類から決めたもの(体育館など)は、URL がない(src に根拠を書く)
    }),
  ),
});
const officialConfig = z.looseObject({ urls: z.record(str, url) });
const placesConfig = z.looseObject({
  places: z.array(z.looseObject({ site: str, match: str, dest: str, source: str })),
});

export interface Configs {
  courts: CourtsConfig;
  fees: FeesConfig;
  coords: z.infer<typeof coordsConfig>["coords"];
  courtInfo: z.infer<typeof courtInfoConfig>["info"];
  official: z.infer<typeof officialConfig>["urls"];
  places: z.infer<typeof placesConfig>["places"];
}

function read<T extends z.ZodType>(dir: string, file: string, schema: T): z.infer<T> {
  const text = readFileSync(join(dir, file), "utf-8");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`${file}: JSON として読めません(${(e as Error).message})`);
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    const where = r.error.issues.slice(0, 5).map((i) => `  ${i.path.join(".") || "(全体)"}: ${i.message}`).join("\n");
    throw new Error(`${file}: 設定に誤りがあります\n${where}`);
  }
  return r.data;
}

/** 設定をすべて読んで検査する。どれか1つでも誤りがあれば、取得を始める前に例外 */
export function loadConfigs(dir = "config"): Configs {
  return {
    courts: read(dir, "courts.json", courtsConfig),
    fees: read(dir, "fees.json", feesConfig),
    coords: read(dir, "coords.json", coordsConfig).coords,
    courtInfo: read(dir, "courtinfo.json", courtInfoConfig).info,
    official: read(dir, "official.json", officialConfig).urls,
    places: read(dir, "places.json", placesConfig).places,
  };
}
