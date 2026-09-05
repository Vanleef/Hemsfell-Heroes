"use client";

import type { ReactNode } from "react";

export function HeroDetailsTrigger({ name, enemy, onTarget, onInspect, children }: {
  name: string;
  enemy: boolean;
  onTarget?: () => void;
  onInspect?: () => void;
  children: ReactNode;
}) {
  const activate = () => (onTarget ?? onInspect)?.();
  return <div className="hero-power-trigger" data-hero-role={enemy ? "enemy" : "ally"}
    tabIndex={0} role="button"
    aria-label={onTarget ? `Selecionar ${name} como alvo` : `Ver detalhes de ${name}`}
    onClick={event => { event.stopPropagation(); activate(); }}
    onKeyDown={event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      activate();
    }}>{children}</div>;
}
