/** Empty-state placeholder for the test-settings step list — offered when a
 * simple (path) test has zero steps. */

"use client";

interface EmptyStepsProps {
  onPickUrl: () => void;
}

export function EmptySteps({ onPickUrl }: EmptyStepsProps) {
  return (
    <div className="empty-steps stack stack--start">
      <p className="empty-steps__heading">No steps yet.</p>
      <p className="empty-steps__copy">
        Add the paths you want to capture.
      </p>
      <div className="empty-steps__actions row">
        <button type="button" className="btn btn--outline" onClick={onPickUrl}>
          Add path
        </button>
      </div>
    </div>
  );
}
