import { createFeatureSelector, createSelector } from "@ngrx/store";
import type {
  Clause,
  ClauseTreeNode,
  ComplianceStatus,
  OpinionDraft,
  ReconsiderationItem,
  ReviewerOpinion,
  ReviewState,
  SupplierResponse,
} from "../models/review.models";

export const selectReviewState =
  createFeatureSelector<ReviewState>("review");

export const selectClauses = createSelector(
  selectReviewState,
  (state) => state.clauses,
);

export const selectVersions = createSelector(
  selectReviewState,
  (state) => state.versions,
);

export const selectAuditLogs = createSelector(
  selectReviewState,
  (state) => state.auditLogs,
);

export const selectDashboard = createSelector(
  selectReviewState,
  (state) => state.dashboard,
);

export const selectSuppliers = createSelector(
  selectReviewState,
  (state) => state.suppliers,
);

export const selectFilters = createSelector(
  selectReviewState,
  (state) => state.filters,
);

export const selectRole = createSelector(
  selectReviewState,
  (state) => state.role,
);

export const selectSelectedSupplierIds = createSelector(
  selectReviewState,
  (state) => state.selectedSupplierIds,
);

export const selectLoading = createSelector(
  selectReviewState,
  (state) => state.loading,
);

export const selectSaving = createSelector(
  selectReviewState,
  (state) => state.saving,
);

export const selectError = createSelector(
  selectReviewState,
  (state) => state.error,
);

export const selectToast = createSelector(
  selectReviewState,
  (state) => state.toast,
);

export const selectToastSeverity = createSelector(
  selectReviewState,
  (state) => state.toastSeverity,
);

export const selectBatches = createSelector(
  selectReviewState,
  (state) => state.batches,
);

export const selectReconsiderations = createSelector(
  selectReviewState,
  (state) => state.reconsiderations,
);

export const selectLegacyVerifications = createSelector(
  selectReviewState,
  (state) => state.legacyVerifications,
);

/** 仍在有效期的意见（不含已失效待重算）。 */
export const activeOpinions = (
  response: SupplierResponse,
): ReviewerOpinion[] =>
  response.reviews.filter((review) => review.lifecycle !== "invalidated");

export const invalidatedOpinions = (
  response: SupplierResponse,
): ReviewerOpinion[] =>
  response.reviews.filter(
    (review) => review.lifecycle === "invalidated",
  );

export const hasReviewDifference = (response: SupplierResponse): boolean => {
  const decisions = new Set(
    activeOpinions(response)
      .filter((review) => review.decision !== "clarification")
      .map((review) => review.decision),
  );
  return decisions.size > 1;
};

export const findResponse = (
  clause: Clause,
  supplierId: string,
): SupplierResponse | undefined =>
  clause.responses.find((response) => response.supplierId === supplierId);

