import type { RequestHandler } from 'express';
import { usuarioLogado } from '../../shared/middlewares/autenticar';
import { consultaValidada } from '../../shared/middlewares/validar';
import { parametroObrigatorio } from '../../shared/utils/parametros';
import type { BuscarCaronasDTO, ListarMinhasCaronasDTO } from './carona.schema';
import * as caronaService from './carona.service';

export const criar: RequestHandler = async (req, res) => {
  const carona = await caronaService.criar(usuarioLogado(req), req.body);
  res.status(201).json(carona);
};

export const buscar: RequestHandler = async (req, res) => {
  const filtros = consultaValidada<BuscarCaronasDTO>(req);
  res.json(await caronaService.buscar(usuarioLogado(req), filtros));
};

export const listarMinhas: RequestHandler = async (req, res) => {
  const { periodo } = consultaValidada<ListarMinhasCaronasDTO>(req);
  res.json(await caronaService.listarDoMotorista(usuarioLogado(req), periodo));
};

export const buscarPorId: RequestHandler = async (req, res) => {
  res.json(await caronaService.buscarPorId(parametroObrigatorio(req, 'id')));
};

export const atualizar: RequestHandler = async (req, res) => {
  const carona = await caronaService.atualizar(
    parametroObrigatorio(req, 'id'),
    usuarioLogado(req),
    req.body,
  );
  res.json(carona);
};

export const cancelar: RequestHandler = async (req, res) => {
  const carona = await caronaService.cancelar(parametroObrigatorio(req, 'id'), usuarioLogado(req));
  res.json(carona);
};
