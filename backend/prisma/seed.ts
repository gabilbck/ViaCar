/**
 * Popula o banco com o cenario de demonstracao do case.
 *
 * O roteiro que ele monta e o mesmo do pitch:
 *   abrir carona com mais vagas do que o carro comporta  -> barrado pela RN-01
 *   passageiro reserva                                   -> vaga ocupada
 *   ultima vaga preenchida                               -> carona vira LOTADA
 *   passageiro cancela                                   -> vaga volta (RN-06)
 *
 * Rodar com: npm run seed
 * O banco e limpo antes, entao pode rodar quantas vezes quiser.
 */
import { PrismaClient, Sentido, StatusCarona, StatusReserva } from '@prisma/client';
import { hash } from 'bcryptjs';
import { chaveDeBairro } from '../src/shared/utils/bairro';
import { combinarDiaEHorario, textoParaHora } from '../src/shared/utils/horario';

const prisma = new PrismaClient({ log: ['error'] });

const SENHA_PADRAO = 'viacar123';
const CUSTO_HASH = 10;

/** Proximo dia util a partir de hoje, deslocado em `daquiAQuantosDias`. */
function proximoDiaUtil(daquiAQuantosDias: number): Date {
  const dia = new Date();
  dia.setUTCDate(dia.getUTCDate() + daquiAQuantosDias);
  while (dia.getUTCDay() === 0 || dia.getUTCDay() === 6) {
    dia.setUTCDate(dia.getUTCDate() + 1);
  }
  return dia;
}

async function limpar(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Seed nao roda em producao - ele apaga os dados existentes.');
  }
  // Ordem importa: nada tem cascade, entao as dependentes saem primeiro.
  await prisma.reserva.deleteMany();
  await prisma.carona.deleteMany();
  await prisma.rota.deleteMany();
  await prisma.veiculo.deleteMany();
  await prisma.usuario.deleteMany();
}

