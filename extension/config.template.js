/**
 * config.template.js — CANÔNICO para a rota de download (src/app/api/extension/download).
 * A rota injeta:
 *   1) a placeholder de origem (linha apiBase abaixo) → origem do painel
 *      (ex.: https://app.example.com);
 *   2) o placeholder comentado de token (linha 2 do objeto) → embeddedToken
 *      quando o usuário opta por conexão automática no download (POST com token).
 * Sem token, o comentário permanece e o usuário cola o token na Side Panel.
 * Este arquivo NÃO é carregado pela extensão em dev — use config.js.
 */
const PGS_CONFIG = {
  apiBase: "__API_BASE__",
  /* __TOKEN__ */
};
