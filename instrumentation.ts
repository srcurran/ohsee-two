export async function onRequestError() {
  // Required export — Next.js instrumentation hook.
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recoverStaleReports } = await import("./lib/recover-stale-reports");
    const count = await recoverStaleReports();
    if (count > 0) {
      console.log(`Recovered ${count} stale running report(s) on startup`);
    }
  }
}
