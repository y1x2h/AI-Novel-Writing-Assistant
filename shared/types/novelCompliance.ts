export const NOVEL_COMPLIANCE_SCOPES = ["planning", "full"] as const;
export type NovelComplianceScope = (typeof NOVEL_COMPLIANCE_SCOPES)[number];

export const NOVEL_COMPLIANCE_LEVELS = ["pass", "warn", "block"] as const;
export type NovelComplianceLevel = (typeof NOVEL_COMPLIANCE_LEVELS)[number];

export const NOVEL_COMPLIANCE_DIMENSIONS = ["ip_infringement", "platform_content"] as const;
export type NovelComplianceDimension = (typeof NOVEL_COMPLIANCE_DIMENSIONS)[number];

export const NOVEL_COMPLIANCE_SEVERITIES = ["high", "medium", "low"] as const;
export type NovelComplianceSeverity = (typeof NOVEL_COMPLIANCE_SEVERITIES)[number];

export interface NovelComplianceItem {
  rule: string;
  dimension: NovelComplianceDimension;
  severity: NovelComplianceSeverity;
  excerpt: string;
  suggestion: string;
  locationHint: string | null;
}

export interface NovelComplianceReport {
  id: string;
  novelId: string;
  scope: NovelComplianceScope;
  level: NovelComplianceLevel;
  summary: string | null;
  checkedMaterialSummary: string | null;
  items: NovelComplianceItem[];
  createdAt: string;
}
