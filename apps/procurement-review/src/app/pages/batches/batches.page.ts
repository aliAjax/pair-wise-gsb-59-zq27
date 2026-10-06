import { DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { toSignal } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { Store } from "@ngrx/store";
import { ButtonModule } from "primeng/button";
import { DialogModule } from "primeng/dialog";
import { InputTextModule } from "primeng/inputtext";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { TextareaModule } from "primeng/textarea";
import {
  batchStatusLabels,
  legacyEntityLabels,
  roleProfiles,
  type BatchImportInput,
  type ImportClarificationInput,
  type ImportOpinionInput,
  type LegacyVerification,
  type ReconsiderationItem,
} from "../../core/models/review.models";
import { ReviewActions } from "../../core/state/review.actions";
import {
  selectBatches,
  selectInvalidatedResponses,
  selectLegacyVerifications,
  selectPendingDrafts,
  selectReconsiderationContexts,
  selectRole,
} from "../../core/state/review.selectors";
import {
  BatchStatusTagComponent,
  LegacyStatusTagComponent,
  LifecycleTagComponent,
  StatusTagComponent,
} from "../../shared/status-tag.component";

interface ImportPayload {
  batchCode: string;
  label: string;
  opinions: ImportOpinionInput[];
  clarifications: ImportClarificationInput[];
}

const IMPORT_TEMPLATE = `{
  "batchCode": "BATCH-2026-10-06-OFFLINE",
  "label": "线下复核意见归集批次",
  "opinions": [
    {
      "responseId": "C003-SUP-C",
      "reviewer": "陈评审",
      "role": "reviewer_a",
      "decision": "compliant",
      "score": 11,
      "comment": "离线复核：里程碑可核验，资源投入清晰。",
      "createdAt": "2026-10-06T10:00:00+08:00"
    }
  ],
  "clarifications": []
}`;

@Component({
  selector: "app-batches-page",
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TableModule,
    TagModule,
    TextareaModule,
    BatchStatusTagComponent,
    LegacyStatusTagComponent,
    LifecycleTagComponent,
    StatusTagComponent,
  ],
  templateUrl: "./batches.page.html",
  styleUrl: "./batches.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BatchesPage {
  private readonly store = inject(Store);

  readonly batches = toSignal(this.store.select(selectBatches), {
    initialValue: [],
  });
  readonly reconsiderations = toSignal(
    this.store.select(selectReconsiderationContexts),
    { initialValue: [] },
  );
  readonly pendingDrafts = toSignal(this.store.select(selectPendingDrafts), {
    initialValue: [],
  });
  readonly invalidated = toSignal(
    this.store.select(selectInvalidatedResponses),
    { initialValue: [] },
  );
  readonly legacyItems = toSignal(
    this.store.select(selectLegacyVerifications),
    { initialValue: [] },
  );
  readonly role = toSignal(this.store.select(selectRole), {
    initialValue: "reviewer_a",
  });

  readonly batchStatusLabels = batchStatusLabels;
  readonly legacyEntityLabels = legacyEntityLabels;

  readonly importVisible = signal(false);
  readonly resolveVisible = signal(false);
  readonly verifyVisible = signal(false);
  readonly importError = signal<string | undefined>(undefined);
  readonly selectedReconsideration = signal<ReconsiderationItem | null>(null);
  readonly selectedLegacy = signal<LegacyVerification | null>(null);

  readonly canImport = computed(() =>
    ["procurement", "chair"].includes(this.role()),
  );
  readonly canResolve = computed(() => this.role() === "chair");
  readonly canVerify = computed(() =>
    ["procurement", "chair"].includes(this.role()),
  );

  readonly openReconsiderationCount = computed(
    () => this.reconsiderations().filter((item) => item.status === "open").length,
  );
  readonly pendingLegacyCount = computed(
    () =>
      this.legacyItems().filter(
        (item) => item.status === "pending" || item.status === "unverifiable",
      ).length,
  );

  entityLabel(type: LegacyVerification["entityType"]): string {
    return legacyEntityLabels[type];
  }

  readonly importForm = new FormGroup({
    payload: new FormControl(IMPORT_TEMPLATE, {
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

  readonly verifyForm = new FormGroup({
    batchId: new FormControl("", { nonNullable: true }),
  });

  openImport(): void {
    this.importVisible.set(true);
    this.importError.set(undefined);
  }

  submitImport(): void {
    if (!this.canImport() || this.importForm.invalid) {
      this.importForm.markAllAsTouched();
      return;
    }
    let payload: ImportPayload;
    try {
      payload = JSON.parse(this.importForm.controls.payload.value) as ImportPayload;
    } catch {
      this.importError.set("JSON 格式无法解析，请按模板检查批次内容。");
      return;
    }
    if (!payload.batchCode?.trim()) {
      this.importError.set("缺少 batchCode 批次编号。");
      return;
    }
    if (!payload.label?.trim()) {
      this.importError.set("缺少 label 批次名称。");
      return;
    }
    const input: BatchImportInput = {
      batchCode: payload.batchCode,
      label: payload.label,
      actor: roleProfiles[this.role()].name,
      opinions: payload.opinions ?? [],
      clarifications: payload.clarifications ?? [],
    };
    if (input.opinions.length === 0 && input.clarifications.length === 0) {
      this.importError.set("批次中没有任何意见或澄清记录。");
      return;
    }
    this.importError.set(undefined);
    this.store.dispatch(ReviewActions.importReviewBatch({ input }));
    this.importVisible.set(false);
  }

  openResolve(item: ReconsiderationItem): void {
    this.selectedReconsideration.set(item);
    this.resolveForm.reset({ resolution: "" });
    this.resolveVisible.set(true);
  }

  submitResolve(): void {
    const item = this.selectedReconsideration();
    if (!item || !this.canResolve() || this.resolveForm.invalid) {
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

  openVerify(item: LegacyVerification): void {
    this.selectedLegacy.set(item);
    this.verifyForm.reset({ batchId: "" });
    this.verifyVisible.set(true);
  }

  submitVerify(): void {
    const item = this.selectedLegacy();
    if (!item || !this.canVerify()) {
      return;
    }
    const batchId = this.verifyForm.controls.batchId.value.trim();
    this.store.dispatch(
      ReviewActions.verifyLegacyItem({
        input: {
          legacyId: item.id,
          actor: roleProfiles[this.role()].name,
          role: this.role(),
          ...(batchId ? { batchId } : {}),
        },
      }),
    );
    this.verifyVisible.set(false);
  }

  applyDraft(draftId: string): void {
    const item = this.pendingDrafts().find(
      (entry) => entry.draft.id === draftId,
    );
    if (!item) {
      return;
    }
    this.store.dispatch(
      ReviewActions.applyDraft({
        input: {
          draftId,
          actor: roleProfiles[this.role()].name,
          role: this.role(),
          baseRevision: item.response.revision,
        },
      }),
    );
  }

  discardDraft(draftId: string): void {
    this.store.dispatch(
      ReviewActions.discardDraft({
        input: {
          draftId,
          actor: roleProfiles[this.role()].name,
          role: this.role(),
        },
      }),
    );
  }
}
