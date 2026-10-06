import { createActionGroup, emptyProps, props } from "@ngrx/store";
import type {
  ApplyDraftInput,
  BatchImportInput,
  ClauseFilters,
  ClarificationInput,
  ClarificationResponseInput,
  ConfirmAssessmentInput,
  DiscardDraftInput,
  FinalizeVersionInput,
  ResolveReconsiderationInput,
  ReviewRole,
  ReviewState,
  VerifyLegacyItemInput,
} from "../models/review.models";

type WorkspaceSlice = Pick<
  ReviewState,
  | "clauses"
  | "versions"
  | "auditLogs"
  | "dashboard"
  | "suppliers"
  | "batches"
  | "reconsiderations"
  | "legacyVerifications"
>;

export const ReviewActions = createActionGroup({
  source: "Procurement Review",
  events: {
    "Load Review Data": emptyProps(),
    "Load Review Data Success": props<{
      workspace: WorkspaceSlice;
      toast?: string;
      toastSeverity?: "success" | "warn" | "error";
    }>(),
    "Load Review Data Failure": props<{ error: string }>(),
    "Set Role": props<{ role: ReviewRole }>(),
    "Set Filters": props<{ filters: Partial<ClauseFilters> }>(),
    "Toggle Supplier": props<{ supplierId: string }>(),
    "Clear Toast": emptyProps(),
    "Submit Assessment": props<{ input: import("../models/review.models").AssessmentInput }>(),
    "Request Clarification": props<{ input: ClarificationInput }>(),
    "Respond Clarification": props<{ input: ClarificationResponseInput }>(),
    "Confirm Assessment": props<{ input: ConfirmAssessmentInput }>(),
    "Discard Draft": props<{ input: DiscardDraftInput }>(),
    "Apply Draft": props<{ input: ApplyDraftInput }>(),
    "Resolve Reconsideration": props<{ input: ResolveReconsiderationInput }>(),
    "Verify Legacy Item": props<{ input: VerifyLegacyItemInput }>(),
    "Import Review Batch": props<{ input: BatchImportInput }>(),
    "Finalize Version": props<{ input: FinalizeVersionInput }>(),
    "Reset Review Data": emptyProps(),
  },
});
