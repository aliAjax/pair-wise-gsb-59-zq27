import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { toSignal } from "@angular/core/rxjs-interop";
import { Store } from "@ngrx/store";
import { ButtonModule } from "primeng/button";
import { DialogModule } from "primeng/dialog";
import { InputTextModule } from "primeng/inputtext";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { TextareaModule } from "primeng/textarea";
import {
  batchItemKindLabels,
  batchSourceLabels,
  roleProfiles,
  type BatchImportItemInput,
  type BatchItemKind,
  type BatchSource,
  type Clarification,
  type Clause,
  type ReconsiderationItem,
  type SupplierResponse,
} from "../../core/models/review.models";
import { ReviewActions } from "../../core/state/review.actions";
import {
  hasReviewDifference,
  selectBatches,
  selectClauses,
  selectConflictDrafts,
  selectFinalizeBlockers,
  selectOpenReconsiderations,
  selectPendingBatchItems,
  selectPendingClarifications,
  selectReconsiderations,
  selectRole,
  selectStaleRecalcResponses,
  selectVersions,
} from "../../core/state/review.selectors";
import {
  BatchTagComponent,
  ClarificationTagComponent,
  OpinionTagComponent,
  ReconsiderationTagComponent,
  StatusTagComponent,
  VersionTagComponent,
} from "../../shared/status-tag.component";

interface PendingClarification {
  clause: Clause;
  response: SupplierResponse;
  clarification: Clarification;
}

const IMPORT_EXAMPLE = `[
  {
    "kind": "opinion",
    "externalId": "EXT-OP-001",
    "responseId": "C003-SUP-B",
    "reviewer": "陈评审",
    "role": "reviewer_a",
    "decision": "compliant",
    "score": 12,
    "comment": "里程碑计划完整，资源投入可核验。"
  },
  {
    "kind": "receipt",
    "externalId": "EXT-RC-001",
    "clarificationId": "CL-002",
    "responseText": "已补充等保测评结论页及有效期说明。"
  }
]`;

