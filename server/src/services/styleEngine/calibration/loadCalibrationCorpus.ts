import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const calibrationCorpusProvenanceSchema = z.object({
  version: z.literal(1),
  human: z.array(z.object({
    file: z.string().regex(/\.txt$/u),
    author: z.string().min(1),
    work: z.string().min(1),
    sourceUrl: z.string().url(),
    rights: z.string().min(1),
    selection: z.string().min(1),
  })),
});
export type CalibrationCorpusProvenance = z.infer<typeof calibrationCorpusProvenanceSchema>;

export interface CalibrationCorpus {
  human: string[];
  ai: string[];
  provenance: CalibrationCorpusProvenance;
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
  const provenance = calibrationCorpusProvenanceSchema.parse(JSON.parse(
    readFileSync(join(rootDirectory, "provenance.json"), "utf8"),
  ));
  return {
    human: readDirectory(join(rootDirectory, "human")),
    ai: readDirectory(join(rootDirectory, "ai")),
    provenance,
  };
}
