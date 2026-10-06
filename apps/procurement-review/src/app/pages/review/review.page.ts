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
  roleProfiles,
  type Clarification,
  type Clause,
  type ReconsiderationItem,
  type SupplierResponse,
} from "../../core/models/review.models";
import { ReviewActions } from "../../core/state/review.actions";
import {
  activeOpinions,
  hasReviewDifference,
  invalidatedOpinions,
  selectClauses,
  selectPendingClarifications,
  selectBlockingLegacyItems,
  selectReconsiderationContexts,
  selectRole,
  selectVersions,
} from "../../core/state/review.selectors";
import {
  ClarificationTagComponent,
  LifecycleTagComponent,
  StatusTagComponent,
  VersionTagComponent,
} from "../../shared/status-tag.component";

interface PendingClarification {
  clause: Clause;
  response: SupplierResponse;
  clarification: Clarification;
}

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
    ClarificationTagComponent,
    LifecycleTagComponent,
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
  readonly pendingClarifications = toSignal(
    this.store.select(selectPendingClarifications),
    { initialValue: [] as PendingClarification[] },
  );
  readonly reconsiderations = toSignal(
    this.store.select(selectReconsiderationContexts),
    { initialValue: [] },
  );
  readonly blockingLegacyItems = toSignal(
    this.store.select(selectBlockingLegacyItems),
    { initialValue: [] },
  );
  readonly finalizeVisible = signal(false);
  readonly responseVisible = signal(false);
  readonly resolveVisible = signal(false);
  readonly selectedClarification = signal<PendingClarification | null>(null);
  readonly selectedReconsideration = signal<ReconsiderationItem | null>(null);
  readonly canFinalize = computed(() => this.role() === "chair");
  readonly canRespond = computed(() =>
    ["procurement", "chair"].includes(this.role()),
  );
  readonly canResolve = computed(() => this.role() === "chair");
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

  /** 回执失效后仍未重算（无更新有效意见）的响应。 */
  readonly unrecalculated = computed(() =>
    this.clauses().flatMap((clause) =>
      clause.responses
        .filter((response) => {
          const invalidated = invalidatedOpinions(response);
          if (invalidated.length === 0) {
            return false;
          }
          return invalidated.some((opinion) => {
            const replacedAt = opinion.invalidatedAt
              ? Date.parse(opinion.invalidatedAt)
              : Date.parse(opinion.createdAt);
            return !activeOpinions(response).some(
              (candidate) =>
                candidate.reviewer === opinion.reviewer &&
                Date.parse(candidate.createdAt) >= replacedAt,
            );
          });
        })
        .map((response) => ({ clause, response })),
    ),
  );

  readonly finalizeBlockers = computed(() => {
    const blockers: string[] = [];
    if (this.pendingClarifications().length) {
      blockers.push(
        `${this.pendingClarifications().length} 项澄清未回复或已逾期`,
      );
    }
    if (this.blockingLegacyItems().length) {
      blockers.push(
        `${this.blockingLegacyItems().length} 项旧数据缺批次号待核（补不齐同样拦截）`,
      );
    }
    if (this.unrecalculated().length) {
      blockers.push(
        `${this.unrecalculated().length} 个响应存在失效意见尚未重算`,
      );
    }
    return blockers;
  });

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
}
