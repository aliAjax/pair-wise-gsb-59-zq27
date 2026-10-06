import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import {
  createAudit,
  createBatchId,
  createClarificationId,
  createOpinionId,
  createReconsiderationId,
  getOrCreateBatch,
  reviewDataStore,
} from "./data";
import { typeDefs } from "./schema";
import type {
  AssessmentInput,
  BackfillBatchInput,
  BackfillBatchResult,
  BatchImportItemInput,
  BatchImportResult,
  Clarification,
  ClarificationInput,
  ClarificationResponseInput,
  Clause,
  ConfirmOpinionInput,
  DashboardStats,
  FinalizeVersionInput,
  ImportBatchInput,
  RecoverBatchInput,
  ResolveReconsiderationInput,
  ReviewBatch,
  ReviewDatabase,
  ReviewerOpinion,
  ReviewRole,
  SupplierResponse,
} from "./types";

const isActiveOpinion = (opinion: ReviewerOpinion): boolean =>
  opinion.status === "submitted" || opinion.status === "confirmed";

const getDashboard = (database: ReviewDatabase): DashboardStats => {
  const opinionsByResponse = database.responses.map((response) => {
    const decisions = new Set(
      response.reviews
        .filter(
          (review) =>
            isActiveOpinion(review) && review.decision !== "clarification",
        )
        .map((review) => review.decision),
    );
    return decisions.size > 1;
  });
  const proofCounts = database.responses.reduce<Record<string, number>>(
    (counts, response) => {
      if (response.proofFingerprint) {
        counts[response.proofFingerprint] =
          (counts[response.proofFingerprint] ?? 0) + 1;
      }
      return counts;
    },
    {},
  );
  const activeVersion =
    database.versions.find((version) => version.status === "draft") ??
    database.versions[0];

  return {
    totalClauses: database.clauses.length,
    mandatoryCount: database.clauses.filter(
      (clause) => clause.type === "mandatory",
    ).length,
    pendingReviews: database.responses.filter(
      (response) => response.reviews.filter(isActiveOpinion).length < 2,
    ).length,
    differences: opinionsByResponse.filter(Boolean).length,
    overdueClarifications: database.responses.reduce(
      (count, response) =>
        count +
        response.clarifications.filter(
          (clarification) => clarification.status === "overdue",
        ).length,
      0,
    ),
    reusedProofs: Object.values(proofCounts).filter((count) => count > 1)
      .length,
    activeVersion: activeVersion
      ? `${activeVersion.version} ${activeVersion.label}`
      : "未建立版本",
  };
};

const requireRole = (role: ReviewRole, allowed: ReviewRole[]): void => {
  if (!allowed.includes(role)) {
    throw new Error("当前角色无权执行此操作。");
  }
};

const findResponse = (
  database: ReviewDatabase,
  responseId: string,
): SupplierResponse => {
  const response = database.responses.find((item) => item.id === responseId);
  if (!response) {
    throw new Error("供应商响应不存在。");
  }
  return response;
};

const findClause = (database: ReviewDatabase, clauseId: string): Clause => {
  const clause = database.clauses.find((item) => item.id === clauseId);
  if (!clause) {
    throw new Error("对应技术条款不存在。");
  }
  return clause;
};

const validateAssessment = (
  clause: Clause,
  input: Pick<AssessmentInput, "decision" | "score" | "comment">,
): void => {
  if (input.comment.trim().length < 6) {
    throw new Error("评审意见至少需要 6 个字符。");
  }
  if (input.score < 0 || input.score > clause.weight) {
    throw new Error(`评分必须在 0 至 ${clause.weight} 之间。`);
  }
  if (
    clause.type === "scoring" &&
    input.decision === "compliant" &&
    input.score === 0
  ) {
    throw new Error("评分项判定为符合时必须填写评分。");
  }
};

/**
 * 回执更新级联：回执登记批次号并抬高响应修订号；
 * 同组未确认意见失效待重算，已确认意见保留原裁定并登记复议项。
 */
