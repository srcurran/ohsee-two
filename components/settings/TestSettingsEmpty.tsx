/** Empty-state placeholder for the test-settings step list — offered when a
 * test has zero steps. Each button skips the fork and pre-picks the editor
 * for that step type. */

"use client";

interface EmptyStepsProps {
  onPickUrl: () => void;
  onPickMicrotest: () => void;
}

export function EmptySteps({ onPickUrl, onPickMicrotest }: EmptyStepsProps) {
  return (
    <div className="empty-steps stack stack--start">
      <p className="empty-steps__heading">No steps yet.</p>
      <p className="empty-steps__copy">
        Start with a path you want to capture, or paste a Playwright script to
        navigate the app.
      </p>
      <div className="empty-steps__actions row">
        <button type="button" className="btn btn--outline" onClick={onPickUrl}>
          Add path
        </button>
        <button type="button" className="btn btn--outline" onClick={onPickMicrotest}>
          Record with Playwright
        </button>
      </div>
    </div>
  );
}
