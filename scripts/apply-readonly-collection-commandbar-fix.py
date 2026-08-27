from pathlib import Path


def replace_between(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[:start] + replacement + text[end:]


page_path = Path("app/page.tsx")
page = page_path.read_text()

old_import = 'import { MAIN_DECK_SIZE, MAX_COPIES, USER_DECK_STORAGE_KEY, cardAllowedInDeckZone, defaultUserDeck, disabledDeckCardIds as sharedDisabledDeckCardIds, expandUserDeckMain, removedCatalogPages as sharedRemovedCatalogPages, resolveUserDeckExtra, suppliedDeckPages as sharedSuppliedDeckPages, validateUserDeck, validateUserDeckDraft } from "./user-deck.mjs";'
new_import = 'import { MAIN_DECK_SIZE, defaultUserDeck, disabledDeckCardIds as sharedDisabledDeckCardIds, expandUserDeckMain, removedCatalogPages as sharedRemovedCatalogPages, resolveUserDeckExtra, suppliedDeckPages as sharedSuppliedDeckPages, validateUserDeck } from "./user-deck.mjs";'
if old_import not in page:
    raise SystemExit("expected user-deck import was not found")
page = page.replace(old_import, new_import, 1)

page = replace_between(page, "function DeckQuantityControls(", "const createDefaultUserDecks=", "")

page = replace_between(
    page,
    "const [collectionQuery,setCollectionQuery]=",
    "const [engineTargetSelection",
    '''const [collectionQuery,setCollectionQuery]=useState("");const [collectionType,setCollectionType]=useState<"Todas"|CardType>("Todas");const deferredCollectionQuery=useDeferredValue(collectionQuery);\nconst userDecks=useMemo<Record<DeckId,UserDeck>>(()=>createDefaultUserDecks(),[]);\n''',
)

page = replace_between(
    page,
    " const selectedDeck=deckById(mine)",
    " const myRoomParticipant=",
    ''' const selectedDeck=deckById(mine),activeUserDeck=userDecks[mine]??defaultUserDeck(mine,cards,selectedDeck.name),deckValidation=validateUserDeck(activeUserDeck,cards);\n const selectedPool=useMemo<CardDef[]>(()=>activeUserDeck.main.flatMap(entry=>{const card=cards.find(candidate=>candidate.id===entry.cardId);return card?[{...card,collectionQuantity:entry.quantity}]:[]}),[activeUserDeck]);\n const selectedExtra=useMemo(()=>activeUserDeck.extra.map(cardId=>cards.find(card=>card.id===cardId)).filter((card):card is CardDef=>!!card),[activeUserDeck]);\n const mainDeckCopies=deckValidation.mainCount,deckListValid=deckValidation.ok;\n const collectionMatches=(card:CardDef)=>{const query=cleanName(deferredCollectionQuery.trim());return (collectionType==="Todas"||card.type===collectionType)&&(!query||cleanName(`${card.name} ${card.type} ${card.text} ${(card.tags||[]).join(" ")} ${(card.subtypes||[]).join(" ")}`).includes(query))};\n const filteredSelectedPool=selectedPool.filter(collectionMatches),filteredSelectedExtra=selectedExtra.filter(collectionMatches);\n''',
)

collection = r'''  {screen==="decks"&&<section className="collection">
   <header><button onClick={()=>setScreen("menu")}>← Menu</button><div><p>COLEÇÃO DE HERÓIS</p><h2>Todos os heróis</h2></div><span>11 decks · 298 cartas de jogo</span></header>
   <div className="deck-rail">{deckDefs.map(d=><button key={d.id} className={mine===d.id?"active":""} style={{"--deck":d.color} as React.CSSProperties} onClick={()=>setMine(d.id)}><RemoteCardArt page={d.heroPage} name={d.name}/><b>{d.name}</b><span>{d.style}</span></button>)}</div>
   <div className="deck-detail"><aside style={{"--deck":selectedDeck.color} as React.CSSProperties}>
    <button className="collection-hero-inspect" onClick={()=>setShowInspector(cards.find(card=>card.page===selectedDeck.heroPage)||null)} aria-label={`Ver detalhes de ${selectedDeck.name}`}><RemoteCardArt page={selectedDeck.heroPage} name={selectedDeck.name} priority/></button>
    <h3>{selectedDeck.name}</h3><p>{selectedDeck.faction} · {selectedDeck.style}</p><b>{mainDeckCopies} cartas no Deck Principal</b><strong className="extra-summary">Deck Extra · {selectedExtra.length} Imagens</strong>
    <span className={`deck-validity ${deckListValid?"is-valid":"is-invalid"}`}>{deckListValid?"✓ Lista válida":`⚠ ${deckValidation.errors.slice(0,3).map(deckValidationLabel).join(" · ")}`}</span>
    <button className="gold" disabled={!deckListValid} onClick={()=>setScreen("setup")}>Usar este deck</button>
   </aside><HeroGuide deck={selectedDeck}/><div className="collection-lists">
    <div className="collection-toolbar" role="search"><label className="collection-search-field"><span>Buscar cartas</span><input type="search" value={collectionQuery} onChange={event=>setCollectionQuery(event.target.value)} placeholder="Nome, efeito, palavra-chave…"/></label><label><span>Tipo</span><select value={collectionType} onChange={event=>setCollectionType(event.target.value as "Todas"|CardType)}><option>Todas</option>{(["Criatura","Feitiço","Artefato","Encanto","Terreno"] as CardType[]).map(type=><option key={type}>{type}</option>)}</select></label><output aria-live="polite">{filteredSelectedPool.length+filteredSelectedExtra.length} resultado(s)</output></div>
    <section><header><b>Deck Principal</b><span>{filteredSelectedPool.length} de {selectedPool.length} cartas únicas · {mainDeckCopies} cartas no total.</span></header>{filteredSelectedPool.length?<div className="card-library">{filteredSelectedPool.map(c=><OriginalCard key={c.id} card={c} small onClick={()=>setShowInspector(c)}/>)}</div>:<p className="collection-empty">Nenhuma carta do Deck Principal corresponde aos filtros.</p>}</section>
    <section className="extra-collection"><header><b>Deck Extra</b><span>{filteredSelectedExtra.length} de {selectedExtra.length} Imagens · invocadas apenas por efeitos</span></header>{filteredSelectedExtra.length?<div className="card-library">{filteredSelectedExtra.map(c=><OriginalCard key={c.id} card={c} small onClick={()=>setShowInspector(c)}/>)}</div>:<p className="collection-empty">{selectedExtra.length?"Nenhuma Imagem corresponde aos filtros.":"Este herói não possui cartas de Imagem no Deck Extra."}</p>}</section>
   </div></div>
  </section>}
'''
page = replace_between(
    page,
    '  {screen==="decks"&&<section className="collection">',
    '    {screen==="setup"&&<section className="match-setup">',
    collection,
)

forbidden = [
    "DeckQuantityControls",
    "deck-name-field",
    "deck-edit-actions",
    "setDeckDrag",
    "handleDeckDrop(",
    "collectionMembership",
    "collectionSort",
    "Coleção disponível",
    "Adicionar uma cópia",
    "Remover uma cópia",
    "USER_DECK_STORAGE_KEY",
    "validateUserDeckDraft",
]
leftovers = [token for token in forbidden if token in page]
if leftovers:
    raise SystemExit(f"deck editing UI leftovers: {leftovers}")
for required in [
    "HeroGuide deck={selectedDeck}",
    "<b>Deck Principal</b>",
    "<b>Deck Extra</b>",
    "collectionQuantity:entry.quantity",
]:
    if required not in page:
        raise SystemExit(f"missing read-only collection contract: {required}")
page_path.write_text(page)

runtime_path = Path("app/match-ui-runtime.tsx")
runtime = runtime_path.read_text()
fit_start = runtime.index("function commandContentFits(")
fit_end = runtime.index("\nfunction fitCommandChip(", fit_start)
runtime = (
    runtime[:fit_start]
    + '''function commandContentFits(_chip: HTMLElement, content: HTMLElement) {\n  const tolerance = 1;\n  return (\n    content.scrollHeight <= content.clientHeight + tolerance &&\n    content.scrollWidth <= content.clientWidth + tolerance\n  );\n}\n'''
    + runtime[fit_end:]
)
runtime = runtime.replace("const minimumScale = 0.32;", "const minimumScale = 0.78;", 1)
runtime = runtime.replace(
    "const minimum = Math.min(baseSizes[index], 2.15);",
    "const minimum = Math.min(baseSizes[index], index === 0 ? 4 : 4.35);",
    1,
)
if "const minimumScale = 0.32;" in runtime or "2.15" in runtime[fit_start : fit_start + 2600]:
    raise SystemExit("aggressive command-bar autofit values still present")
runtime_path.write_text(runtime)

css_path = Path("app/command-bar-fixes.css")
css = css_path.read_text()
marker = "/* Production command-bar readability guard."
if marker not in css:
    css += r'''

/* Production command-bar readability guard. The text column used to combine
   width:100% with an external margin, so the runtime could conclude that the
   chip never fit and shrink it to its emergency minimum. Keep the text column
   inside the available flex width and preserve a readable CSS floor. */
.screen-game .hero-command-bar .hero-ability-chip>span{
  flex:1 1 0!important;
  width:auto!important;
  max-width:none!important;
  margin-left:clamp(.08rem,.16cqw,.16rem)!important;
}
.screen-game .hero-command-bar .hero-ability-chip p{
  font-size:clamp(.31rem,4.15cqi,.48rem)!important;
  line-height:1.09!important;
}
.screen-game .hero-command-bar .hero-ability-chip>span>b{
  font-size:clamp(.27rem,3.5cqi,.4rem)!important;
}
.screen-game .hero-command-bar .hero-ability-chip.copy-compact p{
  font-size:clamp(.29rem,3.72cqi,.44rem)!important;
}
.screen-game .hero-command-bar .hero-ability-chip.copy-dense p{
  font-size:clamp(.27rem,3.32cqi,.4rem)!important;
}
'''
css_path.write_text(css)

test_path = Path("tests/persistent-deck-builder.test.mjs")
test_path.write_text(
    r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const model=await readFile(new URL("../app/user-deck.mjs",import.meta.url),"utf8");
const matchCss=await readFile(new URL("../app/match-ui.css",import.meta.url),"utf8");
const commandCss=await readFile(new URL("../app/command-bar-fixes.css",import.meta.url),"utf8");
const runtime=await readFile(new URL("../app/match-ui-runtime.tsx",import.meta.url),"utf8");

test("collection is read-only and exposes only the selected canonical deck",()=>{
 assert.doesNotMatch(page,/USER_DECK_STORAGE_KEY/);
 assert.doesNotMatch(page,/localStorage\.setItem\(USER_DECK_STORAGE_KEY/);
 assert.doesNotMatch(page,/DeckQuantityControls/);
 assert.doesNotMatch(page,/setDeckDrag/);
 assert.doesNotMatch(page,/collectionMembership/);
 assert.doesNotMatch(page,/collectionSort/);
 assert.doesNotMatch(page,/Coleção disponível/);
 assert.doesNotMatch(page,/Nome do deck/);
 assert.ok(page.includes("COLEÇÃO DE HERÓIS"));
 assert.ok(page.includes("Deck Principal"));
 assert.ok(page.includes("Deck Extra"));
 assert.match(page,/HeroGuide deck=\{selectedDeck\}/);
 assert.match(page,/collectionQuantity:entry\.quantity/);
});

test("read-only collection keeps search, type filter and card inspection",()=>{
 assert.match(page,/collectionQuery/);
 assert.match(page,/collectionType/);
 assert.match(page,/Buscar cartas/);
 assert.match(page,/setShowInspector\(c\)/);
 assert.match(page,/filteredSelectedPool/);
 assert.match(page,/filteredSelectedExtra/);
});

test("command bar keeps production text inside a readable floor",()=>{
 assert.match(commandCss,/Production command-bar readability guard/);
 assert.match(commandCss,/flex:1 1 0!important/);
 assert.match(runtime,/const minimumScale = 0\.78/);
 assert.match(runtime,/index === 0 \? 4 : 4\.35/);
 assert.doesNotMatch(runtime,/minimumScale = 0\.32/);
});

test("all enabled buttons expose hover, active and keyboard focus feedback",()=>{
 assert.match(matchCss,/button:where\(:not\(:disabled\)\):hover/);
 assert.match(matchCss,/button:where\(:not\(:disabled\)\):active/);
 assert.match(matchCss,/button:focus-visible/);
 assert.match(matchCss,/button:disabled\{cursor:not-allowed\}/);
});

test("online and bot matches consume the validated canonical UserDeck",()=>{
 assert.match(page,/const userDecks=useMemo<Record<DeckId,UserDeck>>\(\(\)=>createDefaultUserDecks\(\),\[\]\)/);
 assert.match(page,/roomAction\("select",\{heroId,userDeck:validation\.deck/);
 assert.match(page,/start\(mine,enemy,0,30,mineValidation\.deck/);
 assert.match(model,/main deck must contain exactly/);
});
'''
)
