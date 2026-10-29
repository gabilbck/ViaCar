import { Router } from 'express';
import { validarCorpo } from '../../shared/middlewares/validar';
import * as authController from './auth.controller';
import { loginSchema, registrarSchema } from './auth.schema';

export const authRoutes = Router();

// Unicas rotas publicas de negocio. As demais excecoes (health e docs) estao
// em app.ts e listadas no RNF-01 (docs/requisitos.md, secao 5.1).
authRoutes.post('/registrar', validarCorpo(registrarSchema), authController.registrar);
authRoutes.post('/login', validarCorpo(loginSchema), authController.login);
