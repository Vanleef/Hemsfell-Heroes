from pathlib import Path

path = Path('tests/rasmus-authoritative.test.mjs')
text = path.read_text()
old = '''test("witch cat supports adjacent auxiliary creatures",()=>{const game=state(),witch={...printed(220),uid:"witch",slot:1,enteredRound:0,exhausted:false,summoning:false},left=unit("left",{slot:0}),right=unit("right",{slot:2});game.players[0].support.push(witch,left,right);const refreshed=executeCommand(game,{type:"emit",owner:0,event:{type:"noop",owner:0}}).state;for(const id of ["left","right"])assert.ok(refreshed.players[0].support.find(card=>card.uid===id).grantedKeywords.some(tag=>String(tag).includes("Barreira Mágica")));});'''
new = '''test("witch cat supports adjacent auxiliary creatures",()=>{const game=state();game.players[0].hand.push({...printed(220),id:"witch-card",cost:0});const placed=executeCommand(game,{type:"playCard",owner:0,cardId:"witch-card",slot:1,placementZone:"support",skipPriority:true}).state;const witch=placed.players[0].support.find(card=>card.page===220);assert.ok(witch);placed.players[0].support.push(unit("left",{slot:0}),unit("right",{slot:2}));const refreshed=executeCommand(placed,{type:"emit",owner:0,event:{type:"noop",owner:0}}).state;for(const id of ["left","right"])assert.ok(refreshed.players[0].support.find(card=>card.uid===id).grantedKeywords.some(tag=>String(tag).includes("Barreira Mágica")));});'''
if old not in text:
    raise SystemExit('support test pattern not found')
path.write_text(text.replace(old, new))
