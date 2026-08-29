import generatedCards from "./cards.generated.json";
import type { CardDef } from "../../model/game-state";

/** Immutable templates. Runtime damage, counters and ownership live in GameState. */
export const GENERATED_CARD_CATALOG = generatedCards as CardDef[];

export default GENERATED_CARD_CATALOG;

