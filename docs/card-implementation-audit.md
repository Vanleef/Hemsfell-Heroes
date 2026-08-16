# Hemsfell Heroes — auditoria de implementação das cartas

> Gerado por `node scripts/export-card-implementation-audit.mjs` a partir de `cards.generated.json` e do compilador/motor atuais.

## Resumo

- Total de cartas: **306**
- Ativas: **294**
- Regras explícitas: **237**
- Regras derivadas do texto: **57**
- Executáveis pelo motor canônico: **294**
- Com efeito textual não suportado: **0**
- Marcadas para revisão: **28**

## Achados confirmados / revisão prioritária

### 7. Xarqiroth

Implementação: **text** · Executável: **sim** · Gatilhos: onEnter · Efeitos: draw

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 11. Valorian, o Dragão Verdadeiro

Implementação: **text** · Executável: **sim** · Gatilhos: onCreatureEnter · Efeitos: damage, keyword

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 18. Bater as Asas

Implementação: **text** · Executável: **sim** · Gatilhos: onPlay · Efeitos: returnToHand

- **REVIEW · text-parser-targeting:** Seleção de alvo depende do parser textual; revisar escopo, opcionalidade e quantidade de alvos.

### 26. Sr. Goblin, o Mercador de Bugigangas

Implementação: **text** · Executável: **sim** · Gatilhos: static · Efeitos: draw

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 27. BURRO DE CARGA

Implementação: **explicit** · Executável: **sim** · Gatilhos: onEnter · Efeitos: grantNextCardDiscount

- **REVIEW · cost-reduction-outside-effect-data:** O texto menciona redução de custo, mas o efeito compilado não expõe um primitivo de custo; verificar se existe tratamento especial em outra camada.

### 40. SUPER MEGATANQUE CHUMBO 3000

Implementação: **text** · Executável: **sim** · Gatilhos: onTurnEnd · Efeitos: keyword

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 41. METE O PÉ!!!

Implementação: **explicit** · Executável: **sim** · Gatilhos: onPlay · Efeitos: returnAllyToHandWithComboDiscount

- **REVIEW · cost-reduction-outside-effect-data:** O texto menciona redução de custo, mas o efeito compilado não expõe um primitivo de custo; verificar se existe tratamento especial em outra camada.

### 43. HOJE É POR CONTA DA CASA!

Implementação: **explicit** · Executável: **sim** · Gatilhos: onPlay · Efeitos: grantNextCardDiscount

- **REVIEW · cost-reduction-outside-effect-data:** O texto menciona redução de custo, mas o efeito compilado não expõe um primitivo de custo; verificar se existe tratamento especial em outra camada.

### 50. Saymon, o Primeiro

Implementação: **text** · Executável: **sim** · Gatilhos: activated · Efeitos: damage, keyword

- **REVIEW · text-parser-targeting:** Seleção de alvo depende do parser textual; revisar escopo, opcionalidade e quantidade de alvos.

### 51. Colecionador

Implementação: **text** · Executável: **sim** · Gatilhos: onPlay · Efeitos: draw, banish

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 52. Se você tem 5 cartas no seu cemitério, bana-as e aumente

Implementação: **text** · Executável: **sim** · Gatilhos: onPlay · Efeitos: draw

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 53. Colecionador

Implementação: **text** · Executável: **sim** · Gatilhos: onPlay · Efeitos: draw, banish

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 54. Uruk, a Encantriz da Evocação

Implementação: **explicit** · Executável: **sim** · Gatilhos: onTurnEnd · Efeitos: resolveLastSpellElement

- **REVIEW · cost-reduction-outside-effect-data:** O texto menciona redução de custo, mas o efeito compilado não expõe um primitivo de custo; verificar se existe tratamento especial em outra camada.

### 77. Manipuladora Arcana

Implementação: **explicit** · Executável: **sim** · Gatilhos: onEnter · Efeitos: grantNextCardDiscount

- **REVIEW · cost-reduction-outside-effect-data:** O texto menciona redução de custo, mas o efeito compilado não expõe um primitivo de custo; verificar se existe tratamento especial em outra camada.

### 83. Ignis, a Chama Eterna

Implementação: **text** · Executável: **sim** · Gatilhos: onEnter · Efeitos: damage

- **REVIEW · text-parser-targeting:** Seleção de alvo depende do parser textual; revisar escopo, opcionalidade e quantidade de alvos.

### 90. Silhueta Noturna

Implementação: **text** · Executável: **sim** · Gatilhos: onPlay · Efeitos: returnToHand, keyword

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 96. Não disse por favor

Implementação: **text** · Executável: **sim** · Gatilhos: onPlay · Efeitos: returnToHand

- **REVIEW · text-parser-targeting:** Seleção de alvo depende do parser textual; revisar escopo, opcionalidade e quantidade de alvos.

### 98. Aqui não

Implementação: **text** · Executável: **sim** · Gatilhos: onPlay · Efeitos: destroy

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.
- **REVIEW · text-parser-targeting:** Seleção de alvo depende do parser textual; revisar escopo, opcionalidade e quantidade de alvos.

### 103. Poção da Ira

Implementação: **text** · Executável: **sim** · Gatilhos: activated · Efeitos: destroy, modifyStats

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.
- **REVIEW · text-parser-targeting:** Seleção de alvo depende do parser textual; revisar escopo, opcionalidade e quantidade de alvos.

