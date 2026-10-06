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

  enum OpinionStatus {
    submitted
    confirmed
    invalidated
    conflict
  }

  enum BatchStatus {
    complete
    failed
    recovered
  }

  enum BatchSource {
    receipt
    opinion
    version
    import
    legacy
  }

  enum BatchItemKind {
    receipt
    opinion
    version
  }

  enum ReconsiderationStatus {
    open
    resolved
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
    status: OpinionStatus!
    baseRevision: Int!
    batchNo: String
    externalId: String
    diffNote: String
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
    batchNo: String
    externalId: String
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
    reviews: [ReviewerOpinion!]!
    clarifications: [Clarification!]!
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
    batchNo: String
  }

  type ReviewBatch {
    id: ID!
    batchNo: String!
    label: String!
    source: BatchSource!
    status: BatchStatus!
    expectedCount: Int!
    appliedCount: Int!
    skippedCount: Int!
    error: String
    createdAt: String!
    createdBy: String!
    recoveredFromId: String
  }

  type ReconsiderationItem {
    id: ID!
    responseId: String!
    opinionId: String!
    reviewer: String!
    decision: ComplianceStatus!
    score: Int!
    reason: String!
    status: ReconsiderationStatus!
    createdAt: String!
    resolution: String
    resolvedBy: String
    resolvedAt: String
  }

  type PendingBatchItem {
    id: ID!
    kind: BatchItemKind!
    refId: String!
    label: String!
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
  }

  type Supplier {
    id: ID!
    name: String!
  }

  type WorkspaceData {
    clauses: [Clause!]!
    versions: [ReviewVersion!]!
    auditLogs: [AuditLog!]!
    dashboard: DashboardStats!
    suppliers: [Supplier!]!
    batches: [ReviewBatch!]!
    reconsiderations: [ReconsiderationItem!]!
    pendingBatchItems: [PendingBatchItem!]!
  }

  type BatchImportResult {
    batch: ReviewBatch!
    appliedCount: Int!
    skippedCount: Int!
  }

  type BackfillBatchResult {
    assigned: Int!
    remaining: Int!
  }

  input AssessmentInput {
    responseId: ID!
    decision: ComplianceStatus!
    score: Int!
    comment: String!
    reviewer: String!
    role: ReviewRole!
    baseRevision: Int!
  }

  input ClarificationInput {
    responseId: ID!
    requestText: String!
    dueAt: String!
    actor: String!
  }

  input ClarificationResponseInput {
    clarificationId: ID!
    responseText: String!
    actor: String!
  }

  input FinalizeVersionInput {
    label: String!
    actor: String!
    role: ReviewRole!
  }

  input ConfirmOpinionInput {
    opinionId: ID!
    actor: String!
    role: ReviewRole!
  }

  input ResolveReconsiderationInput {
    reconsiderationId: ID!
    resolution: String!
    actor: String!
    role: ReviewRole!
  }

  input BatchImportItemInput {
    kind: BatchItemKind!
    externalId: ID!
    responseId: ID
    reviewer: String
    role: ReviewRole
    decision: ComplianceStatus
    score: Int
    comment: String
    clarificationId: ID
    responseText: String
  }

  input ImportBatchInput {
    label: String!
    actor: String!
    role: ReviewRole!
    items: [BatchImportItemInput!]!
  }

  input RecoverBatchInput {
    batchId: ID!
    actor: String!
  }

  input BackfillBatchInput {
    actor: String!
    role: ReviewRole!
  }

  type Query {
    workspace: WorkspaceData!
    dashboard: DashboardStats!
  }

  type Mutation {
    submitAssessment(input: AssessmentInput!): ReviewerOpinion!
    requestClarification(input: ClarificationInput!): Clarification!
    respondClarification(input: ClarificationResponseInput!): Clarification!
    confirmOpinion(input: ConfirmOpinionInput!): ReviewerOpinion!
    resolveReconsideration(input: ResolveReconsiderationInput!): ReconsiderationItem!
    importBatch(input: ImportBatchInput!): BatchImportResult!
    recoverBatch(input: RecoverBatchInput!): ReviewBatch!
    backfillBatchNumbers(input: BackfillBatchInput!): BackfillBatchResult!
    finalizeVersion(input: FinalizeVersionInput!): ReviewVersion!
    resetReviewData: Boolean!
  }
`);
