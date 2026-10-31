import { PLATFORMS, type Platform } from "./types";

/** --name value 形式のオプションと、それ以外の引数に分ける */
export function parseArgs(args: string[]): { positional: string[]; options: Record<string, string> } {
  const positional: string[] = [];
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        options[arg.slice(2)] = "true";
      } else {
        options[arg.slice(2)] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

/**
 * --platforms の値(カンマ区切り)を媒体の配列にする。
 * 空白は無視し、重複は除く(重複すると同じ媒体の下書きが二重に作られるため)。
 * 未指定なら全媒体。
 */
export function parsePlatforms(value: string | undefined): Platform[] {
  if (value === undefined) return [...PLATFORMS];
  const names = [...new Set(value.split(",").map((s) => s.trim()).filter((s) => s !== ""))];
  if (names.length === 0) throw new Error("--platforms に媒体を指定してください");
  for (const name of names) {
    if (!(PLATFORMS as readonly string[]).includes(name)) throw new Error(`未対応の媒体です: ${name}`);
  }
  return names as Platform[];
}
