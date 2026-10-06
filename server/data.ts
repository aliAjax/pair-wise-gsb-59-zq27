import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AuditLog,
  BatchCheckpoint,
  Clarification,
  Clause,
  ComplianceStatus,
  LegacyVerification,
  OpinionDraft,
  ReconsiderationItem,
  ReviewBatch,
  ReviewDatabase,
  ReviewRole,
  ReviewerOpinion,
  SupplierResponse,
} from "./types";

const V1_BATCH_ID = "BATCH-2026-09-25-V1";
const V2_BATCH_ID = "BATCH-2026-09-29-V2";
const LEGACY_BATCH_ID = "BATCH-LEGACY-001";

const clauses: Clause[] = [
  {
    id: "C001",
    code: "A.1",
    title: "实施组织与项目计划",
    category: "实施能力",
    requirement:
      "投标人应明确项目组织、职责界面、实施方法、进度控制和风险应对机制。",
    type: "mandatory",
    weight: 0,
    evidenceRequired: true,
    order: 1,
  },
  {
    id: "C002",
    code: "A.1.1",
    title: "项目经理及关键人员",
    category: "实施能力",
    requirement:
      "项目经理应具备五年以上同类项目经验，关键人员配置应覆盖架构、开发、测试与安全。",
    type: "mandatory",
    weight: 0,
    parentId: "C001",
    evidenceRequired: true,
    order: 2,
  },
  {
    id: "C003",
    code: "A.1.2",
    title: "实施进度与里程碑",
    category: "实施能力",
    requirement:
      "提供可核验的里程碑、交付物、验收条件和资源投入计划。",
    type: "scoring",
    weight: 15,
    parentId: "C001",
    evidenceRequired: false,
    order: 3,
  },
  {
    id: "C004",
    code: "B.1",
    title: "技术架构与互操作性",
    category: "技术方案",
    requirement:
      "系统架构应支持模块化部署、横向扩展，并与采购人现有平台实现稳定互操作。",
    type: "scoring",
    weight: 25,
    evidenceRequired: true,
    order: 4,
  },
  {
    id: "C005",
    code: "B.1.1",
    title: "接口开放与标准协议",
    category: "技术方案",
    requirement:
      "对外接口应遵循 HTTPS、OAuth 2.0 和 OpenAPI 3.x，提供版本兼容与错误码说明。",
    type: "mandatory",
    weight: 0,
    parentId: "C004",
    evidenceRequired: true,
    order: 5,
  },
  {
    id: "C006",
    code: "B.1.2",
    title: "国产化兼容性",
    category: "技术方案",
    requirement:
      "提供操作系统、数据库、中间件及浏览器兼容性矩阵，并说明适配边界。",
    type: "scoring",
    weight: 15,
    parentId: "C004",
    evidenceRequired: true,
    order: 6,
  },
  {
    id: "C007",
    code: "C.1",
    title: "安全保障",
    category: "安全与合规",
    requirement:
      "技术方案应覆盖身份鉴别、访问控制、审计、数据保护和安全运维。",
    type: "mandatory",
    weight: 0,
    evidenceRequired: true,
    order: 7,
  },
  {
    id: "C008",
    code: "C.1.1",
    title: "等级保护三级证明材料",
    category: "安全与合规",
    requirement:
      "提供有效的网络安全等级保护三级备案证明或第三方测评结论。",
    type: "evidence",
    weight: 0,
    parentId: "C007",
    evidenceRequired: true,
    order: 8,
  },
  {
    id: "C009",
    code: "C.1.2",
    title: "漏洞响应机制",
    category: "安全与合规",
    requirement:
      "说明漏洞发现、分级、修复、复测和重大事件通报时限。",
    type: "scoring",
    weight: 15,
    parentId: "C007",
    evidenceRequired: false,
    order: 9,
  },
  {
    id: "C010",
    code: "D.1",
    title: "服务与培训",
    category: "服务保障",
    requirement:
      "提供驻场、巡检、培训、知识转移和故障升级的服务方案及量化响应指标。",
    type: "scoring",
    weight: 20,
    evidenceRequired: false,
    order: 10,
  },
  {
    id: "C011",
    code: "D.2",
    title: "验收指标",
    category: "服务保障",
    requirement:
      "验收指标应可测量、可复现，并与采购需求中的服务水平保持一致。",
    type: "mandatory",
    weight: 0,
    evidenceRequired: true,
    order: 11,
  },
];

