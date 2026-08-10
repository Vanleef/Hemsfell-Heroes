const ability = (trigger, effects, costs = [], extra = {}) => ({ trigger, effects, costs, ...extra });
const effect = (type, data = {}) => ({ type, ...data });

/**
 * Canonical rules for cards whose printed text is not safely expressible by the
 * legacy text parser. These definitions are data, not card-specific executable
 * code, and may later be loaded directly from Supabase.
 */
export const explicitCardRules = Object.freeze({
  p6: [ability("onEnter", [effect("damage", { amount: 2, target: "anyCreature", selections: 1 })])],
  p10: [ability("static", [effect("keyword", { keyword: "Atropelar" })]), ability("onDestroyed", [effect("damageAll", { amount: 2, target: "allCreatures" })])],
  p17: [ability("onPlay", [effect("forceAttack", { attacker: { controller: "self", subtype: "Dragão", ready: true }, defender: "anyCreature" })])],
  p22: [ability("onCreatureDestroyed", [effect("createImage", { name: "Dragão Filhote", destination: "field" })], [], { condition: { all: [{ eventCardTypeNot: "Imagem" }, { eventCardSubtype: "Dragão" }] } })],
  p23: [ability("onEnter", [effect("damage", { amount: 1, target: "anyCreature", selections: 1 })])],
  p24: [ability("static", [effect("keyword", { keyword: "Voar" })]), ability("onEnter", [effect("damage", { amount: 3, target: "enemyCreature", selections: 1 }), effect("damageAdjacent", { amount: 1, relation: "selectedTarget" })])],
  p25: [ability("static", [effect("keyword", { keyword: "Voar" })]), ability("onEnter", [effect("damage", { amount: 5, target: "enemyCreature", selections: 1 }), effect("damageAdjacent", { amount: 2, relation: "selectedTarget" })])],
  p36: [ability("onEnter", [effect("retrieve", { zone: "grave", name: "Suborno", destination: "hand", optional: true })]), ability("onPlay", [effect("grantUntilTurnEnd", { ability: ability("onDestroyed", [effect("returnSelfToHand")]) })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],
  p42: [ability("onPlay", [effect("draw", { amount: 1 }), effect("modifySelfCost", { amount: -1, zone: "hand" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],
  p46: [ability("onPlay", [effect("remainUntilTurnEnd"), effect("trackCardsPlayedAfterSelf")]), ability("onTurnEnd", [effect("countedChoice", { counter: "cardsPlayedAfterSelf", branches: [{ min: 1, max: 4, effects: [effect("damageHeroPerCount", { target: "controller", amount: 1 })] }, { min: 5, max: 5, effects: [effect("createImage", { name: "BUCHA DE CANHÃO", destination: "field" })] }, { min: 6, max: 6, effects: [effect("createImage", { name: "TRAMBUCO DE PIPOCO", destination: "field" })] }, { min: 7, effects: [effect("createImage", { name: "CARCAÇA CHUMBADA DE TANQUE", destination: "field" })] }] }), effect("moveSelf", { destination: "grave" })])],
  p59: [ability("static", [effect("costModifier", { selector: { controller: "self", type: "Feitiço", zone: "hand" }, amount: -1, during: "controllerTurn" })])],
  p58: [ability("onPlay", [effect("damageAll", { amount: 0, amountPerEnemyCreature: 1, target: "allCreatures" })])],
  p71: [ability("onSpellCast", [effect("gainEnergy", { amount: 1, destination: "reserve" })], [], { condition: { firstEachTurn: true, spellElement: "Ar" } })],
  p72: [ability("onSpellCast", [effect("heal", { amount: 3, target: "controllerHero" })], [], { condition: { firstEachTurn: true, spellElement: "Água" } })],
  p84: { ignored: true, reason: "removed-from-game" },
  p85: { ignored: true, reason: "removed-from-game" },
  p93: { ignored: true, reason: "removed-from-game" },
  p99: { ignored: true, reason: "removed-from-game" },
  p101: { ignored: true, reason: "removed-from-game" },
  p116: [ability("onDestroyed", [effect("gainEnergy", { amount: 1, destination: "reserve" })])],
  p120: [ability("onCombatKill", [effect("resurrect", { zone: "grave", cardType: "Criatura", cost: 1, destination: "field", optional: true })]), ability("onDestroyed", [effect("destroy", { target: "otherAllyCreature", selections: 1, optional: true }), effect("returnSelfToField", { onlyIfPreviousPaid: true })])],
  p127: [ability("activated", [effect("replayTopGraveAbility", { trigger: "onDestroyed", requireType: "Criatura" })], [], { uiActivation: true, usageLimit: { count: 1, period: "turn" }, availability: { topGraveHasTrigger: "onDestroyed" } })],
  p130: [ability("onEnter", [effect("loseLife", { amount: 3, target: "controllerHero" })])],
  p133: [ability("static", [effect("keyword", { keyword: "Atropelar" })]), ability("onEnter", [effect("loseLife", { amount: 4, target: "controllerHero" })])],
  p151: [ability("onPlay", [effect("replaySelectedAbility", { selector: { controller: "self", type: "Criatura", hasTrigger: "onEnter" }, trigger: "onEnter" })], [], { playCondition: { alliedPermanentHasTrigger: "onEnter" } })],
  p163: [ability("onCombatStart", [effect("openRepositionWindow", { players: "both", moveAttachments: true, endsBy: ["bothConfirm", "responseTimeout"] })])],
  p165: [ability("onDamageTaken", [effect("modifyStats", { attack: 1, health: 0, duration: "permanent", target: "self" })], [], { condition: { sourceSurvived: true } })],
  p166: [ability("onTargetedBySpell", [effect("additionalTargetCost", { amount: 1, payer: "spellController", onFailure: "chooseNewTarget" })])],
  p167: [ability("static", [effect("conditionalStats", { attack: 1, health: 0, condition: "controllerTurn" })])],
  p168: [ability("onOpponentSpellAttempt", [effect("opponentChoice", { firstEachTurn: true, choices: [[effect("loseLife", { amount: 1, target: "spellControllerHero" })], [effect("draw", { amount: 1, target: "chosenOtherPlayer" })]] })])],
  p169: [ability("static", [effect("keyword", { keyword: "Alerta" })])],
  p174: [ability("onCombatStart", [effect("peekTop", { players: "both" }), effect("controllerChoice", { choices: [[effect("draw", { amount: 1, target: "bothPlayers" })], [effect("moveTopToBottom", { target: "bothPlayers" })]] })])],
  p178: { ignored: true, reason: "removed-from-game" },
  p181: [ability("onPermanentLeaves", [effect("replayAbility", { trigger: "onEnter", target: "eventCard" })], [], { condition: { eventCardSubtype: "Recruta" } })],
  p182: [ability("onCreatureEnter", [effect("replayAbility", { trigger: "onEnter", target: "eventCard", additionalTimes: 1 })], [], { condition: { eventCardSubtype: "Recruta", controller: "self" } })],
  p183: [ability("onEnter", [effect("conditionalStats", { target: "allyCreature", health: 2, alternate: { targetName: "Recruta Elegante", health: 3 }, duration: "turn" })])],
  p184: [ability("onEnter", [effect("tap", { target: "anyCreature" })])],
  p185: [ability("onEnter", [effect("snapshotStats", { target: "self", attackPerOtherSubtype: { subtype: "Recruta", amount: 1 } })])],
  p186: [ability("onEnter", [effect("modifyStats", { target: "allyCreature", attack: 2, health: 0, duration: "turn" })])],
  p188: [ability("onEnter", [effect("damage", { amount: 1, additionalIfExhausted: 1, target: "anyCharacter", selections: 1 })])],
  p190: [ability("onEnter", [effect("returnToHand", { target: "anyCreature", requireExhausted: true, selections: 1 })])],
  p191: [ability("onPlay", [effect("returnToHand", { target: "allyCreature", maxCost: 3, selections: 1 })])],
  p192: [ability("static", [effect("modifyStats", { attack: 2, health: -1, duration: "permanent" })])],
  p193: [ability("static", [effect("modifyStats", { attack: 3, health: 2, duration: "permanent" })])],
  p194: [ability("static", [effect("modifyStats", { attack: 1, health: 1, duration: "permanent" }), effect("keyword", { keyword: "Suporte +1/+1" })])],
  p195: [ability("static", [effect("modifyStats", { attack: 1, health: 4, duration: "permanent" }), effect("keyword", { keyword: "Defensor 2" })])],
  p196: [ability("static", [effect("modifyStats", { attack: 2, health: 2, duration: "permanent" })])],
  p197: [ability("static", [effect("modifyStats", { attack: -2, health: 0, duration: "permanent" }), effect("keyword", { keyword: "Atropelar" })])],
  p202: [ability("onPlay", [effect("heal", { amountPerTurnedCreature: 2, target: "controllerHero" })])],
  p189: [ability("onEnter", [effect("heal", { amount: 2, target: "controllerHero" })])],
  p207: { ignored: true, reason: "removed-from-game" },
  p211: { hero: true, evolution: [{ level: 2, condition: { catsInAllFieldsAtLeast: 5 } }, { level: 3, condition: { catsInAllFieldsAtLeast: 7 } }], levels: { 1: [ability("onSpellCast", [effect("addMarker", { target: "hero", marker: "coffee", amount: 1 }), effect("threshold", { marker: "coffee", amount: 10, reset: true, effects: [effect("createImage", { name: "Café Especial", destination: "hand" })] })], [], { condition: { spellNameIncludes: "Café" } })], 2: [ability("onPlayerDamaged", [effect("heal", { amount: 1, target: "controllerHero" })], [], { condition: { sourceSubtype: "Gato" } })], 3: [ability("static", [effect("allowSubtypeInZone", { subtype: "Gato", zone: "support", players: "both", countsAs: "Criatura", canAttachArtifact: false })])] } },
  p212: [ability("onMaintenance", [effect("createImage", { name: "Gato Multidimensional", destination: "activePlayerField", mandatory: true, replaceIfFull: true, supportAllowedIfHeroLevel: { hero: "Rasmus, o Barista do Tempo", level: 3 } })])],
  p217: [ability("onDestroyed", [effect("returnSelfToField")], [], { condition: { wasOnlySubtypeInAllFields: "Gato" } })],
  p229: [ability("activated", [effect("createImage", { name: "Café Expresso", destination: "hand" })], [{ type: "tap", amount: 1 }], { usageLimit: { count: 1, period: "turn" } })],
  p233: [ability("static", [effect("cannotDefend"), effect("cannotBeDestroyedForSpace")]), ability("onEnter", [effect("loseLife", { amount: 1, target: "controllerHero" })]), ability("activated", [effect("moveSelf", { destination: "obscuro" })], [{ type: "energy", amount: 1 }], { uiActivation: true, usageLimit: { count: 1, period: "turn" } }), ability("onTurnEnd", [effect("loseLife", { amount: 1, target: "controllerHero" })], [], { condition: { controllerSubtypeEnteredThisTurn: { subtype: "Gato", count: 0 } } })],
  p237: [ability("onPlay", [effect("grantDamageShield", { target: "anyCreature", uses: 1, duration: "untilUsed" })])],
  p243: [ability("onPlay", [effect("doubleNextNamedEffect", { controller: "self", nameIncludes: "Café", targetType: "Criatura", additionalTimes: 1 })])],
  p247: [ability("onNamedEffectApplied", [effect("copyEventEffect", { target: "self" })], [], { condition: { nameIncludes: "Café", eventTargetType: "Criatura" } })],
  p252: [ability("onPlay", [effect("increaseVitality", { amount: 2, target: "anyCharacter", duration: "permanent" })])],
  p256: [ability("onDestroyed", [effect("mill", { amount: 2, target: "enemy" })])],
  p257: [ability("onEnter", [effect("investigate", { amount: 2, target: "chosenDeck", reorder: true })])],
  p265: [ability("onPlay", [effect("opponentChoice", { choices: [[effect("draw", { amount: 2, target: "controller" })], [effect("mill", { amount: 2, target: "chooser" })]] })])],
  p269: [ability("static", [effect("attachedStats", { attack: 2, health: 0 })]), ability("onAttachedCreatureDamage", [effect("loseLife", { amount: 1, target: "controllerHero" })])],
  p271: [ability("beforeDraw", [effect("optionalDrawFrom", { zonePosition: "bottom", fallback: "top" })])],
  p274: [ability("static", [effect("copyStrongestAllyStats", { target: "self", updateContinuously: true, bothStatsFromAttack: true })])],
  p286: [ability("onPlay", [effect("drawWithPenalty", { min: 0, max: 3, penaltyPerNonCreature: { amount: 3, target: "controllerHero" } })])],
  p287: [ability("onPlay", [effect("repeatDamageUntilDeaths", { amount: 1, targets: { perPlayer: 2, type: "Criatura" }, stopAfterDeaths: 2, simultaneousEachRound: true })])],
  p290: [ability("onMaintenance", [effect("draw", { amount: 1, target: "activePlayer" })], [], { condition: { activePlayerControlsVanillaCreature: true } })],
  p296: [ability("static", [effect("keyword", { keyword: "Alerta" }), effect("attackPermission", { requiresMarkers: { marker: "action", minimum: 2 } })]), ability("onAttack", [effect("removeMarker", { target: "self", marker: "action", amount: 2 })])],
  p299: [ability("activated", [effect("drawPerMarkersRemoved", { marker: "action", divisor: 3 })], [{ type: "removeMarkers", marker: "action", amount: "X", multipleOf: 3, minimum: 3 }], { usageLimit: { count: 1, period: "turn" } })],
  p300: [ability("activated", [effect("search", { zone: "deck", types: ["Encanto", "Feitiço"], destination: "hand", shuffle: true })], [{ type: "removeMarkersFromConstants", amount: 5 }], { usageLimit: { count: 1, period: "turn" } })],
  p301: [ability("onEnter", [effect("doubleMarkers", { target: "allPermanents" }), effect("halveMaxEnergy", { target: "controller", rounding: "ceil" })])],
  p303: [ability("onAttachedCreatureTargeted", [effect("optionalRedirect", { target: "anotherAllyPermanent" })], [{ type: "removeMarkersFromConstants", amount: 5 }])],
  p304: [ability("static", [effect("costModifier", { selector: { controller: "self", type: "Criatura", zone: "hand" }, amount: -1 })]), ability("onTurnEnd", [effect("loseLife", { amount: 1, target: "controllerHero" })])],
});

export const explicitRuleIds = Object.freeze(Object.keys(explicitCardRules));

export function getExplicitCardRule(cardOrId) {
  const id = typeof cardOrId === "string" ? cardOrId : cardOrId?.id;
  return id ? explicitCardRules[id] || null : null;
}

export function abilitiesForLevel(rule, level = 1) {
  if (!rule || Array.isArray(rule)) return rule || [];
  if (rule.ignored) return [];
  if (!rule.hero) return rule.abilities || [];
  return Object.entries(rule.levels || {}).flatMap(([required, abilities]) => Number(required) <= level ? abilities : []);
}
