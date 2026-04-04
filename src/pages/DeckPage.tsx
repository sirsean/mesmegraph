import { SpecCard } from "../components/SpecCard";
import { listDeckPageSpecs } from "../data/specs";
import { writeSelectedSpecId } from "../storage/selectedSpec";

export function DeckPage() {
  const deckSpecs = listDeckPageSpecs();

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Hyperspec</p>
        <h1>Mesmegraph</h1>
      </header>

      <section className="deck" aria-label="Spec stacks">
        <h2 className="deck__heading">Deck</h2>
        <ul className="deck__grid">
          {deckSpecs.map((spec) => (
            <li key={spec.id} className="deck__cell">
              <SpecCard
                code={spec.code}
                title={spec.title}
                preview={spec.preview}
                deckCardImage={spec.deckCardImage}
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
