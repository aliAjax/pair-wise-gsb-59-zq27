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
export type OpinionLifecycle = "provisional" | "confirmed" | "invalidated";
export type BatchStatus = "open" | "committed" | "failed";
export type LegacyStatus = "pending" | "verified" | "unverifiable";
export type LegacyEntityType = "response" | "opinion" | "clarification";

export interface ReviewerOpinion {
  id: string;
  responseId: string;
  reviewer: string;
  role: ReviewRole;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  createdAt: string;
  batchId: string;
  lifecycle: OpinionLifecycle;
  basedOnMissingMaterial: boolean;
  revision: number;
  invalidatedByClarificationId?: string | null;
  invalidatedAt?: string | null;
  reconsiderationId?: string | null;
}

export interface OpinionDraft {
  id: string;
  responseId: string;
  reviewer: string;
  role: ReviewRole;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  createdAt: string;
  batchId: string;
  baseRevision: number;
  latestRevision: number;
  conflictOpinionId: string;
}

export interface ReconsiderationItem {
  id: string;
  responseId: string;
  opinionId: string;
  reviewer: string;
  batchId: string;
  reason: string;
  clarificationId: string;
  createdAt: string;
  status: "open" | "resolved";
  resolution?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export interface Clarification {
  id: string;
  responseId: string;
  clauseId: string;
  round: number;
  requestText: string;
  supplierResponse?: string | null;
  requestedAt: string;
  dueAt: string;
  respondedAt?: string | null;
  status: ClarificationStatus;
  batchId: string;
  receiptBatchId?: string | null;
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
  batchId: string;
  reviews: ReviewerOpinion[];
  clarifications: Clarification[];
  drafts: OpinionDraft[];
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
  batchId?: string | null;
}

export interface BatchCheckpoint {
  capturedAt: string;
  responseCount: number;
}

export interface ReviewBatch {
  id: string;
  code: string;
  label: string;
  status: BatchStatus;
  createdAt: string;
  createdBy: string;
  committedAt?: string | null;
  checkpoint?: BatchCheckpoint | null;
  lastError?: string | null;
  opinionCount: number;
  clarificationCount: number;
  responseCount: number;
}

export interface LegacyVerification {
  id: string;
  entityType: LegacyEntityType;
  entityId: string;
  responseId?: string | null;
  reason: string;
  status: LegacyStatus;
  createdAt: string;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  assignedBatchId?: string | null;
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
  invalidatedOpinions: number;
  pendingDrafts: number;
  openReconsiderations: number;
  pendingLegacyItems: number;
  unverifiableLegacyItems: number;
  activeBatch: string;
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
  legacyVerifications: LegacyVerification[];
  filters: ClauseFilters;
  role: ReviewRole;
  selectedSupplierIds: string[];
  loading: boolean;
  saving: boolean;
  error?: string;
  toast?: string;
  toastSeverity: "success" | "warn" | "error";
}

export interface WorkspaceQueryResult {
  workspace: {
    clauses: Clause[];
    versions: ReviewVersion[];
    auditLogs: AuditLog[];
    dashboard: DashboardStats;
    suppliers: Supplier[];
    batches: ReviewBatch[];
    reconsiderationItems: ReconsiderationItem[];
    legacyVerifications: LegacyVerification[];
  };
}

export interface AssessmentInput {
  responseId: string;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  reviewer: string;
  role: ReviewRole;
  baseRevision?: number;
  batchId?: string;
}

export interface ClarificationInput {
  responseId: string;
  requestText: string;
  dueAt: string;
  actor: string;
  batchId?: string;
}

export interface ClarificationResponseInput {
  clarificationId: string;
  responseText: string;
  actor: string;
  batchId?: string;
}

export interface FinalizeVersionInput {
  label: string;
  actor: string;
  role: ReviewRole;
}

export interface ConfirmAssessmentInput {
  opinionId: string;
  actor: string;
  role: ReviewRole;
}

export interface DiscardDraftInput {
  draftId: string;
  actor: string;
  role: ReviewRole;
}

export interface ApplyDraftInput {
  draftId: string;
  actor: string;
  role: ReviewRole;
  baseRevision?: number;
}

export interface ResolveReconsiderationInput {
  reconsiderationId: string;
  resolution: string;
  actor: string;
  role: ReviewRole;
}

export interface VerifyLegacyItemInput {
  legacyId: string;
  actor: string;
  role: ReviewRole;
  batchId?: string;
}

export interface ImportOpinionInput {
  responseId: string;
  reviewer: string;
  role: ReviewRole;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  createdAt?: string;
}

export interface ImportClarificationInput {
  responseId: string;
  round: number;
  requestText: string;
  supplierResponse?: string;
  requestedAt: string;
  dueAt: string;
  respondedAt?: string;
  status?: ClarificationStatus;
}

export interface BatchImportInput {
  batchCode: string;
  label: string;
  actor: string;
  opinions: ImportOpinionInput[];
  clarifications: ImportClarificationInput[];
}

export interface SubmitAssessmentResult {
  opinion: ReviewerOpinion | null;
  draft: OpinionDraft | null;
  conflicted: boolean;
  currentRevision: number;
  conflictOpinion: ReviewerOpinion | null;
  batchId: string;
}

export interface BatchImportCounts {
  opinionsAdded: number;
  clarificationsAdded: number;
  opinionsSkipped: number;
  clarificationsSkipped: number;
  errors: string[];
}

export interface BatchImportResult {
  batch: ReviewBatch;
  success: boolean;
  recoveredFromBatchId: string | null;
  message: string;
  counts: BatchImportCounts;
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

export const lifecycleLabels: Record<OpinionLifecycle, string> = {
  provisional: "待确认",
  confirmed: "已确认",
  invalidated: "已失效待重算",
};

export const batchStatusLabels: Record<BatchStatus, string> = {
  open: "工作批次",
  committed: "已提交",
  failed: "导入失败",
};

export const legacyStatusLabels: Record<LegacyStatus, string> = {
  pending: "待核",
  verified: "已核实",
  unverifiable: "补不齐",
};

export const legacyEntityLabels: Record<LegacyEntityType, string> = {
  response: "供应商响应",
  opinion: "独立意见",
  clarification: "澄清回执",
};
