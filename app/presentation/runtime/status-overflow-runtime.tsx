"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { glossaryDescription } from "../glossary/game-glossary";

type StatusKind = "negative" | "positive" | "hero";

type StatusItem = {
  key: string;
  label: string;
  description: string;
  token: string;
};

type StatusGroup = {
  id: number;
  host: HTMLElement;
  kind: StatusKind;
  count: number;
  items: StatusItem[];
};

type FloatingList = {
  group: StatusGroup;
  left: number;
  top: number;
  width: number;
} | null;

type FloatingDetail = {
  item: StatusItem;
  left: number;
  top: number;
  width: number;
} | null;

const HOVER_DELAY_MS = 1_000;
const CLOSE_GRACE_MS = 220;
const LIVE_STATUS_SELECTOR = ".screen-game :is(.field-negative-statuses,.field-keywords) > :is([data-status],[data-keyword])";
const hostIds = new WeakMap<HTMLElement, number>();
let nextHostId = 1;

function hostId(host: HTMLElement) {
  const current = hostIds.get(host);
  if (current) return current;
  const next = nextHostId++;
  hostIds.set(host, next);
  return next;
}

function setHidden(element: HTMLElement, hidden: boolean) {
  if (hidden) element.dataset.hhOverflowHidden = "true";
  else delete element.dataset.hhOverflowHidden;
}

function readStatusItem(element: HTMLElement, kind: StatusKind, index: number): StatusItem {
  const datasetLabel = element.dataset.glossaryKey || element.dataset.keyword || element.dataset.status;
  const cueLabel = element.querySelector<HTMLElement>("b")?.textContent?.trim();
  const ariaLabel = element.getAttribute("aria-label")?.trim();
  const label = (datasetLabel || cueLabel || ariaLabel?.split(":")[0] || element.textContent || `Efeito ${index + 1}`).trim();
  const token = (element.querySelector<HTMLElement>("i")?.textContent || element.textContent || "✦").trim().slice(0, 3) || "✦";
  const semanticDescription = kind === "hero" ? "" : glossaryDescription(label);
  const description = (
    element.dataset.tip
    || element.getAttribute("title")
    || (ariaLabel?.includes(":") ? ariaLabel.slice(ariaLabel.indexOf(":") + 1).trim() : "")
    || semanticDescription
    || label
  ).trim();
  return { key: `${label}-${index}`, label, description, token };
}

function collectGroup(host: HTMLElement, kind: StatusKind): StatusGroup | null {
  const originals = Array.from(host.children).filter((node): node is HTMLElement =>
    node instanceof HTMLElement && !node.hasAttribute("data-hh-status-overflow-trigger"),
  );

  if (kind === "positive") host.setAttribute("aria-hidden", "false");

  /* Hero effects always use one summary strip. Card rails keep two visible
     entries and only collapse denser positive/negative lists. */
  const collapse = kind === "hero" ? originals.length > 0 : originals.length > 3;
  const hiddenStart = kind === "hero" ? 0 : 2;
  originals.forEach((element, index) => setHidden(element, collapse && index >= hiddenStart));
  if (!collapse) return null;

  const hidden = kind === "hero" ? originals : originals.slice(hiddenStart);
  return {
    id: hostId(host),
    host,
    kind,
    count: hidden.length,
    items: hidden.map((element, index) => readStatusItem(element, kind, index)),
  };
}

function collectGroups() {
  const groups: StatusGroup[] = [];
  document.querySelectorAll<HTMLElement>(".hero-status-cues").forEach((host) => {
    const group = collectGroup(host, "hero");
    if (group) groups.push(group);
  });
  document.querySelectorAll<HTMLElement>(".field-negative-statuses").forEach((host) => {
    const group = collectGroup(host, "negative");
    if (group) groups.push(group);
  });
  document.querySelectorAll<HTMLElement>(".field-keywords").forEach((host) => {
    const group = collectGroup(host, "positive");
    if (group) groups.push(group);
  });
  return groups;
}

function floatingGeometry(anchor: HTMLElement, widthHint: number, heightHint: number) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.max(180, Math.min(widthHint, window.innerWidth - 20));
  const gap = 10;
  const preferredRight = rect.right + gap;
  const left = preferredRight + width <= window.innerWidth - 8
    ? preferredRight
    : Math.max(8, rect.left - width - gap);
  const top = Math.max(8, Math.min(window.innerHeight - heightHint - 8, rect.top + rect.height / 2 - Math.min(heightHint / 2, 110)));
  return { left, top, width };
}

const floatingStyle = (left: number, top: number, width: number) => ({
  "--hh-status-tooltip-left": `${left}px`,
  "--hh-status-tooltip-top": `${top}px`,
  "--hh-status-tooltip-width": `${width}px`,
} as CSSProperties);

