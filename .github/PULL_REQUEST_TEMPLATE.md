<!--
Título no padrão Conventional Commits, em português:
  feat: adiciona cancelamento de carona pela interface
  fix: corrige fuso na busca por data
  docs: atualiza o contrato da API
-->

## O que entra

<!-- Uma ou duas frases: o que este PR resolve e por quê. -->

## Como testar

<!--
Passo a passo para quem for revisar. Se dá para reproduzir pela interface ou
pelo Swagger em /docs, diga por onde entrar e com qual usuário do seed.
-->

## Regras de negócio afetadas

<!--
Cite as RNs que este PR toca (RN-01 a RN-10, listadas em docs/modelagem-dados.md),
ou escreva "nenhuma".
-->

## Débitos técnicos

<!--
Abriu algum? Pagou algum? Registre em docs/debitos-tecnicos.md e cite o ID aqui.
Adiar de propósito é decisão válida — deixar sem registro não é.
-->

---

## Definition of Done

- [ ] Segue o [guia de estilo](../docs/guia-de-estilo.md)
- [ ] Sem `catch` vazio, sem código morto, sem credencial no código
- [ ] `npm run typecheck` limpo
- [ ] CI verde
- [ ] Code Review aprovado por outro dev
- [ ] Validado pelo QA