@Component({
  selector: "app-review-page",
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TableModule,
    TagModule,
    TextareaModule,
    BatchTagComponent,
    ClarificationTagComponent,
    OpinionTagComponent,
    ReconsiderationTagComponent,
    StatusTagComponent,
    VersionTagComponent,
  ],
  templateUrl: "./review.page.html",
  styleUrl: "./review.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewPage {
  private readonly store = inject(Store);

  readonly versions = toSignal(this.store.select(selectVersions), {
    initialValue: [],
  });
  readonly clauses = toSignal(this.store.select(selectClauses), {
    initialValue: [],
  });
  readonly role = toSignal(this.store.select(selectRole), {
    initialValue: "reviewer_a",
  });
  readonly batches = toSignal(this.store.select(selectBatches), {
    initialValue: [],
  });
  readonly reconsiderations = toSignal(
    this.store.select(selectReconsiderations),
    { initialValue: [] },
  );
  readonly openReconsiderations = toSignal(
    this.store.select(selectOpenReconsiderations),
    { initialValue: [] },
  );
  readonly pendingBatchItems = toSignal(
    this.store.select(selectPendingBatchItems),
    { initialValue: [] },
  );
  readonly staleRecalc = toSignal(this.store.select(selectStaleRecalcResponses), {
    initialValue: [],
  });
  readonly conflictDrafts = toSignal(this.store.select(selectConflictDrafts), {
    initialValue: [],
  });
  readonly finalizeBlockers = toSignal(this.store.select(selectFinalizeBlockers), {
    initialValue: [],
  });
  readonly pendingClarifications = toSignal(
    this.store.select(selectPendingClarifications),
    { initialValue: [] as PendingClarification[] },
  );
  readonly finalizeVisible = signal(false);
  readonly responseVisible = signal(false);
  readonly importVisible = signal(false);
  readonly resolveVisible = signal(false);
  readonly selectedClarification = signal<PendingClarification | null>(null);
  readonly selectedReconsideration = signal<ReconsiderationItem | null>(null);
  readonly importError = signal<string | null>(null);
  readonly canFinalize = computed(() => this.role() === "chair");
  readonly canRespond = computed(() =>
    ["procurement", "chair"].includes(this.role()),
  );
  readonly canManageBatches = computed(() =>
    ["procurement", "chair"].includes(this.role()),
  );
  readonly differences = computed(() =>
    this.clauses().flatMap((clause) =>
      clause.responses
        .filter(hasReviewDifference)
        .map((response) => ({ clause, response })),
    ),
  );
  readonly finalizedCount = computed(
    () => this.versions().filter((version) => version.status === "finalized").length,
  );
  readonly failedCount = computed(
    () => this.batches().filter((batch) => batch.status === "failed").length,
  );

  readonly importExample = IMPORT_EXAMPLE;

  sourceLabel(source: BatchSource): string {
    return batchSourceLabels[source];
  }

  kindLabel(kind: BatchItemKind): string {
    return batchItemKindLabels[kind];
  }

  readonly finalizeForm = new FormGroup({
    label: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(4)],
    }),
  });
  readonly responseForm = new FormGroup({
    responseText: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)],
    }),
  });
  readonly importForm = new FormGroup({
    label: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(4)],
    }),
    payload: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly resolveForm = new FormGroup({
    resolution: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)],
    }),
  });

  openFinalize(): void {
    this.finalizeForm.reset({ label: "技术响应符合性评审汇总" });
    this.finalizeVisible.set(true);
  }

  finalizeVersion(): void {
    if (!this.canFinalize() || this.finalizeForm.invalid) {
      this.finalizeForm.markAllAsTouched();
      return;
    }
    this.store.dispatch(
      ReviewActions.finalizeVersion({
        input: {
          label: this.finalizeForm.controls.label.value,
          actor: roleProfiles[this.role()].name,
          role: this.role(),
        },
      }),
    );
    this.finalizeVisible.set(false);
  }

  openResponse(item: PendingClarification): void {
    this.selectedClarification.set(item);
    this.responseForm.reset({ responseText: "" });
    this.responseVisible.set(true);
  }

  respondClarification(): void {
    const item = this.selectedClarification();
    if (
      !item ||
      !this.canRespond() ||
      this.responseForm.invalid
    ) {
      this.responseForm.markAllAsTouched();
      return;
    }
    this.store.dispatch(
      ReviewActions.respondClarification({
        input: {
          clarificationId: item.clarification.id,
          responseText: this.responseForm.controls.responseText.value,
          actor: roleProfiles[this.role()].name,
        },
      }),
    );
    this.responseVisible.set(false);
  }

  openImport(): void {
    this.importForm.reset({ label: "", payload: "" });
    this.importError.set(null);
    this.importVisible.set(true);
  }

  fillImportExample(): void {
    this.importForm.controls.payload.setValue(this.importExample);
  }

  importBatch(): void {
    if (!this.canManageBatches() || this.importForm.invalid) {
      this.importForm.markAllAsTouched();
      return;
    }
    let items: BatchImportItemInput[];
    try {
      const parsed: unknown = JSON.parse(this.importForm.controls.payload.value);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        this.importError.set("导入内容必须是非空 JSON 数组。");
        return;
      }
      items = parsed as BatchImportItemInput[];
    } catch {
      this.importError.set("JSON 解析失败，请检查导入内容格式。");
      return;
    }
    this.importError.set(null);
    this.store.dispatch(
      ReviewActions.importBatch({
        input: {
          label: this.importForm.controls.label.value,
          actor: roleProfiles[this.role()].name,
          role: this.role(),
          items,
        },
      }),
    );
    this.importVisible.set(false);
  }

  recoverBatch(batchId: string): void {
    this.store.dispatch(
      ReviewActions.recoverBatch({
        input: {
          batchId,
          actor: roleProfiles[this.role()].name,
        },
      }),
    );
  }

  backfillBatchNumbers(): void {
    if (!this.canManageBatches()) {
      return;
    }
    this.store.dispatch(
      ReviewActions.backfillBatchNumbers({
        input: {
          actor: roleProfiles[this.role()].name,
          role: this.role(),
        },
      }),
    );
  }

  openResolve(item: ReconsiderationItem): void {
    this.selectedReconsideration.set(item);
    this.resolveForm.reset({ resolution: "" });
    this.resolveVisible.set(true);
  }

  resolveReconsideration(): void {
    const item = this.selectedReconsideration();
    if (!item || !this.canFinalize() || this.resolveForm.invalid) {
      this.resolveForm.markAllAsTouched();
      return;
    }
    this.store.dispatch(
      ReviewActions.resolveReconsideration({
        input: {
          reconsiderationId: item.id,
          resolution: this.resolveForm.controls.resolution.value,
          actor: roleProfiles[this.role()].name,
          role: this.role(),
        },
      }),
    );
    this.resolveVisible.set(false);
  }
}
