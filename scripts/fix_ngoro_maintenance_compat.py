from pathlib import Path
p=Path('app/rules-engine/engine-base.mjs')
t=p.read_text(encoding='utf-8')
old='if (entry.heroId === "ngoro" && event.type === "onMaintenanceResourceChoice" && event.owner === owner) result.push({ source: heroSource, owner, ability: { id: "ngoro-level-1-maintenance", trigger: "onMaintenanceResourceChoice", effects: [{ type: "chooseDeckAndInvestigate", amount: 1 }] } });'
new='if (entry.heroId === "ngoro" && event.owner === owner && (event.type === "onMaintenanceResourceChoice" || (event.type === "onMaintenance" && event.afterResourceChoice === true))) result.push({ source: heroSource, owner, ability: { id: "ngoro-level-1-maintenance", trigger: "onMaintenanceResourceChoice", effects: [{ type: "chooseDeckAndInvestigate", amount: 1 }] } });'
if old not in t:
    raise SystemExit('Ngoro maintenance trigger pattern not found')
p.write_text(t.replace(old,new,1),encoding='utf-8')