### 106. Plantão de Cura

Implementação: **text** · Executável: **sim** · Gatilhos: static · Efeitos: heal

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 110. Tifon, a Peste

Implementação: **text** · Executável: **sim** · Gatilhos: static · Efeitos: damage

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 128. Altar da Carnificina

Implementação: **text** · Executável: **sim** · Gatilhos: onTurnEnd · Efeitos: keyword

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 171. Duelista Silenciosa

Implementação: **text** · Executável: **sim** · Gatilhos: onPlay · Efeitos: keyword

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 172. Duelista Silencioso

Implementação: **text** · Executável: **sim** · Gatilhos: onPlay · Efeitos: keyword

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 175. General Atos, o Tirano

Implementação: **text** · Executável: **sim** · Gatilhos: onTurnEnd · Efeitos: damage

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.
- **REVIEW · text-parser-targeting:** Seleção de alvo depende do parser textual; revisar escopo, opcionalidade e quantidade de alvos.

### 177. Aegis da Chama Eterna

Implementação: **text** · Executável: **sim** · Gatilhos: onPlay · Efeitos: keyword

- **REVIEW · text-parser-conditional:** Regra condicional/temporal depende do parser textual; comparar o comportamento executável com o texto impresso.

### 187. Recruta Bom de Briga

Implementação: **text** · Executável: **sim** · Gatilhos: onEnter · Efeitos: damage

- **REVIEW · text-parser-targeting:** Seleção de alvo depende do parser textual; revisar escopo, opcionalidade e quantidade de alvos.

### 278. Revolucionário

Implementação: **text** · Executável: **sim** · Gatilhos: onDestroyed · Efeitos: banish

- **REVIEW · text-parser-targeting:** Seleção de alvo depende do parser textual; revisar escopo, opcionalidade e quantidade de alvos.

## Inventário completo

