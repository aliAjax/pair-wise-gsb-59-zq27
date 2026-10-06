# 公共采购技术响应符合性评审平台

基于 Angular、PrimeNG、NgRx、Angular Router、Apollo Angular、GraphQL、Nx 和 TypeScript 实现。前端不会用普通 JSON 占位接口，而是通过 Apollo Angular 对本地 GraphQL mock server 发起真实查询和 mutation。

## 功能

- 评审概览：否决项遗漏、评审覆盖、评分分歧、逾期澄清、重复证明、当前版本和可恢复批次指标。
- 条款评审：技术条款树、供应商响应、证明文件、独立评审意见、评分、意见确认和澄清发起。
- 批量比对：动态供应商列、评分差异定位、证明复用提示，以及失效意见与并发草稿标记。
- 可恢复批次：供应商澄清回执、独立评审意见和定稿统一按批次登记并保存检查点。
  - **回执驱动重算**：回执更新后，同组"待确认"（按缺材料作出的）意见立即标记为已失效并重算；"已确认"意见保留原裁定，自动生成复议项。
  - **乐观并发**：两名评审员同时提交时，先到者占用响应修订号；后到者意见保留为草稿并显示与先到者的差异，可按最新修订应用或丢弃。
  - **批次导入恢复**：批量导入整批校验、事务提交；新批次任一条目不合法即回滚到最近一个完整批次检查点。相同批次编号重复导入时，已存在条目跳过、仅补缺项；失败批次修正后可重导恢复。
  - **旧数据待核**：缺少批次号的历史响应、意见和回执先进入待核队列，核实后补登批次；引用断裂补不齐的持续拦截定稿。
- 小组复核：保留各评审员独立意见，显示评分区间、分歧处理队列和复议项。
- 澄清轮次：发起澄清、登记回复（回执）、轮次和期限校验，未完成项目阻止定稿。
- 评审版本：创建并锁定定稿快照，保存内容哈希、响应数量、签署人和固化批次；定稿前强制校验未完成澄清、失效意见重算与旧数据批次号。
- 角色分权：采购人员、评审员 A、评审员 B 和评审组长的操作入口按角色限制。
- 审计导出：GraphQL mutation 和版本操作写入审计日志，支持 JSON、CSV 导出。

## 技术栈

- Angular 22 standalone
- PrimeNG 22
- NgRx Store / Effects
- Angular Router
- Apollo Angular + GraphQL
- Nx workspace
- TypeScript 6
- Apollo Server 5 mock schema/server

## 本地 GraphQL

mock server 位于 `server/`，GraphQL 地址为 `http://127.0.0.1:18462/graphql`。schema 和 resolver 定义在 `server/schema.ts`、`server/server.ts`，初始数据位于 `server/data.ts`，运行时 mutation 会写入被 Git 忽略的 `server/runtime-data.json`。

## 运行

```bash
npm install
npm run dev
```

- 前端：`http://localhost:18459`
- GraphQL：`http://127.0.0.1:18462/graphql`

## 构建

```bash
npm run build
```

构建由 `nx build procurement-review` 执行 Angular application builder，并包含 TypeScript 与 Angular 模板严格检查。
