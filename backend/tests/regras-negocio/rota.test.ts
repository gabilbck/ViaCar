import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { criarRotaSchema } from '../../src/modules/rotas/rota.schema';
import * as rotaService from '../../src/modules/rotas/rota.service';
import { AppError } from '../../src/shared/errors/app-error';
import { criarCarona, criarRota, criarUsuario, criarVeiculo, emDias } from '../fabricas';

const ROTA = {
  apelido: 'Costa e Silva -> Empresa',
  origemEndereco: 'Rua Ministro Calógeras, 1200',
  origemBairro: 'Costa e Silva',
  destinoEndereco: 'Rod. Paulo Schroeder, 3000',
  destinoBairro: 'Zona Industrial Norte',
  horarioPartida: '07:30',
  sentido: 'IDA' as const,
  diasSemana: [1, 2, 3, 4, 5],
};

async function capturarErro(acao: () => Promise<unknown>): Promise<AppError> {
  try {
    await acao();
  } catch (erro) {
    if (erro instanceof AppError) return erro;
    throw erro;
  }
  throw new Error('Esperava um AppError, mas a operação foi concluída com sucesso.');
}

describe('cadastro de rota', () => {
  it('cadastra e devolve o horário como "HH:mm", não como timestamp', async () => {
    const motorista = await criarUsuario();

    const rota = await rotaService.criar(motorista.id, ROTA);

    expect(rota.horarioPartida).toBe('07:30');
    expect(rota.ativa).toBe(true);
  });

  it('preserva o horário no ida e volta pelo banco', async () => {
    const motorista = await criarUsuario();
    const criada = await rotaService.criar(motorista.id, { ...ROTA, horarioPartida: '17:40' });

    const lida = await rotaService.buscarPorId(criada.id, motorista.id);

    expect(lida.horarioPartida).toBe('17:40');
  });

  it('ordena e remove repetição nos dias da semana', async () => {
    const motorista = await criarUsuario();

    const rota = await rotaService.criar(motorista.id, { ...ROTA, diasSemana: [5, 1, 5, 3] });

    expect(rota.diasSemana).toEqual([1, 3, 5]);
  });

  it('guarda o bairro como digitado e a chave de busca ao lado', async () => {
    const motorista = await criarUsuario();

    const criada = await rotaService.criar(motorista.id, { ...ROTA, origemBairro: 'Jd. América' });

    const salva = await prisma.rota.findUniqueOrThrow({ where: { id: criada.id } });
    expect(criada.origemBairro).toBe('Jd. América');
    expect(salva.origemBairroChave).toBe('jardim america');
    expect(salva.destinoBairroChave).toBe('zona industrial norte');
  });

  it('recalcula a chave quando o bairro é editado', async () => {
    const motorista = await criarUsuario();
    const criada = await rotaService.criar(motorista.id, ROTA);

    await rotaService.atualizar(criada.id, motorista.id, { destinoBairro: 'Pq. Guarani' });

    const salva = await prisma.rota.findUniqueOrThrow({ where: { id: criada.id } });
    expect(salva.destinoBairroChave).toBe('parque guarani');
    expect(salva.origemBairroChave).toBe('costa silva');
  });

  it('recusa bairro sem nome', () => {
    expect(criarRotaSchema.safeParse({ ...ROTA, origemBairro: '--' }).success).toBe(false);
  });
});

describe('posse da rota', () => {
  it('não deixa um funcionário ver a rota de outro', async () => {
    const motorista = await criarUsuario();
    const intruso = await criarUsuario();
    const rota = await criarRota(motorista.id);

    const erro = await capturarErro(() => rotaService.buscarPorId(rota.id, intruso.id));

    expect(erro.status).toBe(403);
  });

  it('não deixa um funcionário editar a rota de outro', async () => {
    const motorista = await criarUsuario();
    const intruso = await criarUsuario();
    const rota = await criarRota(motorista.id);

    const erro = await capturarErro(() =>
      rotaService.atualizar(rota.id, intruso.id, { apelido: 'Sequestrada' }),
    );

    expect(erro.status).toBe(403);
  });

  it('lista apenas as rotas do próprio motorista', async () => {
    const motorista = await criarUsuario();
    const outro = await criarUsuario();
    await criarRota(motorista.id);
    await criarRota(motorista.id, { sentido: 'VOLTA' });
    await criarRota(outro.id);

    expect(await rotaService.listarDoMotorista(motorista.id)).toHaveLength(2);
  });
});

describe('remoção de rota', () => {
  it('remove logicamente e some da listagem', async () => {
    const motorista = await criarUsuario();
    const rota = await criarRota(motorista.id);

    await rotaService.inativar(rota.id, motorista.id);

    expect(await rotaService.listarDoMotorista(motorista.id)).toHaveLength(0);
  });

  it('recusa remover rota com carona agendada', async () => {
    const motorista = await criarUsuario();
    const veiculo = await criarVeiculo(motorista.id);
    const rota = await criarRota(motorista.id);
    await criarCarona(rota, veiculo.id, { dia: emDias(2) });

    const erro = await capturarErro(() => rotaService.inativar(rota.id, motorista.id));

    expect(erro.codigo).toBe('REGRA_NEGOCIO');
    expect(erro.message).toContain('carona agendada');
  });

  it('permite remover rota cujas caronas já aconteceram', async () => {
    const motorista = await criarUsuario();
    const veiculo = await criarVeiculo(motorista.id);
    const rota = await criarRota(motorista.id);
    await criarCarona(rota, veiculo.id, { dia: emDias(-5) });

    await rotaService.inativar(rota.id, motorista.id);

    expect(await rotaService.listarDoMotorista(motorista.id)).toHaveLength(0);
  });
});
