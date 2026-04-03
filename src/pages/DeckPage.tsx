import { SpecCard } from "../components/SpecCard";
import { SPEC_LIST } from "../data/specs";
import { writeSelectedSpecId } from "../storage/selectedSpec";

export function DeckPage() {
  return (
    <>
      <header className="hero">
        <p className="eyebrow">Hyperspec</p>
        <h1>Mesmegraph</h1>
      </header>

      <section className="deck" aria-label="Spec stacks">
        <h2 className="deck__heading">Deck</h2>
        <ul className="deck__grid">
          {SPEC_LIST.map((spec) => (
            <li key={spec.id} className="deck__cell">
              <SpecCard
                code={spec.code}
                title={spec.title}
                preview={spec.preview}
                cameraTo={`/camera/${spec.id}`}
                onOpen={() => writeSelectedSpecId(spec.id)}
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
