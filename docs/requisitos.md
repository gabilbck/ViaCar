# ViaCar — Especificação de Requisitos (N1)

> Case 14 — Gestão de Caronas Corporativas · Equipe Draft
> **Responsável:** Henrique Cordeiro de Oliveira — Engenheiro de Requisitos
> Revisão: 16/09/2026

Este documento é a fonte de verdade sobre **o que** o sistema faz. O **como** está em [`modelagem-dados.md`](modelagem-dados.md) (DER e regras de negócio) e em [`plano-acao-backend.md`](plano-acao-backend.md) (contrato da API). Toda história aqui atende à DoR da Seção 3.1 do Acordo de Equipe — documento do time, mantido fora do repositório.

---

## 1. Problema e visão

Funcionários que moram no mesmo bairro fazem o mesmo trajeto para a empresa todos os dias, cada um no seu carro ou pagando transporte. O ViaCar conecta quem dirige com quem precisa de carona: o motorista cadastra sua rota e oferta as vagas livres do carro; o colega do mesmo bairro reserva a vaga em vez de gastar com transporte.

**Critério de sucesso do N1:** um funcionário consegue, do zero, cadastrar rota, abrir uma carona e ter a vaga reservada por outro funcionário — sem que o sistema permita ofertar mais vagas do que o carro comporta e sem overbooking.

---

## 2. Atores

| Ator | Descrição |
|---|---|
| **Funcionário** | Usuário autenticado do sistema. Único tipo de conta. |
| **Motorista** | Papel **contextual** do funcionário na carona que ele abriu. |
| **Passageiro** | Papel **contextual** do funcionário na reserva que ele fez. |
| **Administrador de RH** | Ator previsto para N2/N3 (gestão de pontos e resgates). **Fora do escopo do N1.** |

O mesmo funcionário é motorista e passageiro conforme o contexto — inclusive no mesmo dia (ida dirigindo, volta de carona). Por isso não existe cadastro separado de motorista ou passageiro.

---

## 3. Escopo do N1

### 3.1. Dentro do escopo

Cadastro e autenticação de funcionário · cadastro de veículo com capacidade · cadastro de rota recorrente · abertura de carona com oferta de vagas · busca de caronas abertas por bairro, data e sentido · reserva de vaga · cancelamento de reserva e de carona.

### 3.2. Fora do escopo (modelado, não implementado)

Acúmulo de pontos e resgate de voucher/folga · avaliação de conduta · geolocalização e cálculo de rota no mapa · notificações por e-mail ou push · painel administrativo.

> O DER já contempla `EXTRATO_PONTOS`, `AVALIACAO` e `RESGATE`, e os enums de `RESERVA` já preveem `REALIZADA` e `NAO_COMPARECEU`. Ver Seção 4 da modelagem de dados.

---

## 4. Requisitos funcionais

| ID | Requisito | Prioridade |
|---|---|---|
| RF-01 | Cadastrar funcionário com nome, e-mail corporativo, matrícula, telefone e bairro | Essencial |
| RF-02 | Autenticar funcionário e emitir token de sessão | Essencial |
| RF-03 | Consultar e editar o próprio perfil | Desejável |
| RF-04 | Cadastrar veículo informando placa, modelo, cor e capacidade de passageiros | Essencial |
| RF-05 | Listar, editar e inativar os próprios veículos | Desejável |
| RF-06 | Cadastrar rota recorrente com origem, destino, horário, sentido e dias da semana | Essencial |
| RF-07 | Listar, editar e inativar as próprias rotas | Desejável |
| RF-08 | Abrir carona a partir de uma rota, escolhendo veículo, data e número de vagas | Essencial |
| RF-09 | Buscar caronas abertas filtrando por bairro de origem, data e sentido | Essencial |
| RF-10 | Consultar o detalhe de uma carona, com vagas disponíveis e passageiros confirmados | Essencial |
| RF-11 | Reservar uma vaga em carona aberta | Essencial |
| RF-12 | Cancelar a própria reserva, liberando a vaga | Essencial |
| RF-13 | Cancelar a própria carona, cancelando as reservas em cascata | Essencial |
| RF-14 | Listar as caronas em que o funcionário é motorista | Desejável |
| RF-15 | Listar as reservas em que o funcionário é passageiro | Desejável |
| RF-16 | Alterar o número de vagas de uma carona já aberta | Desejável |

## 5. Requisitos não funcionais

