import { z } from 'zod';
import { chaveDeBairro } from '../../shared/utils/bairro';

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O dia da carona vem como "AAAA-MM-DD", não como instante completo.
 *
 * Isso elimina a ambiguidade de fuso na entrada: "2026-09-15T22:00-03:00" cai
 * em 16/09 pelo relógio UTC, e o funcionário que pediu carona para o dia 15
 * receberia a do dia 16. A hora sai de `rota.horarioPartida`, não do cliente.
 */
const dia = z
  .string()
  .trim()
  .regex(FORMATO_DATA, 'Informe a data no formato AAAA-MM-DD, como "2026-09-15".')
  .refine(
    (valor) => {
      // Ida e volta, não só `Date.parse`: o JavaScript ROLA o excedente em vez de
      // recusar. "2026-02-30" vira 02/03 e "2027-02-29" vira 01/03 — o funcionário
      // pediria carona para um dia e receberia outro, sem aviso nenhum.
      const data = new Date(`${valor}T12:00:00.000Z`);
      return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
    },
    { message: 'Esta data não existe no calendário.' },
  );

export const criarCaronaSchema = z.object({
  rotaId: z.uuid('Informe o id da rota.'),
  veiculoId: z.uuid('Informe o id do veículo.'),
  data: dia,
  vagasOfertadas: z.coerce
    .number()
    .int('O número de vagas precisa ser inteiro.')
    .min(1, 'Ofereça ao menos uma vaga.')
    .max(8, 'Nenhum veículo do sistema comporta mais de 8 passageiros.'),
  observacao: z.string().trim().max(255).optional(),
});

export const atualizarCaronaSchema = z
  .object({
    vagasOfertadas: z.coerce
      .number()
      .int('O número de vagas precisa ser inteiro.')
      .min(1, 'Ofereça ao menos uma vaga.')
      .max(8)
      .optional(),
    observacao: z.string().trim().max(255).nullable().optional(),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

/**
 * Filtro de bairro que vira chave vazia ("--") casaria com toda carona aberta,
 * e o funcionário acharia que o filtro funcionou (DT-06).
 */
const filtroDeBairro = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine((texto) => chaveDeBairro(texto) !== '', 'Informe o nome do bairro.');

/** Filtros da busca de caronas. Todos opcionais — sem nenhum, lista tudo que está aberto. */
export const buscarCaronasSchema = z.object({
  bairroOrigem: filtroDeBairro.optional(),
  bairroDestino: filtroDeBairro.optional(),
  data: dia.optional(),
  sentido: z.enum(['IDA', 'VOLTA']).optional(),
});

export type CriarCaronaDTO = z.infer<typeof criarCaronaSchema>;
export type AtualizarCaronaDTO = z.infer<typeof atualizarCaronaSchema>;
export type BuscarCaronasDTO = z.infer<typeof buscarCaronasSchema>;
