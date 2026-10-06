import { Injectable, inject } from "@angular/core";
import { Apollo, gql } from "apollo-angular";
import { Observable, map } from "rxjs";
import type {
  AssessmentInput,
  BackfillBatchInput,
  BackfillBatchResult,
  BatchImportResult,
  Clarification,
  ClarificationInput,
  ClarificationResponseInput,
  ConfirmOpinionInput,
  FinalizeVersionInput,
  ImportBatchInput,
  ReconsiderationItem,
  RecoverBatchInput,
  ResolveReconsiderationInput,
  ReviewBatch,
  ReviewVersion,
  ReviewerOpinion,
  WorkspaceQueryResult,
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
          reviews {
            id
            responseId
            reviewer
            role
            decision
            score
            comment
            createdAt
            status
            baseRevision
            batchNo
            externalId
            diffNote
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
            batchNo
            externalId
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
        batchNo
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
      }
      suppliers {
        id
        name
      }
      batches {
        id
        batchNo
        label
        source
        status
        expectedCount
        appliedCount
        skippedCount
        error
        createdAt
        createdBy
        recoveredFromId
      }
      reconsiderations {
        id
        responseId
        opinionId
        reviewer
        decision
        score
        reason
        status
        createdAt
        resolution
        resolvedBy
        resolvedAt
      }
      pendingBatchItems {
        id
        kind
        refId
        label
      }
    }
  }
`;

const SUBMIT_ASSESSMENT = gql`
  mutation SubmitAssessment($input: AssessmentInput!) {
    submitAssessment(input: $input) {
      id
      responseId
      reviewer
      role
      decision
      score
      comment
      createdAt
      status
      baseRevision
      batchNo
      diffNote
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
      batchNo
    }
  }
`;

const RESPOND_CLARIFICATION = gql`
  mutation RespondClarification($input: ClarificationResponseInput!) {
    respondClarification(input: $input) {
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
      batchNo
    }
  }
`;

const CONFIRM_OPINION = gql`
  mutation ConfirmOpinion($input: ConfirmOpinionInput!) {
    confirmOpinion(input: $input) {
      id
      responseId
      reviewer
      status
      batchNo
    }
  }
`;

const RESOLVE_RECONSIDERATION = gql`
  mutation ResolveReconsideration($input: ResolveReconsiderationInput!) {
    resolveReconsideration(input: $input) {
      id
      status
      resolution
      resolvedBy
      resolvedAt
    }
  }
`;

const IMPORT_BATCH = gql`
  mutation ImportBatch($input: ImportBatchInput!) {
    importBatch(input: $input) {
      batch {
        id
        batchNo
        label
        source
        status
        expectedCount
        appliedCount
        skippedCount
        error
        createdAt
        createdBy
      }
      appliedCount
      skippedCount
    }
  }
`;

const RECOVER_BATCH = gql`
  mutation RecoverBatch($input: RecoverBatchInput!) {
    recoverBatch(input: $input) {
      id
      batchNo
      status
      recoveredFromId
    }
  }
`;

const BACKFILL_BATCH_NUMBERS = gql`
  mutation BackfillBatchNumbers($input: BackfillBatchInput!) {
    backfillBatchNumbers(input: $input) {
      assigned
      remaining
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
      batchNo
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

  submitAssessment(input: AssessmentInput): Observable<ReviewerOpinion> {
    return this.apollo
      .mutate<{ submitAssessment: ReviewerOpinion }>({
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

  confirmOpinion(input: ConfirmOpinionInput): Observable<ReviewerOpinion> {
    return this.apollo
      .mutate<{ confirmOpinion: ReviewerOpinion }>({
        mutation: CONFIRM_OPINION,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回确认结果。");
          }
          return result.data.confirmOpinion;
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
            throw new Error("GraphQL 未返回复议办理结果。");
          }
          return result.data.resolveReconsideration;
        }),
      );
  }

  importBatch(input: ImportBatchInput): Observable<BatchImportResult> {
    return this.apollo
      .mutate<{ importBatch: BatchImportResult }>({
        mutation: IMPORT_BATCH,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回导入结果。");
          }
          return result.data.importBatch;
        }),
      );
  }

  recoverBatch(input: RecoverBatchInput): Observable<ReviewBatch> {
    return this.apollo
      .mutate<{ recoverBatch: ReviewBatch }>({
        mutation: RECOVER_BATCH,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回恢复结果。");
          }
          return result.data.recoverBatch;
        }),
      );
  }

  backfillBatchNumbers(
    input: BackfillBatchInput,
  ): Observable<BackfillBatchResult> {
    return this.apollo
      .mutate<{ backfillBatchNumbers: BackfillBatchResult }>({
        mutation: BACKFILL_BATCH_NUMBERS,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回补登结果。");
          }
          return result.data.backfillBatchNumbers;
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
