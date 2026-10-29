import { describe, expect, it } from 'vitest';
import { chaveDeBairro } from '../../src/shared/utils/bairro';

describe('chaveDeBairro', () => {
  it('ignora maiúsculas, acentos e cedilha', () => {
    expect(chaveDeBairro('SÃO JOÃO')).toBe('sao joao');
    expect(chaveDeBairro('Glória')).toBe('gloria');
    expect(chaveDeBairro('Açores')).toBe('acores');
  });

  it('ignora pontuação e espaços repetidos', () => {
    expect(chaveDeBairro('  Costa   e Silva ')).toBe('costa silva');
    expect(chaveDeBairro('Boa-Vista')).toBe('boa vista');
  });

  it('escreve as abreviações por extenso', () => {
    expect(chaveDeBairro('Jd. América')).toBe('jardim america');
    expect(chaveDeBairro('Vl. Nova')).toBe('vila nova');
    expect(chaveDeBairro('Pq. Guarani')).toBe('parque guarani');
    expect(chaveDeBairro('Res. Sta. Catarina')).toBe('residencial santa catarina');
    expect(chaveDeBairro('Zona Ind. Norte')).toBe('zona industrial norte');
  });

  it('tira os conectivos', () => {
    expect(chaveDeBairro('Costa e Silva')).toBe(chaveDeBairro('Costa Silva'));
    expect(chaveDeBairro('Vila da Glória')).toBe(chaveDeBairro('Vila Gloria'));
  });

  it('não confunde abreviação com pedaço de palavra', () => {
    expect(chaveDeBairro('Jardim Paraíso')).toBe('jardim paraiso');
    expect(chaveDeBairro('Resende')).toBe('resende');
  });

  it('dá a mesma chave para as grafias comuns do mesmo bairro', () => {
    const grafias = ['Jardim América', 'jardim america', 'JD AMERICA', 'Jd. América', 'jd.america'];

    expect(new Set(grafias.map(chaveDeBairro)).size).toBe(1);
  });

  it('não resolve erro de digitação', () => {
    expect(chaveDeBairro('Bucarem')).not.toBe(chaveDeBairro('Bucarein'));
  });

  it('devolve chave vazia quando não sobra nome', () => {
    expect(chaveDeBairro('--')).toBe('');
    expect(chaveDeBairro('de')).toBe('');
  });
});
