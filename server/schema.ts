import { parse } from "graphql";

export const typeDefs = parse(`
  enum ClauseType {
    mandatory
    scoring
    evidence
  }

  enum ComplianceStatus {
    compliant
    deviation
    clarification
    pending
  }

  enum ReviewRole {
    procurement
    reviewer_a
    reviewer_b
    chair
  }

  enum ClarificationStatus {
    open
    responded
    overdue
  }

  enum VersionStatus {
    draft
    finalized
  }

  enum OpinionLifecycle {
    provisional
    confirmed
    invalidated
  }

  enum BatchStatus {
    open
    committed
    failed
  }

  enum LegacyStatus {
    pending
    verified
    unverifiable
  }

  enum LegacyEntityType {
    response
    opinion
    clarification
  }

  type Clause {
    id: ID!
    code: String!
    title: String!
    category: String!
    requirement: String!
    type: ClauseType!
    weight: Int!
    parentId: String
    evidenceRequired: Boolean!
    order: Int!
    responses: [SupplierResponse!]!
  }

  type ReviewerOpinion {
    id: ID!
    responseId: String!
    reviewer: String!
    role: ReviewRole!
    decision: ComplianceStatus!
    score: Int!
    comment: String!
    createdAt: String!
    batchId: String!
    lifecycle: OpinionLifecycle!
    basedOnMissingMaterial: Boolean!
    revision: Int!
    invalidatedByClarificationId: String
    invalidatedAt: String
    reconsiderationId: String
  }

  type OpinionDraft {
    id: ID!
    responseId: String!
    reviewer: String!
    role: ReviewRole!
    decision: ComplianceStatus!
    score: Int!
    comment: String!
    createdAt: String!
    batchId: String!
    baseRevision: Int!
    latestRevision: Int!
    conflictOpinionId: String!
  }

  type ReconsiderationItem {
    id: ID!
    responseId: String!
    opinionId: String!
    reviewer: String!
    batchId: String!
    reason: String!
    clarificationId: String!
    createdAt: String!
    status: String!
    resolution: String
    resolvedAt: String
    resolvedBy: String
  }

  type Clarification {
    id: ID!
    responseId: String!
    clauseId: String!
    round: Int!
    requestText: String!
    supplierResponse: String
    requestedAt: String!
    dueAt: String!
    respondedAt: String
    status: ClarificationStatus!
    batchId: String!
    receiptBatchId: String
  }

  type SupplierResponse {
    id: ID!
    clauseId: String!
    supplierId: String!
    supplierName: String!
    status: ComplianceStatus!
    responseText: String!
    claimedScore: Int!
    attachmentName: String!
    proofFingerprint: String!
    submittedBy: String!
    submittedAt: String!
    reviewRound: Int!
    revision: Int!
    batchId: String!
    reviews: [ReviewerOpinion!]!
    clarifications: [Clarification!]!
    drafts: [OpinionDraft!]!
  }

  type ReviewVersion {
    id: ID!
    version: String!
    label: String!
    status: VersionStatus!
    createdAt: String!
    createdBy: String!
    signedBy: [String!]!
    clauseCount: Int!
    responseCount: Int!
    contentHash: String!
    batchId: String
  }

  type AuditLog {
    id: ID!
    at: String!
    actor: String!
    action: String!
    entity: String!
    detail: String!
  }

  type DashboardStats {
    totalClauses: Int!
    mandatoryCount: Int!
    pendingReviews: Int!
    differences: Int!
    overdueClarifications: Int!
    reusedProofs: Int!
    activeVersion: String!
    invalidatedOpinions: Int!
    pendingDrafts: Int!
    openReconsiderations: Int!
    pendingLegacyItems: Int!
    unverifiableLegacyItems: Int!
    activeBatch: String!
  }

  type Supplier {
    id: ID!
    name: String!
  }

  type BatchCheckpoint {
    capturedAt: String!
    responseCount: Int!
  }

  type ReviewBatch {
    id: ID!
    code: String!
    label: String!
    status: BatchStatus!
    createdAt: String!
    createdBy: String!
    committedAt: String
    checkpoint: BatchCheckpoint
    lastError: String
    opinionCount: Int!
    clarificationCount: Int!
    responseCount: Int!
  }

  type LegacyVerification {
    id: ID!
    entityType: LegacyEntityType!
    entityId: String!
    responseId: String
    reason: String!
    status: LegacyStatus!
    createdAt: String!
    verifiedAt: String
    verifiedBy: String
    assignedBatchId: String
  }

  type WorkspaceData {
    clauses: [Clause!]!
    versions: [ReviewVersion!]!
    auditLogs: [AuditLog!]!
    dashboard: DashboardStats!
    suppliers: [Supplier!]!
    batches: [ReviewBatch!]!
    reconsiderationItems: [ReconsiderationItem!]!
    legacyVerifications: [LegacyVerification!]!
  }

  input AssessmentInput {
    responseId: ID!
    decision: ComplianceStatus!
    score: Int!
    comment: String!
    reviewer: String!
    role: ReviewRole!
    baseRevision: Int
    batchId: String
  }

  input ClarificationInput {
    responseId: ID!
    requestText: String!
    dueAt: String!
    actor: String!
    batchId: String
  }

  input ClarificationResponseInput {
    clarificationId: ID!
    responseText: String!
    actor: String!
    batchId: String
  }

  input FinalizeVersionInput {
    label: String!
    actor: String!
    role: ReviewRole!
  }

  input ConfirmAssessmentInput {
    opinionId: ID!
    actor: String!
    role: ReviewRole!
  }

  input DiscardDraftInput {
    draftId: ID!
    actor: String!
    role: ReviewRole!
  }

  input ApplyDraftInput {
    draftId: ID!
    actor: String!
    role: ReviewRole!
    baseRevision: Int
  }

  input ResolveReconsiderationInput {
    reconsiderationId: ID!
    resolution: String!
    actor: String!
    role: ReviewRole!
  }

  input VerifyLegacyItemInput {
    legacyId: ID!
    actor: String!
    role: ReviewRole!
    batchId: String
  }

  input ImportOpinionInput {
    responseId: ID!
    reviewer: String!
    role: ReviewRole!
    decision: ComplianceStatus!
    score: Int!
    comment: String!
    createdAt: String
  }

  input ImportClarificationInput {
    responseId: ID!
    round: Int!
    requestText: String!
    supplierResponse: String
    requestedAt: String!
    dueAt: String!
    respondedAt: String
    status: ClarificationStatus
  }

  input BatchImportInput {
    batchCode: String!
    label: String!
    actor: String!
    opinions: [ImportOpinionInput!]!
    clarifications: [ImportClarificationInput!]!
  }

  """提交意见结果：冲突时 opinion 为空并携带草稿与差异。"""
  type SubmitAssessmentResult {
    opinion: ReviewerOpinion
    draft: OpinionDraft
    conflicted: Boolean!
    currentRevision: Int!
    conflictOpinion: ReviewerOpinion
    batchId: String!
  }

  type BatchImportCounts {
    opinionsAdded: Int!
    clarificationsAdded: Int!
    opinionsSkipped: Int!
    clarificationsSkipped: Int!
    errors: [String!]!
  }

  type BatchImportResult {
    batch: ReviewBatch!
    success: Boolean!
    recoveredFromBatchId: String
    message: String!
    counts: BatchImportCounts!
  }

  type Query {
    workspace: WorkspaceData!
    dashboard: DashboardStats!
  }

  type Mutation {
    submitAssessment(input: AssessmentInput!): SubmitAssessmentResult!
    requestClarification(input: ClarificationInput!): Clarification!
    respondClarification(input: ClarificationResponseInput!): Clarification!
    confirmAssessment(input: ConfirmAssessmentInput!): ReviewerOpinion!
    discardDraft(input: DiscardDraftInput!): Boolean!
    applyDraft(input: ApplyDraftInput!): SubmitAssessmentResult!
    resolveReconsideration(input: ResolveReconsiderationInput!): ReconsiderationItem!
    verifyLegacyItem(input: VerifyLegacyItemInput!): LegacyVerification!
    importReviewBatch(input: BatchImportInput!): BatchImportResult!
    finalizeVersion(input: FinalizeVersionInput!): ReviewVersion!
    resetReviewData: Boolean!
  }
`);
