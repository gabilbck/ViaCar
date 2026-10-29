import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { criarCaronaSchema } from '../../src/modules/caronas/carona.schema';
import * as caronaService from '../../src/modules/caronas/carona.service';
import * as rotaService from '../../src/modules/rotas/rota.service';
import * as veiculoService from '../../src/modules/veiculos/veiculo.service';
import { AppError } from '../../src/shared/errors/app-error';
import { criarRota, criarUsuario, criarVeiculo, diaEmTexto, criarCarona, emDias } from '../fabricas';

async function capturarErro(acao: () => Promise<unknown>): Promise<AppError> {
  try {
    await acao();
  } catch (erro) {
    if (erro instanceof AppError) return erro;
    throw erro;
  }
  throw new Error('Esperava um AppError, mas a operação foi concluída com sucesso.');
}

/** Motorista com rota das 07:30 e um Civic de 4 lugares. */
async function cenarioMotorista(capacidade = 4) {
  const motorista = await criarUsuario();
  const veiculo = await criarVeiculo(motorista.id, { capacidadePassageiros: capacidade });
  const rota = await criarRota(motorista.id);
  return { motorista, veiculo, rota };
}

describe('RN-01 na camada de serviço', () => {
  /**
   * A trigger do banco já barra a operação. Esta camada existe para trocar o erro
   * cru do Postgres por uma mensagem que o motorista entenda na tela — que é o
   * que a avaliação do case pede para ver funcionando.
   */
  it('recusa ofertar mais vagas do que o carro comporta, dizendo o porquê', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista(4);

    const erro = await capturarErro(() =>
      caronaService.criar(motorista.id, {
        rotaId: rota.id,
        veiculoId: veiculo.id,
        data: diaEmTexto(1),
        vagasOfertadas: 6,
      }),
    );

    expect(erro.status).toBe(422);
    expect(erro.codigo).toBe('REGRA_NEGOCIO');
    expect(erro.campo).toBe('vagasOfertadas');
    expect(erro.message).toContain('Honda Civic');
    expect(erro.message).toContain('4 passageiro');
    expect(erro.message).toContain('6 vagas');
  });

  it('aceita ofertar exatamente a capacidade', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista(4);

    const carona = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: diaEmTexto(1),
      vagasOfertadas: 4,
    });

    expect(carona.vagasOfertadas).toBe(4);
    expect(carona.vagasDisponiveis).toBe(4);
    expect(carona.status).toBe('ABERTA');
  });

  it('revalida a regra ao aumentar as vagas de uma carona já aberta', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista(4);
    const carona = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: diaEmTexto(1),
      vagasOfertadas: 2,
    });

    const erro = await capturarErro(() =>
      caronaService.atualizar(carona.id, motorista.id, { vagasOfertadas: 5 }),
    );

    expect(erro.codigo).toBe('REGRA_NEGOCIO');
  });
});

describe('quem pode abrir a carona', () => {
  it('recusa usar rota de outro motorista (RN-09)', async () => {
    const { veiculo, rota } = await cenarioMotorista();
    const intruso = await criarUsuario();
    const veiculoDoIntruso = await criarVeiculo(intruso.id);

    const erro = await capturarErro(() =>
      caronaService.criar(intruso.id, {
        rotaId: rota.id,
        veiculoId: veiculoDoIntruso.id,
        data: diaEmTexto(1),
        vagasOfertadas: 2,
      }),
    );

    expect(erro.status).toBe(403);
    expect(veiculo.id).toBeDefined();
  });

  it('recusa usar veículo de outro funcionário (RN-03)', async () => {
    const { motorista, rota } = await cenarioMotorista();
    const outro = await criarUsuario();
    const veiculoAlheio = await criarVeiculo(outro.id);

    const erro = await capturarErro(() =>
      caronaService.criar(motorista.id, {
        rotaId: rota.id,
        veiculoId: veiculoAlheio.id,
        data: diaEmTexto(1),
        vagasOfertadas: 2,
      }),
    );

    expect(erro.status).toBe(403);
  });

  /**
   * `GET /veiculos/:id` não filtra removidos, de propósito, para caronas antigas
   * conseguirem exibir o carro. Sem esta checagem daria para publicar carona com
   * um veículo que o motorista já removeu — e a trigger do banco não cobre isso.
   */
  it('recusa usar veículo já removido', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    await veiculoService.inativar(veiculo.id, motorista.id);

    const erro = await capturarErro(() =>
      caronaService.criar(motorista.id, {
        rotaId: rota.id,
        veiculoId: veiculo.id,
        data: diaEmTexto(1),
        vagasOfertadas: 2,
      }),
    );

    expect(erro.codigo).toBe('REGRA_NEGOCIO');
    expect(erro.campo).toBe('veiculoId');
    expect(erro.message).toContain('removido');
  });
});