export default function StatusOverflowRuntime() {
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [list, setList] = useState<FloatingList>(null);
  const [detail, setDetail] = useState<FloatingDetail>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearOpenTimer = useCallback(() => {
    if (openTimer.current != null) window.clearTimeout(openTimer.current);
    openTimer.current = null;
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const closeAll = useCallback(() => {
    clearOpenTimer();
    clearCloseTimer();
    setList(null);
    setDetail(null);
  }, [clearOpenTimer, clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setList(null);
      setDetail(null);
    }, CLOSE_GRACE_MS);
  }, [clearCloseTimer]);

  const openList = useCallback((group: StatusGroup, anchor: HTMLElement, delayed: boolean) => {
    clearOpenTimer();
    clearCloseTimer();
    const show = () => {
      setList({ group, ...floatingGeometry(anchor, group.kind === "hero" ? 390 : 320, group.kind === "hero" ? 320 : 260) });
      setDetail(null);
    };
    if (delayed) openTimer.current = window.setTimeout(show, HOVER_DELAY_MS);
    else show();
  }, [clearOpenTimer, clearCloseTimer]);

  const openDetail = useCallback((item: StatusItem, anchor: HTMLElement, delayed = false) => {
    clearOpenTimer();
    clearCloseTimer();
    const show = () => setDetail({ item, ...floatingGeometry(anchor, 290, 150) });
    if (delayed) openTimer.current = window.setTimeout(show, HOVER_DELAY_MS);
    else show();
  }, [clearOpenTimer, clearCloseTimer]);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        setGroups(collectGroups());
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-keyword", "data-status", "data-tip", "title", "aria-label"],
    });
    window.addEventListener("resize", closeAll, { passive: true });
    window.addEventListener("scroll", closeAll, { passive: true, capture: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      clearOpenTimer();
      clearCloseTimer();
      window.removeEventListener("resize", closeAll);
      window.removeEventListener("scroll", closeAll, true);
      document.querySelectorAll<HTMLElement>("[data-hh-overflow-hidden]").forEach((element) => delete element.dataset.hhOverflowHidden);
    };
  }, [clearOpenTimer, clearCloseTimer, closeAll]);

  /* Visible status icons need the same body-level tooltip authority as the
     overflow list. GameGlossaryRuntime intentionally removes native titles, so
     without this delegated surface statuses such as Sufocado had no tooltip. */
  useEffect(() => {
    const statusElement = (target: EventTarget | null) => target instanceof Element
      ? target.closest<HTMLElement>(LIVE_STATUS_SELECTOR)
      : null;

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const element = statusElement(event.target);
      if (!element || element.dataset.hhOverflowHidden === "true") return;
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      const kind: StatusKind = element.dataset.status ? "negative" : "positive";
      openDetail(readStatusItem(element, kind, 0), element, true);
    };
    const onPointerOut = (event: PointerEvent) => {
      const element = statusElement(event.target);
      if (!element || event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      clearOpenTimer();
      setDetail(null);
    };
    const onFocusIn = (event: FocusEvent) => {
      const element = statusElement(event.target);
      if (!element || element.dataset.hhOverflowHidden === "true") return;
      const kind: StatusKind = element.dataset.status ? "negative" : "positive";
      openDetail(readStatusItem(element, kind, 0), element, false);
    };
    const onFocusOut = (event: FocusEvent) => {
      const element = statusElement(event.target);
      if (!element) return;
      clearOpenTimer();
      setDetail(null);
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, [clearOpenTimer, openDetail]);

  return <>
    {groups.map((group) => {
      const expanded = list?.group.id === group.id;
      return createPortal(
        <button
          type="button"
          className="hh-status-overflow-trigger"
          data-hh-status-overflow-trigger="true"
          data-overflow-kind={group.kind}
          aria-expanded={expanded}
          aria-label={group.kind === "hero"
            ? `Efeitos Ativos: ${group.count}`
            : `${group.count} efeitos ${group.kind === "negative" ? "negativos" : "positivos"} adicionais`}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse" || event.pointerType === "pen") openList(group, event.currentTarget, true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse" || event.pointerType === "pen") scheduleClose();
          }}
          onFocus={(event) => openList(group, event.currentTarget, false)}
          onBlur={scheduleClose}
          onClick={(event) => {
            event.stopPropagation();
            if (expanded) closeAll();
            else openList(group, event.currentTarget, false);
          }}
        >
          {group.kind === "hero" ? <>
            <span className="hh-status-overflow-label">Efeitos Ativos:</span>
            <span className="hh-status-overflow-count" aria-hidden="true">{group.count}</span>
          </> : <span className="hh-status-overflow-count" aria-hidden="true">{group.count}</span>}
        </button>,
        group.host,
        `hh-status-overflow-${group.id}`,
      );
    })}

    {list && typeof document !== "undefined" ? createPortal(
      <div
        className="hh-global-tooltip-portal hh-status-list-tooltip"
        data-status-list-kind={list.group.kind}
        role="tooltip"
        style={floatingStyle(list.left, list.top, list.width)}
        onPointerEnter={clearCloseTimer}
        onPointerLeave={scheduleClose}
      >
        <small>{list.group.kind === "hero" ? "EFEITOS ATIVOS" : list.group.kind === "negative" ? "EFEITOS NEGATIVOS" : "EFEITOS POSITIVOS"}</small>
        {list.group.kind === "hero" ? (
          <ol className="hh-hero-effect-list">
            {list.group.items.map((item, index) => (
              <li key={item.key}>
                <b>{index + 1}. {item.label}</b>
                <p>{item.description}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="hh-status-list-tooltip-items">
            {list.group.items.map((item) => (
              <button
                type="button"
                className="hh-status-list-item"
                key={item.key}
                onPointerEnter={(event) => openDetail(item, event.currentTarget)}
                onPointerLeave={() => setDetail(null)}
                onFocus={(event) => openDetail(item, event.currentTarget)}
                onBlur={() => setDetail(null)}
              >
                <i aria-hidden="true">{item.token}</i>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>,
      document.body,
    ) : null}

    {detail && typeof document !== "undefined" ? createPortal(
      <div
        className="hh-global-tooltip-portal hh-status-detail-tooltip"
        role="tooltip"
        style={floatingStyle(detail.left, detail.top, detail.width)}
      >
        <b>{detail.item.label}</b>
        <p>{detail.item.description}</p>
      </div>,
      document.body,
    ) : null}
  </>;
}
