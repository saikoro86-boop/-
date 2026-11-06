/**
 * Cloudflare の画面に貼り付けるための、1ファイルの worker/worker.js を作る。
 *   npm run worker:build
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as ts from "typescript";

const tr = (file: string) =>
  ts.transpileModule(readFileSync(file, "utf-8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext, removeComments: false },
  }).outputText;

const logic = tr("worker/src/logic.ts").replace(/\bexport\s+/g, "");
const index = tr("worker/src/index.ts").replace(/^import .*$/gm, "");
writeFileSync(
  "worker/worker.js",
  `// 自動生成: npm run worker:build(worker/src/*.ts から作られます。直接は編集しないでください)\n${logic}\n${index}`,
);
console.log("worker/worker.js を生成しました");
