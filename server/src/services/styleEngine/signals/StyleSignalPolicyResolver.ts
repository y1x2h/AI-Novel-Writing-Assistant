import {
  createStyleSignalPolicy,
  styleSignalPolicyOverrideSchema,
  type LanguageRules,
  type StyleSignalPolicy,
} from "@ai-novel/shared/types/styleEngine";

/**
 * 把写法档案的语体设置翻译成检测阈值。
 *
 * 只做确定性合并：全局默认基线 ← 写法档案声明的 `signalCalibration` 覆盖项。
 * 这里不做任何关键词判断，也不推断语体；写法模板通过显式阈值声明不同语体的敏感度。
 */
export class StyleSignalPolicyResolver {
  resolve(languageRules?: LanguageRules | null): StyleSignalPolicy {
    const base = createStyleSignalPolicy();
    const parsed = styleSignalPolicyOverrideSchema.safeParse(languageRules?.signalCalibration);
    if (!parsed.success) {
      return base;
    }
    // 只合并真正声明了的项：显式传入的 undefined 不应该把基线阈值清掉。
    const applied = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    );
    return { ...base, ...applied };
  }
}
