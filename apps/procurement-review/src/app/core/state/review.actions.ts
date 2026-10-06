import { createActionGroup, emptyProps, props } from "@ngrx/store";
import type {
  AssessmentInput,
  BackfillBatchInput,
  ClauseFilters,
  ClarificationInput,
  ClarificationResponseInput,
  ConfirmOpinionInput,
  FinalizeVersionInput,
  ImportBatchInput,
  RecoverBatchInput,
  ResolveReconsiderationInput,
  ReviewRole,
  ReviewState,
} from "../models/review.models";

export const ReviewActions = createActionGroup({
  source: "Procurement Review",
  events: {
    "Load Review Data": emptyProps(),
    "Load Review Data Success": props<{
      workspace: Pick<
        ReviewState,
        | "clauses"
        | "versions"
        | "auditLogs"
        | "dashboard"
        | "suppliers"
        | "batches"
        | "reconsiderations"
        | "pendingBatchItems"
      >;
      toast?: string;
    }>(),
    "Load Review Data Failure": props<{ error: string }>(),
    "Set Role": props<{ role: ReviewRole }>(),
    "Set Filters": props<{ filters: Partial<ClauseFilters> }>(),
    "Toggle Supplier": props<{ supplierId: string }>(),
    "Clear Toast": emptyProps(),
    "Submit Assessment": props<{ input: AssessmentInput }>(),
    "Request Clarification": props<{ input: ClarificationInput }>(),
    "Respond Clarification": props<{ input: ClarificationResponseInput }>(),
    "Confirm Opinion": props<{ input: ConfirmOpinionInput }>(),
    "Resolve Reconsideration": props<{ input: ResolveReconsiderationInput }>(),
    "Import Batch": props<{ input: ImportBatchInput }>(),
    "Recover Batch": props<{ input: RecoverBatchInput }>(),
    "Backfill Batch Numbers": props<{ input: BackfillBatchInput }>(),
    "Finalize Version": props<{ input: FinalizeVersionInput }>(),
    "Reset Review Data": emptyProps(),
  },
});
