import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Platform } from "./types";

const BRAND_PATH = process.env.SNS_BRAND_PATH ?? "./config/brand.md";

const PostsSchema = z.object({
  x: z.string().describe("X(Twitter)用の本文。ハッシュタグ込みで全角130文字以内"),
  threads: z.string().describe("Threads用の本文。500文字以内"),
  instagram: z
    .string()
    .describe("Instagram用のキャプション。改行で読みやすく、末尾にハッシュタグ5〜10個"),
});

export type GeneratedPosts = z.infer<typeof PostsSchema>;

const SYSTEM_PROMPT = `あなたは企業アカウントのSNS運用担当です。
与えられたテーマから、X・Threads・Instagram それぞれの特性に合わせた投稿文を作成します。

- X: 短く要点を1つに絞る。冒頭で興味を引く。
- Threads: 会話的で親しみやすいトーン。少し背景や理由を足してよい。
- Instagram: 画像と一緒に読まれる前提。改行と絵文字で読みやすくし、最後にハッシュタグをまとめる。

投稿は人が確認してから公開されます。事実が不確かな点(数字・日付・固有名詞)はテーマに書かれた内容だけを使い、推測で補わないでください。`;

function loadBrandGuide(): string {
  if (!fs.existsSync(BRAND_PATH)) return "";
  return fs.readFileSync(BRAND_PATH, "utf-8");
}

export async function generatePosts(theme: string, platforms: Platform[]): Promise<GeneratedPosts> {
  const client = new Anthropic();
  const brand = loadBrandGuide();

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // 安全分類で断られた場合に、サーバー側で別モデルに自動で切り替える
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: betaZodOutputFormat(PostsSchema),
    },
    system: brand ? `${SYSTEM_PROMPT}\n\n# ブランドガイド\n${brand}` : SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `テーマ: ${theme}\n\n今回実際に使う媒体: ${platforms.join(", ")}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`投稿文の生成が断られました: ${response.stop_details?.explanation ?? "理由不明"}`);
  }
  if (!response.parsed_output) {
    throw new Error(`投稿文を読み取れませんでした (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
