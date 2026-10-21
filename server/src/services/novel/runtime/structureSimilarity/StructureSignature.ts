import {
  normalizeReaderExperienceContract,
  type ReaderExperienceContract,
} from "@ai-novel/shared/types/novel/readerExperience";

/**
 * 单章的结构骨架签名。
 *
 * 签名只做两件事：把场景拆解里的“转折/情绪”抽成有序骨架，把读者体验合同抽成要点集合。
 * 它不解释语义、不打分，只提供后续比对的确定性输入。
 */
export interface ChapterStructureSignature {
  chapterId: string;
  chapterOrder: number;
  /** 每个场景的转折骨架，按场景顺序保留。 */
  sceneBeats: string[];
  /** 场景骨架的整体 shingle 集合，容忍近义但不同措辞的写法。 */
  beatShingles: string[];
  /** 读者体验合同的 shingle 集合。 */
  contractShingles: string[];
  /** 合同关键短语，用于给出人可读的位置证据。 */
  contractHighlights: string[];
  /** 本章是否存在可用的场景拆解；缺失时只依赖读者体验合同。 */
  hasSceneCards: boolean;
}

export interface ChapterStructureSignatureInput {
  chapterId: string;
  chapterOrder: number;
  sceneCards?: string | null;
  targetWordCount?: number | null;
}

const SHINGLE_SIZE = 2;
const MAX_CONTRACT_HIGHLIGHTS = 3;
const PUNCTUATION_PATTERN = /[\s，。、；：！？…—～·「」『』“”‘’"'（）()【】\[\]《》<>~!?,.:;｜|]/gu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 去掉空白与标点，避免同一骨架因标点差异被判成不同。 */
export function normalizeStructurePhrase(value: unknown): string {
  return readString(value).replace(PUNCTUATION_PATTERN, "");
}

export function buildShingles(text: string): string[] {
  if (!text) return [];
  if (text.length <= SHINGLE_SIZE) return [text];
  const shingles: string[] = [];
  for (let index = 0; index + SHINGLE_SIZE <= text.length; index += 1) {
    shingles.push(text.slice(index, index + SHINGLE_SIZE));
  }
  return shingles;
}

function readSceneCardsSource(sceneCards: string | null | undefined): {
  scenes: Record<string, unknown>[];
  readerExperience: ReaderExperienceContract;
} | null {
  if (!sceneCards) return null;
  try {
    const parsed = JSON.parse(sceneCards) as unknown;
    if (!isRecord(parsed)) return null;
    const scenes = Array.isArray(parsed.scenes)
      ? parsed.scenes.filter(isRecord)
      : Array.isArray(parsed.sceneCards)
        ? parsed.sceneCards.filter(isRecord)
        : [];
    return { scenes, readerExperience: normalizeReaderExperienceContract(parsed.readerExperience) };
  } catch {
    return null;
  }
}

function buildContractShingles(contract: ReaderExperienceContract): {
  shingles: string[];
  highlights: string[];
} {
  const highlights = [
    contract.keyTurn,
    contract.primaryResistance,
    contract.emotionalShift,
    contract.netChange,
    contract.endingHook,
  ]
    .map((value) => normalizeStructurePhrase(value))
    .filter((value) => value.length > 0);
  return {
    shingles: buildShingles(highlights.join("")),
    highlights: highlights.slice(0, MAX_CONTRACT_HIGHLIGHTS),
  };
}

export function buildChapterStructureSignature(
  input: ChapterStructureSignatureInput,
): ChapterStructureSignature {
  const source = readSceneCardsSource(input.sceneCards);
  const sceneBeats = (source?.scenes ?? [])
    .map((scene) => normalizeStructurePhrase(scene.turn) || normalizeStructurePhrase(scene.title))
    .filter((beat) => beat.length > 0);
  const contract = source?.readerExperience ?? normalizeReaderExperienceContract(null);
  const contractSignature = buildContractShingles(contract);
  return {
    chapterId: input.chapterId,
    chapterOrder: input.chapterOrder,
    sceneBeats,
    beatShingles: buildShingles(sceneBeats.join("")),
    contractShingles: contractSignature.shingles,
    contractHighlights: contractSignature.highlights,
    hasSceneCards: sceneBeats.length > 0,
  };
}

export function hasComparableStructure(signature: ChapterStructureSignature): boolean {
  return signature.beatShingles.length > 0 || signature.contractShingles.length > 0;
}
