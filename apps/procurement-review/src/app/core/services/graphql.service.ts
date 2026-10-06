import { Injectable, inject } from "@angular/core";
import { Apollo, gql } from "apollo-angular";
import { Observable, map } from "rxjs";
import type {
  ApplyDraftInput,
  AssessmentInput,
  BatchImportInput,
  BatchImportResult,
  Clarification,
  ClarificationInput,
  ClarificationResponseInput,
  ConfirmAssessmentInput,
  DiscardDraftInput,
  FinalizeVersionInput,
  ResolveReconsiderationInput,
  ReviewVersion,
  ReviewerOpinion,
  SubmitAssessmentResult,
  VerifyLegacyItemInput,
  WorkspaceQueryResult,
  LegacyVerification,
  ReconsiderationItem,
} from "../models/review.models";

const WORKSPACE_QUERY = gql`
  query ProcurementReviewWorkspace {
    workspace {
      clauses {
        id
        code
        title
        category
        requirement
        type
        weight
        parentId
        evidenceRequired
        order
        responses {
          id
          clauseId
          supplierId
          supplierName
          status
          responseText
          claimedScore
          attachmentName
          proofFingerprint
          submittedBy
          submittedAt
          reviewRound
          revision
          batchId
          reviews {
            id
            responseId
            reviewer
            role
            decision
            score
            comment
            createdAt
            batchId
            lifecycle
            basedOnMissingMaterial
            revision
            invalidatedByClarificationId
            invalidatedAt
            reconsiderationId
          }
          clarifications {
            id
            responseId
            clauseId
            round
            requestText
            supplierResponse
            requestedAt
            dueAt
            respondedAt
            status
            batchId
            receiptBatchId
          }
          drafts {
            id
            responseId
            reviewer
            role
            decision
            score
            comment
            createdAt
            batchId
            baseRevision
            latestRevision
            conflictOpinionId
          }
        }
      }
      versions {
        id
        version
        label
        status
        createdAt
        createdBy
        signedBy
        clauseCount
        responseCount
        contentHash
        batchId
      }
      auditLogs {
        id
        at
        actor
        action
        entity
        detail
      }
      dashboard {
        totalClauses
        mandatoryCount
        pendingReviews
        differences
        overdueClarifications
        reusedProofs
        activeVersion
        invalidatedOpinions
        pendingDrafts
        openReconsiderations
        pendingLegacyItems
        unverifiableLegacyItems
        activeBatch
      }
      suppliers {
        id
        name
      }
      batches {
        id
        code
        label
        status
        createdAt
        createdBy
        committedAt
        checkpoint {
          capturedAt
          responseCount
        }
        lastError
        opinionCount
        clarificationCount
        responseCount
      }
      reconsiderationItems {
        id
        responseId
        opinionId
        reviewer
        batchId
        reason
        clarificationId
        createdAt
        status
        resolution
        resolvedAt
        resolvedBy
      }
      legacyVerifications {
        id
        entityType
        entityId
        responseId
        reason
        status
        createdAt
        verifiedAt
        verifiedBy
        assignedBatchId
      }
    }
  }
`;

const SUBMIT_ASSESSMENT = gql`
  mutation SubmitAssessment($input: AssessmentInput!) {
    submitAssessment(input: $input) {
      conflicted
      currentRevision
      batchId
      opinion {
        id
        responseId
        reviewer
        role
        decision
        score
        comment
        createdAt
        batchId
        lifecycle
        basedOnMissingMaterial
        revision
      }
      draft {
        id
        responseId
        reviewer
        role
        decision
        score
        comment
        createdAt
        batchId
        baseRevision
        latestRevision
        conflictOpinionId
      }
      conflictOpinion {
        id
        reviewer
        decision
        score
        comment
      }
    }
  }
`;

const REQUEST_CLARIFICATION = gql`
  mutation RequestClarification($input: ClarificationInput!) {
    requestClarification(input: $input) {
      id
      responseId
      clauseId
      round
      requestText
      supplierResponse
      requestedAt
      dueAt
      respondedAt
      status
      batchId
      receiptBatchId
    }
  }
`;

const RESPOND_CLARIFICATION = gql`
  mutation RespondClarification($input: ClarificationResponseInput!) {
    respondClarification(input: $input) {
      id
      status
      receiptBatchId
    }
  }
`;

const CONFIRM_ASSESSMENT = gql`
  mutation ConfirmAssessment($input: ConfirmAssessmentInput!) {
    confirmAssessment(input: $input) {
      id
      lifecycle
    }
  }
`;

const DISCARD_DRAFT = gql`
  mutation DiscardDraft($input: DiscardDraftInput!) {
    discardDraft(input: $input)
  }
`;

const APPLY_DRAFT = gql`
  mutation ApplyDraft($input: ApplyDraftInput!) {
    applyDraft(input: $input) {
      conflicted
      currentRevision
      batchId
      opinion {
        id
        reviewer
        decision
        score
        lifecycle
        revision
      }
      draft {
        id
        latestRevision
      }
    }
  }
`;

const RESOLVE_RECONSIDERATION = gql`
  mutation ResolveReconsideration($input: ResolveReconsiderationInput!) {
    resolveReconsideration(input: $input) {
      id
      status
      resolution
    }
  }
`;

