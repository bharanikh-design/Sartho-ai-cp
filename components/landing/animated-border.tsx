import type { CSSProperties, ReactNode } from "react";

/*
 * A border with a highlight travelling around it.
 *
 * One thin arc of light runs the perimeter on a slow loop, the way light catches
 * the edge of a real pane of glass as it turns. It is drawn as a masked conic
 * gradient on a pseudo-element, so it rides on the compositor and costs the main
 * thread nothing, and it holds still under prefers-reduced-motion (handled in
 * front-door.css). The duration is a prop because the card wants a slower, more
 * expensive-feeling sweep than a button does.
 */
export function AnimatedBorder({
  children,
  className,
  radius = 26,
  duration = 9,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** Corner radius in px; kept in sync with the mask so the arc hugs the corner. */
  radius?: number;
  /** Seconds for one full lap. */
  duration?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`fd-border${className ? ` ${className}` : ""}`}
      style={
        {
          "--fd-border-radius": `${radius}px`,
          "--fd-border-duration": `${duration}s`,
          ...style,
        } as CSSProperties
      }
    >
      <span className="fd-border-sweep" aria-hidden="true" />
      {children}
    </div>
  );
}
