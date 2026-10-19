import NovelCompliancePanel from "./NovelCompliancePanel";
import { useNovelCompliance } from "./useNovelCompliance";

interface PlanningComplianceSectionProps {
  novelId: string;
}

/**
 * 规划阶段的合规预检入口：只读取/生成报告，不参与自动导演状态机，也不阻断生成。
 */
export default function PlanningComplianceSection({ novelId }: PlanningComplianceSectionProps) {
  const compliance = useNovelCompliance(novelId);

  return (
    <NovelCompliancePanel
      report={compliance.report}
      isLoading={compliance.isLoading}
      isRunning={compliance.isRunning}
      onRunPrecheck={compliance.runPrecheck}
      scope="planning"
      title="规划阶段合规预检"
      description="在正式写正文前，先检查方向、设定和大纲里可能引起的侵权、影射或平台驳回风险。"
    />
  );
}
