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
}

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

export interface ReviewDatabase {
  clauses: Clause[];
  responses: SupplierResponse[];
  versions: ReviewVersion[];
  auditLogs: AuditLog[];
  suppliers: Array<{ id: string; name: string }>;
  batches: ReviewBatch[];
  reconsiderations: ReconsiderationItem[];
  pendingBatchItems: PendingBatchItem[];
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
