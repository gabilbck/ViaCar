import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/prisma';
import * as authService from '../../src/modules/auth/auth.service';
import { AppError } from '../../src/shared/errors/app-error';
import { loginSchema, registrarSchema } from '../../src/modules/auth/auth.schema';

const NOVO = {
  nome: 'Willian Squena',
  email: 'willian@viacar.com.br',
  senha: 'viacar123',
  matricula: 'F-10003',
  bairro: 'Costa e Silva',
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

describe('cadastro de funcionário', () => {
  it('cadastra e já devolve o funcionário autenticado', async () => {
    const { token, usuario } = await authService.registrar(NOVO);

    expect(token).toBeTruthy();
    expect(usuario.email).toBe('willian@viacar.com.br');
    expect(usuario.ativo).toBe(true);
  });

  it('nunca devolve senhaHash na resposta', async () => {
    const { usuario } = await authService.registrar(NOVO);

    expect(usuario).not.toHaveProperty('senhaHash');
    expect(JSON.stringify(usuario)).not.toContain('$2');
  });

  it('guarda a senha com hash, nunca em texto puro', async () => {
    await authService.registrar(NOVO);

    const salvo = await prisma.usuario.findUniqueOrThrow({ where: { email: NOVO.email } });
    expect(salvo.senhaHash).not.toBe(NOVO.senha);
    expect(salvo.senhaHash.startsWith('$2')).toBe(true);
  });

  it('normaliza o e-mail para minúsculas', async () => {
    await authService.registrar({ ...NOVO, email: 'WILLIAN@ViaCar.com.BR' });

    const salvo = await prisma.usuario.findUnique({ where: { email: 'willian@viacar.com.br' } });
    expect(salvo).not.toBeNull();
  });

  it('recusa e-mail já cadastrado, apontando o campo', async () => {
    await authService.registrar(NOVO);

    const erro = await capturarErro(() =>
      authService.registrar({ ...NOVO, matricula: 'F-99999' }),
    );

    expect(erro.codigo).toBe('CONFLITO');
    expect(erro.campo).toBe('email');
  });

  it('recusa matrícula já cadastrada, apontando o campo', async () => {
    await authService.registrar(NOVO);

    const erro = await capturarErro(() =>
      authService.registrar({ ...NOVO, email: 'outro@viacar.com.br' }),
    );

    expect(erro.codigo).toBe('CONFLITO');
    expect(erro.campo).toBe('matricula');
  });
});

describe('login', () => {
  it('autentica com a senha correta', async () => {
    await authService.registrar(NOVO);

    const { token, usuario } = await authService.login({
      email: NOVO.email,
      senha: NOVO.senha,
    });

    expect(token).toBeTruthy();
    expect(usuario.matricula).toBe(NOVO.matricula);
  });

  it('aceita e-mail digitado em maiúsculas', async () => {
    await authService.registrar(NOVO);

    const { token } = await authService.login({ email: 'WILLIAN@VIACAR.COM.BR', senha: NOVO.senha });

    expect(token).toBeTruthy();
  });

  /**
   * Decisão de segurança: responder "e-mail não encontrado" permitiria a qualquer
   * um enumerar a lista de funcionários da empresa testando endereços.
   */
  it('devolve a mesma mensagem para senha errada e para e-mail inexistente', async () => {
    await authService.registrar(NOVO);

    const senhaErrada = await capturarErro(() =>
      authService.login({ email: NOVO.email, senha: 'errada123' }),
    );
    const emailInexistente = await capturarErro(() =>
      authService.login({ email: 'ninguem@viacar.com.br', senha: NOVO.senha }),
    );

    expect(senhaErrada.message).toBe(emailInexistente.message);
    expect(senhaErrada.status).toBe(401);
    expect(emailInexistente.status).toBe(401);
  });

  it('recusa login de cadastro inativo com mensagem específica', async () => {
    await authService.registrar(NOVO);
    await prisma.usuario.update({ where: { email: NOVO.email }, data: { ativo: false } });

    const erro = await capturarErro(() =>
      authService.login({ email: NOVO.email, senha: NOVO.senha }),
    );

    expect(erro.codigo).toBe('SEM_PERMISSAO');
    expect(erro.message).toContain('RH');
  });
});

describe('política de senha (DT-04)', () => {
  /** Mensagens de erro do campo senha; lista vazia = senha aceita. */
  function errosDeSenha(senha: string): string[] {
    const resultado = registrarSchema.safeParse({ ...NOVO, senha });
    if (resultado.success) return [];
    return resultado.error.issues
      .filter((problema) => problema.path[0] === 'senha')
      .map((problema) => problema.message);
  }

  it('aceita senha com maiúscula, número e caractere especial', () => {
    expect(errosDeSenha('Carona@2026')).toEqual([]);
  });

  it('aceita maiúscula acentuada', () => {
    expect(errosDeSenha('Ética#2026')).toEqual([]);
  });

  it('recusa senha com menos de 8 caracteres', () => {
    expect(errosDeSenha('Ab1!')).toContain('Senha precisa ter ao menos 8 caracteres.');
  });

  it('recusa senha sem letra maiúscula', () => {
    expect(errosDeSenha('carona@2026')).toContain('Senha precisa ter ao menos uma letra maiúscula.');
  });

  it('recusa senha sem número', () => {
    expect(errosDeSenha('Carona@@')).toContain('Senha precisa ter ao menos um número.');
  });

  it('recusa senha sem caractere especial', () => {
    expect(errosDeSenha('Carona2026')).toContain(
      'Senha precisa ter ao menos um caractere especial (ex.: ! @ # $).',
    );
  });

    it('recusa senha com mais de 72 caracteres', () => {
    const longa = `Aa1!${'x'.repeat(69)}`;

    expect(errosDeSenha(longa)).toContain('Senha pode ter no máximo 72 caracteres.');
  });

  it('não exige a política no login: senhas antigas continuam entrando', () => {
    const resultado = loginSchema.safeParse({ email: NOVO.email, senha: 'viacar123' });

    expect(resultado.success).toBe(true);
  });

});