const suppliers = [
  { id: "SUP-A", name: "华云数科" },
  { id: "SUP-B", name: "北辰信息" },
  { id: "SUP-C", name: "南岭科技" },
];

const responseOverrides: Record<
  string,
  Partial<
    Pick<
      SupplierResponse,
      "status" | "claimedScore" | "attachmentName" | "proofFingerprint"
    >
  >
> = {
  "C001-SUP-A": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "项目组织方案.pdf",
    proofFingerprint: "PROOF-PLAN-A",
  },
  "C001-SUP-B": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "实施组织与计划.pdf",
    proofFingerprint: "PROOF-PLAN-B",
  },
  "C001-SUP-C": {
    status: "clarification",
    claimedScore: 0,
    attachmentName: "项目管理说明.pdf",
    proofFingerprint: "PROOF-PLAN-C",
  },
  "C005-SUP-A": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "安全测评报告.pdf",
    proofFingerprint: "PROOF-SEC-CERT-2026",
  },
  "C005-SUP-B": {
    status: "deviation",
    claimedScore: 0,
    attachmentName: "接口兼容说明.pdf",
    proofFingerprint: "PROOF-API-B",
  },
  "C008-SUP-A": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "等保三级备案证明.pdf",
    proofFingerprint: "PROOF-SEC-CERT-2026",
  },
  "C008-SUP-B": {
    status: "clarification",
    claimedScore: 0,
    attachmentName: "等保材料说明.pdf",
    proofFingerprint: "PROOF-SEC-B",
  },
  "C010-SUP-B": {
    status: "compliant",
    claimedScore: 16,
    attachmentName: "服务方案.pdf",
    proofFingerprint: "PROOF-SERVICE-B",
  },
};

interface SeedOpinion {
  responseId: string;
  reviewer: string;
  role: ReviewRole;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  createdAt: string;
  batchId: string;
  lifecycle: ReviewerOpinion["lifecycle"];
  basedOnMissingMaterial?: boolean;
  invalidatedByClarificationId?: string;
  invalidatedAt?: string;
  reconsiderationId?: string;
}

const reviewFactories: SeedOpinion[] = [
  {
    responseId: "C002-SUP-A",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "compliant",
    score: 0,
    comment: "人员履历满足年限要求，社保材料与履历能够对应。",
    createdAt: "2026-09-25T15:10:00+08:00",
    batchId: V1_BATCH_ID,
    lifecycle: "confirmed",
  },
  {
    responseId: "C002-SUP-A",
    reviewer: "李评审",
    role: "reviewer_b",
    decision: "clarification",
    score: 0,
    comment: "安全负责人项目经历需补充合同页或验收证明。",
    createdAt: "2026-09-28T10:25:00+08:00",
    batchId: V2_BATCH_ID,
    lifecycle: "confirmed",
    basedOnMissingMaterial: true,
  },
  {
    responseId: "C003-SUP-A",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "compliant",
    score: 13,
    comment: "里程碑和交付物完整，风险缓冲充分。",
    createdAt: "2026-09-25T15:30:00+08:00",
    batchId: V1_BATCH_ID,
    lifecycle: "confirmed",
  },
  {
    responseId: "C003-SUP-A",
    reviewer: "李评审",
    role: "reviewer_b",
    decision: "compliant",
    score: 10,
    comment: "计划完整，但关键人员投入比例未量化。",
    createdAt: "2026-09-25T16:00:00+08:00",
    batchId: V1_BATCH_ID,
    lifecycle: "confirmed",
  },
  {
    responseId: "C004-SUP-B",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "compliant",
    score: 21,
    comment: "架构分层清晰，现有系统适配路径可验证。",
    createdAt: "2026-09-25T16:15:00+08:00",
    batchId: V1_BATCH_ID,
    lifecycle: "confirmed",
  },
  {
    responseId: "C004-SUP-B",
    reviewer: "李评审",
    role: "reviewer_b",
    decision: "deviation",
    score: 15,
    comment: "高可用部署缺少跨机房切换演练记录。",
    createdAt: "2026-09-25T16:40:00+08:00",
    batchId: V1_BATCH_ID,
    lifecycle: "confirmed",
  },
  {
    responseId: "C006-SUP-A",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "clarification",
    score: 0,
    comment: "国产化兼容性矩阵缺少中间件版本页，按缺材料暂列待澄清。",
    createdAt: "2026-10-04T11:02:00+08:00",
    batchId: V2_BATCH_ID,
    lifecycle: "provisional",
    basedOnMissingMaterial: true,
  },
  {
    responseId: "C009-SUP-C",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "deviation",
    score: 8,
    comment: "漏洞分级与四小时通报时限在初版材料中无制度依据。",
    createdAt: "2026-09-24T10:30:00+08:00",
    batchId: V1_BATCH_ID,
    lifecycle: "confirmed",
    basedOnMissingMaterial: true,
    reconsiderationId: "REC-001",
  },
  {
    responseId: "C009-SUP-C",
    reviewer: "李评审",
    role: "reviewer_b",
    decision: "clarification",
    score: 0,
    comment: "需补充重大漏洞四小时通报的流程截图。",
    createdAt: "2026-09-25T09:40:00+08:00",
    batchId: V1_BATCH_ID,
    lifecycle: "invalidated",
    basedOnMissingMaterial: true,
    invalidatedByClarificationId: "CL-003",
    invalidatedAt: "2026-09-27T14:20:00+08:00",
  },
  // 旧数据：未登记批次号，进入待核队列。
  {
    responseId: "C010-SUP-B",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "compliant",
    score: 16,
    comment: "驻场与培训方案完整，响应指标可量化，历史离线登记。",
    createdAt: "2026-09-23T17:20:00+08:00",
    batchId: "",
    lifecycle: "confirmed",
  },
];

