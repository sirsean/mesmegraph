import { useCallback, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { SpecDefinition } from "../data/specs";
import { writeSelectedSpecId } from "../storage/selectedSpec";
import "./DeckPlaymat.css";

const DRAG_THRESHOLD_PX = 10;

function specPreviewStyle(spec: SpecDefinition): CSSProperties {
  return spec.deckCardImage ? {} : { background: spec.preview };
}

function SlotArt({ spec }: { spec: SpecDefinition }) {
  if (spec.deckCardImage) {
    return (
      <img
        src={spec.deckCardImage}
        alt=""
        className="deck-playmat__slot-img"
        decoding="async"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      />
    );
  }
  return <div className="deck-playmat__slot-gradient" style={{ background: spec.preview }} />;
}

/** Thumb + meta — same chrome for hand cards and the drag ghost (whole card, not bare image). */
function HandCardFace({ spec }: { spec: SpecDefinition }) {
  return (
    <>
      <div
        className={`deck-playmat__thumb${spec.deckCardImage ? "" : " deck-playmat__thumb--gradient"}`}
        style={specPreviewStyle(spec)}
      >
        {spec.deckCardImage ? (
          <img
            src={spec.deckCardImage}
            alt=""
            className="deck-playmat__thumb-img"
            decoding="async"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          />
        ) : null}
      </div>
      <div className="deck-playmat__card-meta">
        <span className="deck-playmat__card-code">{spec.code}</span>
        <span className="deck-playmat__card-title">{spec.title}</span>
      </div>
    </>
  );
}

export function DeckPlaymat({ specs }: { specs: SpecDefinition[] }) {
  const navigate = useNavigate();
  const readerRef = useRef<HTMLDivElement>(null);
  const [slotSpec, setSlotSpec] = useState<SpecDefinition | null>(null);
  const [float, setFloat] = useState<{
    spec: SpecDefinition;
    x: number;
    y: number;
    grabOffsetX: number;
    grabOffsetY: number;
  } | null>(null);
  const [readerActive, setReaderActive] = useState(false);

  const pointInReader = useCallback((clientX: number, clientY: number) => {
    const el = readerRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }, []);

  const attachDragSession = useCallback(
    (e: React.PointerEvent, spec: SpecDefinition) => {
      if (e.button !== 0) return;
      const originEl = e.currentTarget as HTMLElement;
      originEl.setPointerCapture(e.pointerId);

      const x0 = e.clientX;
      const y0 = e.clientY;
      let dragging = false;
      const pointerId = e.pointerId;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          dragging = true;
          const rect = originEl.getBoundingClientRect();
          setFloat({
            spec,
            x: ev.clientX,
            y: ev.clientY,
            grabOffsetX: ev.clientX - rect.left,
            grabOffsetY: ev.clientY - rect.top,
          });
          setReaderActive(pointInReader(ev.clientX, ev.clientY));
          ev.preventDefault();
          return;
        }
        if (dragging) {
          ev.preventDefault();
          setFloat((prev) => (prev ? { ...prev, x: ev.clientX, y: ev.clientY } : prev));
          setReaderActive(pointInReader(ev.clientX, ev.clientY));
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        try {
          originEl.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
        originEl.removeEventListener("pointermove", onMove);
        originEl.removeEventListener("pointerup", onUp);
        originEl.removeEventListener("pointercancel", onUp);
        setFloat(null);
        setReaderActive(false);

        const over = pointInReader(ev.clientX, ev.clientY);
        if (dragging && over) {
          setSlotSpec(spec);
        }
      };

      const passiveOpts = { passive: false } as const;
      originEl.addEventListener("pointermove", onMove, passiveOpts);
      originEl.addEventListener("pointerup", onUp, passiveOpts);
      originEl.addEventListener("pointercancel", onUp, passiveOpts);
    },
    [pointInReader],
  );

  const openStack = useCallback(() => {
    if (!slotSpec) return;
    writeSelectedSpecId(slotSpec.id);
    navigate(`/camera/${slotSpec.id}`);
  }, [navigate, slotSpec]);

  return (
    <section className="deck-playmat" aria-label="Lens deck reader">
      <div className="deck-playmat__layout">
        <div className="deck-playmat__reader-col">
          <div
            className={`deck-playmat__reader${readerActive ? " deck-playmat__reader--drop-hover" : ""}${slotSpec ? " deck-playmat__reader--loaded" : ""}`}
            aria-label={slotSpec ? `Loaded: ${slotSpec.title}` : "Lens reader — empty"}
          >
            <button
              type="button"
              className="primary-btn deck-playmat__open"
              disabled={!slotSpec}
              onClick={openStack}
            >
              Open lens stack
            </button>

            <div ref={readerRef} className="deck-playmat__reader-frame">
              {slotSpec ? (
                <>
                  <header className="deck-playmat__reader-rail">
                    <span className="deck-playmat__reader-code">{slotSpec.code}</span>
                    <h3 className="deck-playmat__reader-title">{slotSpec.title}</h3>
                  </header>
                  <div className="deck-playmat__reader-viewport">
                    <SlotArt spec={slotSpec} />
                  </div>
                </>
              ) : (
                <div className="deck-playmat__reader-empty">
                  <span className="deck-playmat__reader-empty-label">Reader</span>
                  <span className="deck-playmat__reader-empty-sub">Drop a lens card here to arm the stack</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="deck-playmat__hand-col">
          <div className="deck-playmat__hand-label" id="deck-hand-label">
            Lens cards
          </div>
          <ul className="deck-playmat__hand" aria-labelledby="deck-hand-label">
            {specs.map((spec) => (
              <li key={spec.id} className="deck-playmat__hand-cell">
                <div
                  className={`deck-playmat__card${slotSpec?.id === spec.id ? " deck-playmat__card--in-reader" : ""}${float?.spec.id === spec.id ? " deck-playmat__card--dragging" : ""}`}
                  aria-label={
                    slotSpec?.id === spec.id
                      ? `${spec.title}, stack ${spec.code}, loaded in reader`
                      : `${spec.title}, stack ${spec.code}. Drag into the reader.`
                  }
                  onPointerDown={(e) => attachDragSession(e, spec)}
                  onDragStart={(e) => e.preventDefault()}
                >
                  <HandCardFace spec={spec} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {float
        ? createPortal(
            <div
              className="deck-playmat__float"
              style={{
                left: float.x - float.grabOffsetX,
                top: float.y - float.grabOffsetY,
              }}
              aria-hidden
            >
              <div className="deck-playmat__card deck-playmat__card--float-clone">
                <HandCardFace spec={float.spec} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
