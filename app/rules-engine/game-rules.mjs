/** Pure rules shared by the live game and deterministic tests.
 * Manual de Regras: Primeiro Ato and Último Suspiro are automatic triggers;
 * Vire is a manual cost and a turned creature cannot attack or defend. */

export const elementalChainFrom = (element) => {
  if (element === "Terra") return { element: "Fogo", effect: "Sufocado" };
  if (element === "Água") return { element: "Ar", effect: "Atordoado" };
  if (element === "Ar") return { element: "Água", effect: "Congelado" };
  if (element === "Fogo") return { element: "Terra", effect: "Imobilizado" };
  return undefined;
};

export const earthquakeDamage = (enemyCreatureCount) => Math.max(0, enemyCreatureCount);

export const cloneRetaliation = (text = "") => ({
  frozen: /congel/i.test(text),
  stunned: /atordoad/i.test(text),
  suffocated: /sufoc/i.test(text),
  immobilized: /imobiliz/i.test(text),
});

export function applyCloneRetaliation(target, text) {
  const effects = cloneRetaliation(text);
  if (effects.frozen) target.frozen = true;
  if (effects.stunned) {
    target.stunned = true;
    target.exhausted = true;
  }
  if (effects.suffocated) {
    target.suffocated = true;
    target.bonusAtk = 0;
    target.bonusHp = 0;
    target.markers = 0;
  }
  if (effects.immobilized) target.immobilized = true;
  return target;
}

/** Returns true only for the first matching trigger in the current turn. */
export function claimOncePerTurn(uses, key) {
  if (uses[key]) return false;
  uses[key] = 1;
  return true;
}
