/**
 * Especificacao OpenAPI servida em /docs. E a fonte da verdade do contrato:
 * se esta divergindo do codigo, o bug esta aqui.
 *
 * Documentar so o que ja responde: o frontend nao deve construir tela em cima
 * de endpoint que ainda nao existe.
 */

const erro = {
  type: 'object',
  properties: {
    erro: {
      type: 'string',
      enum: ['VALIDACAO', 'NAO_AUTENTICADO', 'SEM_PERMISSAO', 'NAO_ENCONTRADO', 'CONFLITO', 'REGRA_NEGOCIO'],
    },
    mensagem: { type: 'string', description: 'Texto em portugues, pronto para exibir ao usuario final.' },
    campo: { type: 'string', nullable: true, description: 'Campo do payload que causou o erro, quando aplicavel.' },
  },
  example: {
    erro: 'CONFLITO',
    mensagem: 'Ja existe um veiculo cadastrado com a placa MHT4A21.',
    campo: 'placa',
  },
} as const;

function respostaErro(descricao: string) {
  return {
    description: descricao,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
  };
}

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'ViaCar API',
    version: '1.0.0',
    description: [
      'API de gestao de caronas corporativas — Case 14, Equipe Draft.',
      '',
      '**Autenticacao:** todas as rotas exigem `Authorization: Bearer <token>`, exceto `/health` e `/auth/*`.',
      'O token vale 8 horas — a jornada de trabalho, para cobrir da ida ate a carona da volta.',
      '',
      '**Datas** em ISO 8601 UTC. **Ids** em UUID v4. **Corpo** em JSON camelCase.',
      '',
      '⚠️ **Fuso horario:** `dataPartida` e o instante real. Uma carona das 07:30 em Joinville',
      'chega como `10:30Z`. Exiba com `toLocaleTimeString("pt-BR")` — cortar a string do ISO',
      'mostraria 10:30. Ja `rota.horarioPartida` e hora de parede pura, vem como `"07:30"`.',
      '',
      '**Reservar vaga** e `POST /caronas/{caronaId}/reservas`. A vaga so e considerada ocupada',
      'com a reserva `CONFIRMADA` — `vagasDisponiveis` ja desconta isso e nunca precisa ser calculado na tela.',
    ].join('\n'),
  },
  servers: [{ url: 'http://localhost:3333', description: 'Desenvolvimento local' }],
  tags: [
    { name: 'Sistema', description: 'Disponibilidade da API' },
    { name: 'Autenticacao', description: 'Cadastro e login de funcionarios' },
    { name: 'Perfil', description: 'Dados do funcionario logado' },
    { name: 'Veiculos', description: 'Carros do funcionario — a capacidade define o teto da RN-01' },
    { name: 'Rotas', description: 'O trajeto recorrente: origem, destino, horario e dias da semana' },
    { name: 'Caronas', description: 'A viagem de um dia — onde vive a RN-01 do case' },
    { name: 'Reservas', description: 'A vaga do passageiro — onde vive a RN-02, sem overbooking' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Erro: erro,
      Usuario: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          nome: { type: 'string' },
          email: { type: 'string', format: 'email' },
          matricula: { type: 'string' },
          telefone: { type: 'string', nullable: true },
          bairro: { type: 'string', description: 'Usado para aproximar quem mora perto na busca de caronas.' },
          ativo: { type: 'boolean' },
          criadoEm: { type: 'string', format: 'date-time' },
        },
        example: {
          id: '9f1c4a2e-77b0-4d31-a0c8-1e5b3d9f0a12',
          nome: 'Willian Squena',
          email: 'willian@viacar.com.br',
          matricula: 'F-10428',
          telefone: '(47) 99812-4455',
          bairro: 'Costa e Silva',
          ativo: true,
          criadoEm: '2026-09-10T13:02:11.000Z',
        },
      },
      RespostaAutenticacao: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'JWT valido por 8 horas.' },
          usuario: { $ref: '#/components/schemas/Usuario' },
        },
      },
      Veiculo: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          usuarioId: { type: 'string', format: 'uuid' },
          placa: { type: 'string', description: 'Normalizada em maiusculas, sem hifen.' },
          modelo: { type: 'string' },
          cor: { type: 'string' },
          capacidadePassageiros: {
            type: 'integer',
            minimum: 1,
            maximum: 8,
            description: 'NAO inclui o motorista. Um Civic de 5 lugares tem capacidade 4.',
          },
          ativo: { type: 'boolean' },
          criadoEm: { type: 'string', format: 'date-time' },
        },
        example: {
          id: '3d7a11c4-9e02-4b8a-96f1-c0d4e7a51b33',
          usuarioId: '9f1c4a2e-77b0-4d31-a0c8-1e5b3d9f0a12',
          placa: 'MHT4A21',
          modelo: 'Honda Civic',
          cor: 'Prata',
          capacidadePassageiros: 4,
          ativo: true,
          criadoEm: '2026-09-11T09:15:00.000Z',
        },
      },
      Rota: {
        type: 'object',
        description: 'O trajeto recorrente do motorista. A viagem de um dia específico é a Carona.',
        properties: {
          id: { type: 'string', format: 'uuid' },
          apelido: { type: 'string' },
          origemEndereco: { type: 'string' },
          origemBairro: { type: 'string' },
          destinoEndereco: { type: 'string' },
          destinoBairro: { type: 'string' },
          horarioPartida: {
            type: 'string',
            example: '07:30',
            description: 'Hora de parede, sem data e sem fuso. Não precisa de conversão no frontend.',
          },
          sentido: { type: 'string', enum: ['IDA', 'VOLTA'] },
          diasSemana: {
            type: 'array',
            items: { type: 'integer', minimum: 1, maximum: 7 },
            description: '1 = segunda ... 7 = domingo. Devolvido sem repetição e em ordem.',
          },
          ativa: { type: 'boolean' },
          criadoEm: { type: 'string', format: 'date-time' },
        },
        example: {
          id: '7c2f9a10-4b6e-4d0a-9b2f-8e1c5a7d3f44',
          apelido: 'Costa e Silva → Empresa',
          origemEndereco: 'Rua Ministro Calógeras, 1200',
          origemBairro: 'Costa e Silva',
          destinoEndereco: 'Rod. Dr. Paulo Schroeder, 3000',
          destinoBairro: 'Zona Industrial Norte',
          horarioPartida: '07:30',
          sentido: 'IDA',
          diasSemana: [1, 2, 3, 4, 5],
          ativa: true,
          criadoEm: '2026-09-11T09:20:00.000Z',
        },
      },
      Carona: {
        type: 'object',
        description: 'A viagem de um dia específico, gerada a partir de uma Rota.',
        properties: {
          id: { type: 'string', format: 'uuid' },
          dataPartida: {
            type: 'string',
            format: 'date-time',
            description:
              'Instante real em UTC. 07:30 em Joinville chega como 10:30Z — use toLocaleTimeString para exibir.',
          },
          vagasOfertadas: { type: 'integer' },
          vagasDisponiveis: {
            type: 'integer',
            description: 'Calculado: vagasOfertadas menos as reservas confirmadas. Nunca recalcule no frontend.',
          },
          status: {
            type: 'string',
            enum: ['ABERTA', 'LOTADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'],
          },
          observacao: { type: 'string', nullable: true },
          motorista: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              nome: { type: 'string' },
              bairro: { type: 'string' },
              telefone: { type: 'string', nullable: true },
            },
          },
          veiculo: {
            type: 'object',
            properties: {
              placa: { type: 'string' },
              modelo: { type: 'string' },
              cor: { type: 'string' },
              capacidadePassageiros: { type: 'integer' },
            },
          },
          rota: {
            type: 'object',
            properties: {
              apelido: { type: 'string' },
              origemEndereco: { type: 'string' },
              origemBairro: { type: 'string' },
              destinoEndereco: { type: 'string' },
              destinoBairro: { type: 'string' },
              horarioPartida: { type: 'string', example: '07:30' },
              sentido: { type: 'string', enum: ['IDA', 'VOLTA'] },
            },
          },
          criadoEm: { type: 'string', format: 'date-time' },
        },
      },
      CaronaDetalhada: {
        allOf: [
          { $ref: '#/components/schemas/Carona' },
          {
            type: 'object',
            properties: {
              passageiros: {
                type: 'array',
                description:
                  'Só aparece em GET /caronas/{id}. Na listagem, use vagasDisponiveis. O recorte depende de quem pede — ver a descricao do endpoint. **Ausente** quando quem pede nao pode ver ninguem; `[]` significa "ninguem reservou".',
                items: {
                  type: 'object',
                  required: ['nome', 'bairro'],
                  properties: {
                    id: {
                      type: 'string',
                      format: 'uuid',
                      description: 'So para o motorista e os passageiros confirmados.',
                    },
                    nome: {
                      type: 'string',
                      description: 'Nome completo para quem esta na carona; so o primeiro nome para os demais.',
                    },
                    bairro: { type: 'string' },
                    pontoEmbarque: {
                      type: 'string',
                      nullable: true,
                      description:
                        'O motorista ve o de todos; o passageiro, so o proprio. Ausente nos demais casos.',
                    },
                  },
                },
              },
            },
          },
        ],
      },
      Reserva: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          caronaId: { type: 'string', format: 'uuid' },
          status: {
            type: 'string',
            enum: ['CONFIRMADA', 'CANCELADA', 'REALIZADA', 'NAO_COMPARECEU'],
            description:
              'REALIZADA e NAO_COMPARECEU existem para a pontuacao e a avaliacao de conduta (N2/N3). Na N1 so CONFIRMADA e CANCELADA aparecem.',
          },
          pontoEmbarque: { type: 'string', nullable: true, example: 'Portaria do condominio' },
          criadoEm: { type: 'string', format: 'date-time' },
          canceladoEm: { type: 'string', format: 'date-time', nullable: true },
          carona: {
            allOf: [{ $ref: '#/components/schemas/Carona' }],
            description:
              'Vem embutida para a tela de reservas nao precisar de uma requisicao por linha.',
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Sistema'],
        summary: 'Verifica API e banco',
        description: 'Consulta o banco de verdade — nao responde "ok" so por estar de pe.',
        security: [],
        responses: {
          200: {
            description: 'API e banco respondendo',
            content: {
              'application/json': {
                example: {
                  status: 'ok',
                  servico: 'viacar-api',
                  banco: 'conectado',
                  ambiente: 'development',
                  horario: '2026-09-11T09:00:00.000Z',
                },
              },
            },
          },
        },
      },
    },
    '/auth/registrar': {
      post: {
        tags: ['Autenticacao'],
        summary: 'Cadastra um funcionario',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nome', 'email', 'senha', 'matricula', 'bairro'],
                properties: {
                  nome: { type: 'string', minLength: 3, maxLength: 120 },
                  email: { type: 'string', format: 'email', maxLength: 160 },
                  senha: { type: 'string', minLength: 8, maxLength: 72 },
                  matricula: { type: 'string', minLength: 2, maxLength: 20 },
                  telefone: { type: 'string', maxLength: 20 },
                  bairro: { type: 'string', minLength: 2, maxLength: 80 },
                },
              },
              example: {
                nome: 'Willian Squena',
                email: 'willian@viacar.com.br',
                senha: 'viacar123',
                matricula: 'F-10428',
                telefone: '(47) 99812-4455',
                bairro: 'Costa e Silva',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Funcionario cadastrado e ja autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RespostaAutenticacao' } },
            },
          },
          400: respostaErro('Payload invalido'),
          409: respostaErro('E-mail ou matricula ja cadastrados'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Autenticacao'],
        summary: 'Autentica e devolve o token',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'senha'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  senha: { type: 'string' },
                },
              },
              example: { email: 'willian@viacar.com.br', senha: 'viacar123' },
            },
          },
        },
        responses: {
          200: {
            description: 'Autenticado',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RespostaAutenticacao' } },
            },
          },
          401: respostaErro('E-mail ou senha incorretos'),
          403: respostaErro('Cadastro inativo'),
        },
      },
    },
    '/usuarios/me': {
      get: {
        tags: ['Perfil'],
        summary: 'Dados do funcionario logado',
        responses: {
          200: {
            description: 'Perfil',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Usuario' } } },
          },
          401: respostaErro('Token ausente, invalido ou expirado'),
        },
      },
      patch: {
        tags: ['Perfil'],
        summary: 'Atualiza contato e bairro',
        description: 'Nome, e-mail e matricula sao dados funcionais e nao se editam por aqui.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                minProperties: 1,
                properties: {
                  telefone: { type: 'string', nullable: true, maxLength: 20 },
                  bairro: { type: 'string', minLength: 2, maxLength: 80 },
                },
              },
              example: { telefone: '(47) 99812-4455', bairro: 'Bucarein' },
            },
          },
        },
        responses: {
          200: {
            description: 'Perfil atualizado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Usuario' } } },
          },
          400: respostaErro('Nenhum campo informado ou payload invalido'),
          401: respostaErro('Nao autenticado'),
        },
      },
    },
    '/veiculos': {
      post: {
        tags: ['Veiculos'],
        summary: 'Cadastra um veiculo',
        description:
          'A capacidade informada vira o teto da RN-01: nenhuma carona deste veiculo podera ofertar mais vagas do que isto.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['placa', 'modelo', 'cor', 'capacidadePassageiros'],
                properties: {
                  placa: { type: 'string', example: 'MHT4A21' },
                  modelo: { type: 'string', maxLength: 80 },
                  cor: { type: 'string', maxLength: 40 },
                  capacidadePassageiros: { type: 'integer', minimum: 1, maximum: 8 },
                },
              },
              example: { placa: 'MHT4A21', modelo: 'Honda Civic', cor: 'Prata', capacidadePassageiros: 4 },
            },
          },
        },
        responses: {
          201: {
            description: 'Veiculo cadastrado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Veiculo' } } },
          },
          400: respostaErro('Placa fora do formato ou capacidade fora de 1..8'),
          401: respostaErro('Nao autenticado'),
          409: respostaErro('Placa ja cadastrada'),
        },
      },
      get: {
        tags: ['Veiculos'],
        summary: 'Lista os veiculos do funcionario logado',
        description: 'Retorna apenas os ativos.',
        responses: {
          200: {
            description: 'Lista de veiculos',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Veiculo' } },
              },
            },
          },
          401: respostaErro('Nao autenticado'),
        },
      },
    },
    '/veiculos/{id}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      get: {
        tags: ['Veiculos'],
        summary: 'Detalhe de um veiculo',
        responses: {
          200: {
            description: 'Veiculo',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Veiculo' } } },
          },
          401: respostaErro('Nao autenticado'),
          403: respostaErro('O veiculo pertence a outro funcionario'),
          404: respostaErro('Veiculo nao encontrado'),
        },
      },
      patch: {
        tags: ['Veiculos'],
        summary: 'Atualiza um veiculo',
        description:
          'Baixar a capacidade e bloqueado se alguma carona ja publicada oferta mais vagas do que a nova capacidade.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                minProperties: 1,
                properties: {
                  placa: { type: 'string' },
                  modelo: { type: 'string' },
                  cor: { type: 'string' },
                  capacidadePassageiros: { type: 'integer', minimum: 1, maximum: 8 },
                },
              },
              example: { cor: 'Preto', capacidadePassageiros: 3 },
            },
          },
        },
        responses: {
          200: {
            description: 'Veiculo atualizado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Veiculo' } } },
          },
          400: respostaErro('Payload invalido'),
          401: respostaErro('Nao autenticado'),
          403: respostaErro('O veiculo pertence a outro funcionario'),
          404: respostaErro('Veiculo nao encontrado'),
          409: respostaErro('Placa ja usada por outro veiculo'),
          422: respostaErro('Capacidade menor que as vagas ja ofertadas em uma carona'),
        },
      },
      delete: {
        tags: ['Veiculos'],
        summary: 'Remove um veiculo',
        description:
          'Soft delete: o registro fica com `ativo: false`. O veiculo nunca e apagado porque as caronas passadas apontam para ele. Recadastrar a mesma placa reativa este registro.',
        responses: {
          204: { description: 'Veiculo inativado' },
          401: respostaErro('Nao autenticado'),
          403: respostaErro('O veiculo pertence a outro funcionario'),
          404: respostaErro('Veiculo nao encontrado'),
          422: respostaErro('Veiculo com carona agendada'),
        },
      },
    },

    '/rotas': {
      post: {
        tags: ['Rotas'],
        summary: 'Cadastra uma rota',
        description: 'O trajeto recorrente. Cadastra uma vez e gera caronas a partir dele.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'apelido',
                  'origemEndereco',
                  'origemBairro',
                  'destinoEndereco',
                  'destinoBairro',
                  'horarioPartida',
                  'sentido',
                  'diasSemana',
                ],
                properties: {
                  apelido: { type: 'string', minLength: 3, maxLength: 120 },
                  origemEndereco: { type: 'string', minLength: 5, maxLength: 200 },
                  origemBairro: { type: 'string', minLength: 2, maxLength: 80 },
                  destinoEndereco: { type: 'string', minLength: 5, maxLength: 200 },
                  destinoBairro: { type: 'string', minLength: 2, maxLength: 80 },
                  horarioPartida: { type: 'string', example: '07:30' },
                  sentido: { type: 'string', enum: ['IDA', 'VOLTA'] },
                  diasSemana: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 7 } },
                },
              },
              example: {
                apelido: 'Costa e Silva → Empresa',
                origemEndereco: 'Rua Ministro Calógeras, 1200',
                origemBairro: 'Costa e Silva',
                destinoEndereco: 'Rod. Dr. Paulo Schroeder, 3000',
                destinoBairro: 'Zona Industrial Norte',
                horarioPartida: '07:30',
                sentido: 'IDA',
                diasSemana: [1, 2, 3, 4, 5],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Rota cadastrada',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Rota' } } },
          },
          400: respostaErro('Payload invalido'),
          401: respostaErro('Nao autenticado'),
        },
      },
      get: {
        tags: ['Rotas'],
        summary: 'Lista as rotas ativas do motorista logado',
        responses: {
          200: {
            description: 'Lista de rotas',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Rota' } },
              },
            },
          },
          401: respostaErro('Nao autenticado'),
        },
      },
    },
    '/rotas/{id}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      get: {
        tags: ['Rotas'],
        summary: 'Detalhe de uma rota',
        responses: {
          200: {
            description: 'Rota',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Rota' } } },
          },
          403: respostaErro('A rota pertence a outro funcionario'),
          404: respostaErro('Rota nao encontrada'),
        },
      },
      patch: {
        tags: ['Rotas'],
        summary: 'Atualiza uma rota',
        description:
          'Alterar o horario NAO mexe nas caronas ja publicadas: o instante delas foi congelado na criacao, e mudar retroativamente moveria o horario combinado com quem ja reservou.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', minProperties: 1 },
              example: { horarioPartida: '07:15', diasSemana: [1, 3, 5] },
            },
          },
        },
        responses: {
          200: {
            description: 'Rota atualizada',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Rota' } } },
          },
          400: respostaErro('Payload invalido'),
          403: respostaErro('A rota pertence a outro funcionario'),
          404: respostaErro('Rota nao encontrada'),
        },
      },
      delete: {
        tags: ['Rotas'],
        summary: 'Remove uma rota',
        description: 'Soft delete. Caronas ja publicadas continuam validas.',
        responses: {
          204: { description: 'Rota inativada' },
          403: respostaErro('A rota pertence a outro funcionario'),
          404: respostaErro('Rota nao encontrada'),
          422: respostaErro('Rota com carona agendada'),
        },
      },
    },

    '/caronas': {
      post: {
        tags: ['Caronas'],
        summary: 'Abre uma carona',
        description: [
          '**Aqui vive a RN-01 do case:** `vagasOfertadas` não pode passar de `veiculo.capacidadePassageiros`.',
          'A regra é garantida em duas camadas — validação no serviço, com mensagem explicando qual carro e quantas vagas,',
          'e uma trigger no banco que barra até escrita que não passa pela API.',
          '',
          '**A data vem como "AAAA-MM-DD", não como instante.** A hora sai de `rota.horarioPartida`.',
          'É isso que faz "uma carona por rota por dia" ser realmente garantido.',
        ].join('\n'),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['rotaId', 'veiculoId', 'data', 'vagasOfertadas'],
                properties: {
                  rotaId: { type: 'string', format: 'uuid' },
                  veiculoId: { type: 'string', format: 'uuid' },
                  data: { type: 'string', example: '2026-09-15', description: 'AAAA-MM-DD' },
                  vagasOfertadas: { type: 'integer', minimum: 1, maximum: 8 },
                  observacao: { type: 'string', maxLength: 255 },
                },
              },
              example: {
                rotaId: '7c2f9a10-4b6e-4d0a-9b2f-8e1c5a7d3f44',
                veiculoId: '3d7a11c4-9e02-4b8a-96f1-c0d4e7a51b33',
                data: '2026-09-15',
                vagasOfertadas: 4,
                observacao: 'Passo no posto antes, saio 5 min mais cedo',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Carona aberta',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Carona' } } },
          },
          400: respostaErro('Payload invalido'),
          403: respostaErro('A rota ou o veiculo pertence a outro funcionario'),
          404: respostaErro('Rota ou veiculo nao encontrado'),
          409: respostaErro('Ja existe carona desta rota neste dia'),
          422: respostaErro('RN-01 violada, veiculo removido, ou data no passado'),
        },
      },
      get: {
        tags: ['Caronas'],
        summary: 'Busca caronas disponiveis',
        description: [
          'A tela que ataca o problema do case. Devolve apenas caronas **ABERTAS** e futuras, e **exclui as do proprio usuario** — a busca existe para achar quem vai no mesmo caminho, e a RN-04 proibe reservar vaga na propria carona.',
          '',
          '⚠️ `status = ABERTA` esconde tambem as **LOTADA**, nao so as canceladas. Uma carona some desta lista quando enche (RN-07) e volta quando alguem cancela (RN-06). Para acompanhar uma carona especifica depois de reservar, use `GET /caronas/{id}` ou `GET /reservas/minhas`, que nao filtram por status.',
        ].join('\n'),
        parameters: [
          {
            name: 'bairroOrigem',
            in: 'query',
            schema: { type: 'string' },
            description: 'Busca parcial, ignora maiusculas.',
            example: 'Costa e Silva',
          },
          { name: 'bairroDestino', in: 'query', schema: { type: 'string' } },
          {
            name: 'data',
            in: 'query',
            schema: { type: 'string', example: '2026-09-15' },
            description: 'AAAA-MM-DD. Filtra o dia no fuso da empresa.',
          },
          { name: 'sentido', in: 'query', schema: { type: 'string', enum: ['IDA', 'VOLTA'] } },
        ],
        responses: {
          200: {
            description: 'Caronas encontradas, da mais proxima para a mais distante',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Carona' } },
              },
            },
          },
          400: respostaErro('Filtro invalido'),
          401: respostaErro('Nao autenticado'),
        },
      },
    },
    '/caronas/minhas': {
      get: {
        tags: ['Caronas'],
        summary: 'Caronas em que sou o motorista',
        description: 'De hoje em diante, da mais proxima para a mais distante.',
        responses: {
          200: {
            description: 'Minhas caronas',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Carona' } },
              },
            },
          },
          401: respostaErro('Nao autenticado'),
        },
      },
    },
    '/caronas/{id}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      get: {
        tags: ['Caronas'],
        summary: 'Detalhe da carona, com a lista de passageiros',
        description: [
          'Qualquer funcionario autenticado ve o detalhe (vagas, rota, motorista, veiculo). O campo `passageiros` depende do vinculo de quem pede com a carona (DT-23):',
          '',
          '| Quem pede | `passageiros` |',
          '|---|---|',
          '| Motorista da carona | `id`, nome completo, bairro e `pontoEmbarque` de todos |',
          '| Passageiro confirmado | `id`, nome completo e bairro de todos; `pontoEmbarque` so o proprio |',
          '| Outro funcionario | Primeiro nome e bairro, sem `id` e sem `pontoEmbarque` |',
          '| Outro funcionario, carona encerrada | Campo ausente |',
          '',
          'Encerrada = `CANCELADA`, `CONCLUIDA` ou com `dataPartida` no passado. O primeiro nome reduz a exposicao, mas **nao anonimiza**: junto com o bairro, ainda pode identificar a pessoa.',
        ].join('\n'),
        responses: {
          200: {
            description: 'Carona detalhada',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CaronaDetalhada' } },
            },
          },
          404: respostaErro('Carona nao encontrada'),
        },
      },
      patch: {
        tags: ['Caronas'],
        summary: 'Altera vagas ou observacao',
        description:
          'Revalida a RN-01. Tambem recusa reduzir as vagas abaixo do numero de reservas ja confirmadas.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                minProperties: 1,
                properties: {
                  vagasOfertadas: { type: 'integer', minimum: 1, maximum: 8 },
                  observacao: { type: 'string', nullable: true, maxLength: 255 },
                },
              },
              example: { vagasOfertadas: 3 },
            },
          },
        },
        responses: {
          200: {
            description: 'Carona atualizada',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Carona' } } },
          },
          400: respostaErro('Payload invalido'),
          403: respostaErro('A carona e de outro motorista'),
          404: respostaErro('Carona nao encontrada'),
          422: respostaErro('RN-01 violada, vagas abaixo das reservas, ou carona nao editavel'),
        },
      },
    },
    '/caronas/{id}/cancelar': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      post: {
        tags: ['Caronas'],
        summary: 'Cancela a carona',
        description:
          'RN-08: cancela em cascata as reservas confirmadas, em transacao. Deixar reserva confirmada apontando para carona cancelada faria o passageiro acreditar que tem vaga numa viagem que nao vai acontecer.',
        responses: {
          200: {
            description: 'Carona cancelada',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Carona' } } },
          },
          403: respostaErro('A carona e de outro motorista'),
          404: respostaErro('Carona nao encontrada'),
          409: respostaErro('Carona ja cancelada'),
          422: respostaErro('Carona ja concluida'),
        },
      },
    },
    '/caronas/{caronaId}/reservas': {
      parameters: [
        { name: 'caronaId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      post: {
        tags: ['Reservas'],
        summary: 'Reserva uma vaga na carona',
        description: [
          'Quem reserva sai do token e qual carona sai da URL — o corpo so acrescenta onde apanhar o passageiro.',
          '',
          '**RN-02 (sem overbooking):** a carona e travada com `SELECT ... FOR UPDATE` antes de qualquer decisao,',
          'dentro de uma transacao. Medido contra o banco: sem a trava, 4 pessoas disputando 1 vaga terminaram',
          'com 4 reservas confirmadas; com a trava, exatamente 1.',
          '',
          '**RN-07:** ao ocupar a ultima vaga a carona vira `LOTADA` e some de `GET /caronas`.',
          'A resposta ja traz o status novo — nao e preciso recarregar a carona depois de reservar.',
        ].join('\n'),
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  pontoEmbarque: {
                    type: 'string',
                    minLength: 3,
                    maxLength: 160,
                    example: 'Portaria do condominio, Rua das Palmeiras 40',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Reserva confirmada, com a carona ja atualizada',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Reserva' } } },
          },
          400: respostaErro('Payload invalido'),
          404: respostaErro('Carona nao encontrada'),
          409: respostaErro(
            'Sem vaga (RN-02), carona lotada, reserva repetida, ou ja existe reserva no mesmo dia e sentido (RN-10)',
          ),
          422: respostaErro(
            'RN-04: e a propria carona do motorista. RN-05: carona cancelada, encerrada ou que ja partiu',
          ),
        },
      },
    },
    '/reservas/minhas': {
      get: {
        tags: ['Reservas'],
        summary: 'Lista as reservas do funcionario logado',
        description:
          'A contraparte de GET /caronas/minhas, que lista o que ele oferece como motorista. Traz o historico inteiro, inclusive canceladas, da partida mais distante para a mais antiga.',
        responses: {
          200: {
            description: 'Reservas do passageiro',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Reserva' } },
              },
            },
          },
        },
      },
    },
    '/reservas/{id}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      delete: {
        tags: ['Reservas'],
        summary: 'Cancela a reserva e devolve a vaga',
        description: [
          '**RN-06:** a vaga volta a existir na mesma transacao, e a carona que estava `LOTADA` volta para `ABERTA`.',
          '',
          'Responde com a **carona atualizada**, nao com a reserva: quem cancelou ja sabe o que fez, e o que a tela',
          'precisa saber e quantas vagas a carona tem agora.',
          '',
          'A remocao e logica — a linha continua no banco como `CANCELADA`. Carona que ja partiu nao pode ter a',
          'reserva cancelada: apagaria o registro de quem de fato viajou, que e a base da pontuacao (N2) e da',
          'avaliacao de conduta (N3).',
        ].join('\n'),
        responses: {
          200: {
            description: 'Carona com a vaga ja devolvida',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Carona' } } },
          },
          403: respostaErro('A reserva e de outro funcionario'),
          404: respostaErro('Reserva nao encontrada'),
          409: respostaErro('Reserva ja cancelada'),
          422: respostaErro('A carona ja partiu, ou a reserva ja foi encerrada como realizada'),
        },
      },
    },
  },
} as const;
