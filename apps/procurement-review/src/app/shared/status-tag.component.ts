import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { TagModule } from "primeng/tag";
import type {
  BatchStatus,
  ClauseType,
  ClarificationStatus,
  ComplianceStatus,
  OpinionStatus,
  ReconsiderationStatus,
  VersionStatus,
} from "../core/models/review.models";

type Severity =
  | "success"
  | "secondary"
  | "info"
  | "warn"
  | "danger"
  | "contrast";

const statusConfig: Record<
  ComplianceStatus,
  { label: string; severity: Severity }
> = {
  compliant: { label: "符合", severity: "success" },
  deviation: { label: "偏离", severity: "danger" },
  clarification: { label: "待澄清", severity: "warn" },
  pending: { label: "待评审", severity: "secondary" },
};

const typeConfig: Record<
  ClauseType,
  { label: string; severity: Severity }
> = {
  mandatory: { label: "否决项", severity: "danger" },
  scoring: { label: "评分项", severity: "info" },
  evidence: { label: "证明项", severity: "secondary" },
};

const clarificationConfig: Record<
  ClarificationStatus,
  { label: string; severity: Severity }
> = {
  open: { label: "待回复", severity: "warn" },
  responded: { label: "已回复", severity: "success" },
  overdue: { label: "已逾期", severity: "danger" },
};

const versionConfig: Record<
  VersionStatus,
  { label: string; severity: Severity }
> = {
  draft: { label: "工作版", severity: "warn" },
  finalized: { label: "已定稿", severity: "success" },
};

const opinionConfig: Record<
  OpinionStatus,
  { label: string; severity: Severity }
> = {
  submitted: { label: "已提交", severity: "info" },
  confirmed: { label: "已确认", severity: "success" },
  invalidated: { label: "已失效", severity: "danger" },
  conflict: { label: "冲突草稿", severity: "warn" },
};

const batchConfig: Record<BatchStatus, { label: string; severity: Severity }> =
  {
    complete: { label: "完整", severity: "success" },
    failed: { label: "失败", severity: "danger" },
    recovered: { label: "已恢复", severity: "info" },
  };

const reconsiderationConfig: Record<
  ReconsiderationStatus,
  { label: string; severity: Severity }
> = {
  open: { label: "待复议", severity: "warn" },
  resolved: { label: "已办结", severity: "success" },
};

@Component({
  selector: "app-status-tag",
  imports: [TagModule],
  template: `<p-tag [value]="label()" [severity]="severity()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusTagComponent {
  readonly status = input<ComplianceStatus>("pending");

  label(): string {
    return statusConfig[this.status()].label;
  }

  severity(): Severity {
    return statusConfig[this.status()].severity;
  }
}

@Component({
  selector: "app-clause-type-tag",
  imports: [TagModule],
  template: `<p-tag [value]="label()" [severity]="severity()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClauseTypeTagComponent {
  readonly type = input<ClauseType>("mandatory");

  label(): string {
    return typeConfig[this.type()].label;
  }

  severity(): Severity {
    return typeConfig[this.type()].severity;
  }
}

@Component({
  selector: "app-clarification-tag",
  imports: [TagModule],
  template: `<p-tag [value]="label()" [severity]="severity()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClarificationTagComponent {
  readonly status = input<ClarificationStatus>("open");

  label(): string {
    return clarificationConfig[this.status()].label;
  }

  severity(): Severity {
    return clarificationConfig[this.status()].severity;
  }
}

@Component({
  selector: "app-version-tag",
  imports: [TagModule],
  template: `<p-tag [value]="label()" [severity]="severity()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionTagComponent {
  readonly status = input<VersionStatus>("draft");

  label(): string {
    return versionConfig[this.status()].label;
  }

  severity(): Severity {
    return versionConfig[this.status()].severity;
  }
}

@Component({
  selector: "app-opinion-tag",
  imports: [TagModule],
  template: `<p-tag [value]="label()" [severity]="severity()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpinionTagComponent {
  readonly status = input<OpinionStatus>("submitted");

  label(): string {
    return opinionConfig[this.status()].label;
  }

  severity(): Severity {
    return opinionConfig[this.status()].severity;
  }
}

@Component({
  selector: "app-batch-tag",
  imports: [TagModule],
  template: `<p-tag [value]="label()" [severity]="severity()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchTagComponent {
  readonly status = input<BatchStatus>("complete");

  label(): string {
    return batchConfig[this.status()].label;
  }

  severity(): Severity {
    return batchConfig[this.status()].severity;
  }
}

@Component({
  selector: "app-reconsideration-tag",
  imports: [TagModule],
  template: `<p-tag [value]="label()" [severity]="severity()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReconsiderationTagComponent {
  readonly status = input<ReconsiderationStatus>("open");

  label(): string {
    return reconsiderationConfig[this.status()].label;
  }

  severity(): Severity {
    return reconsiderationConfig[this.status()].severity;
  }
}