describe('instante de partida', () => {
  it('monta a partida a partir do horário da rota, não do cliente', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();

    const carona = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: '2027-03-15',
      vagasOfertadas: 2,
    });

    // 07:30 em Joinville (UTC-3) é 10:30 UTC.
    expect(carona.dataPartida.toISOString()).toBe('2027-03-15T10:30:00.000Z');
    expect(carona.rota.horarioPartida).toBe('07:30');
  });

  /**
   * Armadilha 3.1 fechada: como o instante é sempre recomposto pelo helper, duas
   * tentativas para o mesmo dia produzem o mesmo valor e colidem no índice único.
   */
  it('recusa abrir duas caronas da mesma rota no mesmo dia', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const dados = {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: diaEmTexto(2),
      vagasOfertadas: 2,
    };
    await caronaService.criar(motorista.id, dados);

    const erro = await capturarErro(() => caronaService.criar(motorista.id, dados));

    expect(erro.codigo).toBe('CONFLITO');
    expect(erro.message).toContain('neste dia');
  });

  it('recusa abrir carona para um dia que já passou', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();

    const erro = await capturarErro(() =>
      caronaService.criar(motorista.id, {
        rotaId: rota.id,
        veiculoId: veiculo.id,
        data: diaEmTexto(-1),
        vagasOfertadas: 2,
      }),
    );

    expect(erro.codigo).toBe('REGRA_NEGOCIO');
    expect(erro.campo).toBe('data');
  });
});

/**
 * Bugs encontrados na revisão de fechamento do D3, todos reproduzidos contra o
 * banco antes de serem corrigidos. Os testes ficam para que não voltem.
 */
describe('bordas descobertas no fechamento do D3', () => {
  /**
   * A unicidade dependia de `UNIQUE (rota_id, data_partida)`, que compara o
   * instante. Bastava alterar o horário da rota entre uma abertura e outra para
   * o mesmo dia aceitar duas caronas.
   */
  it('continua uma carona por dia mesmo se o horário da rota mudar no meio', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const data = diaEmTexto(4);
    await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data,
      vagasOfertadas: 2,
    });

    await rotaService.atualizar(rota.id, motorista.id, { horarioPartida: '08:15' });

    const erro = await capturarErro(() =>
      caronaService.criar(motorista.id, {
        rotaId: rota.id,
        veiculoId: veiculo.id,
        data,
        vagasOfertadas: 2,
      }),
    );

    expect(erro.codigo).toBe('CONFLITO');
    expect(await prisma.carona.count({ where: { rotaId: rota.id } })).toBe(1);
  });

  /** O bloqueio por dia não pode transformar um cancelamento em proibição permanente. */
  it('permite reabrir a carona do mesmo dia depois de cancelar', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const data = diaEmTexto(4);
    const primeira = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data,
      vagasOfertadas: 2,
    });
    await caronaService.cancelar(primeira.id, motorista.id);

    const segunda = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data,
      vagasOfertadas: 3,
    });

    expect(segunda.id).not.toBe(primeira.id);
    expect(segunda.status).toBe('ABERTA');
  });

  /** Espelha a checagem que já existia para veículo removido. */
  it('recusa abrir carona em rota removida', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    await rotaService.inativar(rota.id, motorista.id);

    const erro = await capturarErro(() =>
      caronaService.criar(motorista.id, {
        rotaId: rota.id,
        veiculoId: veiculo.id,
        data: diaEmTexto(3),
        vagasOfertadas: 2,
      }),
    );

    expect(erro.codigo).toBe('REGRA_NEGOCIO');
    expect(erro.campo).toBe('rotaId');
    expect(erro.message).toContain('removida');
  });

  /**
   * Cancelar em cascata marcaria as reservas como CANCELADA e apagaria o
   * registro de quem de fato viajou — base da pontuação (N2) e da conduta (N3).
   */
  it('recusa cancelar carona que já partiu', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const passada = await prisma.carona.create({
      data: {
        rotaId: rota.id,
        veiculoId: veiculo.id,
        dataPartida: new Date(Date.now() - 5 * 86_400_000),
        vagasOfertadas: 2,
      },
    });
    const passageiro = await criarUsuario();
    await prisma.reserva.create({ data: { caronaId: passada.id, passageiroId: passageiro.id } });

    const erro = await capturarErro(() => caronaService.cancelar(passada.id, motorista.id));

    expect(erro.codigo).toBe('REGRA_NEGOCIO');
    expect(erro.message).toContain('partiu');

    // O histórico tem que continuar intacto.
    const reserva = await prisma.reserva.findFirstOrThrow({ where: { caronaId: passada.id } });
    expect(reserva.status).toBe('CONFIRMADA');
  });
});

