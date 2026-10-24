import type {
  ApiError,
  Carona,
  LoginResponse,
  Reserva,
  Rota,
  Usuario,
  Veiculo,
} from "./src/types";

const API_URL = "http://localhost:3333";

class ApiException extends Error {
  status: number;
  data?: ApiError;

  constructor(message: string, status: number, data?: ApiError) {
    super(message);
    this.name = "ApiException";
    this.status = status;
    this.data = data;
  }
}

function getToken(): string | null {
  return localStorage.getItem("viacar_token");
}

function logout() {
  localStorage.removeItem("viacar_token");
  localStorage.removeItem("viacar_usuario");

  window.location.href = "/";
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  authenticated = true
): Promise<T> {
  const headers = new Headers(options.headers);

  headers.set("Content-Type", "application/json");

  if (authenticated) {
    const token = getToken();

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  let data: unknown = null;

  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    data = await response.json();
  }

  if (!response.ok) {
    const errorData = data as ApiError | null;

    if (response.status === 401 && authenticated) {
      logout();
    }

    throw new ApiException(
      errorData?.mensagem || "Ocorreu um erro na comunicação com o servidor.",
      response.status,
      errorData || undefined
    );
  }

  return data as T;
}

// ================================
// AUTENTICAÇÃO
// ================================

export async function login(
  email: string,
  senha: string
): Promise<LoginResponse> {
  const response = await request<LoginResponse>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({
        email,
        senha,
      }),
    },
    false
  );

  localStorage.setItem("viacar_token", response.token);
  localStorage.setItem(
    "viacar_usuario",
    JSON.stringify(response.usuario)
  );

  return response;
}

export async function registrarUsuario(data: {
  nome: string;
  email: string;
  senha: string;
  matricula: string;
  bairro: string;
  telefone?: string;
}): Promise<LoginResponse> {
  const response = await request<LoginResponse>(
    "/auth/registrar",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    false
  );

  localStorage.setItem(
    "viacar_token",
    response.token
  );

  localStorage.setItem(
    "viacar_usuario",
    JSON.stringify(response.usuario)
  );

  return response;
}

export function getUsuarioSalvo(): Usuario | null {
  const usuario = localStorage.getItem("viacar_usuario");

  if (!usuario) {
    return null;
  }

  try {
    return JSON.parse(usuario) as Usuario;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

export function logoutUsuario() {
  logout();
}

// ================================
// USUÁRIO
// ================================

export async function getMeuPerfil(): Promise<Usuario> {
  return request<Usuario>("/usuarios/me");
}

export async function atualizarMeuPerfil(data: {
  telefone?: string | null;
  bairro?: string;
}): Promise<Usuario> {
  const usuario = await request<Usuario>("/usuarios/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  localStorage.setItem("viacar_usuario", JSON.stringify(usuario));

  return usuario;
}

// ================================
// VEÍCULOS
// ================================

export async function criarVeiculo(data: {
  placa: string;
  modelo: string;
  cor: string;
  capacidadePassageiros: number;
}): Promise<Veiculo> {
  return request<Veiculo>("/veiculos", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listarVeiculos(): Promise<Veiculo[]> {
  return request<Veiculo[]>("/veiculos");
}

export async function atualizarVeiculo(
  id: string,
  data: {
    modelo?: string;
    cor?: string;
    capacidadePassageiros?: number;
  }
): Promise<Veiculo> {
  return request<Veiculo>(`/veiculos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function removerVeiculo(id: string): Promise<void> {
  await request<void>(`/veiculos/${id}`, {
    method: "DELETE",
  });
}

// ================================
// ROTAS
// ================================

export async function criarRota(data: {
  apelido?: string;
  origemBairro: string;
  origemEndereco: string;
  destinoBairro: string;
  destinoEndereco: string;
  horarioPartida: string;
  sentido: "IDA" | "VOLTA";
  diasSemana: number[];
}): Promise<Rota> {
  return request<Rota>("/rotas", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listarRotas(): Promise<Rota[]> {
  return request<Rota[]>("/rotas");
}

export async function buscarRota(id: string): Promise<Rota> {
  return request<Rota>(`/rotas/${id}`);
}

export async function atualizarRota(
  id: string,
  data: Partial<{
    apelido: string;
    origemBairro: string;
    origemEndereco: string;
    destinoBairro: string;
    destinoEndereco: string;
    horarioPartida: string;
    sentido: "IDA" | "VOLTA";
    diasSemana: number[];
  }>
): Promise<Rota> {
  return request<Rota>(`/rotas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function removerRota(id: string): Promise<void> {
  await request<void>(`/rotas/${id}`, {
    method: "DELETE",
  });
}

// ================================
// CARONAS
// ================================

export async function criarCarona(data: {
  rotaId: string;
  veiculoId: string;
  data: string;
  vagasOfertadas: number;
  observacao?: string;
}): Promise<Carona> {
  return request<Carona>("/caronas", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listarCaronas(filtros?: {
  bairroOrigem?: string;
  data?: string;
  sentido?: "IDA" | "VOLTA";
}): Promise<Carona[]> {
  const params = new URLSearchParams();

  if (filtros?.bairroOrigem) {
    params.set("bairroOrigem", filtros.bairroOrigem);
  }

  if (filtros?.data) {
    params.set("data", filtros.data);
  }

  if (filtros?.sentido) {
    params.set("sentido", filtros.sentido);
  }

  const query = params.toString();

  return request<Carona[]>(
    `/caronas${query ? `?${query}` : ""}`
  );
}

export async function listarMinhasCaronas(periodo: "proximas" | "passadas" = "proximas"): Promise<Carona[]> {
  return request<Carona[]>(`/caronas/minhas?periodo=${periodo}`);
}

export async function buscarCarona(id: string): Promise<Carona> {
  return request<Carona>(`/caronas/${id}`);
}

export async function atualizarCarona(
  id: string,
  data: {
    vagasOfertadas?: number;
    observacao?: string;
  }
): Promise<Carona> {
  return request<Carona>(`/caronas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function cancelarCarona(id: string): Promise<Carona> {
  return request<Carona>(`/caronas/${id}/cancelar`, {
    method: "POST",
  });
}

// ================================
// RESERVAS
// ================================

export async function criarReserva(
  caronaId: string,
  pontoEmbarque?: string
): Promise<Reserva> {
  return request<Reserva>(`/caronas/${caronaId}/reservas`, {
    method: "POST",
    body: JSON.stringify(
      pontoEmbarque
        ? {
            pontoEmbarque,
          }
        : {}
    ),
  });
}

export async function listarMinhasReservas(): Promise<Reserva[]> {
  return request<Reserva[]>("/reservas/minhas");
}

export async function cancelarReserva(id: string): Promise<Reserva> {
  return request<Reserva>(`/reservas/${id}`, {
    method: "DELETE",
  });
}
