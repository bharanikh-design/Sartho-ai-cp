import Link from "next/link";
import type { ReactNode } from "react";

type HeaderMetric = {
  value: ReactNode;
  label: string;
};

type HeaderAction = {
  href: string;
  label: string;
  primary?: boolean;
};

export function ProductPageHeader({
  eyebrow,
  title,
  description,
  metric,
  actions = [],
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  metric?: HeaderMetric;
  actions?: HeaderAction[];
}) {
  return (
    <header className="product-system-header">
      <div className="product-system-header__copy">
        <p className="product-system-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="product-system-header__description">{description}</p>
        {actions.length ? (
          <div className="product-system-header__actions">
            {actions.map((action) => (
              <Link
                className={action.primary ? "primary-button" : "secondary-button"}
                href={action.href}
                key={`${action.href}-${action.label}`}
              >
                {action.label}{action.primary ? <span aria-hidden="true"> →</span> : null}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      {metric ? (
        <div className="product-system-header__metric" aria-label={metric.label}>
          <strong>{metric.value}</strong>
          <span>{metric.label}</span>
        </div>
      ) : null}
    </header>
  );
}

export function ProductSectionHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="product-system-section-header">
      <div>
        {eyebrow ? <p className="product-system-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {aside ? <div className="product-system-section-header__aside">{aside}</div> : null}
    </div>
  );
}
