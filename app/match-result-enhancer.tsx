"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RemoteCardArt } from "./remote-card-art";

const HEROES = [
  { page: 2, name: "Gimble, Presenteado Sortudo" },
  { page: 26, name: "Sr. Goblin, o Mercador" },
  { page: 54, name: "Uruk, a Encantriz" },
  { page: 110, name: "Tifon, a Peste" },
  { page: 129, name: "Saymon, o Primeiro" },
  { page: 152, name: "Tessália, a Mão de Ferro" },
  { page: 180, name: "Quarion Siannodel" },
  { page: 211, name: "Rasmus, o Barista do Tempo" },
  { page: 255, name: "Ngoro, o Investigador" },
  { page: 273, name: "Zayan, a Revolucionária" },
  { page: 291, name: "Campeão de Natureza" },
] as const;

const fold = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function MatchResultEnhancer() {
  const [result, setResult] = useState<{ host: HTMLElement; page: number; name: string } | null>(null);

  useEffect(() => {
    let frame = 0;
    const scan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>(".overlay .maintenance"));
        const host = candidates.find((node) => /fim do teste/i.test(node.textContent || ""));
        if (!host) {
          setResult((current) => current ? null : current);
          return;
        }
        const text = fold(host.textContent || "");
        const hero = HEROES.find((candidate) => text.includes(fold(candidate.name)));
        if (!hero) return;
        host.classList.add("enhanced-match-result");
        setResult((current) => current?.host === host && current.page === hero.page ? current : { host, ...hero });
      });
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  if (!result) return null;
  return createPortal(
    <div className="match-result-hero-art" aria-label={`Herói vencedor: ${result.name}`}>
      <RemoteCardArt page={result.page} name={result.name} priority />
      <small>CAMPEÃO DA BATALHA</small>
      <b>{result.name}</b>
    </div>,
    result.host,
  );
}
