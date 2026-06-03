interface Props {
  count: number;
  /** No screenshot / no data captured → a neutral em-dash badge. */
  noData?: boolean;
  /** Badge scale. Omitted = the default 22px card badge. */
  size?: "lg" | "xl";
  /** `solid` (default) = filled background; `tint` = soft tinted background. */
  tone?: "solid" | "tint";
  /** Count shown as `N+` past this. Default 50. */
  cap?: number;
}

/**
 * The change-count badge — one component for every place a page's change
 * total appears (cards, the detail-panel header, the page-route header). The
 * universal-vs-viewport-specific breakdown lives in the change list / dots;
 * here the user just wants the total at a glance.
 *
 *   none → neutral em-dash · 0 → success · >0 → warning (`N+` past `cap`)
 */
export default function ChangeBadge({ count, noData, size, tone = "solid", cap = 50 }: Props) {
  const cls = ["badge"];
  if (size) cls.push(`badge--${size}`);

  if (noData) {
    cls.push("badge--neutral");
    return <span className={cls.join(" ")}>&mdash;</span>;
  }

  const changed = count > 0;
  cls.push(
    tone === "tint"
      ? "badge--tint"
      : changed ? "badge--warning" : "badge--success",
  );
  return <span className={cls.join(" ")}>{count > cap ? `${cap}+` : count}</span>;
}
