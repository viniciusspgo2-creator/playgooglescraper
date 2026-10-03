/**
 * config.js — usado em DEV (carregar descompactado direto desta pasta).
 * Em produção, a rota /api/extension/download gera este arquivo com a
 * placeholder de origem substituída pela origem do painel (e, opcionalmente,
 * com embeddedToken). Se apiBase ainda contém "__", o service worker mostra
 * erro amigável pedindo o download pelo painel web.
 */
const PGS_CONFIG = {
  apiBase: "__API_BASE__",
  /* __TOKEN__ */
};