| Pág. | Carta | Tipo | Implementação | Executável | Gatilhos | Efeitos |
|---:|---|---|---|:---:|---|---|
| 2 | Gimble, Presenteado Sortudo | Herói | explicit | ✓ | — | — |
| 3 | Valorian, o pseudodragão | Criatura | explicit | ✓ | static, activated | keyword, transformFromHandOrDeck |
| 4 | Dr.Elizabeth | Criatura | text | ✓ | onEnter | search |
| 5 | Wyvern | Criatura | explicit | ✓ | static, onCombatDamage | keyword, damageAdjacent |
| 6 | Smallgui | Criatura | explicit | ✓ | onEnter | damage |
| 7 | Xarqiroth | Criatura | text | ✓ | onEnter | draw |
| 8 | Breathker | Criatura | text | ✓ | onPlay | supportAura, keyword |
| 9 | Dancadon | Criatura | explicit | ✓ | static | protectAlliedDragonsOncePerTurn |
| 10 | Dragão de Limo | Criatura | explicit | ✓ | static, onDestroyed | keyword, damageAll |
| 11 | Valorian, o Dragão Verdadeiro | Criatura | text | ✓ | onCreatureEnter | damage, keyword |
| 12 | Ilusão Dracônica Menor | Encanto | explicit | ✓ | onPlay | createImage |
| 13 | Ilusão Dracônica | Feitiço | explicit | ✓ | onPlay | replaceImage |
| 14 | Ilusão Dracônica Maior | Feitiço | explicit | ✓ | onPlay | replaceImage |
| 15 | Sabedoria Ancestral | Feitiço | explicit | ✓ | onPlay | conditionalDrawByControlledSubtype |
| 16 | Escama Protetora | Feitiço | explicit | ✓ | onPlay | modifyStats |
| 17 | Investida Alada | Feitiço | explicit | ✓ | onPlay | forceAttack |
| 18 | Bater as Asas | Feitiço | text | ✓ | onPlay | returnToHand |
| 19 | Coração de Rubi | Artefato | explicit | ✓ | static | attachedStats, conditionalAttachedBonus |
| 20 | Anel de Esmeralda | Artefato | explicit | ✓ | activated | gainMaxEnergy, destroy |
| 21 | Garras do Leviatã | Artefato | explicit | ✓ | static | attachedKeyword, conditionalAttachedBonus |
| 22 | Alpes Dracônicos | Terreno | explicit | ✓ | onCreatureDestroyed | createImage |
| 23 | Dragão Filhote | Criatura | explicit | ✓ | onEnter | damage |
| 24 | Dragão Jovem | Criatura | explicit | ✓ | static, onEnter | keyword, damage, damageAdjacent |
| 25 | Dragão Ancião | Criatura | explicit | ✓ | static, onEnter | keyword, damage, damageAdjacent |
| 26 | Sr. Goblin, o Mercador de Bugigangas | Herói | text | ✓ | static | draw |
| 27 | BURRO DE CARGA | Criatura | explicit | ✓ | onEnter | grantNextCardDiscount |
| 28 | TIRA DENTES | Criatura | text | ✓ | onEnter | returnToHand |
| 29 | CARRETA FURACÃO | Criatura | explicit | ✓ | onPlay | keyword, modifyStats |
| 30 | BIRIBA, O FOLGADO | Criatura | explicit | ✓ | onPlay | modifyStatsFromTurnCardsPlayed |
| 31 | BOMBARDEIRO MALUCO | Criatura | explicit | ✓ | onPlay | damage |
| 32 | ZOIUDO, O LARÁPIO | Criatura | explicit | ✓ | static, onPlay | keyword, destroyCreatureUpToTurnCardsPlayed |
| 33 | FUSCÃO, O AGIOTA | Criatura | explicit | ✓ | onCardPlayed | draw |
| 34 | BAFO DE FUMAÇA | Criatura | explicit | ✓ | onEnter, onCreatureDestroyed | damageAndMarkRepeat |
| 35 | BOMBARDEIRO GENTE BOA | Criatura | explicit | ✓ | onCreatureEnter | damage |
| 36 | CHAMINÉ, O MAFIOSO | Criatura | explicit | ✓ | onEnter, onPlay | returnNamedFromGraveToHand, grantUntilTurnEnd |
| 37 | BUCHA DE CANHÃO | Feitiço | explicit | ✓ | activated | damageFromSacrificedAttack |
| 38 | TRAMBUCO DO PIPOCO | Artefato | explicit | ✓ | onEnter, activated, onAttachedHostDestroyed | validateAttachedSubtype, attachedStats, attachedKeyword, reattachArtifact, optionalReequipArtifact |
| 39 | CARCAÇA CHUMBADA DE TANQUE | Encanto | explicit | ✓ | onPermanentLeaves, activated | addMarker, createImage |
| 40 | SUPER MEGATANQUE CHUMBO 3000 | Criatura | text | ✓ | onTurnEnd | keyword |
| 41 | METE O PÉ!!! | Feitiço | explicit | ✓ | onPlay | returnAllyToHandWithComboDiscount |
| 42 | FIADO NÃO É ROUBADO | Feitiço | explicit | ✓ | onPlay | draw |
| 43 | HOJE É POR CONTA DA CASA! | Feitiço | explicit | ✓ | onPlay | grantNextCardDiscount |
| 44 | SUBORNO | Feitiço | explicit | ✓ | onPlay | gainEnergy, disableReserveStorage |
| 45 | BICUDA NA FUÇA! | Feitiço | explicit | ✓ | onPlay | damageFromCardsPlayedThisTurn |
| 46 | TRANQUEIRA-MÁTICA ELETROSTÁTICA | Feitiço | explicit | ✓ | onPlay, onTurnEnd | remainUntilTurnEnd, trackCardsPlayedAfterSelf, countedChoice, moveSelf |
| 47 | COMBADO NÃO SAI CARO | Feitiço | explicit | ✓ | onPlay, onPermanentLeaves, onTurnEnd | remainUntilTurnEnd, gainEnergy, moveSelf |
| 48 | PINGA QUE LEVANTA ATÉ DEFUNTO | Feitiço | explicit | ✓ | onPlay | resurrect, configureResurrected |
| 49 | PARQUE DOS GURI CAÇA-BOBOS | Terreno | explicit | ✓ | onCardPlayed | applyGoblinThresholds |
| 50 | Saymon, o Primeiro | Herói | text | ✓ | activated | damage, keyword |
| 51 | Colecionador | Herói | text | ✓ | onPlay | draw, banish |
| 52 | Se você tem 5 cartas no seu cemitério, bana-as e aumente | Herói | text | ✓ | onPlay | draw |
| 53 | Colecionador | Herói | text | ✓ | onPlay | draw, banish |
| 54 | Uruk, a Encantriz da Evocação | Herói | explicit | ✓ | onTurnEnd | resolveLastSpellElement |
| 55 | Orbe Cromático | Feitiço | explicit | ✓ | onPlay | damage |
| 56 | Punho Sísmico | Feitiço | explicit | ✓ | onPlay | damage, grantNextElementEffect |
| 57 | Tempestade de Areia | Feitiço | explicit | ✓ | onPlay | reduceEnemyAttackUntilControllerMaintenance, grantNextElementEffect |
| 58 | Terremoto | Feitiço | explicit | ✓ | onPlay | damageAll |
| 59 | Mudra Sovna, a Escola de Magia | Terreno | explicit | ✓ | static | costModifier |
| 60 | Anel de Safira | Artefato | explicit | ✓ | activated | fillReserve, destroy |
| 61 | Levantar Maré | Feitiço | explicit | ✓ | onPlay | createImage, grantNextElementEffect |
| 62 | Bolha Protetora | Feitiço | explicit | ✓ | onPlay | grantHeroDamageShield, grantNextElementEffect |
| 63 | Nevasca | Feitiço | explicit | ✓ | onPlay | freezeEnemyBoard |
| 64 | Alta Voltagem | Feitiço | explicit | ✓ | onPlay | damageByAdjacentCount, grantNextElementEffect |
| 65 | Nuvem Esmagadora | Feitiço | explicit | ✓ | onPlay | returnToHandAndTaxNextCreature, grantNextElementEffect |
| 66 | Tufão | Feitiço | explicit | ✓ | onPlay | returnAllCreaturesToOwnersHands |
| 67 | Obliterar | Feitiço | explicit | ✓ | onPlay | consumeAllEnergyForDamage |
| 68 | Lança Ardente | Feitiço | text | ✓ | onPlay | damage, keyword |
| 69 | Bola de Fogo | Feitiço | text | ✓ | onPlay | damage, keyword |
| 70 | Maestria Elemental | Feitiço | explicit | ✓ | onPlay | createSelectedMasteryImage |
| 71 | Maestria Elemental: Aeromancia | Encanto | explicit | ✓ | onSpellCast | gainEnergy |
| 72 | Maestria Elemental: Hidromancia | Encanto | explicit | ✓ | onSpellCast | heal |
| 73 | Maestria Elemental: Geomancia | Encanto | explicit | ✓ | onSpellCast | geomancyChoice |
| 74 | Maestria Elemental: Piromancia | Encanto | explicit | ✓ | onSpellCast | empowerSpellDamage |
| 75 | Eclipse Final | Feitiço | explicit | ✓ | onPlay | damageFromSpellsThisTurn |
| 76 | Golem Rochedo | Criatura | explicit | ✓ | static, onEnter | keyword, grantRobustIfSpellPlayedThisTurn |
| 77 | Manipuladora Arcana | Criatura | explicit | ✓ | onEnter | grantNextCardDiscount |
| 78 | Arquimago Sombrio | Criatura | explicit | ✓ | onSpellCast | modifyStats |
| 79 | Athos, o Bibliotecário | Criatura | explicit | ✓ | onSpellCast | draw |
| 80 | Feiticeira Espectral | Criatura | explicit | ✓ | onSpellCast, activated | addMarker, search |
| 81 | Clone de Água | Criatura | text | ✓ | onDestroyed | keyword |
| 82 | Fênix Cintilante | Criatura | text | ✓ | onPlay, onDestroyed | keyword, search |
| 83 | Ignis, a Chama Eterna | Criatura | text | ✓ | onEnter | damage |
| 84 | Undaris, a Voz do Oceano | Criatura | ignored | — | — | — |
| 85 | Terron, o Guardiao Ancestral | Criatura | ignored | — | — | — |
| 86 | Zephyrus, o Relâmpago Voraz | Criatura | text | ✓ | onPlay, onDestroyed | keyword, gainEnergy |
| 87 | Invocar Elemental | Feitiço | explicit | ✓ | onPlay | controllerChoice |
| 88 | Acumulador | Herói | explicit | ✓ | onEnter | snapshotStatsFromHand |
| 89 | Jogador Viciado | Herói | explicit | ✓ | onMaintenance | optionalDrawWithCreatureCostDamage |
| 90 | Silhueta Noturna | Herói | text | ✓ | onPlay | returnToHand, keyword |
| 91 | Especialista em Escudos | Herói | text | ✓ | onPlay | keyword |
| 92 | Barreira de Mártires | Herói | explicit | ✓ | onEnter | snapshotHealthFromFactionConstants |
| 93 | Jogo Justo | Feitiço | ignored | — | — | — |
| 94 | Chave Rara | Feitiço | explicit | ✓ | onPlay | search |
| 95 | Epifania | Feitiço | text | ✓ | onPlay | draw |
| 96 | Não disse por favor | Feitiço | text | ✓ | onPlay | returnToHand |
| 97 | Chinela de mãe | Feitiço | explicit | ✓ | onPlay | counterPendingAction |
| 98 | Aqui não | Feitiço | text | ✓ | onPlay | destroy |
| 99 | Sepultar | Feitiço | ignored | — | — | — |
| 100 | Divinus AMP | Feitiço | text | ✓ | onPlay | draw, banish |
| 101 | Trabalho honesto | Encanto | ignored | — | — | — |
| 102 | Desenterrar | Feitiço | explicit | ✓ | onPlay | resurrect |
| 103 | Poção da Ira | Artefato | text | ✓ | activated | destroy, modifyStats |
| 104 | Recomeço | Feitiço | text | ✓ | onPlay | banish |
| 105 | Anti-arterfato | Artefato | explicit | ✓ | activated | destroy |
| 106 | Plantão de Cura | Encanto | text | ✓ | static | heal |
| 107 | Pergaminho: Estabilizar | Artefato | explicit | ✓ | activated | grantTeamReserveTapAbility, destroy |
| 108 | Cemitério Amaldiçoado | Terreno | text | ✓ | static | modifyStats, keyword |
| 109 | Anel de Diamante | Artefato | text | ✓ | activated | gainEnergy |
| 110 | Tifon, a Peste | Herói | text | ✓ | static | damage |
| 111 | Bestial Filhote | Criatura | text | ✓ | onDestroyed | damage |
| 112 | Condenado | Criatura | text | ✓ | onDestroyed | modifyStats |
| 113 | Bestial | Criatura | text | ✓ | onDestroyed | damage |
| 114 | Vingador | Criatura | explicit | ✓ | onCreatureDestroyed | modifyStats |
| 115 | Indomável | Criatura | explicit | ✓ | static | keyword, cannotDefend |
| 116 | Conjurador | Criatura | explicit | ✓ | onDestroyed | gainEnergy |
| 117 | Brutamontes | Criatura | explicit | ✓ | static, onEnter | keyword, optionalSacrificeBuff |
| 118 | Reanimador | Criatura | text | ✓ | onDestroyed | returnToHand |
| 119 | Explosivo | Criatura | explicit | ✓ | onDestroyed | damageHeroFromTurnDeaths |
| 120 | Primordial | Criatura | explicit | ✓ | onCombatKill, onDestroyed | resurrect, destroy, returnSelfToField |
| 121 | Ritual da Ametista de Sangue | Feitiço | text | ✓ | onPlay | damage |
| 122 | Marcha dos Condenados | Feitiço | explicit | ✓ | onPlay | returnSelectedGraveCardsToHand |
| 123 | Tremor da Fenda | Feitiço | text | ✓ | onPlay | damageAll |
| 124 | Saliva acida | Feitiço | explicit | ✓ | onPlay | grantKeyword |
| 125 | Ataque Temerário | Feitiço | explicit | ✓ | onPlay | modifyStats |
| 126 | Totem das Cinzas | Encanto | explicit | ✓ | onCreatureDestroyed, activated | addMarker, resurrectByDoubleMarkerCost |
| 127 | Estandarte da Ruína | Encanto | explicit | ✓ | activated | replayTopGraveAbility |
| 128 | Altar da Carnificina | Terreno | text | ✓ | onTurnEnd | keyword |
| 129 | Saymon, o Primeiro | Herói | explicit | ✓ | activated | damage |
| 130 | Servo Iniciante | Criatura | explicit | ✓ | onEnter | loseLife |
| 131 | Discípulo de Sangue | Criatura | explicit | ✓ | onLifeLost | modifyStats |
| 132 | Morcego Rastreador | Criatura | explicit | ✓ | onLifeLost | draw |
| 133 | O Carniceiro | Criatura | explicit | ✓ | static, onEnter | keyword, loseLife |
| 134 | O Cobra Dor | Criatura | explicit | ✓ | onMaintenance, activated | loseLife, addMarker, healFromMarkersRemoved |
| 135 | Condutor de Rasnóvia | Criatura | explicit | ✓ | onEnter | controllerChoice |
| 136 | Extrator da Lua sangrenta | Criatura | explicit | ✓ | static, onCreatureEnter | keyword, forceSelfCombatEnteringCreature |
| 137 | Viúva Negra | Criatura | explicit | ✓ | onDestroyed, activated | heal, grantKeyword |
| 138 | Olhos Sangrentos | Criatura | explicit | ✓ | activated | grantKeyword |
| 139 | Dominus Nox | Criatura | explicit | ✓ | onEnter | heal |
| 140 | Lorde de Sangue | Criatura | text | ✓ | onPlay | supportAura, keyword |
| 141 | Pacto de Sangue | Artefato | explicit | ✓ | activated | modifyStats |
| 142 | Dança Macabra | Feitiço | explicit | ✓ | onPlay | grantSubtype, combatRestriction |
| 143 | Nascer do Sol | Feitiço | explicit | ✓ | onPlay | destroy, heal |
| 144 | Despertar da Noite | Feitiço | explicit | ✓ | onPlay | damageAllWithLifesteal |
| 145 | Mordida Fatal | Feitiço | explicit | ✓ | onPlay | fatalBite |
| 146 | Túmulo do Sacrifício | Feitiço | explicit | ✓ | onPlay | nextCreaturePaysLife |
| 147 | Silêncio Ensurdecedor | Encanto | explicit | ✓ | onPlay, onTurnEnd, onPermanentLeaves | suffocateWhileSourceInField, payLifeOrDestroySelf, releaseSuffocatedBySource |
| 148 | Castelo Carmesim | Terreno | explicit | ✓ | onLifeLost | resolveCrimsonCastle |
| 149 | O Ufanista | Criatura | ignored | — | — | — |
| 150 | Anel de Casamento | Artefato | explicit | ✓ | onPlay, onPermanentLeaves | linkCreatures, followLinkedDestination |
| 151 | Nada se cria, tudo se copia | Feitiço | explicit | ✓ | onPlay | replaySelectedAbility |
| 152 | Tessália, a Mão de Ferro | Herói | explicit | ✓ | onAttack, static | addMarker, commanderRule |
| 153 | Anel de Rubi | Artefato | explicit | ✓ | activated | gainTemporaryEnergy, skipNextMaxEnergyIncrease, destroy |
| 154 | Correntes Purificadoras | Artefato | explicit | ✓ | onAttachedCreatureTargeted, static | draw, graveReplacement |
| 155 | Machado Indomável | Artefato | explicit | ✓ | static | attachedStats, attachedKeyword |
| 156 | Armadura de Ferro Maciço | Artefato | explicit | ✓ | static | keyword |
| 157 | Frenesi | Feitiço | explicit | ✓ | onPlay | grantAdditionalAttack, scheduleEffect |
| 158 | Punição Divina | Feitiço | explicit | ✓ | onPlay | destroyExhaustedAndHealCost |
| 159 | Escudo Anulador | Feitiço | explicit | ✓ | onPlay | suffocateUntilTurnEndAndDrawOwner |
| 160 | Vingança | Feitiço | explicit | ✓ | onPlay | destroyIfDamagedControllerThisTurn |
| 161 | Condenar | Feitiço | explicit | ✓ | onPlay | destroyAtTurnEndUnlessCombat |
| 162 | Castigo | Feitiço | explicit | ✓ | onPlay | destroyIfEffectAppliedThisTurn |
| 163 | Arte da Guerra | Terreno | explicit | ✓ | onCombatStart | openRepositionWindow |
| 164 | Sentinela da Ordem | Criatura | text | ✓ | onPlay | supportAura |
| 165 | Escudeiro Cruel | Criatura | explicit | ✓ | onDamageTaken | modifyStats |
| 166 | Especialista Anti-magia | Criatura | explicit | ✓ | static | spellTargetSurcharge |
| 167 | O Combatente | Criatura | explicit | ✓ | static | conditionalStats |
| 168 | Inspetor Desconfiado | Criatura | explicit | ✓ | onOpponentSpellAttempt | opponentChoice |
| 169 | Veterano de Guerra | Criatura | explicit | ✓ | static | keyword |
| 170 | J.J.J.J.JR. | Criatura | explicit | ✓ | onEnter, onPermanentLeaves | banishUntilSourceLeaves, returnBanishedBySource |
| 171 | Duelista Silenciosa | Criatura | text | ✓ | onPlay | keyword |
| 172 | Duelista Silencioso | Criatura | text | ✓ | onPlay | keyword |
| 173 | Cavaleiro Negro | Criatura | explicit | ✓ | onCreatureDestroyed | modifyStats |
| 174 | General Yara, a Estrategista | Criatura | explicit | ✓ | onCombatStart | peekTop, controllerChoice |
| 175 | General Atos, o Tirano | Criatura | text | ✓ | onTurnEnd | damage |
| 176 | General Nilo, o Carrasco | Criatura | explicit | ✓ | static, onCombatKill | keyword, cannotDefend, grantAdditionalAttack |
| 177 | Aegis da Chama Eterna | Artefato | text | ✓ | onPlay | keyword |
| 178 | Mestra da Vigília | Criatura | ignored | — | — | — |
| 179 | Inspetor Aposentado | Criatura | explicit | ✓ | onCardsDrawn | opponentChoice |
| 180 | Quarion Siannodel | Herói | explicit | ✓ | onFirstActResolved | draw |
| 181 | Saideira dos Recrutas! | Terreno | explicit | ✓ | static | recruitFirstActOnLeave |
| 182 | Chefe da Guarda | Criatura | explicit | ✓ | static | doubleRecruitFirstAct |
| 183 | Recruta Apaixonado | Criatura | explicit | ✓ | onEnter | conditionalStats |
| 184 | Recruta Elegante | Criatura | explicit | ✓ | onEnter | toggleTap |
| 185 | Recruta Exibido | Criatura | explicit | ✓ | onEnter | snapshotStats |
| 186 | Recruta Solidário | Criatura | explicit | ✓ | onEnter | modifyStats |
| 187 | Recruta Bom de Briga | Criatura | text | ✓ | onEnter | damage |
| 188 | Recruta Trapaceira | Criatura | explicit | ✓ | onEnter | damage |
| 189 | Recruta Pinguço | Criatura | explicit | ✓ | onEnter | heal |
| 190 | Recruta Vigilante | Criatura | explicit | ✓ | onEnter | returnToHand |
| 191 | Bater em Retirada | Feitiço | explicit | ✓ | onPlay | returnToHand |
| 192 | Caneca da Sorte | Artefato | explicit | ✓ | static | modifyStats, attachedConditionalKeyword |
| 193 | Diálogo, o Martelo Esmagador | Artefato | explicit | ✓ | static | attachedStats, attachedKillGrowth |
| 194 | Estandarte da Ordem | Artefato | explicit | ✓ | static | attachedSupportAura |
| 195 | Escudo Duro na Queda | Artefato | explicit | ✓ | static | modifyStats, keyword |
| 196 | Gran Finale | Artefato | explicit | ✓ | static | attachedStats, granFinale |
| 197 | “Fatiadora Práteáda” | Artefato | explicit | ✓ | static | attachedConditionalStats, keyword |
| 198 | Bárbaro Cansado | Criatura | explicit | ✓ | activated | modifyStats |
| 199 | Assassino de Aluguel | Criatura | text | ✓ | onEnter | draw, discard |
| 200 | Torneio dos Campeões | Terreno | ignored | — | — | — |
| 201 | Escudeiro Fiél | Criatura | ignored | — | — | — |
| 202 | Juramento Solene | Feitiço | explicit | ✓ | onPlay | heal |
| 203 | Recrutas ao Resgate! | Feitiço | explicit | ✓ | onPlay | optionalSacrificeThenFillRecruits |
| 204 | Circulo de Proteção Divina | Terreno | ignored | — | — | — |
| 205 | Escudo Vingativo | Artefato | ignored | — | — | — |
| 206 | Infusão Proibida | Feitiço | explicit | ✓ | onPlay | buffFromSpellsThisTurn |
| 207 | Dízimo | Feitiço | ignored | — | — | — |
| 208 | O Informante | Criatura | text | ✓ | onDestroyed | draw |
| 209 | A Dama de Ferro | Feitiço | explicit | ✓ | onPlay | purgeSpellsAndCreateImage |
| 210 | Tessália, a Mão de Ferro | Criatura | explicit | ✓ | onTargetedByOpponent | controllerChoice |
| 211 | Rasmus, o Barista do Tempo | Herói | explicit | ✓ | onSpellCast | addMarker, threshold |
| 212 | Café do Tempo | Terreno | explicit | ✓ | onMaintenance | createImage |
| 213 | Gato Multidimensional | Criatura | explicit | ✓ | static, onEnter, activated, onTurnEnd | cannotDefend, cannotBeDestroyedForSpace, loseLife, moveSelf |
| 214 | Morris, o Gato Popular | Criatura | explicit | ✓ | static | dynamicCatStats |
| 215 | Gato do Barista | Criatura | explicit | ✓ | onEnter | search |
| 216 | Lazuli, o Gato Dragão | Criatura | text | ✓ | onPlay | keyword |
| 217 | Gato de Rua | Criatura | explicit | ✓ | onDestroyed | returnSelfToField |
| 218 | Gato de Batalha | Criatura | explicit | ✓ | static | subtypeAura |
| 219 | Gato de Fazenda | Criatura | explicit | ✓ | static | costModifier |
| 220 | Gato Aprendiz de Bruxa | Criatura | explicit | ✓ | static | keyword, supportAura |
| 221 | Gato Afeiçoado | Criatura | explicit | ✓ | onEnter, onPermanentLeaves | linkDestroyCreatures, destroyLinkedCreature |
| 222 | Erva de Gato | Feitiço | text | ✓ | onPlay | search |
| 223 | Promoção de Café | Feitiço | explicit | ✓ | onPlay | drawIfPriorSpell |
| 224 | Café Gelado | Feitiço | explicit | ✓ | onPlay | returnToHandWithSubtypeBonus |
| 225 | Café Descafeinado | Feitiço | explicit | ✓ | onPlay | grantKeyword |
| 226 | Café Derramado | Feitiço | explicit | ✓ | onPlay | destroyIfEffectAppliedThisTurn |
| 227 | Abstinência de Café | Feitiço | explicit | ✓ | onPlay | tapUntilAnotherSpellEffect |
| 228 | Rebelião dos Gatos | Feitiço | explicit | ✓ | onPlay | damagePerSubtype |
| 229 | Máquina de Expresso | Encanto | explicit | ✓ | activated | createImage |
| 230 | Café Expresso | Feitiço | explicit | ✓ | onPlay | controllerChoice |
| 231 | Café Especial | Feitiço | explicit | ✓ | onPlay | controllerChoice |
| 232 | Infusão de Café | Encanto | explicit | ✓ | activated | grantKeyword |
| 235 | Anel de Safira | Artefato | explicit | ✓ | activated | fillReserve, destroy |
| 236 | Café Pingado | Feitiço | explicit | ✓ | onPlay | grantDamageReductionShield |
| 237 | Café com Leite | Feitiço | explicit | ✓ | onPlay | grantDamageShield |
| 238 | Cappuccino | Feitiço | explicit | ✓ | onPlay | modifyStats, grantCombatImmobilize |
| 239 | Café Mocha | Feitiço | explicit | ✓ | onPlay | drawIfPriorNamedCard |
| 240 | Café Latte Macchiato | Feitiço | explicit | ✓ | onPlay | returnToHandWithSubtypeBonus |
| 241 | Café Filtrado | Feitiço | explicit | ✓ | onPlay | modifyStats, skipNextUntap |
| 242 | Café Duplo | Feitiço | explicit | ✓ | onPlay | modifyStats |
| 243 | Café Blend Supremo | Feitiço | explicit | ✓ | onPlay | doubleNextNamedEffect |
| 244 | Gato de Colo | Criatura | text | ✓ | onPlay | keyword |
| 245 | O Gato Cachorro | Criatura | explicit | ✓ | static | dynamicSubtypeStats |
| 246 | Gato Dorminhoco | Criatura | explicit | ✓ | static, onNamedEffectApplied | entersExhausted, ready |
| 247 | Gato Viciado | Criatura | explicit | ✓ | onNamedEffectApplied | copyEventEffect |
| 248 | Ritual do Barista | Feitiço | explicit | ✓ | onPlay | repeatChoiceForCoffeeCount |
| 249 | Café Preto Sem Açúcar | Feitiço | explicit | ✓ | onPlay | modifyStats, skipNextUntap |
| 250 | Tentar de Novo | Feitiço | explicit | ✓ | onPlay | redrawHand |
| 251 | Compra Estratégica | Feitiço | explicit | ✓ | onPlay | strategicDraw |
| 252 | Café Expresso Duplo | Feitiço | explicit | ✓ | onPlay | increaseVitality |
| 253 | Descarte Estratégico | Feitiço | explicit | ✓ | onPlay | randomDiscardAndResolveByType |
| 254 | Hora do Café | Encanto | explicit | ✓ | onSpellCast | draw |
| 255 | Ngoro, o Investigador | Herói | explicit | ✓ | onInvestigate, onMaintenance | addMarker, chooseDeckAndInvestigate |
| 256 | Cria de Ladino | Criatura | explicit | ✓ | onDestroyed | mill |
| 257 | Saral | Criatura | explicit | ✓ | onEnter | controllerChoice |
| 258 | Contrabandista | Criatura | text | ✓ | onEnter | search |
| 259 | Allen Burn | Criatura | explicit | ✓ | static, onPlayerDamaged | keyword, investigate |
| 260 | Nburnu | Criatura | explicit | ✓ | static | keyword, dynamicMilledAttack |
| 261 | Espião Infiltrado | Criatura | explicit | ✓ | onCardRevealed | modifyStats |
| 262 | Nmali | Criatura | explicit | ✓ | onCardRevealed | mill |
| 263 | Liaz | Criatura | explicit | ✓ | onCardRevealed | damage, grantKeyword |
| 264 | Carthana | Criatura | explicit | ✓ | static, onCreatureEnter | keyword, investigate |
| 265 | Sua escolha | Feitiço | explicit | ✓ | onPlay | opponentChoice |
| 266 | Queima de Arquivos | Feitiço | explicit | ✓ | onPlay | archiveToGrave |
| 267 | Anel de Ametista | Artefato | explicit | ✓ | activated | gainEnergy |
| 268 | Luvas do larapio | Artefato | explicit | ✓ | static, onAttachedCreatureDamage | keyword, millFromDirectDamage |
| 269 | Adaga de Ametista de Sangue | Artefato | explicit | ✓ | static, onAttachedCreatureDamage | attachedStats, loseLife |
| 270 | Manto da Invisibilidade | Artefato | explicit | ✓ | static | attachedKeyword |
| 271 | Prestidigitação | Encanto | explicit | ✓ | beforeDraw | optionalDrawFrom |
| 272 | Base de Investigação | Terreno | explicit | ✓ | onCardRevealed | mill, damage, gainEnergy, draw, discard |
| 273 | Zayan, a Líder Revolucionária | Herói | explicit | ✓ | onCombatStart | modifyStats |
| 274 | Maria vai com as outras | Criatura | explicit | ✓ | static | copyStrongestAllyStats |
| 275 | Cidadão de Sel Kanthar | Criatura | text | ✓ | onPlay | — |
| 276 | Meretriz | Criatura | text | ✓ | onPlay | — |
| 277 | Cidadão Enfurecido | Criatura | text | ✓ | onPlay | — |
| 278 | Revolucionário | Criatura | text | ✓ | onDestroyed | banish |
| 279 | Fazendeiro Irado | Criatura | text | ✓ | onPlay | — |
| 280 | Líder Recluso | Criatura | explicit | ✓ | onEnter | search |
| 281 | Soldado Exilado | Criatura | text | ✓ | onPlay | — |
| 282 | Víbora Desgarrada | Criatura | text | ✓ | onPlay | — |
| 283 | Mímico | Criatura | explicit | ✓ | static, onDamageTaken | cannotAttack, becomeVanilla |
| 284 | Chorinho | Encanto | explicit | ✓ | onTurnEnd | draw |
| 285 | Medida Desesperada | Feitiço | explicit | ✓ | onPlay | grantKeyword, controllerLifeThresholdStats |
| 286 | Informante Fofoqueiro | Feitiço | explicit | ✓ | onPlay | drawWithPenalty |
| 287 | Tortura Coletiva | Feitiço | explicit | ✓ | onPlay | repeatDamageUntilDeaths |
| 288 | Contramedida | Feitiço | explicit | ✓ | onPlay | destroy |
| 289 | Logística | Feitiço | explicit | ✓ | onPlay | search, moveCardsFromHandToDeckBottom |
| 290 | Recrutamento Revolucionário | Terreno | explicit | ✓ | onMaintenance | draw |
| 291 | Campeão de Natureza | Herói | explicit | ✓ | activated | addMarker |
| 292 | CRIATURA 1 | Criatura | explicit | ✓ | activated | addMarker |
| 293 | CRIATURA 2 | Criatura | explicit | ✓ | activated | search |
| 294 | CRIATURA 3 | Criatura | explicit | ✓ | activated | ready |
| 295 | CRIATURA 4 | Criatura | explicit | ✓ | onCreatureEnter | addMarker |
| 296 | CRIATURA 5 | Criatura | explicit | ✓ | static, onAttack | keyword, attackPermission, removeMarker |
| 297 | CRIATURA 6 | Criatura | explicit | ✓ | static, onCombatDamage | keyword, moveMarkerToSelf |
| 298 | CRIATURA 7 | Criatura | explicit | ✓ | activated, onTurnEnd | convertActionMarkersToPlusOneCounters, banishOwnCreatureWithMostPlusOneCounters |
| 299 | CRIATURA 8 | Criatura | explicit | ✓ | activated | drawPerMarkersRemoved |
| 300 | CRIATURA 9 | Criatura | explicit | ✓ | activated | selectMarkersThenSearch |
| 301 | BOMBA | Criatura | explicit | ✓ | onEnter | doubleMarkers, halveMaxEnergy |
| 302 | MÁSCARA PROFANA | Artefato | explicit | ✓ | onAttachedCreatureTargeted | opponentChoice |
| 303 | MÁSCARA REFLETORA | Artefato | explicit | ✓ | onAttachedCreatureTargeted | optionalRedirect |
| 304 | MÁSCARA DO PACTO | Artefato | explicit | ✓ | static, onTurnEnd | costModifier, loseLife |
| 305 | MÁSCARA DA ARANHA RAINHA | Artefato | explicit | ✓ | static | conditionalAttachedBlockRestriction |
| 306 | Anel de Esmeralda | Artefato | explicit | ✓ | activated | gainMaxEnergy, destroy |
| 307 | FUGA | Feitiço | explicit | ✓ | onPlay | escapeCreatureAndTransferArtifacts |
| 308 | SOPRO NATURAL | Feitiço | explicit | ✓ | onPlay | returnSelectedGraveCardsAndBanishRest |
| 309 | ENCANTO 1 | Encanto | explicit | ✓ | onTurnEnd, activated | consolidateMarkersAndDamage, moveMarker |

## Como interpretar

- `explicit`: a carta possui definição canônica em `rules-engine/card-rules.mjs`.
- `text`: a implementação foi inferida automaticamente do texto impresso pelo compilador.
- `ignored`: removida/ignorada explicitamente pelo conjunto de regras atual.
- `review` não significa necessariamente bug; indica que a semântica impressa merece comparação manual com o comportamento do motor.
