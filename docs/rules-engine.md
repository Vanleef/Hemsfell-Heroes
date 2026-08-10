# Motor de regras modular

Esta pasta inicia a migração do protótipo monolítico para um motor determinístico e orientado a dados. A interface React continua apresentando a partida; regras novas devem entrar como dados compilados e primitivas reutilizáveis.

## Fluxo

1. `compiler.mjs` converte texto legado em habilidades: gatilho, condição, custos e efeitos.
2. Um comando representa intenção (`playCard`, `activate`, `attack`, `advancePhase`).
3. `engine.mjs` valida prioridade, fase e custos antes de clonar e alterar o estado.
4. Efeitos são resolvidos pela pilha usando handlers de `effects.mjs`.
5. Eventos coletam gatilhos das constantes em ordem determinística: jogador, slot e ID da habilidade.
6. Limites de passos e repetição interrompem loops infinitos com `RulesLoopError`.

## Regras do manual codificadas

- Reserva paga apenas feitiços e efeitos, nunca criaturas ou constantes.
- Sacrifício envia ao cemitério com `suppressDeathTrigger`, portanto não ativa Último Suspiro.
- Criaturas recém-invocadas não atacam; Investida será um modificador que remove essa restrição.
- Criaturas viradas ou atordoadas não defendem.
- Dano de combate normal é simultâneo.
- Efeitos ativados só podem ser usados no turno do controlador e após validar todos os custos.
- Primeiro Ato e Último Suspiro são gatilhos automáticos, nunca botões de ativação.

## Inclusão de cartas

Uma carta deve armazenar `abilities`, não código próprio. Exemplo:

```json
{
  "trigger": "onEnter",
  "costs": [],
  "effects": [
    { "type": "draw", "amount": 2 },
    { "type": "discard", "amount": 1 }
  ]
}
```

O parser de texto existe para migrar o catálogo atual. Novas cartas devem ser cadastradas diretamente nessa forma estruturada e validadas pelo banco.

## Testes e simulação

- `npm run test:rules`: primitivas, custos, combate, gatilhos e loop guard.
- `npm run audit:cards`: compila todas as cartas e lista dados inválidos ou efeitos ainda não migrados.
- `npm run simulate:headless -- --games=100000`: executa partidas sem interface. O parâmetro pode ser elevado para milhões em CI ou servidor dedicado.

## Migração segura

O multiplayer atual ainda aceita `sync` do cliente por compatibilidade. A transição correta é fazer o cliente enviar somente comandos e usar `executeCommand` no servidor. O endpoint legado deve ser removido apenas depois que todas as ações da interface emitirem comandos e os efeitos usados pelos decks iniciais tiverem cobertura integral.
