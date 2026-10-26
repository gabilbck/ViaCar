import { StatusCarona, type Prisma, type Rota } from '@prisma/client';
import { prisma, type ClientePrisma } from '../../config/prisma';
import { AppError } from '../../shared/errors/app-error';
import { chaveDeBairro } from '../../shared/utils/bairro';
import { textoParaHora } from '../../shared/utils/horario';
import { paraPublica, type RotaPublica } from './rota.mapper';
import type { AtualizarRotaDTO, CriarRotaDTO } from './rota.schema';

const STATUS_EM_USO: StatusCarona[] = [
  StatusCarona.ABERTA,
  StatusCarona.LOTADA,
  StatusCarona.EM_ANDAMENTO,
];

/**
 * Carrega a rota garantindo que ela pertence a quem está pedindo.
 *
 * Exportada porque o módulo de caronas precisa exatamente desta checagem antes
 * de abrir uma carona — é a RN-09 (só o dono da rota mexe nela).
 */
export async function carregarDoMotorista(
  rotaId: string,
  motoristaId: string,
  db: ClientePrisma = prisma,
): Promise<Rota> {
  const rota = await db.rota.findUnique({ where: { id: rotaId } });

  if (!rota) {
    throw new AppError('NAO_ENCONTRADO', 'Rota não encontrada.');
  }

  if (rota.motoristaId !== motoristaId) {
    throw new AppError('SEM_PERMISSAO', 'Esta rota pertence a outro funcionário.');
  }

  return rota;
}

/**
 * Chave de busca de cada bairro presente nos dados (DT-06).
 *
 * Calculada junto com o bairro, no mesmo `create`/`update`, para que um nunca
 * mude sem o outro: uma rota com a chave velha some da busca sem erro nenhum.
 */
function chavesDosBairros(dados: { origemBairro?: string; destinoBairro?: string }): {
  origemBairroChave?: string;
  destinoBairroChave?: string;
} {
  return {
    ...(dados.origemBairro !== undefined && {
      origemBairroChave: chaveDeBairro(dados.origemBairro),
    }),
    ...(dados.destinoBairro !== undefined && {
      destinoBairroChave: chaveDeBairro(dados.destinoBairro),
    }),
  };
}

/**
 * Normaliza o que vem da API para o formato do banco:
 * "HH:mm" vira TIME, os dias da semana ficam únicos e em ordem, e cada bairro
 * leva junto a sua chave de busca.
 *
 * A ordenação é invariante do domínio, não formatação: sem ela, `[5,1,5,3]` e
 * `[1,3,5]` descreveriam a mesma rota com valores diferentes no banco, e
 * comparar duas rotas deixaria de funcionar.
 */
function paraDadosDoBanco<
  T extends { horarioPartida?: string; diasSemana?: number[]; origemBairro?: string; destinoBairro?: string },
>(
  dados: T,
): Omit<T, 'horarioPartida' | 'diasSemana'> &
  ReturnType<typeof chavesDosBairros> & { horarioPartida?: Date; diasSemana?: number[] } {
  const { horarioPartida, diasSemana, ...resto } = dados;

  return {
    ...resto,
    ...chavesDosBairros(resto),
    ...(horarioPartida !== undefined && { horarioPartida: textoParaHora(horarioPartida) }),
    ...(diasSemana !== undefined && {
      diasSemana: [...new Set(diasSemana)].sort((a, b) => a - b),
    }),
  };
}

export async function criar(motoristaId: string, dados: CriarRotaDTO): Promise<RotaPublica> {
  const rota = await prisma.rota.create({
    data: { ...paraDadosDoBanco(dados), motoristaId } as Prisma.RotaUncheckedCreateInput,
  });

  return paraPublica(rota);
}

export async function listarDoMotorista(motoristaId: string): Promise<RotaPublica[]> {
  const rotas = await prisma.rota.findMany({
    where: { motoristaId, ativa: true },
    orderBy: [{ sentido: 'asc' }, { horarioPartida: 'asc' }],
  });

  return rotas.map(paraPublica);
}

export async function buscarPorId(rotaId: string, motoristaId: string): Promise<RotaPublica> {
  return paraPublica(await carregarDoMotorista(rotaId, motoristaId));
}

export async function atualizar(
  rotaId: string,
  motoristaId: string,
  dados: AtualizarRotaDTO,
): Promise<RotaPublica> {
  await carregarDoMotorista(rotaId, motoristaId);

  // Alterar o horário da rota NÃO mexe nas caronas já publicadas: o instante de
  // partida delas foi congelado na criação, e mudar retroativamente moveria o
  // horário combinado com quem já reservou.
  const rota = await prisma.rota.update({
    where: { id: rotaId },
    data: paraDadosDoBanco(dados) as Prisma.RotaUncheckedUpdateInput,
  });

  return paraPublica(rota);
}

/**
 * Remoção lógica. A rota vira o histórico das caronas que ela gerou, então nunca
 * é apagada de verdade.
 */
export async function inativar(rotaId: string, motoristaId: string): Promise<void> {
  await carregarDoMotorista(rotaId, motoristaId);

  const agendada = await prisma.carona.findFirst({
    where: { rotaId, status: { in: STATUS_EM_USO }, dataPartida: { gte: new Date() } },
    select: { id: true },
  });

  if (agendada) {
    throw new AppError(
      'REGRA_NEGOCIO',
      'Esta rota tem carona agendada. Cancele a carona antes de remover a rota.',
    );
  }

  await prisma.rota.update({ where: { id: rotaId }, data: { ativa: false } });
}
