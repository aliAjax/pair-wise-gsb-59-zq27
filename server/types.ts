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
  /** 所属可恢复批次；旧数据为空字符串，须先在待核队列补登。 */
  batchId: string;
  /** provisional=待确认，confirmed=已确认（留原裁定），invalidated=已失效（待重算）。 */
  lifecycle: OpinionLifecycle;
  /** 基于材料缺失作出的意见，在回执到达后触发同组失效重算。 */
  basedOnMissingMaterial: boolean;
  /** 提交时所基于的响应修订号。 */
  revision: number;
  /** 因回执更新被失效时，记录触发回执，供重算溯源。 */
  invalidatedByClarificationId?: string;
  invalidatedAt?: string;
  /** 已确认意见在回执更新后保留，但进入复议队列。 */
  reconsiderationId?: string;
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
  /** 草稿基于的过期修订号。 */
  baseRevision: number;
  /** 先到者占用修订后，响应当时的最新修订号。 */
  latestRevision: number;
  /** 先到者意见编号，便于差异对照。 */
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
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
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
  /** 澄清发起所在批次。 */
  batchId: string;
  /** 供应商回执登记所在批次（可与发起批次不同）。 */
  receiptBatchId?: string;
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
  /** 乐观修订号：两名评审员并发提交时，先到者占用，后到者保留草稿。 */
  revision: number;
  batchId: string;
  reviews: ReviewerOpinion[];
  clarifications: Clarification[];
  drafts: OpinionDraft[];
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
  /** 定稿所固化的批次编号。 */
  batchId?: string;
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

/** 批次检查点：导入失败时从此完整快照恢复（澄清记录内嵌于响应）。 */
export interface BatchCheckpoint {
  capturedAt: string;
  responses: SupplierResponse[];
  versions: ReviewVersion[];
  reconsiderationItems: ReconsiderationItem[];
  legacyVerifications: LegacyVerification[];
}

export interface ReviewBatch {
  id: string;
  code: string;
  label: string;
  status: BatchStatus;
  createdAt: string;
  createdBy: string;
  committedAt?: string;
  /** 该批次完整提交后的数据库快照（不含检查点本身）。 */
  checkpoint?: BatchCheckpoint;
  /** 导入失败原因。 */
  lastError?: string;
  /** 批次最近一次写入的条目数统计。 */
  opinionCount: number;
  clarificationCount: number;
  responseCount: number;
}

export interface LegacyVerification {
  id: string;
  entityType: LegacyEntityType;
  entityId: string;
  responseId?: string;
  reason: string;
  status: LegacyStatus;
  createdAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  assignedBatchId?: string;
}

export interface ReviewDatabase {
  clauses: Clause[];
  responses: SupplierResponse[];
  versions: ReviewVersion[];
  auditLogs: AuditLog[];
  suppliers: Array<{ id: string; name: string }>;
  batches: ReviewBatch[];
  reconsiderationItems: ReconsiderationItem[];
  legacyVerifications: LegacyVerification[];
}

export interface AssessmentInput {
  responseId: string;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  reviewer: string;
  role: ReviewRole;
  /** 前端读取到的响应修订号，用于并发冲突检测。 */
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
  /** 回执批次；缺省时使用当前工作批次。 */
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
  /** 应用草稿时所基于的最新修订号。 */
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
  /** 可核实时补登的批次编号；为空则归入历史归集批次。 */
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