interface SeedClarification extends Clarification {
  receiptBatchId?: string;
}

const clarifications: SeedClarification[] = [
  {
    id: "CL-001",
    responseId: "C002-SUP-A",
    clauseId: "C002",
    round: 1,
    requestText: "补充安全负责人近五年的同类项目合同页或验收证明。",
    requestedAt: "2026-09-27T09:00:00+08:00",
    dueAt: "2026-09-28T18:00:00+08:00",
    status: "overdue",
    batchId: V2_BATCH_ID,
  },
  {
    id: "CL-002",
    responseId: "C008-SUP-B",
    clauseId: "C008",
    round: 1,
    requestText: "提供等保测评结论页及有效期说明。",
    requestedAt: "2026-09-28T14:30:00+08:00",
    dueAt: "2026-10-02T18:00:00+08:00",
    status: "open",
    batchId: V2_BATCH_ID,
  },
  {
    id: "CL-003",
    responseId: "C009-SUP-C",
    clauseId: "C009",
    round: 2,
    requestText: "补充重大漏洞四小时通报的流程截图。",
    supplierResponse: "已补充值班表、升级路径和平台告警截图。",
    requestedAt: "2026-09-26T15:00:00+08:00",
    dueAt: "2026-09-28T18:00:00+08:00",
    respondedAt: "2026-09-27T14:20:00+08:00",
    status: "responded",
    batchId: V1_BATCH_ID,
    receiptBatchId: V2_BATCH_ID,
  },
  // 旧数据：回执未登记批次号，进入待核队列。
  {
    id: "CL-004",
    responseId: "C011-SUP-C",
    clauseId: "C011",
    round: 1,
    requestText: "补充验收指标复测方法与抽样比例说明。",
    supplierResponse: "历史离线登记：已随纸质文件补交，缺批次号。",
    requestedAt: "2026-09-22T10:00:00+08:00",
    dueAt: "2026-09-24T18:00:00+08:00",
    respondedAt: "2026-09-23T15:30:00+08:00",
    status: "responded",
    batchId: "",
  },
];

const reconsiderationItems: ReconsiderationItem[] = [
  {
    id: "REC-001",
    responseId: "C009-SUP-C",
    opinionId: "OP-C009-SUP-C-1",
    reviewer: "陈评审",
    batchId: V2_BATCH_ID,
    reason: "第 2 轮澄清回执已到达，原按缺材料作出的偏离裁定需结合新证据复议。",
    clarificationId: "CL-003",
    createdAt: "2026-09-27T14:20:00+08:00",
    status: "open",
  },
];

