// supabase/functions/validate-turnstile/index.ts
//
// NÃO CHAMADA MAIS POR NINGUÉM (auditoria de segurança 2026-09-09) — deixada
// no repositório só como referência, não precisa mais estar deployada.
// index.html validava o Turnstile chamando esta function ANTES de tentar o
// login de verdade — mas isso é um passo à parte que dá pra pular (chamar
// client.auth.signInWithPassword direto com a anon key, sem nunca passar por
// aqui). A validação agora acontece DENTRO do próprio Supabase Auth (opção
// "Enable Captcha protection" > Turnstile, painel Authentication > Settings,
// com a mesma TURNSTILE_SECRET_KEY que esta function usava) — index.html
// passa "captchaToken" direto em signUp/signInWithPassword, então não tem
// mais como pular a verificação chamando a API de auth direto. Ver
// comentário em credsForm.addEventListener("submit", ...) em index.html.
//
// Valida um token do Cloudflare Turnstile contra a API do Cloudflare, usando
// a Secret Key — essa chave NUNCA pode chegar no navegador (por isso a
// validacao acontece aqui, nao no front-end), so' a Site Key (publica) fica
// em index.html.
//
// Mesmo padrao de function usada em dr-laureano/index.ts e
// estatisticas-ia/index.ts (CORS, jsonResponse, defensivo contra payload
// forjado) — publica (so' exige a anon key), sem checagem de sessao: faz
// sentido, porque ela roda ANTES do login, quando ainda nao existe sessao
// nenhuma pra checar.
//
// Secret necessario, ja configurado no projeto Supabase: TURNSTILE_SECRET_KEY

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Limite defensivo: um token de verdade do Turnstile tem um tamanho
// tipico bem menor que isso — so' pra' nao repassar um payload gigante
// forjado pra' API do Cloudflare.
const MAX_TOKEN_CHARS = 2048;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Método não permitido." }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "JSON inválido." }, 400);
  }

  const token = (body as { token?: unknown })?.token;
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_CHARS) {
    return jsonResponse({ success: false, error: "Token do Turnstile ausente ou inválido." }, 400);
  }

  const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secretKey) {
    return jsonResponse({ success: false, error: "Turnstile não configurado no servidor." }, 500);
  }

  // IP de quem preencheu o formulario, se disponivel — opcional pra' API
  // do Cloudflare (melhora a precisao da checagem), nunca obrigatorio.
  const remoteip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined;

  const verifyPayload: Record<string, string> = {
    secret: secretKey,
    response: token,
  };
  if (remoteip) verifyPayload.remoteip = remoteip;

  let upstream: Response;
  try {
    upstream = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verifyPayload),
    });
  } catch (err) {
    return jsonResponse({ success: false, error: "Falha ao conectar com o Cloudflare.", detail: String(err) }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text();
    return jsonResponse({ success: false, error: "O Cloudflare retornou um erro.", detail }, 502);
  }

  const result = await upstream.json();

  if (!result?.success) {
    return jsonResponse({ success: false, error: "Verificação de segurança não confirmada.", codes: result?.["error-codes"] ?? [] }, 200);
  }

  return jsonResponse({ success: true });
});
