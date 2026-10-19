import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  NovelComplianceReport,
  NovelComplianceScope,
} from "@ai-novel/shared/types/novelCompliance";
import { apiClient } from "../client";

export async function getNovelComplianceReport(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelComplianceReport | null>>(
    `/novels/${id}/compliance`,
  );
  return data;
}

export async function runNovelCompliancePrecheck(
  id: string,
  scope: NovelComplianceScope = "planning",
) {
  const { data } = await apiClient.post<ApiResponse<NovelComplianceReport>>(
    `/novels/${id}/compliance/precheck`,
    { scope },
  );
  return data;
}
