from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Could not locate expected snippet in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

# Preserve the physical card uid when a lethal creature is moved to the grave.
replace_once(
    "app/rules-engine/engine-base.mjs",
    "return { page:template.page,id:card.id,name:template.name,type:template.type,cost:template.cost,atk:template.atk,hp:template.hp,text:template.text,tags:[...(template.tags||[])],subtypes:[...(template.subtypes||[])],abilities:clone(template.abilities||[]),image:template.image,hero:template.hero,imageCard:template.imageCard,generatedImage:card.generatedImage };",
    "return { page:template.page,id:card.id,uid:card.uid,name:template.name,type:template.type,cost:template.cost,atk:template.atk,hp:template.hp,text:template.text,tags:[...(template.tags||[])],subtypes:[...(template.subtypes||[])],abilities:clone(template.abilities||[]),image:template.image,hero:template.hero,imageCard:template.imageCard,generatedImage:card.generatedImage };"
)

# Gato de Rua must find the grave card through either its live uid or its card id.
replace_once(
    "app/rules-engine/effects.mjs",
    'returnSelfToField(state, effect, context) { const entry = player(state, context.owner); const index = entry.grave.findIndex((card) => card.uid === context.sourceId || card.id === context.sourceId); const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot)); if (index >= 0 && openSlot != null) { const copy = { ...entry.grave.splice(index, 1)[0], enteredRound: state.round, attackedThisTurn: false, damage: 0, exhausted: false, summoning: false, slot: openSlot }; entry.board.push(copy); queueEvent(state, { type: "onEnter", owner: context.owner, sourceId: copy.uid || copy.id, cardId: copy.uid || copy.id, card: copy }); queueEvent(state, { type: "onCreatureEnter", owner: context.owner, sourceId: copy.uid || copy.id, cardId: copy.uid || copy.id, card: copy }); } },',
    'returnSelfToField(state, effect, context) { const entry = player(state, context.owner); const sourceKeys = new Set([context.sourceId, context.event?.sourceId, context.event?.card?.uid, context.event?.card?.id, context.effectSource?.uid, context.effectSource?.id].filter(Boolean)); const index = entry.grave.findIndex((card) => sourceKeys.has(card.uid) || sourceKeys.has(card.id)); const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot)); if (index >= 0 && openSlot != null) { const buried = entry.grave.splice(index, 1)[0]; const copy = { ...buried, uid: buried.uid || context.event?.card?.uid || `${buried.id}-${state.round}-returned`, enteredRound: state.round, attackedThisTurn: false, damage: 0, exhausted: false, summoning: false, slot: openSlot }; entry.board.push(copy); queueEvent(state, { type: "onEnter", owner: context.owner, sourceId: copy.uid || copy.id, cardId: copy.uid || copy.id, card: copy }); queueEvent(state, { type: "onCreatureEnter", owner: context.owner, sourceId: copy.uid || copy.id, cardId: copy.uid || copy.id, card: copy }); } },'
)

# `summoning` is the lifecycle gate. enteredRound must not keep tap activations
# blocked after the controller has already cleared summoning at maintenance.
replace_once(
    "app/rules-engine/engine-base.mjs",
    "if (cost.type === \"tap\") { const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === context.sourceId); if (!source || source.exhausted || source.summoning || source.enteredRound === state.round) throw new RulesViolation(\"cannot-tap\"); }",
    "if (cost.type === \"tap\") { const source = [...entry.board, ...entry.support, ...(entry.terrain ? [entry.terrain] : [])].find((unit) => unit.uid === context.sourceId); if (!source || source.exhausted || source.summoning) throw new RulesViolation(\"cannot-tap\"); }"
)
replace_once(
    "app/rules-engine/engine-base.mjs",
    "if (isAuxiliary && (source.summoning || source.enteredRound === state.round || source.exhausted)) throw new RulesViolation(\"cannot-tap\");",
    "if (isAuxiliary && (source.summoning || source.exhausted)) throw new RulesViolation(\"cannot-tap\");"
)

# Avoid stale overlapping AI timers dispatching the same hero power twice before
# the first authoritative state update has committed to React.
replace_once(
    "app/page.tsx",
    "const [repositionSeconds,setRepositionSeconds]=useState(30);const aiRepositionHandledRef=useRef<string>(\"\");",
    "const [repositionSeconds,setRepositionSeconds]=useState(30);const aiRepositionHandledRef=useRef<string>(\"\");const aiHeroActionInFlightRef=useRef<string>(\"\");"
)
replace_once(
    "app/page.tsx",
    " useEffect(()=>{currentGameRef.current=game},[game]);",
    " useEffect(()=>{currentGameRef.current=game},[game]);\n useEffect(()=>{if(game?.active!==1||game?.phase===\"manutencao\")aiHeroActionInFlightRef.current=\"\"},[game?.active,game?.phase,game?.round]);"
)
old = 'const heroAction=chooseAIHeroAbility(game,1,difficulty);if(heroAction){if(heroAction.kind===\"gimble-ready\"){void runRulesCommand({type:\"activateHero\",owner:1,abilityId:\"gimble-level-2\",targetIds:heroAction.targetId?[heroAction.targetId]:[]},1)}else{const abilityId=heroAction.kind===\"saymon-lifesteal\"?\"saymon-level-2\":heroAction.kind===\"saymon-damage\"?\"saymon-level-1\":heroAction.kind===\"ngoro-stealth\"?\"ngoro-level-3\":heroAction.kind===\"ngoro-clue-action\"?\"ngoro-level-2\":heroAction.kind===\"nature-markers\"?\"natureza-level-1\":\"\";if(abilityId)void runRulesCommand({type:\"activateHero\",owner:1,abilityId,targetIds:heroAction.targetId?[heroAction.targetId]:[]},1)}return}'
new = 'const heroAction=chooseAIHeroAbility(game,1,difficulty);if(heroAction){const heroActionKey=`${game.round}:${heroAction.kind}`;if(aiHeroActionInFlightRef.current===heroActionKey)return;aiHeroActionInFlightRef.current=heroActionKey;const dispatch=(command:Record<string,unknown>)=>{void runRulesCommand(command,1).then(ok=>{if(!ok&&aiHeroActionInFlightRef.current===heroActionKey)aiHeroActionInFlightRef.current=\"\"})};if(heroAction.kind===\"gimble-ready\"){dispatch({type:\"activateHero\",owner:1,abilityId:\"gimble-level-2\",targetIds:heroAction.targetId?[heroAction.targetId]:[]})}else{const abilityId=heroAction.kind===\"saymon-lifesteal\"?\"saymon-level-2\":heroAction.kind===\"saymon-damage\"?\"saymon-level-1\":heroAction.kind===\"ngoro-stealth\"?\"ngoro-level-3\":heroAction.kind===\"ngoro-clue-action\"?\"ngoro-level-2\":heroAction.kind===\"nature-markers\"?\"natureza-level-1\":\"\";if(abilityId)dispatch({type:\"activateHero\",owner:1,abilityId,targetIds:heroAction.targetId?[heroAction.targetId]:[]})}return}'
replace_once("app/page.tsx", old, new)
