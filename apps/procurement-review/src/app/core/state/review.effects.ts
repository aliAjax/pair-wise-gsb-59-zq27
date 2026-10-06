import { Injectable, inject } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { catchError, map, of, switchMap } from "rxjs";
import type { WorkspaceQueryResult } from "../models/review.models";
import { ReviewGraphqlService } from "../services/graphql.service";
import { ReviewActions } from "./review.actions";

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "GraphQL 请求失败，请检查本地 mock server。";
};

const toSuccess = (
  result: WorkspaceQueryResult,
  toast?: string,
  toastSeverity: "success" | "warn" | "error" = "success",
) => {
  const { workspace } = result;
  return ReviewActions.loadReviewDataSuccess({
    workspace: {
      clauses: workspace.clauses,
      versions: workspace.versions,
      auditLogs: workspace.auditLogs,
      dashboard: workspace.dashboard,
      suppliers: workspace.suppliers,
      batches: workspace.batches,
      reconsiderations: workspace.reconsiderationItems,
      legacyVerifications: workspace.legacyVerifications,
    },
    toast,
    toastSeverity,
  });
};

@Injectable()
export class ReviewEffects {
  private readonly actions$ = inject(Actions);
  private readonly graphql = inject(ReviewGraphqlService);

  loadReviewData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.loadReviewData),
      switchMap(() =>
        this.graphql.loadWorkspace().pipe(
          map((result) => toSuccess(result)),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  private reloadWith(
    toast: string,
    severity: "success" | "warn" = "success",
  ) {
    return switchMap(() =>
      this.graphql.loadWorkspace().pipe(
        map((result) => toSuccess(result, toast, severity)),
        catchError((error: unknown) =>
          of(
            ReviewActions.loadReviewDataFailure({
              error: errorMessage(error),
            }),
          ),
        ),
      ),
    );
  }

  submitAssessment$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.submitAssessment),
      switchMap(({ input }) =>
        this.graphql.submitAssessment(input).pipe(
          switchMap((submitResult) =>
            this.graphql.loadWorkspace().pipe(
              map((workspaceResult) =>
                toSuccess(
                  workspaceResult,
                  submitResult.conflicted
                    ? `修订已被先到者 ${submitResult.conflictOpinion?.reviewer ?? "其他评审员"} 占用，您的意见已保留为草稿和差异。`
                    : "评审意见已提交，其他评审员意见保持不变。",
                  submitResult.conflicted ? "warn" : "success",
                ),
              ),
            ),
          ),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  requestClarification$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.requestClarification),
      this.reloadWith("澄清要求已发出，并写入批次与审计日志。"),
    ),
  );

  respondClarification$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.respondClarification),
      this.reloadWith(
        "澄清回执已登记：同组未确认意见失效重算，已确认意见列入复议。",
      ),
    ),
  );

  confirmAssessment$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.confirmAssessment),
      this.reloadWith("评审意见已确认，后续回执更新将保留原裁定并转复议。"),
    ),
  );

  discardDraft$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.discardDraft),
      this.reloadWith("并发草稿已丢弃。"),
    ),
  );

  applyDraft$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.applyDraft),
      switchMap(({ input }) =>
        this.graphql.applyDraft(input).pipe(
          switchMap((applyResult) =>
            this.graphql.loadWorkspace().pipe(
              map((workspaceResult) =>
                toSuccess(
                  workspaceResult,
                  applyResult.conflicted
                    ? "修订仍被占用，草稿继续保留并更新差异。"
                    : "草稿已基于最新修订提交为独立意见。",
                  applyResult.conflicted ? "warn" : "success",
                ),
              ),
            ),
          ),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  resolveReconsideration$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.resolveReconsideration),
      this.reloadWith("复议项已记录处理结论并关闭。"),
    ),
  );

  verifyLegacyItem$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.verifyLegacyItem),
      this.reloadWith("旧数据已核实并补登批次号。"),
    ),
  );

  importReviewBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.importReviewBatch),
      switchMap(({ input }) =>
        this.graphql.importReviewBatch(input).pipe(
          switchMap((importResult) =>
            this.graphql.loadWorkspace().pipe(
              map((workspaceResult) =>
                toSuccess(
                  workspaceResult,
                  importResult.message,
                  importResult.success ? "success" : "warn",
                ),
              ),
            ),
          ),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  finalizeVersion$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.finalizeVersion),
      this.reloadWith("评审版本已汇总签字、固化批次并锁定。"),
    ),
  );

  resetReviewData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.resetReviewData),
      this.reloadWith("评审演示数据已恢复。"),
    ),
  );
}
