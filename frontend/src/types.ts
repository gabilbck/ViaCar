export interface ApiError {
  codigo?: string;
  mensagem?: string;
  campo?: string;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  matricula: string;
  telefone?: string | null;
  bairro: string;
  ativo?: boolean;
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface LoginResponse {
  token: string;
  usuario: Usuario;
}

export interface Veiculo {
  id: string;
  placa: string;
  modelo: string;
  cor: string;
  capacidadePassageiros: number;
  ativo?: boolean;
}

export interface Rota {
  id: string;
  apelido?: string | null;
  origemBairro: string;
  origemEndereco: string;
  destinoBairro: string;
  destinoEndereco: string;
  horarioPartida: string;
  sentido: "IDA" | "VOLTA";
  diasSemana: number[];
  ativa?: boolean;
  motoristaId?: string;
}

export interface Carona {
  id: string;
  rotaId: string;
  veiculoId: string;
  dataPartida: string;
  vagasOfertadas: number;
  vagasDisponiveis: number;
  observacao?: string | null;
  status: string;

  rota: Rota;

  veiculo: Veiculo;

  motorista: {
    id: string;
    nome: string;
    bairro?: string;
  };

  _count?: {
    reservas: number;
  };
}

/** Passageiro confirmado. Só vem a reserva confirmada; quem cancelou não aparece. */
export interface PassageiroCarona {
  id: string;
  nome: string;
  bairro: string;
  pontoEmbarque: string | null;
}

/** Só mostra passageiro ao motorista. */
export interface CaronaDetalhada extends Carona {
  passageiros: PassageiroCarona[];
}

export interface Reserva {
  id: string;
  caronaId: string;
  status: string;
  pontoEmbarque?: string | null;
  criadaEm?: string;
  canceladoEm?: string | null;

  carona: Carona;
}