describe('datas inexistentes no calendário', () => {
  /**
   * `Date.parse` ROLA o excedente em vez de recusar: "2026-02-30" vira 02/03.
   * O funcionário pediria carona para um dia e receberia outro, sem aviso.
   */
  it.each(['2026-02-30', '2026-04-31', '2027-02-29', '2026-13-01', '2026-00-10'])(
    'recusa %s',
    (data) => {
      const resultado = criarCaronaSchema.safeParse({
        rotaId: '00000000-0000-0000-0000-000000000000',
        veiculoId: '00000000-0000-0000-0000-000000000000',
        data,
        vagasOfertadas: 2,
      });

      expect(resultado.success).toBe(false);
    },
  );

  it('aceita 29 de fevereiro em ano bissexto', () => {
    const resultado = criarCaronaSchema.safeParse({
      rotaId: '00000000-0000-0000-0000-000000000000',
      veiculoId: '00000000-0000-0000-0000-000000000000',
      data: '2028-02-29',
      vagasOfertadas: 2,
    });

    expect(resultado.success).toBe(true);
  });
});

describe('busca de caronas', () => {
  async function cenarioBusca() {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const passageiro = await criarUsuario({ bairro: 'Costa e Silva' });

    const carona = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: diaEmTexto(1),
      vagasOfertadas: 3,
    });

    return { motorista, passageiro, carona, rota, veiculo };
  }

  it('encontra a carona de um colega', async () => {
    const { passageiro } = await cenarioBusca();

    const achadas = await caronaService.buscar(passageiro.id, {});

    expect(achadas).toHaveLength(1);
    expect(achadas[0]?.motorista.nome).toBeDefined();
  });

  it('não devolve a carona do próprio usuário', async () => {
    const { motorista } = await cenarioBusca();

    expect(await caronaService.buscar(motorista.id, {})).toHaveLength(0);
  });

  it('filtra por bairro de origem ignorando maiúsculas', async () => {
    const { passageiro } = await cenarioBusca();

    expect(await caronaService.buscar(passageiro.id, { bairroOrigem: 'costa e silva' })).toHaveLength(1);
    expect(await caronaService.buscar(passageiro.id, { bairroOrigem: 'Bucarein' })).toHaveLength(0);
  });

  it('filtra por sentido', async () => {
    const { passageiro } = await cenarioBusca();

    expect(await caronaService.buscar(passageiro.id, { sentido: 'IDA' })).toHaveLength(1);
    expect(await caronaService.buscar(passageiro.id, { sentido: 'VOLTA' })).toHaveLength(0);
  });

  it('filtra pelo dia da partida', async () => {
    const { passageiro } = await cenarioBusca();

    expect(await caronaService.buscar(passageiro.id, { data: diaEmTexto(1) })).toHaveLength(1);
    expect(await caronaService.buscar(passageiro.id, { data: diaEmTexto(5) })).toHaveLength(0);
  });

  it('não devolve carona cancelada', async () => {
    const { motorista, passageiro, carona } = await cenarioBusca();
    await caronaService.cancelar(carona.id, motorista.id);

    expect(await caronaService.buscar(passageiro.id, {})).toHaveLength(0);
  });
});

