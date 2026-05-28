import type { CSSProperties } from "react";

export function ConfiguratorSubmissionSpinner() {
  return (
    <div style={styles.wrap} role="status" aria-live="polite" aria-label="Saving bundle">
      <div style={styles.spinnerTile}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="24"
            cy="24"
            r="19"
            fill="none"
            stroke="rgba(4, 123, 93, 0.16)"
            strokeWidth="5"
          />
          <path
            d="M24 5a19 19 0 0 1 18.2 24.5"
            fill="none"
            stroke="rgb(4, 123, 93)"
            strokeWidth="5"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 24 24"
              to="360 24 24"
              dur="0.85s"
              repeatCount="indefinite"
            />
          </path>
        </svg>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "56px",
    margin: "0 0 12px",
  },
  spinnerTile: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "58px",
    height: "58px",
    borderRadius: "999px",
    background: "transparent",
  },
};
