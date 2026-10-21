import {
  STYLE_FRAGMENT_MAX_CHARACTERS,
  STYLE_FRAGMENT_MAX_COUNT,
  STYLE_FRAGMENT_MIN_CHARACTERS,
  dedupeStyleFragments,
  normalizeStyleFragment,
  type StyleFragmentRule,
} from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../../db/prisma";

/** 目前只有「禁改」一种用途；历史数据的 kind 仍在过滤条件里，方便后续区分其他片段类型。 */
const PROTECTED_KIND = "protected";

function assertFragmentLength(fragment: string): void {
  const length = Array.from(fragment).length;
  if (length < STYLE_FRAGMENT_MIN_CHARACTERS) {
    throw new Error(`禁改片段至少 ${STYLE_FRAGMENT_MIN_CHARACTERS} 个字。`);
  }
  if (length > STYLE_FRAGMENT_MAX_CHARACTERS) {
    throw new Error(`禁改片段最多 ${STYLE_FRAGMENT_MAX_CHARACTERS} 个字，太长的内容请拆成多条。`);
  }
}

function mapRow(row: {
  id: string;
  novelId: string;
  fragment: string;
  note: string | null;
  source: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): StyleFragmentRule {
  return {
    id: row.id,
    novelId: row.novelId,
    fragment: row.fragment,
    note: row.note,
    source: row.source,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class StyleFragmentRuleService {
  async list(novelId: string): Promise<StyleFragmentRule[]> {
    const rows = await prisma.styleFragmentRule.findMany({
      where: { novelId, kind: PROTECTED_KIND },
      orderBy: [{ enabled: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(mapRow);
  }

  /**
   * 供修文链路读取的书级禁改片段。
   * 只取启用项并去重；不跨书继承，也没有跨书默认值。
   */
  async listProtectedFragments(novelId: string): Promise<string[]> {
    const rows = await prisma.styleFragmentRule.findMany({
      where: { novelId, kind: PROTECTED_KIND, enabled: true },
      select: { fragment: true },
      orderBy: { createdAt: "asc" },
    });
    return dedupeStyleFragments(rows.map((row) => row.fragment));
  }

  async create(input: {
    novelId: string;
    fragment: string;
    note?: string | null;
    enabled?: boolean;
  }): Promise<StyleFragmentRule> {
    const novel = await prisma.novel.findUnique({
      where: { id: input.novelId },
      select: { id: true },
    });
    if (!novel) {
      throw new Error("找不到这本书，无法保存禁改片段。");
    }

    const fragment = normalizeStyleFragment(input.fragment);
    assertFragmentLength(fragment);
    const existing = await this.list(input.novelId);
    if (existing.some((row) => normalizeStyleFragment(row.fragment) === fragment)) {
      throw new Error("这条片段已经在禁改清单里了。");
    }
    if (existing.length >= STYLE_FRAGMENT_MAX_COUNT) {
      throw new Error(`禁改清单最多保存 ${STYLE_FRAGMENT_MAX_COUNT} 条片段。`);
    }

    const row = await prisma.styleFragmentRule.create({
      data: {
        novelId: input.novelId,
        kind: PROTECTED_KIND,
        fragment,
        note: input.note?.trim() || null,
        source: "manual",
        enabled: input.enabled ?? true,
      },
    });
    return mapRow(row);
  }

  async update(id: string, patch: {
    fragment?: string;
    note?: string | null;
    enabled?: boolean;
  }): Promise<StyleFragmentRule> {
    const current = await prisma.styleFragmentRule.findFirst({
      where: { id, kind: PROTECTED_KIND },
    });
    if (!current) {
      throw new Error("这条禁改片段不存在或已被删除。");
    }

    const data: { fragment?: string; note?: string | null; enabled?: boolean } = {};
    if (patch.fragment !== undefined) {
      const fragment = normalizeStyleFragment(patch.fragment);
      assertFragmentLength(fragment);
      const siblings = await this.list(current.novelId);
      if (siblings.some((row) => row.id !== id && normalizeStyleFragment(row.fragment) === fragment)) {
        throw new Error("这条片段已经在禁改清单里了。");
      }
      data.fragment = fragment;
    }
    if (patch.note !== undefined) {
      data.note = patch.note?.trim() || null;
    }
    if (patch.enabled !== undefined) {
      data.enabled = patch.enabled;
    }
    if (Object.keys(data).length === 0) {
      return mapRow(current);
    }

    const row = await prisma.styleFragmentRule.update({ where: { id }, data });
    return mapRow(row);
  }

  async remove(id: string): Promise<void> {
    const current = await prisma.styleFragmentRule.findFirst({
      where: { id, kind: PROTECTED_KIND },
      select: { id: true },
    });
    if (!current) {
      return;
    }
    await prisma.styleFragmentRule.delete({ where: { id } });
  }
}
