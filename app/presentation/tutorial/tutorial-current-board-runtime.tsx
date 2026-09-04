"use client";

import { useEffect } from "react";

const BOARD_SELECTOR = ".tutorial-screen .tutorial-board-visual";

function slotRow(zone: "aux" | "creature", owner: "opponent" | "player", badge: string) {
  const row = document.createElement("div");
  row.className = `hh-tutorial-board-row is-${owner} is-${zone}`;
  row.dataset.zoneBadge = badge;
  const marker = document.createElement("b");
  marker.className = "hh-tutorial-zone-badge";
  marker.textContent = badge;
  row.append(marker);
  for (let index = 0; index < 5; index += 1) {
    const slot = document.createElement("i");
    slot.className = "hh-tutorial-board-slot";
    row.append(slot);
  }
  return row;
}

function hand(owner: "opponent" | "player") {
  const node = document.createElement("div");
  node.className = `hh-tutorial-live-hand is-${owner}`;
  for (let index = 0; index < 7; index += 1) {
    const card = document.createElement("i");
    card.style.setProperty("--hh-hand-index", String(index));
    node.append(card);
  }
  return node;
}

function hero(owner: "opponent" | "player") {
  const node = document.createElement("div");
  node.className = `hh-tutorial-live-hero is-${owner}`;
  const art = document.createElement("i");
  const copy = document.createElement("span");
  copy.innerHTML = `<b>NV. 1</b><strong>${owner === "player" ? "Gimble" : "Sr. Goblin"}</strong><small>♥ 30</small>`;
  node.append(art, copy);
  return node;
}

function energy(owner: "opponent" | "player") {
  const node = document.createElement("div");
  node.className = `hh-tutorial-live-energy is-${owner}`;
  node.innerHTML = `<b>ENERGIA</b><i>${owner === "player" ? "1/1" : "0/0"}</i><small>RESERVA · ○ ○ ○</small>`;
  return node;
}

function piles(owner: "opponent" | "player") {
  const node = document.createElement("div");
  node.className = `hh-tutorial-live-piles is-${owner}`;
  ["DECK", "EXTRA", "CEM.", "OBS."].forEach((label) => {
    const pile = document.createElement("i");
    pile.textContent = label;
    node.append(pile);
  });
  return node;
}

function terrain(owner: "opponent" | "player", badge: string) {
  const node = document.createElement("div");
  node.className = `hh-tutorial-live-terrain is-${owner}`;
  const marker = document.createElement("b");
  marker.className = "hh-tutorial-zone-badge";
  marker.textContent = badge;
  const slot = document.createElement("i");
  node.append(marker, slot);
  return node;
}

function buildCurrentBoard(board: HTMLElement) {
  if (board.dataset.hhCurrentBoard === "true") return;
  board.dataset.hhCurrentBoard = "true";
  board.classList.add("hh-tutorial-current-board");
  board.replaceChildren();

  const topbar = document.createElement("div");
  topbar.className = "hh-tutorial-live-topbar";
  topbar.innerHTML = "<span>☰ &nbsp; Turno 1 &nbsp; <b>Seu turno</b></span><strong>① MANUTENÇÃO ② PRINCIPAL ③ COMBATE ④ FINALIZAÇÃO</strong><small>MODO: ASSISTIDO</small>";

  const stage = document.createElement("div");
  stage.className = "hh-tutorial-live-stage";

  const opponentHero = hero("opponent");
  const playerHero = hero("player");
  const opponentHand = hand("opponent");
  const playerHand = hand("player");
  const opponentEnergy = energy("opponent");
  const playerEnergy = energy("player");
  const opponentPiles = piles("opponent");
  const playerPiles = piles("player");
  const opponentTerrain = terrain("opponent", "3");
  const playerTerrain = terrain("player", "6");

  const field = document.createElement("div");
  field.className = "hh-tutorial-live-field";
  field.append(
    slotRow("aux", "opponent", "1"),
    slotRow("creature", "opponent", "2"),
  );
  const divider = document.createElement("div");
  divider.className = "hh-tutorial-live-divider";
  divider.innerHTML = "<i></i><span>CAMPO CENTRAL</span><i></i>";
  field.append(divider, slotRow("creature", "player", "4"), slotRow("aux", "player", "5"));

  const phase = document.createElement("div");
  phase.className = "hh-tutorial-live-phase";
  phase.innerHTML = "<small>FASE ATUAL</small><b>PRINCIPAL</b><span>COMBATE →</span>";

  stage.append(
    opponentHero,
    playerHero,
    opponentHand,
    playerHand,
    opponentTerrain,
    playerTerrain,
    field,
    opponentEnergy,
    playerEnergy,
    phase,
    opponentPiles,
    playerPiles,
  );
  board.append(topbar, stage);
}

export default function TutorialCurrentBoardRuntime() {
  useEffect(() => {
    const sync = () => document.querySelectorAll<HTMLElement>(BOARD_SELECTOR).forEach(buildCurrentBoard);
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
