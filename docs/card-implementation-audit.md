# Auditoria de implementação das cartas — Hemsfell Heroes

Este documento acompanha o inventário automático produzido por:

```bash
npm run audit:cards:full
```

O comando percorre **todas as entradas de `app/cards.generated.json`**, compila cada carta com o mesmo `compileCard` usado pelo jogo e registra:

- página, id, nome, tipo e custo impresso;
- origem da implementação (`explicit`, `text` ou `ignored`);
- gatilhos compilados;
- tipos de efeitos executáveis;
- custos de habilidades;
- efeitos que exigem alvo;
- quantidade de efeitos não suportados;
- resultado de `canExecuteCard`;
- alertas que merecem comparação manual entre texto impresso e comportamento do motor.

O comando também gera `docs/card-implementation-audit.json` e reescreve este Markdown com o inventário completo em tabela.

## Como interpretar a origem da implementação

### `explicit`
A carta possui uma regra canônica dedicada em `app/rules-engine/card-rules.mjs`. É o caminho mais seguro para cartas com condições, substituições, custos especiais, escolhas, efeitos ativáveis e gatilhos que o parser textual não consegue representar sem ambiguidade.

### `text`
A implementação foi inferida de `text` pelo compilador em `app/rules-engine/compiler.mjs`. Estas cartas são auditadas com atenção extra quando possuem condicionais, seleção de alvo, temporização, redução de custo ou texto de substituição.

### `ignored`
A carta foi explicitamente retirada/ignorada pelo conjunto de regras atual. O relatório preserva o motivo registrado na regra.

## Achado confirmado — Ilusão Dracônica (p13)

Texto impresso:

> Coloque em campo uma imagem de Dragão Jovem. Se voce possui um Dragão Filhote em campo, reduza o custo para jogar esta carta em 2 e substitua o Dragão Filhote pelo Dragão Jovem.

Comportamento pretendido para a versão digital:

1. **Sem Dragão Filhote no campo:** custo normal de 4; nenhum alvo é solicitado; cria uma cópia/Imagem de **Dragão Jovem** em um espaço válido.
2. **Com ao menos um Dragão Filhote no campo:** custo efetivo reduzido em 2; o jogador deve selecionar **qual Dragão Filhote aliado** será substituído; o Dragão Jovem ocupa a posição selecionada.
3. Ter múltiplos Dragões Filhotes não autoriza o motor a escolher silenciosamente o primeiro da lista.
4. A existência do Filhote altera tanto o custo quanto a necessidade de interação, mas **não é requisito para jogar o feitiço**.

### Estado encontrado no código

- A redução de custo de p13 já existe tanto na camada de UI quanto no motor canônico quando p23 está no campo.
- A regra explícita de p13 usa `replaceImage`.
- `replaceImage` procura automaticamente a primeira Imagem chamada `Dragão Filhote`; caso não encontre uma, cria o Dragão Jovem normalmente.
- Portanto, **o custo condicional e o modo sem Filhote já estão conceitualmente corretos; a parte incorreta é a ausência da escolha do Filhote quando existe um alvo substituível**.

Esta divergência é marcada pelo auditor como `confirmed / conditional-image-target-not-selected`.

## Revisão associada — Ilusão Dracônica Maior (p14)

p14 usa a mesma estratégia estrutural para `Dragão Jovem -> Dragão Ancião`. O auditor marca a carta para revisão porque, se houver mais de um Dragão Jovem elegível, a implementação atual também tende a selecionar automaticamente a primeira ocorrência. A decisão final deve seguir a regra de design desejada para a cadeia de Imagens.

## Grupos de maior risco semântico

O relatório completo prioriza especialmente:

- condicionais (`se`, `caso`, `enquanto`);
- gatilhos de manutenção/fim do turno/uma vez por turno;
- escolha de alvo e múltiplos alvos;
- substituição de permanentes e Imagens;
- redução ou alteração dinâmica de custo;
- custos pagos em vida;
- marcadores e efeitos ativáveis;
- efeitos de cemitério/Obscuro;
- Primeiro Ato, Último Suspiro e Fura-Fila;
- efeitos ainda derivados do parser textual.

Uma marca `review` **não significa automaticamente que a carta está errada**. Ela significa que a semântica impressa é suficientemente sensível para exigir comparação manual com o comportamento executável.