| ID | Requisito | Verificação |
|---|---|---|
| RNF-01 | Todo endpoint, exceto cadastro e login, exige token JWT válido | Teste automatizado: requisição sem token retorna 401 |
| RNF-02 | Senha nunca é armazenada nem trafegada em texto puro | Inspeção do schema e do payload de resposta |
| RNF-03 | A reserva de vaga é atômica sob concorrência: duas requisições simultâneas na última vaga não podem ambas ser confirmadas | Teste de requisições paralelas |
| RNF-04 | O contrato da API é navegável em `/docs` (Swagger) e reflete o código em produção | Conferência manual antes da entrega |
| RNF-05 | Erros seguem formato único `{ erro, mensagem, campo }`, com mensagem em português legível ao usuário final | Revisão de código no PR |
| RNF-06 | Payload inválido é rejeitado com 400 antes de chegar à regra de negócio | Testes de validação |
| RNF-07 | O ambiente sobe do zero em máquina limpa com Docker e um comando de seed | Ensaio de clone limpo antes do pitch |
| RNF-08 | Os testes automatizados rodam contra banco separado, sem tocar nos dados de desenvolvimento | `npm test` em `viacar_test` |
| RNF-09 | O vocabulário do domínio é o do case, em português, em código, banco, API e interface | Guia de estilo, Seção 5.1 |

---

## 6. Histórias de usuário

Formato exigido pela DoR: **"Como [papel], eu quero [funcionalidade] para que [benefício]"**.

### US-01 — Cadastro de funcionário
> Como **funcionário da empresa**, eu quero **criar minha conta com meu e-mail corporativo e meu bairro**, para que **eu possa ser encontrado por colegas que fazem o mesmo trajeto**.

**Critérios de aceitação**
- Nome, e-mail, senha, matrícula e bairro são obrigatórios; telefone é opcional.
- E-mail e matrícula são únicos: repetir qualquer um dos dois retorna erro informando qual campo está duplicado.
- A senha é gravada com hash; a resposta do cadastro nunca traz o campo de senha.
- Após o cadastro, o funcionário consegue autenticar imediatamente.

**RF:** RF-01 · **RNF:** RNF-02, RNF-06

---

### US-02 — Autenticação
> Como **funcionário cadastrado**, eu quero **entrar no sistema com e-mail e senha**, para que **eu acesse minhas rotas, caronas e reservas com segurança**.

**Critérios de aceitação**
- Credenciais corretas retornam um token de sessão e os dados do funcionário.
- Credenciais incorretas retornam 401 com mensagem genérica, sem revelar se o e-mail existe.
- Requisição a qualquer endpoint protegido sem token, ou com token expirado, retorna 401.

**RF:** RF-02 · **RNF:** RNF-01

---

### US-03 — Cadastro de veículo
> Como **motorista**, eu quero **cadastrar meu carro informando quantos passageiros ele comporta**, para que **o sistema saiba o limite real de vagas que posso ofertar**.

**Critérios de aceitação**
- Placa, modelo, cor e capacidade de passageiros são obrigatórios; a placa é única.
- A capacidade aceita apenas valores de 1 a 8; fora disso, retorna 400.
- A capacidade **não inclui o motorista** — o campo é rotulado e documentado nesses termos na interface e no Swagger.
- O funcionário só enxerga e edita os próprios veículos.

**RF:** RF-04, RF-05 · **RN:** RN-03

---

### US-04 — Cadastro de rota recorrente
> Como **motorista**, eu quero **cadastrar uma vez o trajeto que faço todo dia**, para que **eu não precise redigitar origem, destino e horário a cada carona que abrir**.

**Critérios de aceitação**
- Origem (endereço e bairro), destino (endereço e bairro), horário de partida, sentido (ida ou volta) e dias da semana são obrigatórios.
- A rota fica vinculada ao funcionário que a cadastrou, e só ele a edita ou inativa.
- Inativar uma rota não apaga as caronas já geradas a partir dela.

**RF:** RF-06, RF-07

---

### US-05 — Abertura de carona respeitando a capacidade do veículo *(história crítica do case)*
> Como **motorista**, eu quero **abrir a carona de um dia escolhendo o carro e quantas vagas vou ofertar**, para que **colegas possam reservar — sem que eu ofereça mais lugares do que o carro tem**.

**Critérios de aceitação**
- O motorista escolhe uma rota sua, um veículo seu, a data de partida e o número de vagas.
- **Se as vagas ofertadas excederem a capacidade do veículo, a carona não é criada.** O erro identifica o veículo, sua capacidade e o número pedido: *"O Honda Civic de placa MHT4A21 comporta 4 passageiro(s), mas foram oferecidas 6 vagas."*
- Vagas ofertadas precisam ser maiores que zero.
- Usar veículo que pertence a outro funcionário é recusado.
- Não é possível abrir duas caronas para a mesma rota no mesmo dia, independente do horário. Caronas canceladas não bloqueiam o dia.
- A carona nasce com status `ABERTA`.