describe('alteração e cancelamento', () => {
  it('não deixa outro motorista alterar a carona', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const intruso = await criarUsuario();
    const carona = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: diaEmTexto(1),
      vagasOfertadas: 3,
    });

    const erro = await capturarErro(() =>
      caronaService.atualizar(carona.id, intruso.id, { vagasOfertadas: 1 }),
    );

    expect(erro.status).toBe(403);
  });

  it('recusa reduzir as vagas abaixo das reservas já confirmadas', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const carona = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: diaEmTexto(1),
      vagasOfertadas: 4,
    });
    const p1 = await criarUsuario();
    const p2 = await criarUsuario();
    await prisma.reserva.createMany({
      data: [
        { caronaId: carona.id, passageiroId: p1.id },
        { caronaId: carona.id, passageiroId: p2.id },
      ],
    });

    const erro = await capturarErro(() =>
      caronaService.atualizar(carona.id, motorista.id, { vagasOfertadas: 1 }),
    );

    expect(erro.codigo).toBe('REGRA_NEGOCIO');
    expect(erro.message).toContain('2 reserva');
  });

  it('vagasDisponiveis desconta as reservas confirmadas', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const carona = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: diaEmTexto(1),
      vagasOfertadas: 4,
    });
    const passageiro = await criarUsuario();
    await prisma.reserva.create({ data: { caronaId: carona.id, passageiroId: passageiro.id } });

    const detalhe = await caronaService.buscarPorId(carona.id);

    expect(detalhe.vagasOfertadas).toBe(4);
    expect(detalhe.vagasDisponiveis).toBe(3);
    expect(detalhe.passageiros).toHaveLength(1);
  });

  /** RN-08: cancelar a carona cancela em cascata as reservas confirmadas. */
  it('cancelar a carona cancela as reservas confirmadas', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const carona = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: diaEmTexto(1),
      vagasOfertadas: 4,
    });
    const passageiro = await criarUsuario();
    await prisma.reserva.create({ data: { caronaId: carona.id, passageiroId: passageiro.id } });

    const cancelada = await caronaService.cancelar(carona.id, motorista.id);

    expect(cancelada.status).toBe('CANCELADA');
    const reservas = await prisma.reserva.findMany({ where: { caronaId: carona.id } });
    expect(reservas.every((r) => r.status === 'CANCELADA')).toBe(true);
    expect(reservas.every((r) => r.canceladoEm !== null)).toBe(true);
  });

  it('recusa cancelar duas vezes', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const carona = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: diaEmTexto(1),
      vagasOfertadas: 3,
    });
    await caronaService.cancelar(carona.id, motorista.id);

    const erro = await capturarErro(() => caronaService.cancelar(carona.id, motorista.id));

    expect(erro.codigo).toBe('CONFLITO');
  });

  it('recusa alterar carona cancelada', async () => {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    const carona = await caronaService.criar(motorista.id, {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      data: diaEmTexto(1),
      vagasOfertadas: 3,
    });
    await caronaService.cancelar(carona.id, motorista.id);

    const erro = await capturarErro(() =>
      caronaService.atualizar(carona.id, motorista.id, { vagasOfertadas: 2 }),
    );

    expect(erro.codigo).toBe('REGRA_NEGOCIO');
  });
});

describe('caronas do motorista (US-11)', () => {
  async function cenarioHistorico() {
    const { motorista, veiculo, rota } = await cenarioMotorista();
    // -2, e não -1: emDias conta em UTC; depois das 21h, "ontem" em UTC
    // ainda é hoje no fuso da empresa e cairia em "próximas".
    const antiga = await criarCarona(rota, veiculo.id, { dia: emDias(-7) });
    const recente = await criarCarona(rota, veiculo.id, { dia: emDias(-2) });
    const futura = await criarCarona(rota, veiculo.id, { dia: emDias(2) });
    return { motorista, antiga, recente, futura };
  }

  it('sem período, lista só de hoje em diante', async () => {
    const { motorista, futura } = await cenarioHistorico();
    const caronas = await caronaService.listarDoMotorista(motorista.id);

    expect(caronas.map((c) => c.id)).toEqual([futura.id]);
  });

  it('com período "passadas", lista o histórico da mais recente para a mais antiga', async () => {
    const { motorista, antiga, recente } = await cenarioHistorico();
    const caronas = await caronaService.listarDoMotorista(motorista.id, 'passadas');

    expect(caronas.map((c) => c.id)).toEqual([recente.id, antiga.id]);
  });
});
