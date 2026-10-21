import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CalibrationCorpus {
  human: string[];
  ai: string[];
}

function readDirectory(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".txt"))
    .sort()
    .map((name) => readFileSync(join(directory, name), "utf8"));
}

/**
 * 语料以 .txt 提交在源码目录，tsc 不会把它们复制进 dist，
 * 因此调用方需要显式传入语料根目录（脚本用相对路径，测试用源码路径）。
 */
export function loadCalibrationCorpus(rootDirectory: string): CalibrationCorpus {
  return {
    human: readDirectory(join(rootDirectory, "human")),
    ai: readDirectory(join(rootDirectory, "ai")),
  };
}
