import Link from "next/link";

export function WorkflowHandoff({
  eyebrow = "Next step",
  title,
  description,
  reason,
  href,
  label,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  reason?: string;
  href: string;
  label: string;
}) {
  return (
    <section className="workflow-handoff" aria-label={eyebrow}>
      <div className="workflow-handoff__copy">
        <p className="product-system-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <aside className="workflow-handoff__action">
        {reason ? <p><strong>Why now</strong>{reason}</p> : null}
        <Link className="primary-button" href={href}>{label} <span aria-hidden="true">→</span></Link>
      </aside>
    </section>
  );
}
