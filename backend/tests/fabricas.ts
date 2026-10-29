import type { Carona, Rota, Usuario, Veiculo } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { chaveDeBairro } from '../src/shared/utils/bairro';
import { combinarDiaEHorario, textoParaHora } from '../src/shared/utils/horario';

/**
 * Fábricas de dados para os testes. Cada uma preenche valores padrão plausíveis
 * e aceita sobrescrita parcial, para que cada teste declare só o que é relevante
 * para ele — e quem lê o teste enxergue a regra, não o preenchimento.
 */

let contador = 0;
const proximo = (): number => ++contador;

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Placa no formato Mercosul (LLLNLNN), sempre com 7 caracteres.
 *
 * Interpolar o contador direto na placa parecia funcionar e estourava o
 * `VARCHAR(8)` assim que a suíte passava de 99 veículos — e a falha aparecia no
 * arquivo de teste azarado da vez, não aqui. O contador é do módulo e não zera
 * entre arquivos, então o tamanho precisa ser fixo.
 */
function placaDeTeste(n: number): string {
  const digito = Math.floor(n / 2600) % 10;
  const letra = LETRAS[n % 26];
  return `TST${digito}${letra}${String(n % 100).padStart(2, '0')}`;
}

export async function criarUsuario(dados: Partial<Usuario> = {}): Promise<Usuario> {
  const n = proximo();
  return prisma.usuario.create({
    data: {
      nome: `Funcionario ${n}`,
      email: `funcionario${n}@viacar.com.br`,
      senhaHash: 'hash-de-teste',
      matricula: `F-${String(n).padStart(5, '0')}`,
      bairro: 'Costa e Silva',
      ...dados,
    },
  });
}

export async function criarVeiculo(
  usuarioId: string,
  dados: Partial<Veiculo> = {},
): Promise<Veiculo> {
  const n = proximo();
  return prisma.veiculo.create({
    data: {
      usuarioId,
      placa: placaDeTeste(n),
      modelo: 'Honda Civic',
      cor: 'Prata',
      capacidadePassageiros: 4,
      ...dados,
    },
  });
}

/** As chaves de busca saem sempre dos bairros finais, inclusive dos sobrescritos. */
export async function criarRota(motoristaId: string, dados: Partial<Rota> = {}): Promise<Rota> {
  const { origemBairro = 'Costa e Silva', destinoBairro = 'Zona Industrial Norte', ...resto } = dados;
  return prisma.rota.create({
    data: {
      motoristaId,
      apelido: 'Costa e Silva -> Empresa',
      origemEndereco: 'Rua Ministro Calogeras, 1200',
      origemBairro,
      origemBairroChave: chaveDeBairro(origemBairro),
      destinoEndereco: 'Rod. Paulo Schroeder, 3000',
      destinoBairro,
      destinoBairroChave: chaveDeBairro(destinoBairro),
      horarioPartida: textoParaHora('07:30'),
      sentido: 'IDA',
      diasSemana: [1, 2, 3, 4, 5],
      ...resto,
    },
  });
}

/** Data deslocada em dias a partir de agora. Use negativo para o passado. */
export function emDias(dias: number): Date {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + dias);
  return data;
}

/** O mesmo deslocamento, no formato "AAAA-MM-DD" que a API de caronas recebe. */
export function diaEmTexto(dias: number): string {
  return emDias(dias).toISOString().slice(0, 10);
}

export async function criarCarona(
  rota: Rota,
  veiculoId: string,
  dados: Partial<Carona> & { dia?: Date } = {},
): Promise<Carona> {
  const { dia, ...resto } = dados;
  return prisma.carona.create({
    data: {
      rotaId: rota.id,
      veiculoId,
      dataPartida: combinarDiaEHorario(dia ?? emDias(1), rota.horarioPartida),
      vagasOfertadas: 3,
      ...resto,
    },
  });
}
