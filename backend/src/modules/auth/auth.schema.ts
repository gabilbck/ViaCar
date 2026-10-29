import { z } from 'zod';

/** DT-04: tamanho mínimo, maiúscula, número e caractere especial. */
const senha = z
  .string()
  .min(8, 'Senha precisa ter ao menos 8 caracteres.')
  .max(72, 'Senha pode ter no máximo 72 caracteres.')
  .regex(/\p{Lu}/u, 'Senha precisa ter ao menos uma letra maiúscula.')
  .regex(/\d/, 'Senha precisa ter ao menos um número.')
  .regex(/[^\p{L}\p{N}\s]/u, 'Senha precisa ter ao menos um caractere especial (ex.: ! @ # $).');

export const registrarSchema = z.object({
  nome: z.string().trim().min(3, 'Nome precisa ter ao menos 3 caracteres.').max(120),
  email: z.email('Informe um e-mail válido.').max(160),
  senha,
  matricula: z.string().trim().min(2, 'Matrícula é obrigatória.').max(20),
  telefone: z.string().trim().max(20).optional(),
  bairro: z.string().trim().min(2, 'Bairro é obrigatório.').max(80),
});

export const loginSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Senha é obrigatória.'),
});

export type RegistrarDTO = z.infer<typeof registrarSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