const applyReceiptUpdate = (
  database: ReviewDatabase,
  clarification: Clarification,
  responseText: string,
  actor: string,
  batchNo: string,
): void => {
  clarification.supplierResponse = responseText.trim();
  clarification.respondedAt = new Date().toISOString();
  clarification.status = "responded";
  clarification.batchNo = batchNo;

  const response = database.responses.find(
    (item) => item.id === clarification.responseId,
  );
  if (!response) {
    return;
  }
  response.revision += 1;
  response.status = "pending";

  let invalidated = 0;
  response.reviews.forEach((opinion) => {
    if (opinion.status === "confirmed") {
      database.reconsiderations.unshift({
        id: createReconsiderationId(),
        responseId: response.id,
        opinionId: opinion.id,
        reviewer: opinion.reviewer,
        decision: opinion.decision,
        score: opinion.score,
        reason: `回执批次 ${batchNo} 登记后修订号升至 R${response.revision}，原裁定保留，列入复议。`,
        status: "open",
        createdAt: new Date().toISOString(),
      });
      return;
    }
    if (opinion.status === "submitted" || opinion.status === "conflict") {
      opinion.status = "invalidated";
      opinion.diffNote = `回执批次 ${batchNo} 更新后失效，需按 R${response.revision} 重新评审。`;
      invalidated += 1;
    }
  });
  createAudit(
    database,
    actor,
    "登记澄清回执",
    clarification.id,
    `第 ${clarification.round} 轮回执归入批次 ${batchNo}，${invalidated} 条未确认意见失效重算，已确认意见列入复议。`,
  );
};

const opinionBatchNo = (response: SupplierResponse): string =>
  `BATCH-OP-${response.id}-R${response.revision}`;

