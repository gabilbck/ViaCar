import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Roda UMA vez antes de toda a suíte: garante que o banco de teste existe e está
 * com as migrations aplicadas — incluindo as constraints e a trigger da RN-01,
 * que são justamente o que vários testes verificam.
 */
export default async function preparar(): Promise<void> {
  const url = process.env['DATABASE_URL'];

  if (!url) {
    throw new Error('DATABASE_URL não definida. O .env.test foi carregado?');
  }

  if (!url.includes('_test')) {
    throw new Error(
      `Recusando rodar a suíte: DATABASE_URL não aponta para um banco de teste.\n` +
        `Encontrado: ${url}\n` +
        `A suíte limpa as tabelas — apontar para o banco de desenvolvimento apagaria seus dados.`,
    );
  }

  await criarBancoSeNaoExistir(url);

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}

/**
 * O `prisma migrate deploy` não cria o banco, só aplica migrations num que já
 * existe. Então a suíte cria antes, conectando no banco de manutenção
 * (`postgres`) do mesmo servidor.
 *
 * A versão anterior fazia isso com `docker exec viacar-postgres psql`, o que
 * amarrava a suíte a um container com esse nome exato. Funcionava na máquina de
 * quem escreveu e em nenhum outro lugar — num runner de CI, onde o Postgres é
 * um serviço e não esse container, os testes nem começavam.
 */
async function criarBancoSeNaoExistir(url: string): Promise<void> {
  const nome = new URL(url).pathname.replace('/', '');

  // O nome é interpolado no SQL, então vale garantir que é um identificador.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nome)) {
    throw new Error(`Nome de banco inválido na DATABASE_URL: "${nome}".`);
  }

  const manutencao = new URL(url);
  manutencao.pathname = '/postgres';
  manutencao.search = '';

  const prisma = new PrismaClient({ datasourceUrl: manutencao.toString(), log: [] });

  try {
    const existe = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM pg_database WHERE datname = '${nome}'`,
    );

    if (existe.length === 0) {
      // CREATE DATABASE não roda dentro de transação — por isso `$executeRawUnsafe`
      // direto, e não `$transaction`.
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${nome}"`);
    }
  } catch (erro) {
    throw new Error(
      `Não foi possível preparar o banco de teste "${nome}".\n` +
        `O Postgres está de pé e aceitando conexão em ${manutencao.host}? ` +
        `Em desenvolvimento: docker compose up -d\n${String(erro)}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
