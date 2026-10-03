"use client";

/**
 * GA4 + Google Tag Manager — carregam APENAS quando as envs correspondentes
 * existem (NEXT_PUBLIC_GA_MEASUREMENT_ID / NEXT_PUBLIC_GTM_ID).
 *
 * Também instrumenta a profundidade de scroll (25/50/75/100) por página,
 * evento exigido na estrutura de campanhas (rastreamento de engajamento).
 */
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { analyticsEvents } from "@/lib/analytics";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

const DEPTHS = [25, 50, 75, 100] as const;

export function Analytics() {
  const pathname = usePathname();
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!GA_ID && !GTM_ID) return;
    firedRef.current = new Set();

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - window.innerHeight;
        if (scrollable <= 0) return;
        const percent = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
        for (const depth of DEPTHS) {
          if (percent >= depth && !firedRef.current.has(depth)) {
            firedRef.current.add(depth);
            analyticsEvents.scrollDepth(depth, pathname);
          }
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [pathname]);

  if (!GA_ID && !GTM_ID) return null;

  return (
    <>
      {GA_ID ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${GA_ID}', { send_page_view: true });`}
          </Script>
        </>
      ) : null}
      {GTM_ID ? (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      ) : null}
    </>
  );
}
