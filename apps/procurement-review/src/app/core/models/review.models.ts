export type ClauseType = "mandatory" | "scoring" | "evidence";
export type ComplianceStatus =
  | "compliant"
  | "deviation"
  | "clarification"
  | "pending";
export type ReviewRole =
  | "procurement"
  | "reviewer_a"
  | "reviewer_b"
  | "chair";
export type ClarificationStatus = "open" | "responded" | "overdue";
export type VersionStatus = "draft" | "finalized";
export type OpinionStatus = "submitted" | "confirmed" | "invalidated" | "conflict";
export type BatchStatus = "complete" | "failed" | "recovered";
export type BatchSource = "receipt" | "opinion" | "version" | "import" | "legacy";
export type BatchItemKind = "receipt" | "opinion" | "version";
export type ReconsiderationStatus = "open" | "resolved";

export interface ReviewerOpinion {
  id: string;
  responseId: string;
  reviewer: string;
  role: ReviewRole;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  createdAt: string;
  status: OpinionStatus;
  baseRevision: number;
  batchNo?: string;
  externalId?: string;
  diffNote?: string;
}

export interface Clarification {
  id: string;
  responseId: string;
  clauseId: string;
  round: number;
  requestText: string;
  supplierResponse?: string;
  requestedAt: string;
  dueAt: string;
  respondedAt?: string;
  status: ClarificationStatus;
  batchNo?: string;
  externalId?: string;
}

export interface SupplierResponse {
  id: string;
  clauseId: string;
  supplierId: string;
  supplierName: string;
  status: ComplianceStatus;
  responseText: string;
  claimedScore: number;
  attachmentName: string;
  proofFingerprint: string;
  submittedBy: string;
  submittedAt: string;
  reviewRound: number;
  revision: number;
  reviews: ReviewerOpinion[];
  clarifications: Clarification[];
}

export interface Clause {
  id: string;
  code: string;
  title: string;
  category: string;
  requirement: string;
  type: ClauseType;
  weight: number;
  parentId?: string;
  evidenceRequired: boolean;
  order: number;
  responses: SupplierResponse[];
  children?: ClauseTreeNode[];
}

export interface ClauseTreeNode extends Clause {
  children: ClauseTreeNode[];
}

export interface ReviewVersion {
  id: string;
  version: string;
  label: string;
  status: VersionStatus;
  createdAt: string;
  createdBy: string;
  signedBy: string[];
  clauseCount: number;
  responseCount: number;
  contentHash: string;
  batchNo?: string;
}

export interface ReviewBatch {
  id: string;
  batchNo: string;
  label: string;
  source: BatchSource;
  status: BatchStatus;
  expectedCount: number;
  appliedCount: number;
  skippedCount: number;
  error?: string;
  createdAt: string;
  createdBy: string;
  recoveredFromId?: string;
}

export interface ReconsiderationItem {
  id: string;
  responseId: string;
  opinionId: string;
  reviewer: string;
  decision: ComplianceStatus;
  score: number;
  reason: string;
  status: ReconsiderationStatus;
  createdAt: string;
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface PendingBatchItem {
  id: string;
  kind: BatchItemKind;
  refId: string;
  label: string;
}

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  detail: string;
}

export interface DashboardStats {
  totalClauses: number;
  mandatoryCount: number;
  pendingReviews: number;
  differences: number;
  overdueClarifications: number;
  reusedProofs: number;
  activeVersion: string;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface ClauseFilters {
  keyword: string;
  category: string;
  type: ClauseType | "all";
  differencesOnly: boolean;
}

export interface ReviewState {
  clauses: Clause[];
  versions: ReviewVersion[];
  auditLogs: AuditLog[];
  dashboard?: DashboardStats;
  suppliers: Supplier[];
  batches: ReviewBatch[];
  reconsiderations: ReconsiderationItem[];
  pendingBatchItems: PendingBatchItem[];
  filters: ClauseFilters;
  role: ReviewRole;
  selectedSupplierIds: string[];
  loading: boolean;
  saving: boolean;
  error?: string;
  toast?: string;
}

export interface WorkspaceQueryResult {
  workspace: {
    clauses: Clause[];
    versions: ReviewVersion[];
    auditLogs: AuditLog[];
    dashboard: DashboardStats;
    suppliers: Supplier[];
    batches: ReviewBatch[];
    reconsiderations: ReconsiderationItem[];
    pendingBatchItems: PendingBatchItem[];
  };
}

export interface AssessmentInput {
  responseId: string;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  reviewer: string;
  role: ReviewRole;
  baseRevision: number;
}

export interface ClarificationInput {
  responseId: string;
  requestText: string;
  dueAt: string;
  actor: string;
}

export interface ClarificationResponseInput {
  clarificationId: string;
  responseText: string;
  actor: string;
}

export interface FinalizeVersionInput {
  label: string;
  actor: string;
  role: ReviewRole;
}

export interface ConfirmOpinionInput {
  opinionId: string;
  actor: string;
  role: ReviewRole;
}

export interface ResolveReconsiderationInput {
  reconsiderationId: string;
  resolution: string;
  actor: string;
  role: ReviewRole;
}

export interface BatchImportItemInput {
  kind: BatchItemKind;
  externalId: string;
  responseId?: string;
  reviewer?: string;
  role?: ReviewRole;
  decision?: ComplianceStatus;
  score?: number;
  comment?: string;
  clarificationId?: string;
  responseText?: string;
}

export interface ImportBatchInput {
  label: string;
  actor: string;
  role: ReviewRole;
  items: BatchImportItemInput[];
}

export interface BatchImportResult {
  batch: ReviewBatch;
  appliedCount: number;
  skippedCount: number;
}

export interface RecoverBatchInput {
  batchId: string;
  actor: string;
}

export interface BackfillBatchInput {
  actor: string;
  role: ReviewRole;
}

export interface BackfillBatchResult {
  assigned: number;
  remaining: number;
}

export const roleProfiles: Record<ReviewRole, { name: string; label: string }> = {
  procurement: { name: "采购专员", label: "采购人员" },
  reviewer_a: { name: "陈评审", label: "技术评审员 A" },
  reviewer_b: { name: "李评审", label: "技术评审员 B" },
  chair: { name: "赵主任", label: "评审组长" },
};

export const complianceLabels: Record<ComplianceStatus, string> = {
  compliant: "符合",
  deviation: "偏离",
  clarification: "待澄清",
  pending: "待评审",
};

export const clauseTypeLabels: Record<ClauseType, string> = {
  mandatory: "否决项",
  scoring: "评分项",
  evidence: "证明项",
};

export const statusSeverity: Record<ComplianceStatus, string> = {
  compliant: "success",
  deviation: "danger",
  clarification: "warn",
  pending: "secondary",
};

export const opinionStatusLabels: Record<OpinionStatus, string> = {
  submitted: "已提交",
  confirmed: "已确认",
  invalidated: "已失效",
  conflict: "冲突草稿",
};

export const batchStatusLabels: Record<BatchStatus, string> = {
  complete: "完整",
  failed: "失败",
  recovered: "已恢复",
};

export const batchSourceLabels: Record<BatchSource, string> = {
  receipt: "澄清回执",
  opinion: "独立意见",
  version: "定稿版本",
  import: "批量导入",
  legacy: "旧数据补登",
};

export const batchItemKindLabels: Record<BatchItemKind, string> = {
  receipt: "澄清回执",
  opinion: "独立意见",
  version: "定稿版本",
};
