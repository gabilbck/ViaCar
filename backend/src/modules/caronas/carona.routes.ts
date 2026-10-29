import { Router } from 'express';
import { autenticar } from '../../shared/middlewares/autenticar';
import { validarCorpo, validarQuery } from '../../shared/middlewares/validar';
import * as caronaController from './carona.controller';
import { atualizarCaronaSchema, buscarCaronasSchema, criarCaronaSchema, listarMinhasCaronasSchema } from './carona.schema';

export const caronaRoutes = Router();

caronaRoutes.use(autenticar);

caronaRoutes.post('/', validarCorpo(criarCaronaSchema), caronaController.criar);
caronaRoutes.get('/', validarQuery(buscarCaronasSchema), caronaController.buscar);

// Antes de "/:id", senão o Express trata "minhas" como um id.
caronaRoutes.get('/minhas', validarQuery(listarMinhasCaronasSchema), caronaController.listarMinhas);


caronaRoutes.get('/:id', caronaController.buscarPorId);
caronaRoutes.patch('/:id', validarCorpo(atualizarCaronaSchema), caronaController.atualizar);
caronaRoutes.post('/:id/cancelar', caronaController.cancelar);
