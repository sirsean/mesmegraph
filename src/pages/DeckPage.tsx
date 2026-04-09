import { DeckPlaymat } from "../components/DeckPlaymat";
import { listDeckPageSpecs } from "../data/specs";

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
        <DeckPlaymat specs={deckSpecs} />
      </section>
    </>
  );
}
