import { z } from 'zod';

const FORMATO_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * 1 = segunda ... 7 = domingo.
 *
 * Aqui só se valida a faixa. Deduplicar e ordenar é invariante do domínio e
 * acontece no service — senão valeria apenas para quem entra pela API, e o seed
 * ou um job gravariam a lista torta.
 */
const diasSemana = z
  .array(
    z.coerce
      .number()
      .int('Dia da semana precisa ser um número inteiro.')
      .min(1, 'Dia da semana vai de 1 (segunda) a 7 (domingo).')
      .max(7, 'Dia da semana vai de 1 (segunda) a 7 (domingo).'),
  )
  .min(1, 'Informe ao menos um dia da semana.');

export const criarRotaSchema = z.object({
  apelido: z.string().trim().min(3, 'Dê um nome à rota com ao menos 3 caracteres.').max(120).optional(),
  origemEndereco: z.string().trim().min(5, 'Endereço de origem é obrigatório.').max(200),
  origemBairro: z.string().trim().min(2, 'Bairro de origem é obrigatório.').max(80),
  destinoEndereco: z.string().trim().min(5, 'Endereço de destino é obrigatório.').max(200),
  destinoBairro: z.string().trim().min(2, 'Bairro de destino é obrigatório.').max(80),
  horarioPartida: z.string().regex(FORMATO_HORA, 'Horário deve estar no formato HH:mm, como "07:30".'),
  sentido: z.enum(['IDA', 'VOLTA'], 'Sentido deve ser IDA (para a empresa) ou VOLTA (para casa).'),
  diasSemana,
});

export const atualizarRotaSchema = criarRotaSchema
  .partial()
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

export type CriarRotaDTO = z.infer<typeof criarRotaSchema>;
export type AtualizarRotaDTO = z.infer<typeof atualizarRotaSchema>;
