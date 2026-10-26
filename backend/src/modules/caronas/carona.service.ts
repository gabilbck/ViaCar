import { Prisma, StatusCarona, StatusReserva, type Rota, type Veiculo } from '@prisma/client';
import { prisma, type ClientePrisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/app-error';
import { chaveDeBairro } from '../../shared/utils/bairro';
import {
  combinarDiaEHorario,
  formatarInstante,
  inicioDoDiaAtual,
  intervaloDoDia,
} from '../../shared/utils/horario';
import { carregarDoMotorista } from '../rotas/rota.service';
import {
  INCLUDE_DETALHE,
  INCLUDE_RESUMO,
  paraDetalhada,
  paraPublica,
  type CaronaComResumo,
  type CaronaDetalhada,
  type CaronaPublica,
} from './carona.mapper';
import type { AtualizarCaronaDTO, BuscarCaronasDTO, CriarCaronaDTO } from './carona.schema';

const STATUS_EDITAVEIS: StatusCarona[] = [StatusCarona.ABERTA, StatusCarona.LOTADA];

/**
 * RN-01 — CRÍTICA, enunciada no case:
 * o motorista não pode oferecer mais vagas do que a capacidade do seu veículo.
 *
 * A trigger `carona_valida_capacidade` garante a regra no banco, inclusive para
 * escrita que não passa pela API. Esta validação existe em cima dela por um
 * motivo diferente: produzir uma mensagem que o funcionário entenda, dizendo
 * qual carro é, quanto ele comporta e quanto foi pedido.
 */
function validarCapacidade(veiculo: Veiculo, vagasOfertadas: number): void {
  if (vagasOfertadas > veiculo.capacidadePassageiros) {
    throw new AppError(
      'REGRA_NEGOCIO',
      `O ${veiculo.modelo} de placa ${veiculo.placa} comporta ${veiculo.capacidadePassageiros} ` +
        `passageiro(s), mas foram oferecidas ${vagasOfertadas} vagas.`,
      'vagasOfertadas',
    );
  }
}

/**
 * Carrega a rota exigindo posse (RN-09) e que ela ainda esteja ativa.
 *
 * Sem a checagem de `ativa`, uma rota removida continuaria gerando caronas: ela
 * some da listagem do motorista, mas as caronas dela seguem aparecendo na busca
 * dos colegas. É o mesmo cuidado que `carregarVeiculoUtilizavel` toma.
 */
async function carregarRotaUtilizavel(rotaId: string, motoristaId: string): Promise<Rota> {
  const rota = await carregarDoMotorista(rotaId, motoristaId);

  if (!rota.ativa) {
    throw new AppError(
      'REGRA_NEGOCIO',
      `A rota "${rota.apelido}" foi removida. Cadastre-a novamente para abrir caronas.`,
      'rotaId',
    );
  }

  return rota;
}

/**
 * Carrega o veículo exigindo posse (RN-03) e que ele ainda esteja ativo.
 *
 * A checagem de `ativo` é obrigatória: `GET /veiculos/:id` não filtra removidos,
 * de propósito, para que caronas antigas consigam exibir o carro. Sem esta
 * checagem daria para publicar carona com um veículo que o motorista já removeu.
 */
async function carregarVeiculoUtilizavel(veiculoId: string, motoristaId: string): Promise<Veiculo> {
  const veiculo = await prisma.veiculo.findUnique({ where: { id: veiculoId } });

  if (!veiculo) {
    throw new AppError('NAO_ENCONTRADO', 'Veículo não encontrado.');
  }

  if (veiculo.usuarioId !== motoristaId) {
    throw new AppError('SEM_PERMISSAO', 'Este veículo pertence a outro funcionário.');
  }

  if (!veiculo.ativo) {
    throw new AppError(
      'REGRA_NEGOCIO',
      `O veículo de placa ${veiculo.placa} foi removido. Cadastre-o novamente para usá-lo.`,
      'veiculoId',
    );
  }

  return veiculo;
}

/**
 * Carrega a carona com tudo que a API precisa exibir.
 *
 * Aceita `db` para poder ser chamada de dentro de uma transação. Sem esse
 * parâmetro, uma chamada feita dentro de `$transaction` usaria o singleton e
 * rodaria fora da transação — sem a proteção do lock.
 */
export async function carregarCarona(
  caronaId: string,
  db: ClientePrisma = prisma,
): Promise<CaronaComResumo> {
  const carona = await db.carona.findUnique({
    where: { id: caronaId },
    include: INCLUDE_RESUMO,
  });

  if (!carona) {
    throw new AppError('NAO_ENCONTRADO', 'Carona não encontrada.');
  }

  return carona;
}

/** RN-09 — só o motorista dono da rota mexe na carona. */
function exigirPosse(carona: CaronaComResumo, motoristaId: string): CaronaComResumo {
  if (carona.rota.motoristaId !== motoristaId) {
    throw new AppError('SEM_PERMISSAO', 'Esta carona é de outro motorista.');
  }

  return carona;
}

/**
 * O status que a carona DEVE ter, dada a lotação.
 *
 * `vagasDisponiveis` é calculado a cada leitura, mas `status` não pode ser: a
 * busca filtra por ele no `WHERE` do banco, e não dá para contar reservas ali.
 * Sendo derivado e gravado ao mesmo tempo, ele precisa ser reavaliado por TODO
 * mundo que mexe na lotação — e são três lugares, não dois: reservar, cancelar
 * reserva e editar `vagasOfertadas`.
 *
 * Reavaliar nas duas direções é o ponto. Só a ida deixa a carona presa em
 * `LOTADA` mesmo depois de abrir vaga, e ela nunca mais volta para a busca; só
 * a volta deixa carona cheia aparecendo para quem procura.
 *
 * Status terminal não reabre: uma carona concluída ou cancelada não volta a
 * ficar `ABERTA` porque alguém desmarcou.
 */
export function statusPelaLotacao(
  statusAtual: StatusCarona,
  vagasOfertadas: number,
  confirmadas: number,
): StatusCarona {
  if (!STATUS_EDITAVEIS.includes(statusAtual)) {
    return statusAtual;
  }

  return confirmadas >= vagasOfertadas ? StatusCarona.LOTADA : StatusCarona.ABERTA;
}

/** Carrega a carona exigindo que quem pede seja o motorista dono da rota (RN-09). */
export async function carregarDoDono(
  caronaId: string,
  motoristaId: string,
  db: ClientePrisma = prisma,
): Promise<CaronaComResumo> {
  return exigirPosse(await carregarCarona(caronaId, db), motoristaId);
}

/**
 * Carrega a carona com a linha TRAVADA até o fim da transação.
 *
 * É a peça central da RN-02. Qualquer decisão do tipo "ainda cabe mais alguém?"
 * precisa ser tomada com a linha travada, senão duas requisições leem o mesmo
 * número de vagas livres e ambas gravam.
 *
 * Medido contra o banco, com 4 pessoas disputando 1 vaga ao mesmo tempo:
 * sem o lock as 4 reservas foram confirmadas; com o lock, exatamente 1.
 *
 * Só faz sentido dentro de `prisma.$transaction(async (tx) => ...)` — fora de
 * uma transação o lock é liberado imediatamente e não protege nada.
 */
export async function travarCaronaParaAtualizacao(
  tx: ClientePrisma,
  caronaId: string,
): Promise<CaronaComResumo> {
  const travadas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM carona WHERE id = ${caronaId}::uuid FOR UPDATE`;

  if (travadas.length === 0) {
    throw new AppError('NAO_ENCONTRADO', 'Carona não encontrada.');
  }

  return carregarCarona(caronaId, tx);
}

/** Reservas que de fato ocupam vaga. Conte sempre com a carona travada. */
export async function contarReservasConfirmadas(
  caronaId: string,
  db: ClientePrisma = prisma,
): Promise<number> {
  return db.reserva.count({ where: { caronaId, status: StatusReserva.CONFIRMADA } });
}

export async function criar(motoristaId: string, dados: CriarCaronaDTO): Promise<CaronaPublica> {
  const rota = await carregarRotaUtilizavel(dados.rotaId, motoristaId);
  const veiculo = await carregarVeiculoUtilizavel(dados.veiculoId, motoristaId);

  validarCapacidade(veiculo, dados.vagasOfertadas);

  // O instante de partida NUNCA vem do cliente: é recomposto a partir do dia
  // pedido e do horário da rota. É isso que faz o índice único
  // (rota_id, data_partida) de fato impedir carona duplicada no mesmo dia.
  const dataPartida = combinarDiaEHorario(dados.data, rota.horarioPartida);

  if (dataPartida.getTime() <= Date.now()) {
    throw new AppError(
      'REGRA_NEGOCIO',
      'Não é possível abrir carona para um horário que já passou.',
      'data',
    );
  }

  // A checagem é por DIA, não pelo instante exato. Comparar o instante deixava
  // um furo: bastava alterar `rota.horarioPartida` entre uma abertura e outra
  // para o mesmo dia aceitar uma segunda carona.
  // Caronas canceladas ficam de fora, senão cancelar bloquearia o dia para sempre.
  const { inicio, fim } = intervaloDoDia(dados.data);
  const jaAberta = await prisma.carona.findFirst({
    where: {
      rotaId: rota.id,
      status: { not: StatusCarona.CANCELADA },
      dataPartida: { gte: inicio, lt: fim },
    },
    select: { id: true },
  });

  if (jaAberta) {
    throw new AppError(
      'CONFLITO',
      `Você já abriu uma carona da rota "${rota.apelido}" neste dia.`,
      'data',
    );
  }

  const carona = await prisma.carona.create({
    data: {
      rotaId: rota.id,
      veiculoId: veiculo.id,
      dataPartida,
      vagasOfertadas: dados.vagasOfertadas,
      observacao: dados.observacao ?? null,
    },
    include: INCLUDE_RESUMO,
  });

  return paraPublica(carona);
}

/** Caronas em que o usuário é o motorista, de hoje em diante. */
export async function listarDoMotorista(motoristaId: string): Promise<CaronaPublica[]> {
  const caronas = await prisma.carona.findMany({
    where: { rota: { motoristaId }, dataPartida: { gte: inicioDoDiaAtual() } },
    include: INCLUDE_RESUMO,
    orderBy: { dataPartida: 'asc' },
  });

  return caronas.map(paraPublica);
}

/**
 * Busca de caronas disponíveis — é a tela que ataca o problema do case:
 * "colegas do mesmo bairro gastam com transporte enquanto carros circulam vazios".
 *
 * As caronas do próprio usuário ficam de fora: a busca existe para achar quem vai
 * no mesmo caminho, e a RN-04 proíbe reservar vaga na própria carona.
 *
 * O bairro é comparado pela chave de busca, nunca pelo texto digitado (DT-06):
 * "jd america" acha a rota cadastrada como "Jd. América".
 */
export async function buscar(
  usuarioId: string,
  filtros: BuscarCaronasDTO,
): Promise<CaronaPublica[]> {
  const rota: Prisma.RotaWhereInput = { motoristaId: { not: usuarioId } };

  if (filtros.bairroOrigem) {
    rota.origemBairroChave = { contains: chaveDeBairro(filtros.bairroOrigem) };
  }
  if (filtros.bairroDestino) {
    rota.destinoBairroChave = { contains: chaveDeBairro(filtros.bairroDestino) };
  }
  if (filtros.sentido) {
    rota.sentido = filtros.sentido;
  }

  const caronas = await prisma.carona.findMany({
    where: {
      status: StatusCarona.ABERTA,
      dataPartida: janelaDeBusca(filtros.data),
      rota,
    },
    include: INCLUDE_RESUMO,
    orderBy: { dataPartida: 'asc' },
  });

  return caronas.map(paraPublica);
}

export async function buscarPorId(caronaId: string): Promise<CaronaDetalhada> {
  const carona = await prisma.carona.findUnique({
    where: { id: caronaId },
    include: INCLUDE_DETALHE,
  });

  if (!carona) {
    throw new AppError('NAO_ENCONTRADO', 'Carona não encontrada.');
  }

  return paraDetalhada(carona);
}

/**
 * Alterar vagas mexe na lotação, então vale as mesmas regras da reserva: roda
 * em transação, com a carona travada.
 *
 * Sem a trava, `atualizar` lê a contagem de reservas num instante e grava no
 * seguinte. Medido contra o banco: reduzir para 1 vaga enquanto uma segunda
 * reserva estava em voo terminou com 2 confirmadas em 1 vaga ofertada — a RN-02
 * furada pela porta do motorista, não pela do passageiro.
 */
export async function atualizar(
  caronaId: string,
  motoristaId: string,
  dados: AtualizarCaronaDTO,
): Promise<CaronaPublica> {
  return prisma.$transaction(async (tx) => {
    const carona = exigirPosse(await travarCaronaParaAtualizacao(tx, caronaId), motoristaId);

    if (!STATUS_EDITAVEIS.includes(carona.status)) {
      throw new AppError(
        'REGRA_NEGOCIO',
        `Carona ${carona.status.toLowerCase().replace('_', ' ')} não pode mais ser alterada.`,
      );
    }

    const confirmadas = carona._count.reservas;

    if (dados.vagasOfertadas !== undefined) {
      validarCapacidade(carona.veiculo, dados.vagasOfertadas);

      if (dados.vagasOfertadas < confirmadas) {
        throw new AppError(
          'REGRA_NEGOCIO',
          `Esta carona já tem ${confirmadas} reserva(s) confirmada(s). ` +
            `Não é possível reduzir para ${dados.vagasOfertadas} vaga(s) sem cancelá-las antes.`,
          'vagasOfertadas',
        );
      }
    }

    // A lotação mudou, então o status precisa acompanhar nas duas direções:
    // reduzir até encher fecha a carona, e abrir vaga numa carona lotada a
    // devolve para a busca.
    const vagasOfertadas = dados.vagasOfertadas ?? carona.vagasOfertadas;

    const atualizada = await tx.carona.update({
      where: { id: caronaId },
      data: {
        ...(dados.vagasOfertadas !== undefined && { vagasOfertadas: dados.vagasOfertadas }),
        ...(dados.observacao !== undefined && { observacao: dados.observacao }),
        status: statusPelaLotacao(carona.status, vagasOfertadas, confirmadas),
      },
      include: INCLUDE_RESUMO,
    });

    return paraPublica(atualizada);
  });
}

/**
 * RN-08 — cancelar a carona cancela em cascata as reservas confirmadas.
 *
 * Em transação: deixar reserva confirmada apontando para carona cancelada faria
 * o passageiro acreditar que tem vaga numa viagem que não vai acontecer.
 *
 * E com a carona TRAVADA, não só em transação. Sem o lock, uma reserva que entra
 * no meio do cancelamento não é vista pelo `updateMany` da cascata, mas o
 * `update` da carona espera o lock dela e vence depois — reproduzido contra o
 * banco, com o passageiro terminando `CONFIRMADA` numa carona `CANCELADA`.
 */
export async function cancelar(caronaId: string, motoristaId: string): Promise<CaronaPublica> {
  return prisma.$transaction(async (tx) => {
    const carona = exigirPosse(await travarCaronaParaAtualizacao(tx, caronaId), motoristaId);

    if (carona.status === StatusCarona.CANCELADA) {
      throw new AppError('CONFLITO', 'Esta carona já está cancelada.');
    }

    if (carona.status === StatusCarona.CONCLUIDA) {
      throw new AppError('REGRA_NEGOCIO', 'Uma carona já concluída não pode ser cancelada.');
    }

    // Cancelar uma viagem que já aconteceu não é só inócuo: o cancelamento em
    // cascata marcaria as reservas como CANCELADA e apagaria o registro de quem
    // de fato viajou — que é a base da pontuação (N2) e da avaliação (N3).
    // Para esses casos o caminho é REALIZADA / NAO_COMPARECEU, não CANCELADA.
    if (carona.dataPartida.getTime() <= Date.now()) {
      throw new AppError(
        'REGRA_NEGOCIO',
        `Esta carona partiu em ${formatarInstante(carona.dataPartida)} e não pode mais ser ` +
          `cancelada. Uma viagem que já aconteceu precisa ter as reservas encerradas como ` +
          `realizadas ou não comparecidas.`,
      );
    }

    await tx.reserva.updateMany({
      where: { caronaId, status: StatusReserva.CONFIRMADA },
      data: { status: StatusReserva.CANCELADA, canceladoEm: new Date() },
    });

    const atualizada = await tx.carona.update({
      where: { id: caronaId },
      data: { status: StatusCarona.CANCELADA },
      include: INCLUDE_RESUMO,
    });

    return paraPublica(atualizada);
  });
}

/** Sem filtro de data, tudo daqui para frente. Com filtro, apenas aquele dia. */
function janelaDeBusca(data: string | undefined): Prisma.DateTimeFilter {
  const agora = new Date();

  if (!data) {
    return { gte: agora };
  }

  const { inicio, fim } = intervaloDoDia(data);
  return { gte: inicio > agora ? inicio : agora, lt: fim };
}
