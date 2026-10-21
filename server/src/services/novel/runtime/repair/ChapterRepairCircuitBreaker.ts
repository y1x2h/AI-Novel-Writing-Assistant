import { prisma } from "../../../../db/prisma";

/**
 * 章节级修复熔断记录。
 *
 * 当同一批 issue code 连续两轮被判为未解决时，说明自动修复已经证明修不动这批问题；
 * 继续消耗修复额度只会重复"修复→复检仍失败"的循环。这里把上一轮未解决的 code
 * 集合持久化到章节检查点，供下一次进入章节生产链时快速判定并直接降级为质量债。
 *
 * 复用的持久化模式与 `acceptance/retries/ChapterReviewRetryStore.ts` 一致：
 * 同一个 `chapterArtifactSyncCheckpoint` 表，用独立 artifactType 隔离，避免与资产同步记录混用。
 */
const ARTIFACT_TYPE = "chapter_repair_unresolved_codes:v1";
const SYNC_MODE = "execution";
const RECORD_KEY = "unresolved";

export interface ChapterRepairCircuitBreaker {
  /** 本批 code 是否与上一轮未解决记录完全相同（完全相同表示同一问题已经修过一次仍未解决）。 */
  hasUnresolvedRepeated(novelId: string, chapterId: string, codes: string[]): Promise<boolean>;
  /** 记录本轮未解决的 code；传入空数组表示清除记录（章节已通过）。 */
  recordUnresolved(novelId: string, chapterId: string, codes: string[]): Promise<void>;
}

/** code 集合签名：去空、去重、排序，保证同一问题集在不同轮次得到相同签名。 */
export function buildRepairCodeSignature(codes: string[]): string[] {
  return [...new Set(codes.map((code) => code.trim()).filter((code) => code.length > 0))].sort();
}

export function isSameRepairCodeSignature(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((code, index) => code === right[index]);
}

function buildIdentity(novelId: string, chapterId: string) {
  return { novelId, chapterId, contentHash: RECORD_KEY, artifactType: ARTIFACT_TYPE, syncMode: SYNC_MODE };
}

function buildRecord(codes: string[]): string {
  return JSON.stringify({ codes, recordedAt: new Date().toISOString() });
}

function parseRecordedCodes(metadataJson: string | null): string[] | null {
  if (!metadataJson) {
    return null;
  }
  const parsed = JSON.parse(metadataJson) as unknown;
  const codes = parsed && typeof parsed === "object" ? (parsed as { codes?: unknown }).codes : null;
  return Array.isArray(codes)
    ? buildRepairCodeSignature(codes.filter((code): code is string => typeof code === "string"))
    : null;
}

export const chapterRepairCircuitBreaker: ChapterRepairCircuitBreaker = {
  async hasUnresolvedRepeated(novelId, chapterId, codes) {
    const signature = buildRepairCodeSignature(codes);
    if (signature.length === 0) {
      return false;
    }
    try {
      const row = await prisma.chapterArtifactSyncCheckpoint.findUnique({
        where: { novelId_chapterId_contentHash_artifactType_syncMode: buildIdentity(novelId, chapterId) },
        select: { metadataJson: true },
      });
      const recorded = parseRecordedCodes(row?.metadataJson ?? null);
      return recorded !== null && recorded.length > 0 && isSameRepairCodeSignature(signature, recorded);
    } catch {
      // 熔断记录读取失败不阻塞章节生产，按"没有记录"处理。
      return false;
    }
  },

  async recordUnresolved(novelId, chapterId, codes) {
    const signature = buildRepairCodeSignature(codes);
    const identity = buildIdentity(novelId, chapterId);
    try {
      await prisma.chapterArtifactSyncCheckpoint.upsert({
        where: { novelId_chapterId_contentHash_artifactType_syncMode: identity },
        create: { ...identity, status: "succeeded", metadataJson: buildRecord(signature) },
        update: { status: "succeeded", metadataJson: buildRecord(signature) },
      });
    } catch {
      // 记录失败不阻塞章节生产；下一轮会重新判定。
    }
  },
};