**RF:** RF-08 · **RN:** RN-01 (crítica), RN-03

---

### US-06 — Busca de caronas do meu bairro
> Como **passageiro**, eu quero **buscar caronas abertas que saem do meu bairro na data e no sentido que preciso**, para que **eu encontre um colega com quem dividir o trajeto em vez de pagar transporte**.

**Critérios de aceitação**
- Os filtros disponíveis são bairro de origem, data e sentido, combináveis entre si.
- Só aparecem caronas com status `ABERTA` e data de partida no futuro.
- **A busca não retorna as caronas do próprio funcionário** — ele não reserva vaga consigo mesmo.
- Cada resultado exibe origem, destino, horário, motorista, modelo do carro e vagas disponíveis.
- Busca sem resultado retorna lista vazia com mensagem orientando o usuário, não erro.

**RF:** RF-09 · **RN:** RN-04, RN-05

---

### US-07 — Reserva de vaga sem overbooking
> Como **passageiro**, eu quero **reservar uma vaga na carona que escolhi**, para que **meu lugar esteja garantido no dia**.

**Critérios de aceitação**
- A reserva só é aceita em carona `ABERTA` com data futura e vaga disponível.
- **Duas reservas simultâneas na última vaga não podem ser confirmadas ao mesmo tempo:** uma é confirmada e a outra é recusada com mensagem de vaga indisponível.
- Reservar duas vezes a mesma carona é recusado.
- O motorista não pode reservar vaga na própria carona.
- Ao preencher a última vaga, a carona passa automaticamente para `LOTADA` e some da busca.

**RF:** RF-11 · **RN:** RN-02, RN-04, RN-05, RN-07 · **RNF:** RNF-03

---

### US-08 — Uma carona por vez no mesmo trajeto
> Como **passageiro**, eu quero **ser impedido de confirmar duas caronas para o mesmo deslocamento**, para que **eu não ocupe um lugar que outro colega poderia usar**.

**Critérios de aceitação**
- Tentar confirmar uma segunda reserva no mesmo dia-calendário e mesmo sentido é recusado, indicando a reserva que já existe.
- "Mesmo dia" é o dia no fuso da empresa, não em UTC — a carona de volta das 22h pertence ao dia em que ela sai.
- Ida e volta no mesmo dia continuam permitidas, porque têm sentidos diferentes.

**RF:** RF-11 · **RN:** RN-10

---

### US-09 — Cancelamento de reserva liberando a vaga
> Como **passageiro**, eu quero **cancelar minha reserva quando meus planos mudarem**, para que **a vaga volte a ficar disponível para outro colega**.

**Critérios de aceitação**
- O passageiro cancela apenas as próprias reservas.
- A vaga é liberada na mesma operação, e a carona que estava `LOTADA` volta a `ABERTA` e reaparece na busca.
- A reserva cancelada fica registrada com status `CANCELADA` e data de cancelamento — não é apagada.
- Depois de cancelar, o passageiro pode reservar a mesma carona novamente, se ainda houver vaga.

**RF:** RF-12 · **RN:** RN-06

---

### US-10 — Cancelamento de carona pelo motorista
> Como **motorista**, eu quero **cancelar uma carona que não vou fazer**, para que **os passageiros não fiquem esperando por uma viagem que não vai acontecer**.

**Critérios de aceitação**
- Só o motorista dono da rota cancela a carona; outro funcionário recebe 403.
- Todas as reservas confirmadas são canceladas junto, em uma única operação — ou tudo é cancelado, ou nada é.
- A carona cancelada sai da busca e fica com status `CANCELADA`.

**RF:** RF-13 · **RN:** RN-08, RN-09

---

### US-11 — Acompanhar minhas caronas e reservas
> Como **funcionário**, eu quero **ver em um só lugar as caronas que ofereci e as vagas que reservei**, para que **eu saiba meus compromissos da semana**.

**Critérios de aceitação**
- Como motorista, vê suas caronas com status, data e passageiros confirmados.
- Como passageiro, vê suas reservas com a carona, o motorista e o ponto de embarque.
- Itens cancelados aparecem sinalizados, não somem da lista.

**RF:** RF-10, RF-14, RF-15

---

