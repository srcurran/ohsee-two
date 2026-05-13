/** Pure helpers for the test-settings overlay step list — kept out of the
 * component so multiple sub-views can share the display logic without
 * importing JSX. */

import type { TestStep } from "@/lib/types";

/** Display label for a step in the steps list and the deleted-undo row. */
export function stepLabel(step: TestStep): string {
  if (step.type === "url") return step.url || "(empty path)";
  return step.name || "(unnamed script)";
}
