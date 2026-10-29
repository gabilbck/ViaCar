import { Prisma, type StatusCarona } from '@prisma/client';
import { paraResumo as rotaResumo, type RotaResumo } from '../rotas/rota.mapper';
import { paraResumo as usuarioResumo, type UsuarioResumo } from '../usuarios/usuario.mapper';
import { paraResumo as veiculoResumo, type VeiculoResumo } from '../veiculos/veiculo.mapper';

/**
 * O que toda consulta de carona precisa trazer junto.
 *
 * O `_count` filtrado é o que sustenta `vagasDisponiveis`: o valor é sempre
 * derivado das reservas confirmadas, nunca de uma coluna — uma coluna
 * dessincronizaria no primeiro cancelamento.
 */
export const INCLUDE_RESUMO = {
  veiculo: true,
  rota: { include: { motorista: true } },
  _count: { select: { reservas: { where: { status: 'CONFIRMADA' } } } },
} satisfies Prisma.CaronaInclude;

/** O detalhe acrescenta quem já está na carona. */
export const INCLUDE_DETALHE = {
  ...INCLUDE_RESUMO,
  reservas: {
    where: { status: 'CONFIRMADA' },
    select: { pontoEmbarque: true, passageiro: { select: { id: true, nome: true, bairro: true } } },
    orderBy: { criadoEm: 'asc' },
  },
} satisfies Prisma.CaronaInclude;

export type CaronaComResumo = Prisma.CaronaGetPayload<{ include: typeof INCLUDE_RESUMO }>;
export type CaronaComDetalhe = Prisma.CaronaGetPayload<{ include: typeof INCLUDE_DETALHE }>;

/**
 * Campos opcionais porque cada camada de visibilidade entrega um recorte
 * diferente (DT-23) — ver `passageirosVisiveis()`.
 */
export interface PassageiroDaCarona {
  /** Só para quem está na carona: correlaciona a mesma pessoa entre caronas. */
  id?: string;
  /** Nome completo para quem está na carona; primeiro nome para os demais. */
  nome: string;
  bairro: string;
  /** Endereço de rua. Só o motorista vê o de todos; o passageiro, só o próprio. */
  pontoEmbarque?: string | null;
}

/**
 * Quem pede o detalhe da carona, do ponto de vista da privacidade dos passageiros.
 * Decidida no service, a partir do vínculo com a carona — não da autenticação.
 */
export type CamadaDeVisibilidade =
  | 'MOTORISTA'
  | 'PASSAGEIRO'
  | 'OUTRO_FUNCIONARIO'
  | 'OUTRO_FUNCIONARIO_CARONA_ENCERRADA';

export interface CaronaPublica {
  id: string;
  dataPartida: Date;
  vagasOfertadas: number;
  /** Calculado: `vagasOfertadas - reservas confirmadas`. Nunca é coluna. */
  vagasDisponiveis: number;
  status: StatusCarona;
  observacao: string | null;
  motorista: UsuarioResumo;
  veiculo: VeiculoResumo;
  rota: RotaResumo;
  criadoEm: Date;
}

export interface CaronaDetalhada extends CaronaPublica {
  /**
   * Ausente quando quem pede não pode ver ninguém (DT-23). Não vem como lista
   * vazia de propósito: `[]` diria "ninguém reservou", que é outra informação.
   */
  passageiros?: PassageiroDaCarona[];
}

export function paraPublica(carona: CaronaComResumo): CaronaPublica {
  return {
    id: carona.id,
    dataPartida: carona.dataPartida,
    vagasOfertadas: carona.vagasOfertadas,
    vagasDisponiveis: carona.vagasOfertadas - carona._count.reservas,
    status: carona.status,
    observacao: carona.observacao,
    motorista: usuarioResumo(carona.rota.motorista),
    veiculo: veiculoResumo(carona.veiculo),
    rota: rotaResumo(carona.rota),
    criadoEm: carona.criadoEm,
  };
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/**
 * O recorte de `passageiros` por camada (DT-23), num lugar só. Mudar o que uma
 * camada vê é mudar aqui — e os testes de visibilidade em `carona.test.ts`.
 *
 * | Camada                          | Recebe                                                   |
 * |---------------------------------|----------------------------------------------------------|
 * | Motorista                       | id, nome, bairro e ponto de embarque de todos            |
 * | Passageiro confirmado           | id, nome e bairro de todos; ponto de embarque só o próprio |
 * | Outro funcionário               | primeiro nome e bairro, sem id e sem ponto de embarque   |
 * | Outro, com a carona encerrada   | nada: o campo não vem                                    |
 *
 * Primeiro nome é redução, não anonimato: numa empresa pequena, "Ana" + bairro
 * ainda identifica. Serve para "tem alguém que eu conheço nessa carona?".
 */
function passageirosVisiveis(
  carona: CaronaComDetalhe,
  camada: CamadaDeVisibilidade,
  solicitanteId: string,
): PassageiroDaCarona[] | undefined {
  switch (camada) {
    case 'MOTORISTA':
      return carona.reservas.map(({ passageiro, pontoEmbarque }) => ({
        id: passageiro.id,
        nome: passageiro.nome,
        bairro: passageiro.bairro,
        pontoEmbarque,
      }));
    case 'PASSAGEIRO':
      return carona.reservas.map(({ passageiro, pontoEmbarque }) => ({
        id: passageiro.id,
        nome: passageiro.nome,
        bairro: passageiro.bairro,
        ...(passageiro.id === solicitanteId && { pontoEmbarque }),
      }));
    case 'OUTRO_FUNCIONARIO':
      return carona.reservas.map(({ passageiro }) => ({
        nome: primeiroNome(passageiro.nome),
        bairro: passageiro.bairro,
      }));
    case 'OUTRO_FUNCIONARIO_CARONA_ENCERRADA':
      return undefined;
  }
}

export function paraDetalhada(
  carona: CaronaComDetalhe,
  camada: CamadaDeVisibilidade,
  solicitanteId: string,
): CaronaDetalhada {
  const passageiros = passageirosVisiveis(carona, camada, solicitanteId);
  return {
    ...paraPublica(carona),
    ...(passageiros !== undefined && { passageiros }),
  };
}