const filteredClauses = createSelector(
  selectClauses,
  selectFilters,
  (clauses, filters) => {
    const keyword = filters.keyword.trim().toLowerCase();
    return clauses.filter((clause) => {
      const matchesKeyword =
        !keyword ||
        [
          clause.code,
          clause.title,
          clause.category,
          clause.requirement,
          ...clause.responses.map((response) => response.supplierName),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      const matchesCategory =
        !filters.category || clause.category === filters.category;
      const matchesType =
        filters.type === "all" || clause.type === filters.type;
      const matchesDifference =
        !filters.differencesOnly ||
        clause.responses.some(hasReviewDifference);
      return (
        matchesKeyword &&
        matchesCategory &&
        matchesType &&
        matchesDifference
      );
    });
  },
);

export const selectFilteredClauses = filteredClauses;

export const selectClauseTree = createSelector(
  selectClauses,
  filteredClauses,
  (allClauses, matchingClauses): ClauseTreeNode[] => {
    if (matchingClauses.length === 0) {
      return [];
    }
    const includedIds = new Set<string>();
    const byId = new Map(allClauses.map((clause) => [clause.id, clause]));
    matchingClauses.forEach((clause) => {
      includedIds.add(clause.id);
      let parentId = clause.parentId;
      while (parentId && !includedIds.has(parentId)) {
        includedIds.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
    });
    const selected = allClauses
      .filter((clause) => includedIds.has(clause.id))
      .sort((a, b) => a.order - b.order);
    const nodeMap = new Map<string, ClauseTreeNode>();
    selected.forEach((clause) => {
      nodeMap.set(clause.id, { ...clause, children: [] });
    });
    const roots: ClauseTreeNode[] = [];
    selected.forEach((clause) => {
      const node = nodeMap.get(clause.id);
      if (!node) {
        return;
      }
      if (clause.parentId && nodeMap.has(clause.parentId)) {
        nodeMap.get(clause.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  },
);

export const selectDifferences = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses
        .filter(hasReviewDifference)
        .map((response) => ({ clause, response })),
    ),
);

export const selectPendingClarifications = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses.flatMap((response) =>
        response.clarifications
          .filter(
            (clarification) =>
              clarification.status === "open" ||
              clarification.status === "overdue",
          )
          .map((clarification) => ({
            clause,
            response,
            clarification,
          })),
      ),
    ),
);

export const selectReusedProofs = createSelector(
  selectClauses,
  (clauses) => {
    const counts = new Map<
      string,
      Array<{ clause: Clause; response: SupplierResponse }>
    >();
    clauses.forEach((clause) => {
      clause.responses.forEach((response) => {
        const current = counts.get(response.proofFingerprint) ?? [];
        current.push({ clause, response });
        counts.set(response.proofFingerprint, current);
      });
    });
    return Array.from(counts.entries())
      .filter(([, entries]) => entries.length > 1)
      .map(([fingerprint, entries]) => ({ fingerprint, entries }));
  },
);

/** 回执更新后失效、尚未重算的意见所在响应。 */
export const selectInvalidatedResponses = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses
        .filter((response) => invalidatedOpinions(response).length > 0)
        .map((response) => ({
          clause,
          response,
          invalidated: invalidatedOpinions(response),
        })),
    ),
);

/** 并发提交后保留的全部草稿（带条款上下文与差异）。 */
export const selectPendingDrafts = createSelector(
  selectClauses,
  (clauses): Array<{
    clause: Clause;
    response: SupplierResponse;
    draft: OpinionDraft;
    conflictOpinion?: ReviewerOpinion;
  }> =>
    clauses.flatMap((clause) =>
      clause.responses.flatMap((response) =>
        response.drafts.map((draft) => ({
          clause,
          response,
          draft,
          conflictOpinion: response.reviews.find(
            (review) => review.id === draft.conflictOpinionId,
          ),
        })),
      ),
    ),
);

export interface ReconsiderationContext extends ReconsiderationItem {
  clause?: Clause;
  response?: SupplierResponse;
}

export const selectReconsiderationContexts = createSelector(
  selectClauses,
  selectReconsiderations,
  (clauses, items): ReconsiderationContext[] =>
    items.map((item) => {
      const response = clauses
        .flatMap((clause) => clause.responses)
        .find((entry) => entry.id === item.responseId);
      const clause = clauses.find(
        (entry) => entry.id === response?.clauseId,
      );
      return { ...item, response, clause };
    }),
);

export const selectPendingLegacyItems = createSelector(
  selectLegacyVerifications,
  (items) => items.filter((item) => item.status === "pending"),
);

/** 定稿拦截口径：待核与补不齐均计入。 */
export const selectBlockingLegacyItems = createSelector(
  selectLegacyVerifications,
  (items) =>
    items.filter(
      (item) => item.status === "pending" || item.status === "unverifiable",
    ),
);

export const responseDecisionSummary = (
  response: SupplierResponse,
): ComplianceStatus[] =>
  Array.from(new Set(activeOpinions(response).map((review) => review.decision)));
