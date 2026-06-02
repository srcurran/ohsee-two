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
  /** How this test sources its screens:
   *  - "simple": a non-linear list of URL paths compared against the site's
   *    shared prod/dev base (good for marketing sites).
   *  - "advanced": Playwright scripts/flows with optional auth.
   *  A test can be converted simple → advanced (one-way, never back).
   *  Absent on legacy records; classified on first read by
   *  readProjectsWithMigration. */
  testType?: "simple" | "advanced";
  /** True while the creation wizard hasn't been finished. Drives the
   *  "Finish creating test" CTA. Cleared when the user completes the wizard
   *  (Save/Run on the final step). */
  draft?: boolean;
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
  /** Per-test credentials: names a vault entry whose email/password/OTP are
   *  interpolated into the test's Playwright login script. */
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
 * Per-test credentials. Names a vault entry (Electron-only Keychain) whose
 * email / password / OTP get interpolated into the test's Playwright login
 * script via $EMAIL$ / $PASSWORD$ / $OTP$. Authentication is done by the
 * script performing a real login — there is no session-cookie forging.
 */
export interface TestCredentials {
  /** Vault entry id (Electron only) — names a stored identity. */
  vaultEntryId?: string;
}

/**
 * Resolved vault credentials for Playwright script interpolation.
 * The client fetches these from the vault before starting a run and
 * sends them to the runner in the POST body. The runner replaces
 * $EMAIL$, $PASSWORD$, $OTP$ template variables in scripts with
 * these values. TOTP codes are generated fresh at execution time
 * from the seed.
 */
export interface ScriptCredentials {
  email: string;
  password: string;
  totpSeed?: string;
  staticOtp?: string;
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
  alignedProdScreenshot?: string;
  alignedDevScreenshot?: string;
  /** Prod screenshot with changed pixels tinted — used as the page-card thumbnail. */
  highlightScreenshot?: string;
  /** Dev screenshot with changed pixels tinted — the dev-side diff overlay. */
  highlightDevScreenshot?: string;
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
    maxWidth: string;
    minWidth: string;
    maxHeight: string;
    minHeight: string;
  };
  /** Visible text content (first 200 chars, direct text only) */
  textContent: string;
  /** Whether the element is visible */
  isVisible: boolean;
  /** `alt` attribute — image identity for content-based descriptions. */
  alt?: string;
  /** `aria-label` — accessible name for icon buttons / unlabelled controls. */
  ariaLabel?: string;
  /** `src` basename (no path, no query) — media identity fallback. */
  src?: string;
  /** `placeholder` attribute — identity for text-less form controls. */
  placeholder?: string;
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
  /** When this change aggregates several elements with the identical
   *  change (same property + same prod→dev transition, or sibling
   *  add/removes), every affected element. The top-level `selector` holds a
   *  stable representative; `yPosition` holds the topmost instance. Absent
   *  ⇒ a single-element change. */
  instances?: { selector: string; yPosition: number }[];
  /** Human-readable location ("the header", "the “Pricing” section"),
   *  derived from the DOM snapshot at detection time. Lets the UI locate a
   *  change by content instead of showing a raw CSS selector. */
  location?: string;
  /** Untruncated `description`, set only when `description` was shortened
   *  with an ellipsis. Surfaced as a hover tooltip in the change list. */
  descriptionFull?: string;
  /** Untruncated `location`, set only when `location` was shortened. */
  locationFull?: string;
}