### US-12 — Ajuste de vagas em carona já aberta
> Como **motorista**, eu quero **alterar o número de vagas de uma carona que já abri**, para que **eu possa acomodar uma mudança de última hora no carro**.

**Critérios de aceitação**
- A alteração revalida a capacidade do veículo e é recusada se exceder.
- Não é possível reduzir as vagas abaixo do número de reservas já confirmadas.
- Reduzir as vagas até o número de reservas confirmadas fecha a carona (`LOTADA`) e ela sai da busca.
- Aumentar as vagas de uma carona `LOTADA` a devolve para `ABERTA` e ela reaparece na busca.
- Só o motorista dono da carona altera.

**RF:** RF-16 · **RN:** RN-01, RN-06, RN-07, RN-09

---

## 7. Matriz de rastreabilidade

| História | RF | Regra de negócio | Endpoint principal |
|---|---|---|---|
| US-01 | RF-01 | — | `POST /auth/registrar` |
| US-02 | RF-02 | — | `POST /auth/login` |
| US-03 | RF-04, RF-05 | RN-03 | `POST /veiculos` |
| US-04 | RF-06, RF-07 | — | `POST /rotas` |
| US-05 | RF-08 | **RN-01**, RN-03 | `POST /caronas` |
| US-06 | RF-09 | RN-04, RN-05 | `GET /caronas` |
| US-07 | RF-11 | **RN-02**, RN-04, RN-05, RN-07 | `POST /caronas/:id/reservas` |
| US-08 | RF-11 | RN-10 | `POST /caronas/:id/reservas` |
| US-09 | RF-12 | RN-06 | `DELETE /reservas/:id` |
| US-10 | RF-13 | RN-08, RN-09 | `POST /caronas/:id/cancelar` |
| US-11 | RF-10, RF-14, RF-15 | — | `GET /caronas/minhas`, `GET /reservas/minhas` |
| US-12 | RF-16 | RN-01, RN-09 | `PATCH /caronas/:id` |

> Cobertura: as dez regras de negócio (RN-01 a RN-10) estão referenciadas por pelo menos uma história. Nenhuma funcionalidade do enunciado do case ficou sem história correspondente.

---

## 8. Glossário

| Termo | Significado no ViaCar |
|---|---|
| **Rota** | Trajeto recorrente do motorista. Cadastrado uma vez. |
| **Carona** | Viagem concreta de um dia, gerada a partir de uma rota. |
| **Reserva** | Vaga tomada por um passageiro em uma carona. |
| **Vaga ofertada** | Quantidade de lugares que o motorista disponibiliza naquela carona. |
| **Vaga disponível** | Vagas ofertadas menos reservas confirmadas. Sempre calculado, nunca armazenado. |
| **Capacidade do veículo** | Passageiros que o carro comporta, **sem contar o motorista**. |
| **Sentido** | Ida (casa → empresa) ou volta (empresa → casa). |

---

## 9. Premissas e questões em aberto

**Premissas**
- Todo usuário é funcionário da mesma empresa; não há cadastro público.
- Bairro é preenchido pelo funcionário como texto livre no N1.
- Não há cobrança, rateio de combustível nem pagamento dentro do sistema.
- **A lista de passageiros de uma carona é visível por vínculo com a carona, não por autenticação.** O motorista publica a carona para ser encontrado, e por isso o resumo dele circula na busca; o passageiro não publicou nada para a empresa inteira, entrou numa viagem específica. Decisão do PO em 27/10/2026, detalhada no DT-23 §2.1 — **decidida, ainda não implementada**. Não houve validação com DPO ou jurídico: o ViaCar não tem cliente real no N1, então a política é premissa do time, a ser reconfirmada se o produto sair do contexto acadêmico.

**Questões em aberto (para o próximo ciclo)**
| # | Questão | Encaminhamento |
|---|---|---|
| Q-01 | Bairro em texto livre quebra a busca por variação de grafia | Registrado como DT-06 |
| Q-02 | Quem marca a carona como concluída, já que não há job de mudança de status | **Definido em 29/10/2026** (DT-09): o motorista registra a presença de cada passageiro entre a partida e 7 dias depois; vencido o prazo, a carona fecha sozinha e as reservas sem registro não pontuam nem penalizam. Implementação pendente |
| Q-03 | Como tratar feriado e exceção de calendário na recorrência da rota | Registrado como DT-07 |
| Q-04 | Regra de pontuação do N2 ainda não definida (quanto vale uma viagem) | Levar ao PO no planejamento do N2 |
| Q-05 | O formulário de reserva não avisa quem verá o ponto de embarque informado | Registrado como DT-32; texto depende de aprovação do PO |
