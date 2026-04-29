export interface TestVariant {
  id: string;
  label: string;
  colorScheme?: "light" | "dark";
  /** JS to run before every page load (via context.addInitScript) */
  initScript?: string;
}

export interface SiteTest {
  id: string;
  name: string;
  pages: PageEntry[];
  flows: FlowEntry[];
  /** Micro-test compositions (new-style flows using reusable script steps) */
  compositions?: TestComposition[];
  /** Unified ordered steps (URLs + Playwright micro-tests) — preferred shape
   *  for new tests. When present, supersedes pages + compositions for both
   *  the UI and the runner. Lazily derived from pages + compositions on
   *  first read for legacy tests via lib/test-steps.ts. */
  steps?: TestStep[];
  /** Breakpoints for this test (uses user/global defaults if omitted) */
  breakpoints?: number[];
  /** Optional theme/variant captures (e.g., light + dark) */
  variants?: TestVariant[];
  /** Soft-deleted / hidden from sidebar; restorable from project Danger Zone. */
  archived?: boolean;
  /** Per-test auth/credentials configuration. Replaces the project-level
   *  requiresAuth flag so different tests can target different identities. */
  credentials?: TestCredentials;
  createdAt: string;
  lastRunAt: string | null;
}

/**
 * A single step in a test's unified `steps[]` list. URL steps and microtest
 * steps share the same shape with a discriminator — under the hood, a URL
 * step is just a simplified Playwright step (`page.goto(url)`).
 *
 * The "microtest" type historically referenced a separate MicroTest record
 * stored on `project.microTests`. That collection was inlined: `script` and
 * `name` now live directly on the step. `microTestId` is preserved only for
 * legacy records that haven't been read through `readProjectsWithMigration`
 * yet.
 */
export interface TestStep {
  id: string;
  type: "url" | "microtest";
  /** Whether to capture a screenshot at the end of this step. Defaults to
   *  true; set false to use the step purely as a setup/navigation action. */
  captureScreenshot?: boolean;
  /** url-step: the absolute or path-relative URL to navigate to. Path-only
   *  values are resolved against the project's prod/dev base at run time. */
  url?: string;
  /** microtest-step: inline Playwright script body. Receives `page` and
   *  `expect` as arguments. */
  script?: string;
  /** microtest-step: display label shown in the steps list and used in
   *  error messages / screenshot filenames. */
  name?: string;
  /** Legacy: pre-inlining microtest reference. Migrated to inline script+name
   *  on first read; kept for backward-compat if migration hasn't run. */
  microTestId?: string;
}

/**
 * Per-test credentials configuration. Mirrors the project-level requiresAuth
 * model (mints a NextAuth session cookie via mintSessionCookie) but keyed
 * per-test so different tests can run as different identities.
 */
export interface TestCredentials {
  /** When true, the runner mints + injects a session cookie before captures. */
  enabled?: boolean;
  /** Reuse another test's credentials (shared identity). When set, the
   *  runner reads that test's credentials instead. */
  copyFromTestId?: string;
  /** Optional vault entry id (Electron only) — names a stored identity. */
  vaultEntryId?: string;
}

export interface Project {
  id: string;
  /** Display name for the project (falls back to domain if omitted) */
  name?: string;
  prodUrl: string;
  devUrl: string;
  /** @deprecated Use tests[].pages instead. Kept for backward compat during migration. */
  pages: PageEntry[];
  createdAt: string;
  lastDiffAt: string | null;
  /** @deprecated Auth is now handled via micro-test scripts. */
  requiresAuth?: boolean;
  /** @deprecated Use tests[].variants instead. Kept for backward compat during migration. */
  variants?: TestVariant[];
  /** @deprecated Use tests[].breakpoints instead. Kept for backward compat during migration. */
  breakpoints?: number[];
  /** Soft-deleted / hidden from sidebar */
  archived?: boolean;
  /** @deprecated Use tests[].flows instead. Kept for backward compat during migration. */
  flows?: FlowEntry[];
  /** Named tests for this site. Each test has its own pages + flows. */
  tests?: SiteTest[];
  /** @deprecated Inlined onto step.script by readProjectsWithMigration on
   *  first read; kept on the type for migration compatibility only. New
   *  records do not write this field. */
  microTests?: MicroTest[];
}

export interface UserSettings {
  /** Default breakpoints for new projects */
  defaultBreakpoints: number[];
  /** Persisted sidebar project order */
  projectOrder?: string[];
  /** Default variants for new projects */
  defaultVariants?: string[];
  /** Whether to show a native notification when a report run completes. */
  alertNotifications?: boolean;
}

export interface PageEntry {
  id: string;
  path: string;
}

