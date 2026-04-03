import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./SpecCard.css";

const FLICKER_MIN_MS = 2500;
const FLICKER_MAX_MS = 5500;

function randomFlickerDelay(): number {
  return FLICKER_MIN_MS + Math.random() * (FLICKER_MAX_MS - FLICKER_MIN_MS);
}

export type SpecCardProps = {
  code: string;
  title: string;
  /** Placeholder preview: CSS gradient stops */
  preview?: string;
  /** Route to this spec’s camera view */
  cameraTo: string;
  /** Persist last-opened spec for `/camera` redirect */
  onOpen?: () => void;
};

function PunchHoles({ placement }: { placement: "top" | "bottom" }) {
  const count = placement === "top" ? 9 : 9;
  return (
    <div className={`spec-card__holes spec-card__holes--${placement}`} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="spec-card__hole" />
      ))}
    </div>
  );
}

export function SpecCard({
  code,
  title,
  preview = "linear-gradient(135deg, var(--color-border-strong) 0%, var(--color-void-elevated) 45%, var(--color-accent-dim) 100%)",
  cameraTo,
  onOpen,
}: SpecCardProps) {
  const [dashLit, setDashLit] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        setDashLit((v) => !v);
        tick();
      }, randomFlickerDelay());
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <article className={`spec-card${dashLit ? " spec-card--dash-flicker" : ""}`}>
      <PunchHoles placement="top" />
      <header className="spec-card__rail">
        <span className="spec-card__code">{code}</span>
        <h3 className="spec-card__title">{title}</h3>
      </header>
      <div className="spec-card__body">
        <div className="spec-card__viewport" style={{ background: preview }} />
      </div>
      <Link
        to={cameraTo}
        className="spec-card__open primary-btn"
        onClick={onOpen}
      >
        Open lens stack
      </Link>
      <PunchHoles placement="bottom" />
    </article>
  );
}
