#!/usr/bin/env python3
"""Injeta chaves do bloco BLUF da landing (Resumo rápido) nos 3 idiomas."""
import json, collections

BASE = "/home/z/my-project/src/i18n/messages"

QUICK = {
    "pt-BR": {
        "quickTitle": "Resumo rápido: o que é o Play Google Scraper?",
        "quickSubtitle": "Respostas diretas para quem (e para o que) este produto existe.",
        "quickItems": [
            {
                "q": "O que é o Play Google Scraper?",
                "a": "Uma plataforma SaaS multi-tenant com extensão Chrome (Manifest V3) que extrai leads do Google Maps — nome, telefone, website, rating, reviews, endereço e categorias — e os transforma em um funil de vendas com Kanban e WhatsApp.",
            },
            {
                "q": "Como ele consegue mais do que ~120 resultados por busca?",
                "a": "Com a busca em grade quadtree: a região é dividida em células de ~3 km pesquisadas uma a uma; quando uma célula atinge o limite, ela é subdividida em quatro (até profundidade 4), cobrindo 100% da área em vez de uma amostra truncada.",
            },
            {
                "q": "O que é o heat score e para que serve?",
                "a": "Uma nota de 0 a 100 calculada no servidor que prioriza leads por presença digital: negócio sem website é o mais quente (+35), seguido de quem usa apenas páginas sociais (+18), somados a rating, reviews, telefone, WhatsApp e categoria.",
            },
            {
                "q": "Como o envio de mensagens respeita a LGPD?",
                "a": "Toda campanha de WhatsApp tem opt-out por palavra-chave ('sair'/'parar') com supressão permanente por tenant verificada no servidor antes de cada envio, janela de horário, limite diário e aquecimento de número — além de trilha de auditoria completa.",
            },
        ],
    },
    "en-US": {
        "quickTitle": "Quick summary: what is Play Google Scraper?",
        "quickSubtitle": "Direct answers to who this product is for and what it does.",
        "quickItems": [
            {
                "q": "What is Play Google Scraper?",
                "a": "A multi-tenant SaaS platform with a Chrome extension (Manifest V3) that extracts leads from Google Maps — name, phone, website, rating, reviews, address and categories — and turns them into a sales funnel with Kanban and WhatsApp.",
            },
            {
                "q": "How does it get more than ~120 results per search?",
                "a": "Through quadtree grid search: the region is split into ~3 km cells searched one by one; when a cell hits the limit it is subdivided into four (up to depth 4), covering 100% of the area instead of a truncated sample.",
            },
            {
                "q": "What is the heat score and what is it for?",
                "a": "A 0–100 score computed on the server that prioritizes leads by digital presence: businesses without a website are the hottest (+35), followed by social-only pages (+18), plus rating, reviews, phone, WhatsApp and category signals.",
            },
            {
                "q": "How does messaging comply with privacy law (LGPD)?",
                "a": "Every WhatsApp campaign has keyword opt-out ('stop') with permanent per-tenant suppression enforced server-side before each send, time windows, daily limits and number warm-up — plus a complete audit trail.",
            },
        ],
    },
    "es-ES": {
        "quickTitle": "Resumen rápido: ¿qué es Play Google Scraper?",
        "quickSubtitle": "Respuestas directas a para quién es este producto y qué hace.",
        "quickItems": [
            {
                "q": "¿Qué es Play Google Scraper?",
                "a": "Una plataforma SaaS multi-tenant con extensión de Chrome (Manifest V3) que extrae leads de Google Maps — nombre, teléfono, website, rating, reseñas, dirección y categorías — y los convierte en un embudo de ventas con Kanban y WhatsApp.",
            },
            {
                "q": "¿Cómo consigue más de ~120 resultados por búsqueda?",
                "a": "Con la búsqueda en cuadrícula quadtree: la región se divide en celdas de ~3 km buscadas una a una; cuando una celda alcanza el límite se subdivide en cuatro (hasta profundidad 4), cubriendo el 100% del área en vez de una muestra truncada.",
            },
            {
                "q": "¿Qué es el heat score y para qué sirve?",
                "a": "Una nota de 0 a 100 calculada en el servidor que prioriza leads por presencia digital: negocio sin website es el más caliente (+35), seguido de quien usa solo páginas sociales (+18), más rating, reseñas, teléfono, WhatsApp y categoría.",
            },
            {
                "q": "¿Cómo cumple la LGPD el envío de mensajes?",
                "a": "Toda campaña de WhatsApp tiene opt-out por palabra clave ('sair'/'parar') con supresión permanente por tenant verificada en el servidor antes de cada envío, ventana horaria, límite diario y calentamiento de número — además de trilha de auditoría completa.",
            },
        ],
    },
}

for locale, add in QUICK.items():
    path = f"{BASE}/{locale}.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f, object_pairs_hook=collections.OrderedDict)
    data["content"].update(add)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{locale}: quick keys ok")