const legacyVerifications: LegacyVerification[] = [
  {
    id: "LEG-001",
    entityType: "opinion",
    entityId: "OP-C010-SUP-B-1",
    responseId: "C010-SUP-B",
    reason: "历史离线登记的评审意见缺少批次号，待核实后补登。",
    status: "pending",
    createdAt: "2026-09-29T08:10:00+08:00",
  },
  {
    id: "LEG-002",
    entityType: "clarification",
    entityId: "CL-004",
    responseId: "C011-SUP-C",
    reason: "供应商澄清回执为纸质归档补录，缺少批次号，待核实后补登。",
    status: "pending",
    createdAt: "2026-09-29T08:12:00+08:00",
  },
];

const makeResponse = (
  clause: Clause,
  supplierIndex: number,
  clauseIndex: number,
): SupplierResponse => {
  const supplier = suppliers[supplierIndex];
  const id = `${clause.id}-${supplier.id}`;
  const defaultStatus: ComplianceStatus =
    clause.type === "mandatory" ? "compliant" : "pending";
  const maxScore = clause.weight;
  const scorePattern = [
    Math.round(maxScore * 0.8),
    Math.round(maxScore * 0.72),
    Math.round(maxScore * 0.64),
  ];
  const override = responseOverrides[id] ?? {};
  const hasLegacyOpinion = reviewFactories.some(
    (item) => item.responseId === id && item.batchId === "",
  );
  const base: SupplierResponse = {
    id,
    clauseId: clause.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    status: override.status ?? defaultStatus,
    responseText:
      clause.type === "mandatory"
        ? `${supplier.name}已按采购要求提交说明与支持材料。`
        : `${supplier.name}提交响应正文，并声明可满足条款要求，分值依据需评审员复核。`,
    claimedScore: override.claimedScore ?? scorePattern[supplierIndex] ?? 0,
    attachmentName:
      override.attachmentName ??
      `${supplier.name}-${clause.code}-证明材料.pdf`,
    proofFingerprint:
      override.proofFingerprint ?? `PROOF-${clause.id}-${supplier.id}`,
    submittedBy: `${supplier.name}投标专员`,
    submittedAt: `2026-09-${String(22 + ((clauseIndex + supplierIndex) % 4)).padStart(2, "0")}T16:20:00+08:00`,
    reviewRound: 1,
    revision: 0,
    batchId: hasLegacyOpinion ? "" : V1_BATCH_ID,
    reviews: [],
    clarifications: [],
    drafts: [],
  };
  base.reviews = reviewFactories
    .filter((item) => item.responseId === id)
    .map((item, index) => {
      const { ...rest } = item;
      const opinion: ReviewerOpinion = {
        id: `OP-${id}-${index + 1}`,
        responseId: id,
        reviewer: rest.reviewer,
        role: rest.role,
        decision: rest.decision,
        score: rest.score,
        comment: rest.comment,
        createdAt: rest.createdAt,
        batchId: rest.batchId,
        lifecycle: rest.lifecycle,
        basedOnMissingMaterial: rest.basedOnMissingMaterial ?? false,
        revision: index + 1,
        invalidatedByClarificationId: rest.invalidatedByClarificationId,
        invalidatedAt: rest.invalidatedAt,
        reconsiderationId: rest.reconsiderationId,
      };
      return opinion;
    });
  base.revision = base.reviews.length;
  base.clarifications = clarifications
    .filter((item) => item.responseId === id)
    .map(({ receiptBatchId, ...item }) => {
      const clarification: Clarification = {
        ...item,
        ...(receiptBatchId ? { receiptBatchId } : {}),
      };
      return clarification;
    });
  // C011-SUP-C 仅含旧批次澄清，同样按旧数据缺批次号处理。
  if (id === "C011-SUP-C") {
    base.batchId = "";
  }
  return base;
};

const responses: SupplierResponse[] = clauses.flatMap((clause, clauseIndex) =>
  suppliers.map((_supplier, supplierIndex) =>
    makeResponse(clause, supplierIndex, clauseIndex),
  ),
);

const versions = [
  {
    id: "VER-001",
    version: "V1",
    label: "初审问题定位版本",
    status: "finalized" as const,
    createdAt: "2026-09-25T17:30:00+08:00",
    createdBy: "采购工作组",
    signedBy: ["采购负责人", "技术评审组长"],
    clauseCount: clauses.length,
    responseCount: responses.length,
    contentHash: "a84f2d17",
    batchId: V1_BATCH_ID,
  },
  {
    id: "VER-002",
    version: "V2",
    label: "澄清与评分复核工作版",
    status: "draft" as const,
    createdAt: "2026-09-29T08:10:00+08:00",
    createdBy: "采购工作组",
    signedBy: [],
    clauseCount: clauses.length,
    responseCount: responses.length,
    contentHash: "d91c6b42",
    batchId: V2_BATCH_ID,
  },
];