const resolvers = {
  Query: {
    workspace: () => {
      const database = reviewDataStore.snapshot();
      return {
        ...database,
        dashboard: getDashboard(database),
      };
    },
    dashboard: () => getDashboard(reviewDataStore.snapshot()),
  },
  Clause: {
    responses: (clause: Clause, _args: unknown, context: { database: ReviewDatabase }) =>
      context.database.responses.filter(
        (response) => response.clauseId === clause.id,
      ),
  },
  Mutation: {
    submitAssessment: (
      _parent: unknown,
      { input }: { input: AssessmentInput },
    ) => {
      requireRole(input.role, ["reviewer_a", "reviewer_b", "chair"]);
      return reviewDataStore.mutate((database) => {
        const response = findResponse(database, input.responseId);
        const clause = findClause(database, response.clauseId);
        validateAssessment(clause, input);

        // 后到者：提交基于的修订号已被先到的意见或回执占用，保留草稿和差异。
        if (input.baseRevision !== response.revision) {
          const occupying = [...response.reviews]
            .filter(isActiveOpinion)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
          const diffNote = occupying
            ? `基于已过期的 R${input.baseRevision} 提交；与 ${occupying.reviewer} 占据的 R${response.revision} 差异：判定 ${occupying.decision}→${input.decision}，评分 ${occupying.score}→${input.score}。`
            : `基于已过期的 R${input.baseRevision} 提交，当前 R${response.revision} 无在位意见，草稿保留待复核。`;
          const conflict: ReviewerOpinion = {
            id: createOpinionId(),
            responseId: response.id,
            reviewer: input.reviewer.trim(),
            role: input.role,
            decision: input.decision,
            score: input.score,
            comment: input.comment.trim(),
            createdAt: new Date().toISOString(),
            status: "conflict",
            baseRevision: input.baseRevision,
            diffNote,
          };
          response.reviews.push(conflict);
          createAudit(
            database,
            conflict.reviewer,
            "保留冲突草稿",
            response.id,
            `${clause.code} 提交晚于当前修订 R${response.revision}，草稿与差异已保留。`,
          );
          return conflict;
        }

        // 先到者占修订：接受意见并抬高修订号，后续基于旧修订的提交转入冲突草稿。
        const batchNo = opinionBatchNo(response);
        const opinion: ReviewerOpinion = {
          id: createOpinionId(),
          responseId: response.id,
          reviewer: input.reviewer.trim(),
          role: input.role,
          decision: input.decision,
          score: input.score,
          comment: input.comment.trim(),
          createdAt: new Date().toISOString(),
          status: "submitted",
          baseRevision: response.revision,
          batchNo,
        };
        response.reviews.push(opinion);
        response.revision += 1;
        response.status = input.decision;
        response.reviewRound = Math.max(response.reviewRound, 1);
        const batch = getOrCreateBatch(
          database,
          batchNo,
          "opinion",
          opinion.reviewer,
          `${response.supplierName} ${clause.code} 独立意见批次`,
        );
        batch.expectedCount += 1;
        batch.appliedCount += 1;
        createAudit(
          database,
          opinion.reviewer,
          "提交独立意见",
          response.id,
          `${clause.code} ${clause.title} 判定为 ${input.decision}，评分 ${input.score}，占据修订 R${opinion.baseRevision}，归入批次 ${batchNo}。`,
        );
        return opinion;
      });
    },
    requestClarification: (
      _parent: unknown,
      { input }: { input: ClarificationInput },
    ) =>
      reviewDataStore.mutate((database) => {
        const response = findResponse(database, input.responseId);
        if (input.requestText.trim().length < 6) {
          throw new Error("澄清要求至少需要 6 个字符。");
        }
        const requestedAt = new Date();
        const dueAt = new Date(input.dueAt);
        if (Number.isNaN(dueAt.getTime()) || dueAt <= requestedAt) {
          throw new Error("澄清截止时间必须晚于当前时间。");
        }
        const maximumDueAt = new Date(requestedAt);
        maximumDueAt.setDate(maximumDueAt.getDate() + 7);
        if (dueAt > maximumDueAt) {
          throw new Error("澄清期限不得超过 7 个自然日。");
        }
        const round =
          Math.max(
            0,
            ...response.clarifications.map((item) => item.round),
          ) + 1;
        const clarification: Clarification = {
          id: createClarificationId(),
          responseId: response.id,
          clauseId: response.clauseId,
          round,
          requestText: input.requestText.trim(),
          requestedAt: requestedAt.toISOString(),
          dueAt: dueAt.toISOString(),
          status: "open" as const,
        };
        response.clarifications.push(clarification);
        response.status = "clarification";
        createAudit(
          database,
          input.actor,
          "发起澄清",
          clarification.id,
          `${response.supplierName} ${response.clauseId} 第 ${round} 轮澄清已发起。`,
        );
        return clarification;
      }),
    respondClarification: (
      _parent: unknown,
      { input }: { input: ClarificationResponseInput },
    ) =>
      reviewDataStore.mutate((database) => {
        const clarification = database.responses
          .flatMap((response) => response.clarifications)
          .find((item) => item.id === input.clarificationId);
        if (!clarification) {
          throw new Error("澄清记录不存在。");
        }
        if (input.responseText.trim().length < 6) {
          throw new Error("澄清回复至少需要 6 个字符。");
        }
        const batchNo = `BATCH-RC-${clarification.id}`;
        const batch = getOrCreateBatch(
          database,
          batchNo,
          "receipt",
          input.actor,
          `澄清回执批次 ${clarification.id}`,
        );
        batch.expectedCount += 1;
        batch.appliedCount += 1;
        applyReceiptUpdate(
          database,
          clarification,
          input.responseText,
          input.actor,
          batchNo,
        );
        return clarification;
      }),
    confirmOpinion: (
      _parent: unknown,
      { input }: { input: ConfirmOpinionInput },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["chair"]);
        const opinion = database.responses
          .flatMap((response) => response.reviews)
          .find((item) => item.id === input.opinionId);
        if (!opinion) {
          throw new Error("评审意见不存在。");
        }
        if (opinion.status !== "submitted") {
          throw new Error("只有已提交未确认的意见可以确认裁定。");
        }
        opinion.status = "confirmed";
        createAudit(
          database,
          input.actor,
          "确认评审裁定",
          opinion.id,
          `${opinion.reviewer} 在 ${opinion.responseId} 的裁定已确认，回执更新时将保留原裁定并列入复议。`,
        );
        return opinion;
      }),
    resolveReconsideration: (
      _parent: unknown,
      { input }: { input: ResolveReconsiderationInput },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["chair"]);
        const item = database.reconsiderations.find(
          (entry) => entry.id === input.reconsiderationId,
        );
        if (!item) {
          throw new Error("复议项不存在。");
        }
        if (item.status === "resolved") {
          throw new Error("复议项已办结。");
        }
        if (input.resolution.trim().length < 6) {
          throw new Error("复议结论至少需要 6 个字符。");
        }
        item.status = "resolved";
        item.resolution = input.resolution.trim();
        item.resolvedBy = input.actor;
        item.resolvedAt = new Date().toISOString();
        createAudit(
          database,
          input.actor,
          "办结复议项",
          item.id,
          `${item.reviewer} 在 ${item.responseId} 的复议已办结：${item.resolution}`,
        );
        return item;
      }),
    importBatch: (_parent: unknown, { input }: { input: ImportBatchInput }) => {
      requireRole(input.role, ["procurement", "chair"]);
      if (input.label.trim().length < 4) {
        throw new Error("批次名称至少需要 4 个字符。");
      }
      if (input.items.length === 0) {
        throw new Error("导入批次至少需要 1 个条目。");
      }
      return reviewDataStore.mutate((database) => {
        const batchNo = `BATCH-IMP-${Date.now()}`;
        const failBatch = (error: string): never => {
          const batch: ReviewBatch = {
            id: createBatchId(),
            batchNo,
            label: input.label.trim(),
            source: "import",
            status: "failed",
            expectedCount: input.items.length,
            appliedCount: 0,
            skippedCount: 0,
            error,
            createdAt: new Date().toISOString(),
            createdBy: input.actor,
          };
          database.batches.unshift(batch);
          createAudit(
            database,
            input.actor,
            "批量导入失败",
            batch.id,
            `批次 ${batchNo} 校验未通过：${error} 可从最近完整批次恢复。`,
          );
          throw new Error(`批量导入失败：${error}（批次 ${batchNo} 已登记，可从完整批次恢复）`);
        };

        // 先整体校验，任一条目失败则整批不落库，保证可从完整批次恢复。
        const seenExternalIds = new Set<string>();
        const staged: Array<() => void> = [];
        let skippedCount = 0;
        input.items.forEach((item: BatchImportItemInput, index: number) => {
          const position = `第 ${index + 1} 条`;
          if (!item.externalId?.trim()) {
            failBatch(`${position}缺少外部编号 externalId。`);
          }
          const externalId = item.externalId.trim();
          if (seenExternalIds.has(externalId)) {
            failBatch(`${position}外部编号 ${externalId} 在批次内重复。`);
          }
          seenExternalIds.add(externalId);

          if (item.kind === "opinion") {
            const exists = database.responses.some((response) =>
              response.reviews.some((opinion) => opinion.externalId === externalId),
            );
            if (exists) {
              skippedCount += 1;
              return;
            }
            if (!item.responseId || !item.reviewer || !item.role || !item.decision) {
              failBatch(`${position}意见条目缺少响应、评审员、角色或判定。`);
            }
            const response =
              database.responses.find(
                (candidate) => candidate.id === item.responseId,
              ) ?? failBatch(`${position}引用的供应商响应 ${item.responseId} 不存在。`);
            const clause =
              database.clauses.find(
                (candidate) => candidate.id === response.clauseId,
              ) ?? failBatch(`${position}引用的技术条款不存在。`);
            try {
              validateAssessment(clause, {
                decision: item.decision!,
                score: item.score ?? 0,
                comment: item.comment ?? "",
              });
            } catch (error) {
              failBatch(`${position}${(error as Error).message}`);
            }
            staged.push(() => {
              const target = findResponse(database, response.id);
              target.reviews.push({
                id: createOpinionId(),
                responseId: target.id,
                reviewer: item.reviewer!.trim(),
                role: item.role!,
                decision: item.decision!,
                score: item.score ?? 0,
                comment: item.comment!.trim(),
                createdAt: new Date().toISOString(),
                status: "submitted",
                baseRevision: target.revision,
                batchNo,
                externalId,
              });
              target.revision += 1;
              target.status = item.decision!;
            });
            return;
          }

          if (item.kind === "receipt") {
            const exists = database.responses.some((response) =>
              response.clarifications.some(
                (clarification) => clarification.externalId === externalId,
              ),
            );
            if (exists) {
              skippedCount += 1;
              return;
            }
            if (!item.clarificationId || !item.responseText) {
              failBatch(`${position}回执条目缺少澄清编号或回复内容。`);
            }
            const clarification =
              database.responses
                .flatMap((response) => response.clarifications)
                .find((candidate) => candidate.id === item.clarificationId) ??
              failBatch(`${position}引用的澄清记录 ${item.clarificationId} 不存在。`);
            if (item.responseText!.trim().length < 6) {
              failBatch(`${position}回执内容至少需要 6 个字符。`);
            }
            staged.push(() => {
              const target = database.responses
                .flatMap((response) => response.clarifications)
                .find((candidate) => candidate.id === clarification.id);
              if (!target) {
                return;
              }
              target.externalId = externalId;
              applyReceiptUpdate(
                database,
                target,
                item.responseText!,
                input.actor,
                batchNo,
              );
            });
            return;
          }

          failBatch(`${position}类型 ${String(item.kind)} 暂不支持导入。`);
        });

        staged.forEach((apply) => apply());
        const batch = getOrCreateBatch(
          database,
          batchNo,
          "import",
          input.actor,
          input.label.trim(),
        );
        batch.expectedCount = input.items.length;
        batch.appliedCount = input.items.length - skippedCount;
        batch.skippedCount = skippedCount;
        createAudit(
          database,
          input.actor,
          "批量导入完成",
          batch.id,
          `批次 ${batchNo} 应用 ${batch.appliedCount} 项，跳过重复 ${skippedCount} 项。`,
        );
        const result: BatchImportResult = {
          batch,
          appliedCount: batch.appliedCount,
          skippedCount,
        };
        return result;
      });
    },
    recoverBatch: (_parent: unknown, { input }: { input: RecoverBatchInput }) =>
      reviewDataStore.mutate((database) => {
        const batch = database.batches.find((item) => item.id === input.batchId);
        if (!batch) {
          throw new Error("批次不存在。");
        }
        if (batch.status !== "failed") {
          throw new Error("只有失败的批次需要恢复。");
        }
        const restorePoint = database.batches
          .filter((item) => item.status === "complete")
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        if (!restorePoint) {
          throw new Error("没有可恢复的完整批次。");
        }
        batch.status = "recovered";
        batch.recoveredFromId = restorePoint.id;
        createAudit(
          database,
          input.actor,
          "从完整批次恢复",
          batch.id,
          `失败批次 ${batch.batchNo} 已回退到完整批次 ${restorePoint.batchNo}（${restorePoint.label}）的状态。`,
        );
        return batch;
      }),
    backfillBatchNumbers: (
      _parent: unknown,
      { input }: { input: BackfillBatchInput },
    ) => {
      requireRole(input.role, ["procurement", "chair"]);
      return reviewDataStore.mutate((database) => {
        let assigned = 0;
        database.pendingBatchItems.forEach((pending) => {
          if (pending.kind === "opinion") {
            const response = database.responses.find(
              (item) => item.id === pending.refId,
            );
            const opinion = response?.reviews.find(
              (item) => item.id === pending.id,
            );
            if (response && opinion) {
              const batch = getOrCreateBatch(
                database,
                `BATCH-LEGACY-${response.id}`,
                "legacy",
                input.actor,
                `${response.supplierName} ${response.clauseId} 旧数据补登批次`,
              );
              batch.expectedCount += 1;
              batch.appliedCount += 1;
              opinion.batchNo = batch.batchNo;
              assigned += 1;
            }
            return;
          }
          if (pending.kind === "receipt") {
            const response = database.responses.find(
              (item) => item.id === pending.refId,
            );
            const clarification = response?.clarifications.find(
              (item) => item.id === pending.id,
            );
            if (response && clarification) {
              const batch = getOrCreateBatch(
                database,
                "BATCH-LEGACY-RECEIPTS",
                "legacy",
                input.actor,
                "旧澄清回执补登批次",
              );
              batch.expectedCount += 1;
              batch.appliedCount += 1;
              clarification.batchNo = batch.batchNo;
              assigned += 1;
            }
            return;
          }
          const version = database.versions.find(
            (item) => item.id === pending.id,
          );
          if (version) {
            const batch = getOrCreateBatch(
              database,
              "BATCH-LEGACY-VERSIONS",
              "legacy",
              input.actor,
              "旧定稿版本补登批次",
            );
            batch.expectedCount += 1;
            batch.appliedCount += 1;
            version.batchNo = batch.batchNo;
            assigned += 1;
          }
        });
        const result: BackfillBatchResult = {
          assigned,
          remaining: database.pendingBatchItems.length - assigned,
        };
        createAudit(
          database,
          input.actor,
          "补登批次号",
          "pendingBatchItems",
          `旧数据补登批次号 ${assigned} 项，仍待核 ${result.remaining} 项。`,
        );
        return result;
      });
    },
    finalizeVersion: (
      _parent: unknown,
      { input }: { input: FinalizeVersionInput },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["chair"]);
        if (input.label.trim().length < 4) {
          throw new Error("版本名称至少需要 4 个字符。");
        }
        const blockingClarifications = database.responses
          .flatMap((response) => response.clarifications)
          .filter(
            (clarification) =>
              clarification.status === "open" ||
              clarification.status === "overdue",
          );
        if (blockingClarifications.length > 0) {
          throw new Error(
            `仍有 ${blockingClarifications.length} 项未完成澄清，不能定稿。`,
          );
        }
        if (database.pendingBatchItems.length > 0) {
          throw new Error(
            `仍有 ${database.pendingBatchItems.length} 项旧数据缺少批次号（待核），补不齐不能定稿。`,
          );
        }
        const staleRecalc = database.responses.filter((response) => {
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
        });
        if (staleRecalc.length > 0) {
          throw new Error(
            `仍有 ${staleRecalc.length} 项响应在回执更新后意见失效，尚未按当前修订重算，不能定稿。`,
          );
        }
        const maxVersion =
          database.versions.reduce((maximum, version) => {
            const numeric = Number(version.version.replace(/\D/g, ""));
            return Number.isFinite(numeric)
              ? Math.max(maximum, numeric)
              : maximum;
          }, 0) + 1;
        database.versions.forEach((version) => {
          version.status = "finalized";
        });
        const versionId = `VER-${Date.now()}`;
        const batchNo = `BATCH-VER-${versionId}`;
        const batch = getOrCreateBatch(
          database,
          batchNo,
          "version",
          input.actor,
          `定稿版本批次 V${maxVersion}`,
        );
        batch.expectedCount = 1;
        batch.appliedCount = 1;
        const version = {
          id: versionId,
          version: `V${maxVersion}`,
          label: input.label.trim(),
          status: "finalized" as const,
          createdAt: new Date().toISOString(),
          createdBy: input.actor,
          signedBy: [input.actor],
          clauseCount: database.clauses.length,
          responseCount: database.responses.length,
          contentHash: Math.random().toString(16).slice(2, 10),
          batchNo,
        };
        database.versions.unshift(version);
        createAudit(
          database,
          input.actor,
          "汇总签字定稿",
          version.id,
          `${version.version} ${version.label} 已锁定并归入批次 ${batchNo}，签署人 ${input.actor}。`,
        );
        return version;
      }),
    resetReviewData: () => {
      reviewDataStore.reset();
      return true;
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

async function startServer(): Promise<void> {
  const { url } = await startStandaloneServer(server, {
    listen: { port: 18462, host: "0.0.0.0" },
    context: async () => ({
      database: reviewDataStore.snapshot(),
    }),
  });
  console.log(`GraphQL mock server ready at ${url}`);
}

void startServer();
