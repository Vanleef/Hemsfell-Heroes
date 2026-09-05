# Testes

`npm test` valida o estado canônico, tipos de IA/online e todos os `*.test.mjs`. Não faz build. Use `npm run test:build` quando precisar validar também o artefato Next.js. A CI executa o benchmark de IA separadamente e constrói o aplicativo sem repetir a suíte.

- Regras e multiplayer: manter cenários de estado/comandos em `rules-engine`, `rules-and-multiplayer`, `online-*` e regressões específicas de cartas. `test:rules` conserva toda a suíte por compatibilidade, incluindo apresentação.
- Apresentação: `npm run test:presentation` é o ciclo focado de artes, loading e contratos de interação. Outros contratos de UI continuam na execução completa.
- `card-art-lifecycle` e `match-loading-lifecycle`: testes comportamentais com fronteiras de navegador controladas; não dependem de serviços externos, PDF real ou temporizações de relógio. O código sob teste é o módulo da aplicação, com estado isolado por cenário.
- Contratos estáticos: reservar para integração/estrutura que não seja exercitada por um teste comportamental. Evitar asserts de nomes de variáveis, constantes de layout e sintaxe exata quando o comportamento puder ser executado.

O helper em `helpers/` só é importado pelos testes. Nunca importar fixtures ou helpers em `app/`. Executar `npm test` antes de abrir uma revisão; o subconjunto de apresentação não cobre sozinho regras ou online.
