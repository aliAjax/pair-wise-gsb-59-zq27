import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import {
  createAudit,
  createBatchId,
  createClarificationId,
  createDraftId,
  createLegacyId,
  createOpinionId,
  createReconsiderationId,
  LEGACY_BATCH_CODE,
  reviewDataStore,
  stripCheckpoints,
} from "./data";
import { typeDefs } from "./schema";
import type {
  AssessmentInput,
  BatchCheckpoint,
  BatchImportInput,
  Clarification,
  ClarificationInput,
  ClarificationResponseInput,
  Clause,
  ConfirmAssessmentInput,
  DashboardStats,
  FinalizeVersionInput,
  ImportClarificationInput,
  ImportOpinionInput,
  LegacyVerification,
  OpinionDraft,
  ReconsiderationItem,
  ReviewBatch,
  ReviewDatabase,
  ReviewRole,
  ReviewerOpinion,
  SupplierResponse,
} from "./types";

const getDashboard = (database: ReviewDatabase): DashboardStats => {
  const opinionsByResponse = database.responses.map((response) => {
    const decisions = new Set(
      response.reviews
        .filter(
          (review) =>
            review.decision !== "clarification" &&
            review.lifecycle !== "invalidated",
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
  const activeBatch =
    database.batches.find((batch) => batch.status === "open") ??
    database.batches.find((batch) => batch.status === "committed");

  return {
    totalClauses: database.clauses.length,
    mandatoryCount: database.clauses.filter(
      (clause) => clause.type === "mandatory",
    ).length,
    pendingReviews: database.responses.filter(
      (response) =>
        response.reviews.filter(
          (review) => review.lifecycle !== "invalidated",
        ).length < 2,
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
    invalidatedOpinions: database.responses.reduce(
      (count, response) =>
        count +
        response.reviews.filter(
          (review) => review.lifecycle === "invalidated",
        ).length,
      0,
    ),
    pendingDrafts: database.responses.reduce(
      (count, response) => count + response.drafts.length,
      0,
    ),
    openReconsiderations: database.reconsiderationItems.filter(
      (item) => item.status === "open",
    ).length,
    pendingLegacyItems: database.legacyVerifications.filter(
      (item) => item.status === "pending",
    ).length,
    unverifiableLegacyItems: database.legacyVerifications.filter(
      (item) => item.status === "unverifiable",
    ).length,
    activeBatch: activeBatch ? activeBatch.code : "未建立批次",
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
  const response = database.responses.find(
    (item) => item.id === responseId,
  );
  if (!response) {
    throw new Error("供应商响应不存在。");
  }
  return response;
};

const findClarification = (
  database: ReviewDatabase,
  clarificationId: string,
): { clarification: Clarification; response: SupplierResponse } => {
  const response = database.responses.find((item) =>
    item.clarifications.some(
      (clarification) => clarification.id === clarificationId,
    ),
  );
  const clarification = response?.clarifications.find(
    (item) => item.id === clarificationId,
  );
  if (!clarification || !response) {
    throw new Error("澄清记录不存在。");
  }
  return { clarification, response };
};

const findOpinion = (
  database: ReviewDatabase,
  opinionId: string,
): { opinion: ReviewerOpinion; response: SupplierResponse } => {
  const response = database.responses.find((item) =>
    item.reviews.some((review) => review.id === opinionId),
  );
  const opinion = response?.reviews.find((item) => item.id === opinionId);
  if (!opinion || !response) {
    throw new Error("评审意见不存在。");
  }
  return { opinion, response };
};

/** 取得当前工作批次；不存在时创建。 */
const ensureOpenBatch = (
  database: ReviewDatabase,
  actor: string,
  batchId?: string,
): ReviewBatch => {
  if (batchId) {
    const explicit = database.batches.find((batch) => batch.id === batchId);
    if (!explicit) {
      throw new Error(`批次 ${batchId} 不存在。`);
    }
    if (explicit.status === "committed") {
      throw new Error(`批次 ${explicit.code} 已锁定提交，不能再写入。`);
    }
    return explicit;
  }
  const open = database.batches.find((batch) => batch.status === "open");
  if (open) {
    return open;
  }
  const code = `BATCH-${new Date().toISOString().slice(0, 10)}-WORK`;
  const batch: ReviewBatch = {
    id: code,
    code,
    label: "评审工作批次",
    status: "open",
    createdAt: new Date().toISOString(),
    createdBy: actor,
    opinionCount: 0,
    clarificationCount: 0,
    responseCount: 0,
  };
  database.batches.unshift(batch);
  return batch;
};

/** 回执到达后：同组（同响应、同澄清轮次所在批次链）未确认意见失效，已确认登记复议。 */
const applyReceiptToGroup = (
  database: ReviewDatabase,
  response: SupplierResponse,
  clarification: Clarification,
  receiptBatchId: string,
): void => {
  const now = new Date().toISOString();
  response.reviews.forEach((opinion) => {
    if (
      opinion.lifecycle === "invalidated" ||
      opinion.reconsiderationId
    ) {
      return;
    }
    // 只处理针对缺材料作出、且尚无更新意见覆盖的同组意见。
    if (!opinion.basedOnMissingMaterial) {
      return;
    }
    if (opinion.lifecycle === "provisional") {
      opinion.lifecycle = "invalidated";
      opinion.invalidatedByClarificationId = clarification.id;
      opinion.invalidatedAt = now;
      createAudit(
        database,
        "系统",
        "回执触发失效重算",
        opinion.id,
        `${response.supplierName} ${response.clauseId}：${opinion.reviewer} 未确认意见因第 ${clarification.round} 轮回执失效，需重算。`,
      );
    } else {
      const reconsideration: ReconsiderationItem = {
        id: createReconsiderationId(),
        responseId: response.id,
        opinionId: opinion.id,
        reviewer: opinion.reviewer,
        batchId: receiptBatchId,
        reason: `第 ${clarification.round} 轮澄清回执已到达，已确认的原裁定保留，请结合补充材料复议。`,
        clarificationId: clarification.id,
        createdAt: now,
        status: "open",
      };
      database.reconsiderationItems.unshift(reconsideration);
      opinion.reconsiderationId = reconsideration.id;
      createAudit(
        database,
        "系统",
        "已确认意见转复议",
        reconsideration.id,
        `${response.supplierName} ${response.clauseId}：${opinion.reviewer} 已确认意见 ${opinion.id} 保留原裁定并列入复议。`,
      );
    }
  });
};

const opinionFingerprint = (input: {
  reviewer: string;
  decision: string;
  score: number;
  comment: string;
}): string =>
  [input.reviewer, input.decision, input.score, input.comment.trim()].join(
    "|",
  );

const buildCheckpoint = (database: ReviewDatabase): BatchCheckpoint => ({
  capturedAt: new Date().toISOString(),
  ...stripCheckpoints(database),
});

/** 将数据库回滚到最近一个带完整检查点的已提交批次。 */
const restoreLatestCheckpoint = (
  database: ReviewDatabase,
): ReviewBatch | undefined => {
  const checkpointBatch = [...database.batches]
    .filter((batch) => batch.status === "committed" && batch.checkpoint)
    .sort(
      (a, b) =>
        Date.parse(b.checkpoint!.capturedAt) -
        Date.parse(a.checkpoint!.capturedAt),
    )[0];
  if (!checkpointBatch?.checkpoint) {
    return undefined;
  }
  const checkpoint = checkpointBatch.checkpoint;
  database.responses = structuredClone(checkpoint.responses);
  database.versions = structuredClone(checkpoint.versions);
  database.reconsiderationItems = structuredClone(
    checkpoint.reconsiderationItems,
  );
  database.legacyVerifications = structuredClone(
    checkpoint.legacyVerifications,
  );
  return checkpointBatch;
};

const validateOpinionInput = (
  database: ReviewDatabase,
  input: Pick<
    ImportOpinionInput,
    "responseId" | "reviewer" | "role" | "decision" | "score" | "comment"
  >,
): { response: SupplierResponse; clause: Clause } => {
  const response = database.responses.find(
    (item) => item.id === input.responseId,
  );
  if (!response) {
    throw new Error(`响应 ${input.responseId} 不存在。`);
  }
  const clause = database.clauses.find(
    (item) => item.id === response.clauseId,
  );
  if (!clause) {
    throw new Error(`响应 ${input.responseId} 对应条款不存在。`);
  }
  if (input.reviewer.trim().length < 2) {
    throw new Error(
      `响应 ${input.responseId} 的评审员姓名至少需要 2 个字符。`,
    );
  }
  if (input.comment.trim().length < 6) {
    throw new Error(
      `响应 ${input.responseId} 的评审意见至少需要 6 个字符。`,
    );
  }
  if (input.score < 0 || input.score > clause.weight) {
    throw new Error(
      `响应 ${input.responseId} 的评分必须在 0 至 ${clause.weight} 之间。`,
    );
  }
  if (
    clause.type === "scoring" &&
    input.decision === "compliant" &&
    input.score === 0
  ) {
    throw new Error(
      `响应 ${input.responseId} 的评分项判定符合时必须填写评分。`,
    );
  }
  return { response, clause };
};

const validateClarificationInput = (
  database: ReviewDatabase,
  input: ImportClarificationInput,
): SupplierResponse => {
  const response = database.responses.find(
    (item) => item.id === input.responseId,
  );
  if (!response) {
    throw new Error(`澄清引用的响应 ${input.responseId} 不存在。`);
  }
  if (input.requestText.trim().length < 6) {
    throw new Error(
      `响应 ${input.responseId} 的澄清要求至少需要 6 个字符。`,
    );
  }
  const requestedAt = Date.parse(input.requestedAt);
  const dueAt = Date.parse(input.dueAt);
  if (Number.isNaN(requestedAt) || Number.isNaN(dueAt)) {
    throw new Error(
      `响应 ${input.responseId} 的澄清时间格式无效。`,
    );
  }
  if (dueAt <= requestedAt) {
    throw new Error(
      `响应 ${input.responseId} 的澄清截止时间必须晚于发起时间。`,
    );
  }
  if (input.round < 1) {
    throw new Error(
      `响应 ${input.responseId} 的澄清轮次必须从 1 开始。`,
    );
  }
  return response;
};

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
    responses: (
      clause: Clause,
      _args: unknown,
      context: { database: ReviewDatabase },
    ) =>
      context.database.responses.filter(
        (response) => response.clauseId === clause.id,
      ),
  },
  ReviewBatch: {
    checkpoint: (batch: ReviewBatch) =>
      batch.checkpoint
        ? {
            capturedAt: batch.checkpoint.capturedAt,
            responseCount: batch.checkpoint.responses.length,
          }
        : null,
    opinionCount: (
      batch: ReviewBatch,
      _args: unknown,
      context: { database: ReviewDatabase },
    ) =>
      context.database.responses.reduce(
        (count, response) =>
          count +
          response.reviews.filter((review) => review.batchId === batch.id)
            .length,
        0,
      ),
    clarificationCount: (
      batch: ReviewBatch,
      _args: unknown,
      context: { database: ReviewDatabase },
    ) =>
      context.database.responses.reduce(
        (count, response) =>
          count +
          response.clarifications.filter(
            (clarification) =>
              clarification.batchId === batch.id ||
              clarification.receiptBatchId === batch.id,
          ).length,
        0,
      ),
    responseCount: (
      batch: ReviewBatch,
      _args: unknown,
      context: { database: ReviewDatabase },
    ) =>
      context.database.responses.filter(
        (response) => response.batchId === batch.id,
      ).length,
  },
  Mutation: {
    submitAssessment: (
      _parent: unknown,
      { input }: { input: AssessmentInput },
    ) => {
      requireRole(input.role, ["reviewer_a", "reviewer_b", "chair"]);
      if (input.comment.trim().length < 6) {
        throw new Error("评审意见至少需要 6 个字符。");
      }
      return reviewDataStore.mutate((database) => {
        const response = findResponse(database, input.responseId);
        const clause = database.clauses.find(
          (item) => item.id === response.clauseId,
        );
        if (!clause) {
          throw new Error("对应技术条款不存在。");
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
        const batch = ensureOpenBatch(database, input.reviewer, input.batchId);

        // 乐观并发：先到者占用修订，后到者保留草稿和差异。
        const baseRevision = input.baseRevision ?? response.revision;
        if (baseRevision < response.revision) {
          const conflictOpinion = [...response.reviews]
            .filter((review) => review.revision === response.revision)
            .sort(
              (a, b) =>
                Date.parse(b.createdAt) - Date.parse(a.createdAt),
            )[0];
          // 同一评审员针对同一冲突只保留最新草稿。
          response.drafts = response.drafts.filter(
            (draft) => draft.reviewer !== input.reviewer,
          );
          const draft: OpinionDraft = {
            id: createDraftId(),
            responseId: response.id,
            reviewer: input.reviewer.trim(),
            role: input.role,
            decision: input.decision,
            score: input.score,
            comment: input.comment.trim(),
            createdAt: new Date().toISOString(),
            batchId: batch.id,
            baseRevision,
            latestRevision: response.revision,
            conflictOpinionId: conflictOpinion?.id ?? "",
          };
          response.drafts.push(draft);
          createAudit(
            database,
            input.reviewer,
            "并发提交保留草稿",
            draft.id,
            `${clause.code} ${clause.title}：修订已被先到者占用（${conflictOpinion?.reviewer ?? "其他评审员"}），草稿已保留差异。`,
          );
          return {
            opinion: null,
            draft,
            conflicted: true,
            currentRevision: response.revision,
            conflictOpinion: conflictOpinion ?? null,
            batchId: batch.id,
          };
        }

        response.revision += 1;
        const opinion: ReviewerOpinion = {
          id: createOpinionId(),
          responseId: response.id,
          reviewer: input.reviewer.trim(),
          role: input.role,
          decision: input.decision,
          score: input.score,
          comment: input.comment.trim(),
          createdAt: new Date().toISOString(),
          batchId: batch.id,
          lifecycle: "provisional",
          basedOnMissingMaterial:
            input.decision === "clarification" ||
            response.clarifications.some(
              (clarification) => clarification.status === "open",
            ),
          revision: response.revision,
        };
        response.reviews.push(opinion);
        response.status = input.decision;
        response.reviewRound = Math.max(response.reviewRound, 1);
        createAudit(
          database,
          opinion.reviewer,
          "提交独立意见",
          opinion.id,
          `${clause.code} ${clause.title} 判定为 ${input.decision}，评分 ${input.score}，批次 ${batch.code}，修订号 ${response.revision}。`,
        );
        return {
          opinion,
          draft: null,
          conflicted: false,
          currentRevision: response.revision,
          conflictOpinion: null,
          batchId: batch.id,
        };
      });
    },

    confirmAssessment: (
      _parent: unknown,
      { input }: { input: ConfirmAssessmentInput },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["reviewer_a", "reviewer_b", "chair"]);
        const { opinion, response } = findOpinion(
          database,
          input.opinionId,
        );
        if (opinion.lifecycle === "invalidated") {
          throw new Error("已失效意见不能确认，需重新评审。");
        }
        if (
          input.role !== "chair" &&
          opinion.role !== input.role
        ) {
          throw new Error("只能确认本人提交的评审意见，组长可代为确认。");
        }
        opinion.lifecycle = "confirmed";
        createAudit(
          database,
          input.actor,
          "确认评审意见",
          opinion.id,
          `${response.supplierName} ${response.clauseId}：${opinion.reviewer} 意见已确认，后续回执更新将保留原裁定并转复议。`,
        );
        return opinion;
      }),

    discardDraft: (
      _parent: unknown,
      { input }: { input: { draftId: string; actor: string; role: ReviewRole } },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["reviewer_a", "reviewer_b", "chair"]);
        const response = database.responses.find((item) =>
          item.drafts.some((draft) => draft.id === input.draftId),
        );
        const draft = response?.drafts.find(
          (item) => item.id === input.draftId,
        );
        if (!draft || !response) {
          throw new Error("草稿不存在。");
        }
        if (input.role !== "chair" && draft.role !== input.role) {
          throw new Error("只能丢弃本人的草稿。");
        }
        response.drafts = response.drafts.filter(
          (item) => item.id !== input.draftId,
        );
        createAudit(
          database,
          input.actor,
          "丢弃并发草稿",
          draft.id,
          `${response.clauseId}：${draft.reviewer} 的过期草稿已丢弃。`,
        );
        return true;
      }),

    applyDraft: (
      _parent: unknown,
      {
        input,
      }: {
        input: {
          draftId: string;
          actor: string;
          role: ReviewRole;
          baseRevision?: number;
        };
      },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["reviewer_a", "reviewer_b", "chair"]);
        const response = database.responses.find((item) =>
          item.drafts.some((draft) => draft.id === input.draftId),
        );
        const draft = response?.drafts.find(
          (item) => item.id === input.draftId,
        );
        if (!draft || !response) {
          throw new Error("草稿不存在。");
        }
        if (input.role !== "chair" && draft.role !== input.role) {
          throw new Error("只能应用本人的草稿。");
        }
        const baseRevision = input.baseRevision ?? response.revision;
        if (baseRevision < response.revision) {
          draft.latestRevision = response.revision;
          const conflictOpinion = [...response.reviews]
            .filter((review) => review.revision === response.revision)
            .sort(
              (a, b) =>
                Date.parse(b.createdAt) - Date.parse(a.createdAt),
            )[0];
          draft.conflictOpinionId = conflictOpinion?.id ?? "";
          createAudit(
            database,
            input.actor,
            "草稿应用再次冲突",
            draft.id,
            `${response.clauseId}：修订号仍落后，草稿继续保留。`,
          );
          return {
            opinion: null,
            draft,
            conflicted: true,
            currentRevision: response.revision,
            conflictOpinion: conflictOpinion ?? null,
            batchId: draft.batchId,
          };
        }
        response.revision += 1;
        const opinion: ReviewerOpinion = {
          id: createOpinionId(),
          responseId: response.id,
          reviewer: draft.reviewer,
          role: draft.role,
          decision: draft.decision,
          score: draft.score,
          comment: draft.comment,
          createdAt: new Date().toISOString(),
          batchId: draft.batchId,
          lifecycle: "provisional",
          basedOnMissingMaterial: draft.decision === "clarification",
          revision: response.revision,
        };
        response.reviews.push(opinion);
        response.status = opinion.decision;
        response.drafts = response.drafts.filter(
          (item) => item.id !== draft.id,
        );
        createAudit(
          database,
          input.actor,
          "应用并发草稿",
          opinion.id,
          `${response.clauseId}：${draft.reviewer} 草稿已基于最新修订 ${response.revision} 提交。`,
        );
        return {
          opinion,
          draft: null,
          conflicted: false,
          currentRevision: response.revision,
          conflictOpinion: null,
          batchId: draft.batchId,
        };
      }),

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
        const batch = ensureOpenBatch(database, input.actor, input.batchId);
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
          status: "open",
          batchId: batch.id,
        };
        response.clarifications.push(clarification);
        response.status = "clarification";
        createAudit(
          database,
          input.actor,
          "发起澄清",
          clarification.id,
          `${response.supplierName} ${response.clauseId} 第 ${round} 轮澄清已发起，批次 ${batch.code}。`,
        );
        return clarification;
      }),

    respondClarification: (
      _parent: unknown,
      { input }: { input: ClarificationResponseInput },
    ) =>
      reviewDataStore.mutate((database) => {
        if (input.responseText.trim().length < 6) {
          throw new Error("澄清回复至少需要 6 个字符。");
        }
        const { clarification, response } = findClarification(
          database,
          input.clarificationId,
        );
        const batch = ensureOpenBatch(database, input.actor, input.batchId);
        clarification.supplierResponse = input.responseText.trim();
        clarification.respondedAt = new Date().toISOString();
        clarification.status = "responded";
        clarification.receiptBatchId = batch.id;
        response.status = "pending";
        response.reviewRound += 1;
        // 回执更新：同组未确认意见失效重算，已确认意见留原裁定并列复议项。
        applyReceiptToGroup(database, response, clarification, batch.id);
        createAudit(
          database,
          input.actor,
          "登记澄清回执",
          clarification.id,
          `第 ${clarification.round} 轮澄清回执登记到批次 ${batch.code}，同组意见已按确认状态分流。`,
        );
        return clarification;
      }),

    resolveReconsideration: (
      _parent: unknown,
      {
        input,
      }: {
        input: {
          reconsiderationId: string;
          resolution: string;
          actor: string;
          role: ReviewRole;
        };
      },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["chair"]);
        if (input.resolution.trim().length < 6) {
          throw new Error("复议结论至少需要 6 个字符。");
        }
        const item = database.reconsiderationItems.find(
          (entry) => entry.id === input.reconsiderationId,
        );
        if (!item) {
          throw new Error("复议项不存在。");
        }
        item.status = "resolved";
        item.resolution = input.resolution.trim();
        item.resolvedAt = new Date().toISOString();
        item.resolvedBy = input.actor;
        createAudit(
          database,
          input.actor,
          "关闭复议项",
          item.id,
          `${item.responseId}：${item.reviewer} 原裁定的复议已处理：${item.resolution}`,
        );
        return item;
      }),

    verifyLegacyItem: (
      _parent: unknown,
      {
        input,
      }: {
        input: {
          legacyId: string;
          actor: string;
          role: ReviewRole;
          batchId?: string;
        };
      },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["procurement", "chair"]);
        const item = database.legacyVerifications.find(
          (entry) => entry.id === input.legacyId,
        );
        if (!item) {
          throw new Error("待核旧数据不存在。");
        }
        if (item.status !== "pending") {
          throw new Error("该待核项已处理。");
        }
        // 核实引用完整性：引用断裂即补不齐，标记不可核实并继续拦截定稿。
        let verifiable = true;
        if (item.responseId) {
          const response = database.responses.find(
            (entry) => entry.id === item.responseId,
          );
          if (!response) {
            verifiable = false;
          } else if (item.entityType === "opinion") {
            const opinion = response.reviews.find(
              (entry) => entry.id === item.entityId,
            );
            if (!opinion) {
              verifiable = false;
            }
          } else if (item.entityType === "clarification") {
            const clarification = response.clarifications.find(
              (entry) => entry.id === item.entityId,
            );
            if (!clarification) {
              verifiable = false;
            }
          }
        }
        if (!verifiable) {
          item.status = "unverifiable";
          item.verifiedAt = new Date().toISOString();
          item.verifiedBy = input.actor;
          item.assignedBatchId = undefined;
          createAudit(
            database,
            input.actor,
            "旧数据核实不通过",
            item.id,
            `${item.entityType} ${item.entityId} 引用关系断裂，无法补齐批次号，继续拦截定稿。`,
          );
          return item;
        }

        const targetBatchId = input.batchId?.trim()
          ? createBatchId(input.batchId)
          : LEGACY_BATCH_CODE;
        let batch = database.batches.find(
          (entry) => entry.id === targetBatchId,
        );
        if (!batch) {
          const now = new Date().toISOString();
          batch = {
            id: targetBatchId,
            code: targetBatchId,
            label:
              targetBatchId === LEGACY_BATCH_CODE
                ? "历史数据归集批次"
                : "旧数据补登批次",
            status: "committed",
            createdAt: now,
            createdBy: input.actor,
            committedAt: now,
            opinionCount: 0,
            clarificationCount: 0,
            responseCount: 0,
          };
          database.batches.push(batch);
        }
        const response = item.responseId
          ? database.responses.find(
              (entry) => entry.id === item.responseId,
            )
          : undefined;
        if (response) {
          if (item.entityType === "response") {
            response.batchId = targetBatchId;
          } else if (item.entityType === "opinion") {
            const opinion = response.reviews.find(
              (entry) => entry.id === item.entityId,
            );
            if (opinion) {
              opinion.batchId = targetBatchId;
            }
          } else {
            const clarification = response.clarifications.find(
              (entry) => entry.id === item.entityId,
            );
            if (clarification) {
              clarification.batchId = targetBatchId;
            }
          }
          // 响应自身无批次号时一并归集，避免实体仍游离。
          if (!response.batchId) {
            response.batchId = targetBatchId;
          }
        }
        item.status = "verified";
        item.verifiedAt = new Date().toISOString();
        item.verifiedBy = input.actor;
        item.assignedBatchId = targetBatchId;
        createAudit(
          database,
          input.actor,
          "旧数据补登批次",
          item.id,
          `${item.entityType} ${item.entityId} 已核实并补登批次 ${targetBatchId}。`,
        );
        return item;
      }),

    importReviewBatch: (
      _parent: unknown,
      { input }: { input: BatchImportInput },
    ) => {
      if (!input.batchCode.trim()) {
        throw new Error("批次编号不能为空。");
      }
      if (input.label.trim().length < 2) {
        throw new Error("批次名称至少需要 2 个字符。");
      }
      return reviewDataStore.mutate((database) => {
        const batchId = createBatchId(input.batchCode);
        const existing = database.batches.find(
          (batch) => batch.id === batchId,
        );
        const errors: string[] = [];
        const counts = {
          opinionsAdded: 0,
          clarificationsAdded: 0,
          opinionsSkipped: 0,
          clarificationsSkipped: 0,
          errors,
        };

        // 已提交批次允许重复导入：按指纹逐比对，已存在则跳过、只补缺项。
        const stagedOpinions: Array<{
          response: SupplierResponse;
          opinion: ReviewerOpinion;
        }> = [];
        const seenOpinionKeys = new Set<string>();
        for (const entry of input.opinions) {
          try {
            const { response } = validateOpinionInput(database, entry);
            const key = `${response.id}:${opinionFingerprint(entry)}`;
            const already = response.reviews.some(
              (review) =>
                opinionFingerprint(review) === opinionFingerprint(entry),
            );
            if (already || seenOpinionKeys.has(key)) {
              counts.opinionsSkipped += 1;
              continue;
            }
            seenOpinionKeys.add(key);
            stagedOpinions.push({
              response,
              opinion: {
                id: createOpinionId(),
                responseId: response.id,
                reviewer: entry.reviewer.trim(),
                role: entry.role,
                decision: entry.decision,
                score: entry.score,
                comment: entry.comment.trim(),
                createdAt:
                  entry.createdAt ?? new Date().toISOString(),
                batchId,
                lifecycle: "confirmed",
                basedOnMissingMaterial: false,
                revision: 0,
              },
            });
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }

        const stagedClarifications: Array<{
          response: SupplierResponse;
          clarification: Clarification;
        }> = [];
        const seenClarificationKeys = new Set<string>();
        for (const entry of input.clarifications) {
          try {
            const response = validateClarificationInput(database, entry);
            const key = `${response.id}:${entry.round}`;
            const duplicateRound = response.clarifications.some(
              (item) => item.round === entry.round,
            );
            const duplicateContent = response.clarifications.some(
              (item) =>
                item.round === entry.round &&
                item.requestText === entry.requestText.trim(),
            );
            if (duplicateRound || seenClarificationKeys.has(key)) {
              if (duplicateContent) {
                counts.clarificationsSkipped += 1;
                continue;
              }
              throw new Error(
                `响应 ${response.id} 第 ${entry.round} 轮澄清已存在且内容不同。`,
              );
            }
            seenClarificationKeys.add(key);
            stagedClarifications.push({
              response,
              clarification: {
                id: createClarificationId(),
                responseId: response.id,
                clauseId: response.clauseId,
                round: entry.round,
                requestText: entry.requestText.trim(),
                supplierResponse: entry.supplierResponse?.trim(),
                requestedAt: entry.requestedAt,
                dueAt: entry.dueAt,
                respondedAt: entry.respondedAt,
                status: entry.status ?? "open",
                batchId,
                receiptBatchId: entry.respondedAt ? batchId : undefined,
              },
            });
          } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
          }
        }

        const isFreshBatch = !existing;
        // 新批次必须整批成功；旧批次（含失败批次）重导只补缺项。
        if (errors.length > 0 && isFreshBatch) {
          const now = new Date().toISOString();
          const failedBatch: ReviewBatch = {
            id: batchId,
            code: batchId,
            label: input.label.trim(),
            status: "failed",
            createdAt: now,
            createdBy: input.actor,
            lastError: errors[0],
            opinionCount: 0,
            clarificationCount: 0,
            responseCount: 0,
          };
          database.batches.unshift(failedBatch);
          // 从最近一个完整批次检查点恢复；无检查点时回到初始（空）数据。
          const restored = restoreLatestCheckpoint(database);
          if (!restored) {
            database.responses = [];
            database.versions = [];
            database.reconsiderationItems = [];
            database.legacyVerifications = [];
          }
          failedBatch.lastError = errors[0];
          createAudit(
            database,
            input.actor,
            "批量导入失败回滚",
            batchId,
            `批次 ${batchId} 校验失败（${errors.length} 项错误），已从完整批次 ${restored?.code ?? "初始状态"} 恢复：${errors[0]}`,
          );
          return {
            batch: failedBatch,
            success: false,
            recoveredFromBatchId: restored?.id ?? null,
            message: `整批导入失败，已从 ${restored?.code ?? "初始状态"} 恢复，可修正后重新导入。`,
            counts,
          };
        }

        // 提交暂存内容。
        stagedOpinions.forEach(({ response, opinion }) => {
          response.revision += 1;
          opinion.revision = response.revision;
          response.reviews.push(opinion);
          counts.opinionsAdded += 1;
        });
        stagedClarifications.forEach(({ response, clarification }) => {
          response.clarifications.push(clarification);
          counts.clarificationsAdded += 1;
        });

        let batch: ReviewBatch;
        if (existing) {
          batch = existing;
          batch.lastError = undefined;
          if (errors.length === 0) {
            batch.status = "committed";
            batch.committedAt = new Date().toISOString();
          }
        } else {
          const now = new Date().toISOString();
          batch = {
            id: batchId,
            code: batchId,
            label: input.label.trim(),
            status: "committed",
            createdAt: now,
            createdBy: input.actor,
            committedAt: now,
            opinionCount: 0,
            clarificationCount: 0,
            responseCount: 0,
          };
          database.batches.unshift(batch);
        }
        if (batch.status === "committed") {
          batch.checkpoint = buildCheckpoint(database);
        }
        createAudit(
          database,
          input.actor,
          "批量导入批次",
          batch.id,
          `批次 ${batch.code}：新增意见 ${counts.opinionsAdded} 条、澄清 ${counts.clarificationsAdded} 条，补缺跳过 ${counts.opinionsSkipped + counts.clarificationsSkipped} 条。`,
        );
        const message = errors.length
          ? `批次已补入有效项，${errors.length} 项错误已跳过。`
          : `批次 ${batch.code} 已完整提交并建立可恢复检查点。`;
        return {
          batch,
          success: errors.length === 0,
          recoveredFromBatchId: null,
          message,
          counts,
        };
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
        const pendingLegacy = database.legacyVerifications.filter(
          (item) => item.status === "pending" || item.status === "unverifiable",
        );
        if (pendingLegacy.length > 0) {
          throw new Error(
            `仍有 ${pendingLegacy.length} 项旧数据缺批次号未核实（含补不齐项目），不能定稿。`,
          );
        }
        const responsesMissingRecalculation = database.responses.filter(
          (response) => {
            const invalidated = response.reviews.filter(
              (review) => review.lifecycle === "invalidated",
            );
            if (invalidated.length === 0) {
              return false;
            }
            // 每一条失效意见都必须有同评审员、在失效时间之后提交的有效意见覆盖。
            return invalidated.some((opinion) => {
              const invalidatedAt = Date.parse(
                opinion.invalidatedAt ?? opinion.createdAt,
              );
              return !response.reviews.some(
                (candidate) =>
                  candidate.lifecycle !== "invalidated" &&
                  candidate.reviewer === opinion.reviewer &&
                  Date.parse(candidate.createdAt) >= invalidatedAt,
              );
            });
          },
        );
        if (responsesMissingRecalculation.length > 0) {
          const names = responsesMissingRecalculation
            .map((response) => `${response.supplierName} ${response.clauseId}`)
            .join("、");
          throw new Error(
            `回执更新后仍有失效意见未重算：${names}，不能定稿。`,
          );
        }
        const batch = ensureOpenBatch(database, input.actor);

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
        const now = new Date().toISOString();
        const version = {
          id: `VER-${Date.now()}`,
          version: `V${maxVersion}`,
          label: input.label.trim(),
          status: "finalized" as const,
          createdAt: now,
          createdBy: input.actor,
          signedBy: [input.actor],
          clauseCount: database.clauses.length,
          responseCount: database.responses.length,
          contentHash: Math.random().toString(16).slice(2, 10),
          batchId: batch.id,
        };
        database.versions.unshift(version);
        batch.status = "committed";
        batch.committedAt = now;
        batch.checkpoint = buildCheckpoint(database);
        createAudit(
          database,
          input.actor,
          "汇总签字定稿",
          version.id,
          `${version.version} ${version.label} 已锁定，固化批次 ${batch.code}，签署人 ${input.actor}。`,
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
