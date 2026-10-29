/**
 * Bairro e texto livre (DT-06): cada funcionario digita do seu jeito, e
 * "Jd. América", "jardim america" e "JARDIM  AMÉRICA" sao o mesmo lugar.
 *
 * A rota guarda o que o motorista digitou, para exibir, e ao lado uma chave
 * normalizada, para buscar. A busca normaliza o filtro do mesmo jeito e compara
 * chave com chave.
 *
 * O que NAO resolve: erro de digitacao ("Bucarem" no lugar de "Bucarein"). Isso
 * so fecha com um cadastro canonico de bairros - ver DT-06 em debitos-tecnicos.md.
 *
 * As mesmas regras estao replicadas em SQL na migration `chave_de_busca_do_bairro`,
 * que preencheu as rotas ja existentes. Mudou aqui, as rotas antigas ficam com a
 * chave velha: escreva uma migration que recalcule.
 */

/** Abreviacoes comuns em nome de bairro, por extenso e sem acento. */
const ABREVIACOES: Record<string, string> = {
  jd: 'jardim',
  jdm: 'jardim',
  vl: 'vila',
  pq: 'parque',
  res: 'residencial',
  resid: 'residencial',
  cj: 'conjunto',
  conj: 'conjunto',
  lot: 'loteamento',
  cond: 'condominio',
  ind: 'industrial',
  sta: 'santa',
  sto: 'santo',
  nsa: 'nossa',
  sra: 'senhora',
};

/**
 * Conectivos saem da chave: "Costa e Silva" e "Costa Silva", "Vila da Gloria" e
 * "Vila Gloria" sao digitados das duas formas.
 */
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * Chave de busca de um bairro: minusculas, sem acento, sem pontuacao, com as
 * abreviacoes por extenso e sem conectivos.
 *
 * "Jd. São  João" -> "jardim sao joao"
 */
export function chaveDeBairro(bairro: string): string {
  return bairro
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((palavra) => palavra !== '' && !CONECTIVOS.has(palavra))
    .map((palavra) => ABREVIACOES[palavra] ?? palavra)
    .join(' ');
}
