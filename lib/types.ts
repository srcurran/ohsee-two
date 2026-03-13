export interface TestVariant {
  id: string;
  label: string;
  colorScheme?: "light" | "dark";
  /** JS to run before every page load (via context.addInitScript) */
  initScript?: string;
}

export interface Project {
  id: string;
  prodUrl: string;
  devUrl: string;
  pages: PageEntry[];
  createdAt: string;
  lastDiffAt: string | null;
  /** When true, Playwright injects auth cookies for localhost captures */
  requiresAuth?: boolean;
  /** Optional theme/variant captures (e.g., light + dark) */
  variants?: TestVariant[];
}

export interface PageEntry {
  id: string;
  path: string;
}

export interface Report {
  id: string;
  projectId: string;
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
}

export interface BreakpointResult {
  prodScreenshot: string;
  devScreenshot: string;
  diffScreenshot: string;
  alignedProdScreenshot?: string;
  alignedDevScreenshot?: string;
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
