import Link from "next/link";

/*
 * A job that is gone is a real answer, not a wrong turn.
 *
 * The app-wide not-found sends unmatched URLs back to the front door, which is
 * right for a mistyped address but wrong here: silently landing someone on
 * their workspace after they followed a link to a specific role leaves them
 * wondering whether they clicked the wrong thing. This says what happened.
 */
export default function JobNotFound() {
  return (
    <section className="glass-panel" style={{ maxWidth: "46ch", margin: "10vh auto", padding: "34px", textAlign: "center" }}>
      <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 640, letterSpacing: "-0.026em" }}>
        That role is no longer here
      </h1>
      <p style={{ margin: "10px 0 0", color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6 }}>
        It may have been removed, or the link may be out of date. Everything else you are tracking is still where you left it.
      </p>
      <Link
        href="/jobs"
        style={{
          display: "inline-block",
          marginTop: "22px",
          padding: "12px 22px",
          borderRadius: "13px",
          color: "#fff",
          background: "linear-gradient(135deg, #7c5cf0, #5b7ff0)",
          fontSize: "14px",
          fontWeight: 620,
          textDecoration: "none",
        }}
      >
        Back to your roles
      </Link>
    </section>
  );
}
