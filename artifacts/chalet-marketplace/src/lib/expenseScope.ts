export type ExpenseScope =
  | { type: "all" }
  | { type: "chalet"; submissionId?: number | null }
  | { type: "service"; id: number };

interface ScopedExpense {
  submissionId: number | null;
  providerId?: number | null;
  category: string;
}

/** Salaries belong to the owner, not a single property/provider. Do not hide them in unit views. */
export function isExpenseInScope(expense: ScopedExpense, scope: ExpenseScope) {
  if (scope.type === "all") return true;
  const ownerLevel = expense.submissionId == null && expense.providerId == null;
  if (scope.type === "service") {
    return expense.providerId === scope.id || (ownerLevel && expense.category === "salaries");
  }
  return scope.submissionId != null && expense.providerId == null &&
    (expense.submissionId == null || expense.submissionId === scope.submissionId);
}