const auditLogs: AuditLog[] = [
  {
    id: "AUD-001",
    at: "2026-09-25T17:30:00+08:00",
    actor: "采购负责人",
    action: "版本定稿",
    entity: "VER-001",
    detail:
      "初审问题定位版本签署锁定，固化批次 BATCH-2026-09-25-V1，共覆盖 11 条技术条款。",
  },
  {
    id: "AUD-002",
    at: "2026-09-27T09:00:00+08:00",
    actor: "采购专员",
    action: "发起澄清",
    entity: "CL-001",
    detail: "要求华云数科补充关键人员项目经历证明。",
  },
  {
    id: "AUD-003",
    at: "2026-09-27T14:20:00+08:00",
    actor: "采购专员",
    action: "回执触发失效重算",
    entity: "CL-003",
    detail:
      "回执到达后，李评审同组未确认意见失效待重算；陈评审已确认偏离裁定保留并登记复议项 REC-001。",
  },
  {
    id: "AUD-004",
    at: "2026-09-29T08:12:00+08:00",
    actor: "系统",
    action: "旧数据待核",
    entity: "LEG-002",
    detail: "检测到缺批次号的澄清回执 CL-004，列入待核队列并阻断定稿。",
  },
];

/** 构造不含嵌套检查点的深拷贝，供批次快照与恢复使用。 */
export const stripCheckpoints = (
  database: ReviewDatabase,
): Omit<ReviewDatabase, "clauses" | "suppliers" | "auditLogs" | "batches"> => ({
  responses: structuredClone(
    database.responses.map((response) => ({ ...response })),
  ),
  versions: structuredClone(database.versions),
  reconsiderationItems: structuredClone(database.reconsiderationItems),
  legacyVerifications: structuredClone(database.legacyVerifications),
});

const buildSeed = (): ReviewDatabase => {
  const base: ReviewDatabase = {
    clauses: structuredClone(clauses),
    responses: structuredClone(responses),
    versions: structuredClone(versions),
    auditLogs: structuredClone(auditLogs),
    suppliers: structuredClone(suppliers),
    batches: [],
    reconsiderationItems: structuredClone(reconsiderationItems),
    legacyVerifications: structuredClone(legacyVerifications),
  };
  const v1Checkpoint: BatchCheckpoint = {
    capturedAt: "2026-09-29T08:10:00+08:00",
    // V1 是最近一个“完整批次”，其恢复点保存整套一致基线（全部历史响应、
    // 澄清回执、复议项与旧数据待核队列）。新批次导入失败时回到该基线，
    // 仅丢弃失败批次及尚未提交的运行时写入。
    responses: structuredClone(
      base.responses.map((response) => ({
        ...response,
        drafts: [] as OpinionDraft[],
      })),
    ),
    versions: structuredClone(base.versions),
    reconsiderationItems: structuredClone(base.reconsiderationItems),
    legacyVerifications: structuredClone(base.legacyVerifications),
  };
  const batches: ReviewBatch[] = [
    {
      id: V1_BATCH_ID,
      code: V1_BATCH_ID,
      label: "初审问题定位批次",
      status: "committed",
      createdAt: "2026-09-25T17:30:00+08:00",
      createdBy: "采购工作组",
      committedAt: "2026-09-25T17:30:00+08:00",
      checkpoint: v1Checkpoint,
      opinionCount: 0,
      clarificationCount: 0,
      responseCount: 0,
    },
    {
      id: V2_BATCH_ID,
      code: V2_BATCH_ID,
      label: "澄清与评分复核工作批次",
      status: "open",
      createdAt: "2026-09-29T08:10:00+08:00",
      createdBy: "采购工作组",
      opinionCount: 0,
      clarificationCount: 0,
      responseCount: 0,
    },
  ];
  base.batches = batches;
  return base;
};

export const LEGACY_BATCH_CODE = LEGACY_BATCH_ID;