// --- Micro-test types ---

export interface MicroTest {
  id: string;
  /** Short identifier used in code references */
  name: string;
  /** Human-readable label shown in the UI */
  displayName: string;
  /** The function body — receives `page` (Playwright Page) as its argument */
  script: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestCompositionStep {
  id: string;
  /** Inline Playwright script body — receives `page` + `expect`. */
  script?: string;
  /** Display label used in error messages + screenshot filenames. */
  name?: string;
  /** Legacy reference to a project.microTests entry. Inlined on read. */
  microTestId?: string;
  /** Whether to capture a screenshot after this step completes */
  captureScreenshot: boolean;
}

export interface TestComposition {
  id: string;
  name: string;
  startPath: string;
  steps: TestCompositionStep[];
}

// --- Flow types ---

export type FlowAction =
  | { id: string; type: "click"; selector: string; captureScreenshot?: boolean }
  | { id: string; type: "fill"; selector: string; value: string; captureScreenshot?: boolean }
  | { id: string; type: "wait"; ms: number; captureScreenshot?: boolean }
  | { id: string; type: "waitForSelector"; selector: string; captureScreenshot?: boolean }
  | { id: string; type: "navigate"; path: string; captureScreenshot?: boolean }
  | { id: string; type: "screenshot"; label: string };

export interface FlowEntry {
  id: string;
  name: string;
  startPath: string;
  steps: FlowAction[];
}

export interface Report {
  id: string;
  projectId: string;
  /** Which site test produced this report (absent for legacy reports) */
  siteTestId?: string;
  createdAt: string;
  status: "running" | "completed" | "failed" | "cancelled";
  error?: string;
  progress?: { completed: number; total: number };
  pages: ReportPage[];
}

export interface ReportPage {
  id: string;
  pageId: string;
  path: string;
  breakpoints: Record<string, BreakpointResult>;
  /** Variant results: variantId → breakpoint → result */
  variants?: Record<string, Record<string, BreakpointResult>>;
  /** Set when this page is a flow screenshot capture point */
  flowId?: string;
  /** Human-readable label for this flow step */
  stepLabel?: string;
}

export interface BreakpointResult {
  prodScreenshot: string;
  devScreenshot: string;
  diffScreenshot: string;
  alignedProdScreenshot?: string;
  alignedDevScreenshot?: string;
  /** Actual URL Playwright was on when the prod screenshot was taken (post-redirects, post-flow-navigation). */
  prodUrl?: string;
  /** Actual URL Playwright was on when the dev screenshot was taken. */
  devUrl?: string;
  changeCount: number;
  totalPixels: number;
  changePercentage: number;
  pixelChangeCount?: number;
  semanticChanges?: SemanticChange[];
  changeSummary?: Record<string, number>;
}

// --- DOM Snapshot types ---

export interface CapturedElement {
  /** CSS selector path for matching between prod/dev */
  selector: string;
  /** Tag name lowercased */
  tag: string;
  /** Bounding rect relative to page (not viewport) */
  bounds: { x: number; y: number; width: number; height: number };
  /** Key computed styles */
  styles: {
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontWeight: string;
    fontFamily: string;
    textAlign: string;
    lineHeight: string;
    letterSpacing: string;
    paddingTop: string;
    paddingRight: string;
    paddingBottom: string;
    paddingLeft: string;
    marginTop: string;
    marginRight: string;
    marginBottom: string;
    marginLeft: string;
    display: string;
    position: string;
    visibility: string;
    opacity: string;
    borderBottom: string;
    borderTop: string;
    gap: string;
    flexDirection: string;
    justifyContent: string;
    alignItems: string;
  };
  /** Visible text content (first 200 chars, direct text only) */
  textContent: string;
  /** Whether the element is visible */
  isVisible: boolean;
}

export interface DomSnapshot {
  url: string;
  breakpoint: number;
  capturedAt: string;
  elements: CapturedElement[];
}

// --- Semantic Change types ---

export type ChangeCategory =
  | "layout"
  | "spacing"
  | "alignment"
  | "typography"
  | "color"
  | "content"
  | "visibility"
  | "border"
  | "structural";

export type ChangeSeverity = "info" | "warning" | "error";

export interface SemanticChange {
  id: string;
  category: ChangeCategory;
  severity: ChangeSeverity;
  /** Human-readable description */
  description: string;
  /** CSS selector of the affected element */
  selector: string;
  /** Tag name */
  tag: string;
  /** Approximate Y position on page (for linking to visual diff) */
  yPosition: number;
  /** What changed */
  details: {
    property?: string;
    prodValue?: string;
    devValue?: string;
  };
}