const VERIFY_LEGACY_ITEM = gql`
  mutation VerifyLegacyItem($input: VerifyLegacyItemInput!) {
    verifyLegacyItem(input: $input) {
      id
      status
      assignedBatchId
    }
  }
`;

const IMPORT_REVIEW_BATCH = gql`
  mutation ImportReviewBatch($input: BatchImportInput!) {
    importReviewBatch(input: $input) {
      success
      recoveredFromBatchId
      message
      batch {
        id
        code
        label
        status
        lastError
      }
      counts {
        opinionsAdded
        clarificationsAdded
        opinionsSkipped
        clarificationsSkipped
        errors
      }
    }
  }
`;

const FINALIZE_VERSION = gql`
  mutation FinalizeVersion($input: FinalizeVersionInput!) {
    finalizeVersion(input: $input) {
      id
      version
      label
      status
      createdAt
      createdBy
      signedBy
      clauseCount
      responseCount
      contentHash
      batchId
    }
  }
`;

const RESET_REVIEW_DATA = gql`
  mutation ResetReviewData {
    resetReviewData
  }
`;

@Injectable({ providedIn: "root" })
export class ReviewGraphqlService {
  private readonly apollo = inject(Apollo);

  loadWorkspace(): Observable<WorkspaceQueryResult> {
    return this.apollo
      .query<WorkspaceQueryResult>({
        query: WORKSPACE_QUERY,
        fetchPolicy: "network-only",
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回评审工作区。");
          }
          return result.data as WorkspaceQueryResult;
        }),
      );
  }

  submitAssessment(input: AssessmentInput): Observable<SubmitAssessmentResult> {
    return this.apollo
      .mutate<{ submitAssessment: SubmitAssessmentResult }>({
        mutation: SUBMIT_ASSESSMENT,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回评审意见。");
          }
          return result.data.submitAssessment;
        }),
      );
  }

  requestClarification(input: ClarificationInput): Observable<Clarification> {
    return this.apollo
      .mutate<{ requestClarification: Clarification }>({
        mutation: REQUEST_CLARIFICATION,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回澄清记录。");
          }
          return result.data.requestClarification;
        }),
      );
  }

  respondClarification(
    input: ClarificationResponseInput,
  ): Observable<Clarification> {
    return this.apollo
      .mutate<{ respondClarification: Clarification }>({
        mutation: RESPOND_CLARIFICATION,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回澄清回复。");
          }
          return result.data.respondClarification;
        }),
      );
  }

  confirmAssessment(
    input: ConfirmAssessmentInput,
  ): Observable<ReviewerOpinion> {
    return this.apollo
      .mutate<{ confirmAssessment: ReviewerOpinion }>({
        mutation: CONFIRM_ASSESSMENT,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回确认结果。");
          }
          return result.data.confirmAssessment;
        }),
      );
  }

  discardDraft(input: DiscardDraftInput): Observable<boolean> {
    return this.apollo
      .mutate<{ discardDraft: boolean }>({
        mutation: DISCARD_DRAFT,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回草稿处理结果。");
          }
          return result.data.discardDraft;
        }),
      );
  }

  applyDraft(input: ApplyDraftInput): Observable<SubmitAssessmentResult> {
    return this.apollo
      .mutate<{ applyDraft: SubmitAssessmentResult }>({
        mutation: APPLY_DRAFT,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回草稿应用结果。");
          }
          return result.data.applyDraft;
        }),
      );
  }

  resolveReconsideration(
    input: ResolveReconsiderationInput,
  ): Observable<ReconsiderationItem> {
    return this.apollo
      .mutate<{ resolveReconsideration: ReconsiderationItem }>({
        mutation: RESOLVE_RECONSIDERATION,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回复议处理结果。");
          }
          return result.data.resolveReconsideration;
        }),
      );
  }

  verifyLegacyItem(
    input: VerifyLegacyItemInput,
  ): Observable<LegacyVerification> {
    return this.apollo
      .mutate<{ verifyLegacyItem: LegacyVerification }>({
        mutation: VERIFY_LEGACY_ITEM,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回待核处理结果。");
          }
          return result.data.verifyLegacyItem;
        }),
      );
  }

  importReviewBatch(input: BatchImportInput): Observable<BatchImportResult> {
    return this.apollo
      .mutate<{ importReviewBatch: BatchImportResult }>({
        mutation: IMPORT_REVIEW_BATCH,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回批次导入结果。");
          }
          return result.data.importReviewBatch;
        }),
      );
  }

  finalizeVersion(input: FinalizeVersionInput): Observable<ReviewVersion> {
    return this.apollo
      .mutate<{ finalizeVersion: ReviewVersion }>({
        mutation: FINALIZE_VERSION,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回版本信息。");
          }
          return result.data.finalizeVersion;
        }),
      );
  }

  resetReviewData(): Observable<boolean> {
    return this.apollo
      .mutate<{ resetReviewData: boolean }>({
        mutation: RESET_REVIEW_DATA,
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回重置结果。");
          }
          return result.data.resetReviewData;
        }),
      );
  }
}