class ReviewDataStore {
  private readonly runtimePath = join(
    process.cwd(),
    "server",
    "runtime-data.json",
  );
  private data: ReviewDatabase;

  constructor() {
    if (existsSync(this.runtimePath)) {
      try {
        const loaded = JSON.parse(
          readFileSync(this.runtimePath, "utf8"),
        ) as ReviewDatabase;
        const migrated = this.migrate(loaded);
        this.data = migrated;
        // 结构补齐后立即落盘，使迁移结果（含旧数据待核队列）可被后续恢复使用。
        writeFileSync(
          this.runtimePath,
          JSON.stringify(migrated, null, 2),
          "utf8",
        );
      } catch (error) {
        // 损坏或不可解析的运行时文件才回退种子；结构缺字段由 migrate 补齐。
        console.warn(
          "runtime-data.json 无法加载，已回退到种子数据：",
          error instanceof Error ? error.message : error,
        );
        this.data = buildSeed();
      }
    } else {
      this.data = buildSeed();
    }
  }

  /** 旧版 runtime-data.json 缺少批次字段时补齐，避免崩溃。 */
  private migrate(loaded: ReviewDatabase): ReviewDatabase {
    const database = loaded;
    database.batches ??= [];
    database.reconsiderationItems ??= [];
    database.legacyVerifications ??= [];
    // 迁移在模块加载期（reviewDataStore 实例化时）执行，不能引用文件后面
    // 才初始化的 const 工厂（TDZ），故使用本地 ID 生成器。
    const migrateLegacyId = (): string =>
      `LEG-MIG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const queueLegacy = (
      entityType: LegacyVerification["entityType"],
      entityId: string,
      responseId: string | undefined,
      reason: string,
    ): void => {
      const exists = database.legacyVerifications.some(
        (item) =>
          item.entityType === entityType && item.entityId === entityId,
      );
      if (!exists) {
        database.legacyVerifications.push({
          id: migrateLegacyId(),
          entityType,
          entityId,
          responseId,
          reason,
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      }
    };
    database.responses.forEach((response) => {
      response.batchId ??= "";
      response.revision ??= response.reviews.length;
      response.drafts ??= [];
      response.reviews.forEach((review) => {
        review.batchId ??= "";
        review.lifecycle ??= "confirmed";
        review.basedOnMissingMaterial ??= false;
        review.revision ??= response.revision;
        if (!review.batchId) {
          queueLegacy(
            "opinion",
            review.id,
            response.id,
            "迁移检测：历史评审意见缺少批次号，待核实后补登。",
          );
        }
      });
      response.clarifications.forEach((clarification) => {
        clarification.batchId ??= "";
        if (!clarification.batchId) {
          queueLegacy(
            "clarification",
            clarification.id,
            response.id,
            "迁移检测：历史澄清回执缺少批次号，待核实后补登。",
          );
        }
      });
      if (!response.batchId) {
        queueLegacy(
          "response",
          response.id,
          response.id,
          "迁移检测：供应商响应缺少批次号，待核实后补登。",
        );
      }
    });
    return database;
  }

  snapshot(): ReviewDatabase {
    return structuredClone(this.data);
  }

  mutate<T>(work: (database: ReviewDatabase) => T): T {
    const result = work(this.data);
    writeFileSync(
      this.runtimePath,
      JSON.stringify(this.data, null, 2),
      "utf8",
    );
    return result;
  }

  reset(): ReviewDatabase {
    this.data = buildSeed();
    writeFileSync(
      this.runtimePath,
      JSON.stringify(this.data, null, 2),
      "utf8",
    );
    return this.snapshot();
  }
}

export const reviewDataStore = new ReviewDataStore();

export const createAudit = (
  database: ReviewDatabase,
  actor: string,
  action: string,
  entity: string,
  detail: string,
): void => {
  database.auditLogs.unshift({
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    actor,
    action,
    entity,
    detail,
  });
};

export const createOpinionId = (): string =>
  `OP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const createClarificationId = (): string =>
  `CL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const createDraftId = (): string =>
  `DRF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const createReconsiderationId = (): string =>
  `REC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const createBatchId = (code: string): string =>
  code.trim().toUpperCase().startsWith("BATCH-")
    ? code.trim().toUpperCase()
    : `BATCH-${code.trim().toUpperCase()}`;

export const createLegacyId = (): string =>
  `LEG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