async function main(): Promise<void> {
  await limpar();

  const senhaHash = await hash(SENHA_PADRAO, CUSTO_HASH);
  const DIAS_UTEIS = [1, 2, 3, 4, 5];

  // ---------------------------------------------------------------- usuarios
  // Criados um a um, e não por destructuring de Promise.all: o resultado do
  // array daria `Usuario | undefined` para o TypeScript, obrigando a checagem
  // de nulo em toda linha abaixo para provar algo que já sabemos.
  const funcionario = (nome: string, email: string, matricula: string, bairro: string, telefone: string | null) =>
    prisma.usuario.create({ data: { nome, email, matricula, bairro, telefone, senhaHash } });

  const vinicius = await funcionario('Vinicius Steuernagel', 'vinicius@viacar.com.br', 'F-10001', 'Costa e Silva', '(47) 99812-4455');
  const nicholas = await funcionario('Nicholas Scoz dos Santos', 'nicholas@viacar.com.br', 'F-10002', 'Bucarein', '(47) 99730-1188');
  const willian = await funcionario('Willian Squena', 'willian@viacar.com.br', 'F-10003', 'Costa e Silva', '(47) 99655-2301');
  const kaua = await funcionario('Kaua Lucindo', 'kaua@viacar.com.br', 'F-10004', 'Bucarein', '(47) 99521-7744');
  const lucas = await funcionario('Lucas Rogerio Mendonca', 'lucas@viacar.com.br', 'F-10006', 'Iririu', '(47) 99408-9012');

  // Henrique fica sem reserva de propósito: é o usuário para demonstrar o fluxo
  // de reserva do zero na apresentação.
  await funcionario('Henrique Cordeiro de Oliveira', 'henrique@viacar.com.br', 'F-10005', 'Costa e Silva', null);

  // ---------------------------------------------------------------- veiculos
  const civic = await prisma.veiculo.create({
    data: { usuarioId: vinicius.id, placa: 'MHT4A21', modelo: 'Honda Civic', cor: 'Prata', capacidadePassageiros: 4 },
  });
  const onix = await prisma.veiculo.create({
    data: { usuarioId: nicholas.id, placa: 'QPB7C09', modelo: 'Chevrolet Onix', cor: 'Branco', capacidadePassageiros: 3 },
  });

  // ------------------------------------------------------------------- rotas
  const EMPRESA = { endereco: 'Rod. Dr. Paulo Schroeder, 3000', bairro: 'Zona Industrial Norte' };

  const rotaViniciusIda = await prisma.rota.create({
    data: {
      motoristaId: vinicius.id,
      apelido: 'Costa e Silva -> Empresa',
      origemEndereco: 'Rua Ministro Calogeras, 1200',
      origemBairro: 'Costa e Silva',
      origemBairroChave: chaveDeBairro('Costa e Silva'),
      destinoEndereco: EMPRESA.endereco,
      destinoBairro: EMPRESA.bairro,
      destinoBairroChave: chaveDeBairro(EMPRESA.bairro),
      horarioPartida: textoParaHora('07:30'),
      sentido: Sentido.IDA,
      diasSemana: DIAS_UTEIS,
    },
  });

  const rotaViniciusVolta = await prisma.rota.create({
    data: {
      motoristaId: vinicius.id,
      apelido: 'Empresa -> Costa e Silva',
      origemEndereco: EMPRESA.endereco,
      origemBairro: EMPRESA.bairro,
      origemBairroChave: chaveDeBairro(EMPRESA.bairro),
      destinoEndereco: 'Rua Ministro Calogeras, 1200',
      destinoBairro: 'Costa e Silva',
      destinoBairroChave: chaveDeBairro('Costa e Silva'),
      horarioPartida: textoParaHora('17:40'),
      sentido: Sentido.VOLTA,
      diasSemana: DIAS_UTEIS,
    },
  });

  const rotaNicholasIda = await prisma.rota.create({
    data: {
      motoristaId: nicholas.id,
      apelido: 'Bucarein -> Empresa',
      origemEndereco: 'Rua Blumenau, 840',
      origemBairro: 'Bucarein',
      origemBairroChave: chaveDeBairro('Bucarein'),
      destinoEndereco: EMPRESA.endereco,
      destinoBairro: EMPRESA.bairro,
      destinoBairroChave: chaveDeBairro(EMPRESA.bairro),
      horarioPartida: textoParaHora('07:00'),
      sentido: Sentido.IDA,
      diasSemana: DIAS_UTEIS,
    },
  });

  // ----------------------------------------------------------------- caronas
  // data_partida SEMPRE montada a partir do horario da rota - ver
  // docs/debitos-tecnicos.md, armadilha 3.1.
  const caronaAberta = await prisma.carona.create({
    data: {
      rotaId: rotaViniciusIda.id,
      veiculoId: civic.id,
      dataPartida: combinarDiaEHorario(proximoDiaUtil(1), rotaViniciusIda.horarioPartida),
      vagasOfertadas: 4,
      observacao: 'Passo no posto antes, saio 5 min mais cedo',
    },
  });

  const caronaLotada = await prisma.carona.create({
    data: {
      rotaId: rotaNicholasIda.id,
      veiculoId: onix.id,
      dataPartida: combinarDiaEHorario(proximoDiaUtil(1), rotaNicholasIda.horarioPartida),
      vagasOfertadas: 2,
      status: StatusCarona.LOTADA,
    },
  });

  const caronaVolta = await prisma.carona.create({
    data: {
      rotaId: rotaViniciusVolta.id,
      veiculoId: civic.id,
      dataPartida: combinarDiaEHorario(proximoDiaUtil(1), rotaViniciusVolta.horarioPartida),
      vagasOfertadas: 3,
    },
  });

  // ---------------------------------------------------------------- reservas
  await prisma.reserva.createMany({
    data: [
      // Carona aberta: 1 de 4 vagas ocupada -> sobram 3.
      { caronaId: caronaAberta.id, passageiroId: willian.id, pontoEmbarque: 'Praca do Bucarein' },
      // Carona lotada: as 2 vagas ocupadas -> justifica o status LOTADA.
      { caronaId: caronaLotada.id, passageiroId: kaua.id, pontoEmbarque: 'Terminal Norte' },
      { caronaId: caronaLotada.id, passageiroId: lucas.id },
      // Volta: 1 confirmada e 1 cancelada, para demonstrar que a vaga volta (RN-06).
      { caronaId: caronaVolta.id, passageiroId: willian.id },
      { caronaId: caronaVolta.id, passageiroId: kaua.id, status: StatusReserva.CANCELADA, canceladoEm: new Date() },
    ],
  });

  // ------------------------------------------------------------------ resumo
  const confirmadasAberta = await prisma.reserva.count({
    where: { caronaId: caronaAberta.id, status: StatusReserva.CONFIRMADA },
  });

  console.log('\nBanco populado.\n');
  console.log(`  6 funcionarios   senha de todos: ${SENHA_PADRAO}`);
  console.log('    vinicius@viacar.com.br   Costa e Silva   motorista (Civic, 4 vagas)');
  console.log('    nicholas@viacar.com.br   Bucarein        motorista (Onix, 3 vagas)');
  console.log('    willian@viacar.com.br    Costa e Silva   passageiro com reserva confirmada');
  console.log('    kaua@viacar.com.br       Bucarein        passageiro com reserva cancelada');
  console.log('    henrique@viacar.com.br   Costa e Silva   sem reserva');
  console.log('    lucas@viacar.com.br      Iririu          passageiro');
  console.log('\n  2 veiculos, 3 rotas, 3 caronas, 5 reservas');
  console.log(`  Carona aberta de ${caronaAberta.dataPartida.toISOString()}: ${caronaAberta.vagasOfertadas - confirmadasAberta} de ${caronaAberta.vagasOfertadas} vagas livres\n`);
}

main()
  .catch((erro) => {
    console.error('[seed] falhou:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
