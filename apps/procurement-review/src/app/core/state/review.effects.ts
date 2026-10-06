import { Injectable, inject } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { catchError, map, of, switchMap } from "rxjs";
import { ReviewGraphqlService } from "../services/graphql.service";
import { ReviewActions } from "./review.actions";

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "GraphQL 请求失败，请检查本地 mock server。";
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
          map(({ workspace }) =>
            ReviewActions.loadReviewDataSuccess({ workspace }),
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

  submitAssessment$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.submitAssessment),
      switchMap(({ input }) =>
        this.graphql.submitAssessment(input).pipe(
          switchMap((opinion) =>
            this.graphql.loadWorkspace().pipe(
              map(({ workspace }) =>
                ReviewActions.loadReviewDataSuccess({
                  workspace,
                  toast:
                    opinion.status === "conflict"
                      ? "当前修订已被先到意见占据，本次提交已保留为冲突草稿并列出差异。"
                      : "评审意见已提交并占据当前修订，其他评审员意见保持不变。",
                }),
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
      switchMap(({ input }) =>
        this.graphql.requestClarification(input).pipe(
          switchMap(() => this.graphql.loadWorkspace()),
          map(({ workspace }) =>
            ReviewActions.loadReviewDataSuccess({
              workspace,
              toast: "澄清要求已发出，并写入审计日志。",
            }),
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

  respondClarification$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.respondClarification),
      switchMap(({ input }) =>
        this.graphql.respondClarification(input).pipe(
          switchMap(() => this.graphql.loadWorkspace()),
          map(({ workspace }) =>
            ReviewActions.loadReviewDataSuccess({
              workspace,
              toast:
                "回执已登记批次，同组未确认意见失效待重算，已确认意见列入复议。",
            }),
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

  confirmOpinion$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.confirmOpinion),
      switchMap(({ input }) =>
        this.graphql.confirmOpinion(input).pipe(
          switchMap(() => this.graphql.loadWorkspace()),
          map(({ workspace }) =>
            ReviewActions.loadReviewDataSuccess({
              workspace,
              toast: "裁定已确认，回执更新时将保留原裁定并列入复议。",
            }),
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
      switchMap(({ input }) =>
        this.graphql.resolveReconsideration(input).pipe(
          switchMap(() => this.graphql.loadWorkspace()),
          map(({ workspace }) =>
            ReviewActions.loadReviewDataSuccess({
              workspace,
              toast: "复议项已办结，原裁定与复议结论均已留痕。",
            }),
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

  importBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.importBatch),
      switchMap(({ input }) =>
        this.graphql.importBatch(input).pipe(
          switchMap((result) =>
            this.graphql.loadWorkspace().pipe(
              map(({ workspace }) =>
                ReviewActions.loadReviewDataSuccess({
                  workspace,
                  toast: `批次导入完成：应用 ${result.appliedCount} 项，跳过重复 ${result.skippedCount} 项。`,
                }),
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

  recoverBatch$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.recoverBatch),
      switchMap(({ input }) =>
        this.graphql.recoverBatch(input).pipe(
          switchMap(() => this.graphql.loadWorkspace()),
          map(({ workspace }) =>
            ReviewActions.loadReviewDataSuccess({
              workspace,
              toast: "失败批次已回退到最近完整批次的状态。",
            }),
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

  backfillBatchNumbers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.backfillBatchNumbers),
      switchMap(({ input }) =>
        this.graphql.backfillBatchNumbers(input).pipe(
          switchMap((result) =>
            this.graphql.loadWorkspace().pipe(
              map(({ workspace }) =>
                ReviewActions.loadReviewDataSuccess({
                  workspace,
                  toast:
                    result.remaining > 0
                      ? `已补登 ${result.assigned} 项，仍有 ${result.remaining} 项待核，定稿继续拦截。`
                      : `已补登 ${result.assigned} 项，旧数据批次号全部补齐。`,
                }),
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
      switchMap(({ input }) =>
        this.graphql.finalizeVersion(input).pipe(
          switchMap(() => this.graphql.loadWorkspace()),
          map(({ workspace }) =>
            ReviewActions.loadReviewDataSuccess({
              workspace,
              toast: "评审版本已汇总签字并锁定，定稿批次已登记。",
            }),
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

  resetReviewData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.resetReviewData),
      switchMap(() =>
        this.graphql.resetReviewData().pipe(
          switchMap(() => this.graphql.loadWorkspace()),
          map(({ workspace }) =>
            ReviewActions.loadReviewDataSuccess({
              workspace,
              toast: "评审演示数据已恢复。",
            }),
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
}
