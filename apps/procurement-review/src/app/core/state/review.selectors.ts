import { createFeatureSelector, createSelector } from "@ngrx/store";
import type {
  Clause,
  ClauseTreeNode,
  ComplianceStatus,
  ReviewState,
  ReviewerOpinion,
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

export const selectBatches = createSelector(
  selectReviewState,
  (state) => state.batches,
);

export const selectReconsiderations = createSelector(
  selectReviewState,
  (state) => state.reconsiderations,
);

export const selectPendingBatchItems = createSelector(
  selectReviewState,
  (state) => state.pendingBatchItems,
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

export const isActiveOpinion = (opinion: ReviewerOpinion): boolean =>
  opinion.status === "submitted" || opinion.status === "confirmed";

export const hasReviewDifference = (response: SupplierResponse): boolean => {
  const decisions = new Set(
    response.reviews
      .filter(
        (review) => isActiveOpinion(review) && review.decision !== "clarification",
      )
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

export const responseDecisionSummary = (
  response: SupplierResponse,
): ComplianceStatus[] =>
  Array.from(new Set(response.reviews.map((review) => review.decision)));

/** 回执更新后失效且尚未按更新后修订重算的响应。 */
export const selectStaleRecalcResponses = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses
        .filter((response) => {
          const invalidated = response.reviews.filter(
            (opinion) => opinion.status === "invalidated",
          );
          if (invalidated.length === 0) {
            return false;
          }
          const maxInvalidatedBase = Math.max(
            ...invalidated.map((opinion) => opinion.baseRevision),
          );
          return !response.reviews.some(
            (opinion) =>
              isActiveOpinion(opinion) &&
              opinion.baseRevision > maxInvalidatedBase,
          );
        })
        .map((response) => ({ clause, response })),
    ),
);

/** 后到者保留的冲突草稿。 */
export const selectConflictDrafts = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses.flatMap((response) =>
        response.reviews
          .filter((opinion) => opinion.status === "conflict")
          .map((opinion) => ({ clause, response, opinion })),
      ),
    ),
);

export const selectOpenReconsiderations = createSelector(
  selectReconsiderations,
  (items) => items.filter((item) => item.status === "open"),
);

/** 定稿拦截原因汇总，与服务器 finalizeVersion 的校验保持一致。 */
export const selectFinalizeBlockers = createSelector(
  selectPendingClarifications,
  selectPendingBatchItems,
  selectStaleRecalcResponses,
  (pendingClarifications, pendingBatchItems, staleRecalc) => {
    const blockers: string[] = [];
    if (pendingClarifications.length > 0) {
      blockers.push(`${pendingClarifications.length} 项未完成澄清`);
    }
    if (pendingBatchItems.length > 0) {
      blockers.push(`${pendingBatchItems.length} 项旧数据缺批次号（待核）`);
    }
    if (staleRecalc.length > 0) {
      blockers.push(`${staleRecalc.length} 项响应意见失效待重算`);
    }
    return blockers;
  },
);
