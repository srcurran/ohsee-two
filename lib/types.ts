export interface Project {
  id: string;
  prodUrl: string;
  devUrl: string;
  pages: PageEntry[];
  createdAt: string;
  lastDiffAt: string | null;
}

export interface PageEntry {
  id: string;
  path: string;
}

export interface Report {
  id: string;
  projectId: string;
  createdAt: string;
  status: "running" | "completed" | "failed";
  pages: ReportPage[];
}

export interface ReportPage {
  id: string;
  pageId: string;
  path: string;
  breakpoints: Record<string, BreakpointResult>;
}

export interface BreakpointResult {
  prodScreenshot: string;
  devScreenshot: string;
  diffScreenshot: string;
  changeCount: number;
  totalPixels: number;
  changePercentage: number;
}
