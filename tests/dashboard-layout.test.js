const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.join(__dirname, '../package/contents/ui/DashboardRepresentation.qml'), 'utf8');
function getFunction(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw Error('missing ' + name);
  const open = src.indexOf('{', start); let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw Error('unclosed ' + name);
}
let items = [];
const dashboardModel = {
  get count() { return items.length; }, get(i) { return items[i]; },
  clear() { items = []; },
  append(obj) { if (Array.isArray(obj.apps)) { const a = obj.apps; a.append = x => a.push(x); a.get = i => a[i]; Object.defineProperty(a, 'count', {get() {return a.length;}}); } items.push(obj); count = items.length; },
};
let root = {columns: 4, dashRows: 3};
let Plasmoid = {configuration: {showAllAppsInDashboard: false}};
let allAppsHelper = {active:false,count:0,objectAt(){}};
let rootItem = {dashboardApps: [], normalizedDashboardItem:x=>x, canonicalApplicationUrl:x=>x, sameApplication:(a,b)=>!!a && a===b, saveDashboard(){}};
let folderRevision = 0;
let dashboardView = {syncPageOffset(){}};
function saveDashboard(){}
function sameApplication(a,b){ return rootItem.sameApplication(a,b); }
function clear(){ dashboardModel.clear(); }
function append(x){ dashboardModel.append(x); }
function get(i){ return dashboardModel.get(i); }
let count = 0;

for (const fn of ['layoutDashboardItems','planDashboardMove','reload','modelToArray','persistedItem','preserveHiddenAutoItems','saveFromArray','planMoveAppOutOfFolder','moveDashboardItem','toggleFolderPositionLocked','toggleFolderEnlarged','planCreateFolder','normalizedDashboardItem']) eval(getFunction(fn).replaceAll('dashboardApps', 'rootItem.dashboardApps').replaceAll('rootItem.rootItem.', 'rootItem.'));

rootItem.layoutDashboardItems=layoutDashboardItems;
dashboardModel.reload=reload;
function i18n(s) { return s; }
function canonicalApplicationUrl(s) { return s; }
const app=id=>({type:'app',desktopFile:id,name:id,icon:id});
const folder=(id,lock=-1)=>({type:'folder',name:id,enlarged:true,lockedPosition:lock,apps:[app(id+'1'),app(id+'2'),app(id+'3')]});
function signature(grid) { return Array.from(grid,x=>x&&x.type!=='folder_spacer'?[x.type,x.name,x.lockedPosition??-1]:['spacer',x?.parentFolderIndex??-1]); }
function ids(grid) { return grid.flatMap(x=>!x||x.type==='folder_spacer'?[]:x.type==='folder'?x.apps.map(a=>a.desktopFile):[x.desktopFile]).sort(); }
function check(grid) {
 for(let i=0;i<grid.length;i++) {
  const x=grid[i]; if(!x||x.type!=='folder'||!x.enlarged||root.columns<2||root.dashRows<2) continue;
  assert.notEqual(i%root.columns,root.columns-1);
  assert.notEqual(Math.floor(i/root.columns)%root.dashRows,root.dashRows-1);
  for(const j of [i+1,i+root.columns,i+root.columns+1]) {
   assert.equal(grid[j]?.type,'folder_spacer','overlap at '+j);
   assert.equal(grid[j].parentFolderIndex,i);
  }
 }
}
let cases=0;
for(const cols of [2,3,4,5]) for(const rows of [2,3,4]) {
 root.columns=cols; root.dashRows=rows;
 const initial=[app('a'),folder('F'),app('b'),folder('G'),app('c'),folder('H'),app('d')];
 rootItem.dashboardApps=structuredClone(initial); reload();
 const anchors={};
 for(let i=0;i<items.length;i++) if(items[i].type==='folder'&&items[i].name!=='H') anchors[items[i].name]=i;
 const locked=initial.map(x=>x.type==='folder'&&x.name in anchors?{...x,lockedPosition:anchors[x.name]}:x);
 const max=items.length+2;
 for(let from=0;from<max;from++) for(let to=0;to<max;to++) {
  rootItem.dashboardApps=structuredClone(locked); reload(); const before=ids(items);
  const plan=planDashboardMove(from,to);
  if(!plan) continue;
  const preview=layoutDashboardItems(plan); check(preview);
  for(const [name,index] of Object.entries(anchors)) assert.equal(preview[index].name,name);
  saveFromArray(plan);
  assert.deepEqual(signature(items),signature(preview)); assert.deepEqual(ids(items),before);
  for(const [name,index] of Object.entries(anchors)) assert.equal(items[index].name,name);
  cases++;
 }
 // Locked folders cannot be moved directly; app extraction may still work.
 rootItem.dashboardApps=structuredClone(locked); reload();
 for(const index of Object.values(anchors)) assert.equal(planDashboardMove(index,max),null);
 const source=items.findIndex(x=>x.name==='H');
 for(let target=0;target<items.length;target++) {
  const plan=planMoveAppOutOfFolder(source,0,target,false); const packed=layoutDashboardItems(plan.apps); check(packed);
  for(const [name,index] of Object.entries(anchors)) assert.equal(packed[index].name,name);
  assert.deepEqual(ids(packed),ids(items)); cases++;
 }
 // Adding to a locked folder keeps its anchor and identifies the real FX cell.
 const sourceApp=items.findIndex(x=>x.desktopFile==='a');
 const target=anchors.F; const merge=planCreateFolder(sourceApp,target);
 assert.equal(merge.folderIndex,target); saveFromArray(merge.apps); check(items);
 assert.equal(items[target].name,'F'); assert.equal(items[target].apps.at(-1).desktopFile,'a');
 // Layout changes must never overlap folders, and restore saved anchors.
 for(const newCols of [1,2,3,6]) {
  root.columns=newCols; rootItem.dashboardApps=structuredClone(locked); reload(); check(items);
  root.columns=cols; reload();
  for(const [name,index] of Object.entries(anchors)) assert.equal(items[index].name,name);
 }
}
root.columns=4; root.dashRows=3;
rootItem.dashboardApps=[app('a'),folder('F'),app('b')]; reload();
let index=items.findIndex(x=>x.name==='F'); toggleFolderPositionLocked(index);
assert.equal(items[index].lockedPosition,index);
assert.equal(normalizedDashboardItem(rootItem.dashboardApps.find(x=>x.type==='folder')).lockedPosition,index);
toggleFolderPositionLocked(index); assert.equal(items.find(x=>x.name==='F').lockedPosition,-1);
toggleFolderPositionLocked(items.findIndex(x=>x.name==='F'));
toggleFolderEnlarged(items.findIndex(x=>x.name==='F'));
assert.equal(items.find(x=>x.name==='F').lockedPosition,-1);
const collision=layoutDashboardItems([folder('X',0),folder('Y',0),folder('Z',1),...Array.from({length:10},(_,i)=>app('t'+i))]);
check(collision); assert.equal(ids(collision).length,19);
console.log('PASS '+cases+' locked-folder layouts and previews, reservations, persistence, resizing, lock/unlock and merges');
