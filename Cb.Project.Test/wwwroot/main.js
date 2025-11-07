const $ = s => document.querySelector(s);

const state = {
  points: 0,
  house: { slots: [], placed: {} },
  catalog: [],
  timer: null,
};

const POLL_MS = 1500;
let pollHandle;
let catalogPanelOpen = false; // nuevo estado
let lastCatalogSignature = '';
let isDemo = false; // indica si estamos en modo estático sin backend

async function getJSON(url, opts){
  try{
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, ...opts });
    if(!res.ok) throw new Error(await res.text());
    return await res.json();
  }catch(err){
    // Modo demo: si fallan llamadas al backend en Pages, devolver datos simulados
    if(url==='/api/state'){
      isDemo = true;
      return {
        points: 0,
        timer: { isRunning:false, startUtc:new Date().toISOString(), durationSeconds:0, cancelled:false },
        catalog: demoCatalog(),
        house: { slots: demoSlots(), placed: {} }
      };
    }
    if(url.startsWith('/api/preview')){
      isDemo = true;
      return { preview: demoCatalog()[0] };
    }
    if(url.startsWith('/api/purchase')){
      isDemo = true;
      return { points: state.points, placed: state.house.placed };
    }
    throw err;
  }
}

async function postJSON(url, body){
  return await getJSON(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body||{}) });
}

async function loadAll(){
  await refreshState();
  setupCatalogToggle();
  startPolling();
}

async function refreshState(){
  const game = await getJSON('/api/state');
  state.points = game.points;
  state.timer = game.timer;
  state.catalog = game.catalog;
  state.house = game.house;
  renderPoints();
  renderHouse();
  buildFilters();
  // Render del catálogo solo si cerrado o si hay cambios en los datos
  const sig = computeCatalogSignature(state.catalog);
  if(!catalogPanelOpen || sig !== lastCatalogSignature){
    lastCatalogSignature = sig;
    renderCatalog();
  }
  renderTimer();
}

function startPolling(){
  clearInterval(pollHandle);
  // En modo demo reducimos la frecuencia drásticamente
  const interval = isDemo ? 30000 : POLL_MS;
  pollHandle = setInterval(async ()=>{
    try{
      await refreshState();
    }catch(e){ /* silencioso */ }
  }, interval);
}

let localTimerInterval;
let checkingServerOnZero = false;
let finalized = false;
let pendingClaim = false;

function startLocalTimerLoop(){
  clearInterval(localTimerInterval);
  checkingServerOnZero = false;
  finalized = false;
  pendingClaim = false;
  if(!state.timer || !state.timer.isRunning){
    updateTimerStatus('Esperando siguiente concentración');
    return;
  }
  const startMs = Date.parse(state.timer.startUtc);
  if(isNaN(startMs)){
    updateTimerStatus('Sincronizando...');
    return;
  }
  const durMs = (state.timer.durationSeconds|0) * 1000;
  localTimerInterval = setInterval(() => {
    const left = startMs + durMs - Date.now();
    if(left <= 0){
      clearInterval(localTimerInterval);
      updateTimerStatus('Listo para reclamar');
      pendingClaim = true;
      showClaimDialog();
    } else {
      updateTimerStatus('Restante: ' + formatHMS(Math.ceil(left/1000)));
    }
  }, 500);
}

function formatHMS(totalSeconds){
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const sec = s%60;
  const pad = n => n.toString().padStart(2,'0');
  if(h>0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

function showClaimDialog(){
  const dlg = document.getElementById('claimDialog');
  const rewardSpan = document.getElementById('claimReward');
  // Calcular recompensa prevista localmente
  if(state.timer){
    const rewardSeconds = state.timer.durationSeconds;
    const calcReward = Math.max(1, Math.floor(rewardSeconds / 5));
    rewardSpan.textContent = calcReward;
  }
  dlg.showModal();
  const confirmBtn = document.getElementById('claimConfirm');
  confirmBtn.onclick = async (e)=>{
    e.preventDefault();
    if(!pendingClaim) { dlg.close(); return; }
    confirmBtn.disabled = true;
    try{
      if(isDemo){
        // En demo simplemente sumamos puntos locales
        state.points += parseInt(rewardSpan.textContent,10)||0;
        pendingClaim = false;
        state.timer = null;
        renderPoints();
        updateTimerStatus('Demo: recompensa aplicada localmente');
      } else {
        const res = await postJSON('/api/timer/claim');
        state.points = res.points;
        pendingClaim = false;
        state.timer = null;
        renderPoints();
        updateTimerStatus('Esperando siguiente concentración');
      }
    }catch(err){
      alert(err.message||err);
    }finally{
      confirmBtn.disabled = false;
      dlg.close();
    }
  };
}

function updateTimerStatus(text){
  const status = document.getElementById('status');
  status.textContent = text;
}

function renderTimer(){
  if(!state.timer || !state.timer.isRunning){
    clearInterval(localTimerInterval);
    updateTimerStatus('Esperando siguiente concentraci��n');
    return;
  }
  startLocalTimerLoop();
}

let currentFilter = 'all';
const openCategories = new Set(); // categorías actualmente abiertas

function buildFilters(){
  const filters = document.getElementById('catalogFilters');
  filters.innerHTML='';
  // los filtros se basan en slots (objetos destino)
  const slots = Array.from(new Set(state.catalog.map(i=>i.slot)));
  const mkBtn = (id,label)=>{
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.f = id;
    if(id===currentFilter) b.classList.add('active');
    b.onclick = ()=>{ currentFilter = id; buildFilters(); renderCatalog(); };
    return b;
  };
  filters.appendChild(mkBtn('all','Todos'));
  // ordenar por nombre de slot
  slots.sort().forEach(s=> filters.appendChild(mkBtn(s, s)));
}

function renderCatalog(){
  const container = document.getElementById('catalogGrid');
  container.innerHTML = '';
  // filtrar por slot si aplica
  const itemsFiltered = currentFilter==='all' ? state.catalog : state.catalog.filter(i=>i.slot===currentFilter);
  // Agrupar por categoría
  const groups = new Map();
  for(const item of itemsFiltered){
    const cat = item.category || 'Otros';
    if(!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  }
  // Limpiar categorías obsoletas del set
  const existingCats = new Set(groups.keys());
  for(const cat of Array.from(openCategories)){
    if(!existingCats.has(cat)) openCategories.delete(cat);
  }
  const cats = Array.from(groups.keys()).sort();
  if(cats.length===0){
    const p = document.createElement('p');
    p.textContent = 'No hay elementos para este filtro.';
    container.appendChild(p);
    return;
  }
  const layoutClass = currentFilter==='all' ? 'row' : 'grid';
  cats.forEach(cat =>{
    const details = document.createElement('details');
    details.className = 'cat';
    details.dataset.cat = cat;
    const isOpen = openCategories.has(cat);
    if(isOpen) {
      details.open = true; // restaurar estado
      if(currentFilter==='all') details.classList.add('expanded');
    }
    details.addEventListener('toggle', ()=>{
      if(details.open){
        openCategories.add(cat);
        if(currentFilter==='all'){
          // marcar expandida y cerrar las demás
          details.classList.add('expanded');
          const all = container.querySelectorAll('details.cat');
          all.forEach(other=>{
            if(other!==details){
              other.open = false;
              other.classList.remove('expanded');
              if(other.dataset.cat) openCategories.delete(other.dataset.cat);
            }
          });
        }
      } else {
        openCategories.delete(cat);
        details.classList.remove('expanded');
      }
    });
    const summary = document.createElement('summary');
    const items = groups.get(cat);
    summary.textContent = `${cat} (${items.length})`;
    const wrap = document.createElement('div');
    wrap.className = `cat-items ${layoutClass}`;
    items.forEach(item =>{
      const card = document.createElement('div');
      card.className='card';
      card.innerHTML = `
        <img src="${item.image}" alt="${item.name}"/>
        <div class="meta">
          <div>
            <div>${item.name}</div>
            <div class="slot-name">${item.slot}</div>
          </div>
            <div>${item.cost} pt</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button data-act="preview" data-slot="${item.slot}" data-id="${item.id}">Ver</button>
          <button data-act="buy" data-slot="${item.slot}" data-id="${item.id}">Comprar</button>
        </div>`;
      wrap.appendChild(card);
    });
    details.appendChild(summary);
    details.appendChild(wrap);
    container.appendChild(details);
  });

  container.onclick = async (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const { act, slot, id } = btn.dataset;
    try{
      if(act==='preview'){
        const { preview } = await postJSON('/api/preview', { slot, itemId:id });
        openPreview(preview, slot);
      } else if(act==='buy'){
        const res = await postJSON('/api/purchase', { slot, itemId:id });
        state.points = res.points;
        state.house.placed = res.placed;
        renderPoints();
        renderHouse();
      }
    }catch(err){ alert(err.message||err); }
  };
}

function openPreview(item, slot){
  $('#previewTitle').textContent = item.name;
  $('#previewImg').src = item.image;
  $('#previewCost').textContent = `${item.cost} pt`;
  const dlg = $('#previewDialog');
  dlg.showModal();

  const buy = $('#buyBtn');
  const handler = async ()=>{
    try{
      const res = await postJSON('/api/purchase', { slot, itemId: item.id });
      state.points = res.points;
      state.house.placed = res.placed;
      renderPoints();
      renderHouse();
    }catch(err){ alert(err.message || err); }
  };
  buy.addEventListener('click', handler, { once: true });
}

// Llamada inicial (faltaba)
document.addEventListener('DOMContentLoaded', ()=>{
  loadAll().catch(e=>alert(e.message||e));
});

// Mejorar manejadores de inicio/cancelación: evitar doble clic
(function initTimerControls(){
  const startBtn = document.getElementById('startBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const timeValue = document.getElementById('timeValue');
  const timeUnit = document.getElementById('timeUnit');
  startBtn.onclick = async ()=>{
    startBtn.disabled = true;
    try{
      const val = parseInt(timeValue.value,10)||0;
      const unit = timeUnit.value;
      let seconds = 0;
      if(unit === 'minutes') seconds = val * 60;
      else if(unit === 'hours') seconds = val * 3600;
      if(seconds <=0) throw new Error('Duración inválida');
      await postJSON('/api/timer/start', { seconds });
      await refreshState();
    }catch(err){ alert(err.message||err); }
    finally{ startBtn.disabled = false; }
  };
  cancelBtn.onclick = async ()=>{
    cancelBtn.disabled = true;
    try{
      await postJSON('/api/timer/cancel');
      await refreshState();
    }catch(err){ alert(err.message||err); }
    finally{ cancelBtn.disabled = false; }
  };
})();

// --- Funciones faltantes ---
function renderPoints(){
  const span = document.getElementById('pointsValue');
  if(span) span.textContent = state.points + (isDemo ? ' (demo)' : '');
}

function computeCatalogSignature(items){
  // Firma ligera: número + ids ordenados + costs (evita re-render si nada cambió)
  if(!Array.isArray(items)) return '';
  const parts = items.map(i=>`${i.id}:${i.cost}`).sort();
  return `${items.length}|${parts.join(',')}`;
}

function setupCatalogToggle(){
  const btn = document.getElementById('toggleCatalogBtn');
  const panel = document.getElementById('catalogPanel');
  if(!btn || !panel) return;
  btn.addEventListener('click', ()=>{
    panel.classList.toggle('hidden');
    catalogPanelOpen = !panel.classList.contains('hidden');
    if(catalogPanelOpen){
      // Re-render inicial al abrir
      lastCatalogSignature = computeCatalogSignature(state.catalog); // sincronizar firma
      renderCatalog();
    }
  });
}

function renderHouse(){
  const host = document.getElementById('houseSlots');
  if(!host) return;
  host.innerHTML='';
  const slots = state.house?.slots || [];
  const placed = state.house?.placed || {};
  for(const slot of slots){
    const div = document.createElement('div');
    div.className = 'slot';
    div.dataset.slot = slot;
    const itemId = placed[slot];
    const label = document.createElement('div');
    label.className='slot-name';
    label.textContent = slot;
    if(itemId){
      const item = state.catalog.find(c=>c.id===itemId);
      if(item){
        div.classList.add('filled');
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.name;
        div.appendChild(img);
      } else {
        div.classList.add('empty');
      }
    } else {
      div.classList.add('empty');
    }
    div.appendChild(label);
    host.appendChild(div);
  }
}

function demoSlots(){
  return ["sofa","mesa","lampara","cuadro","cocina_mueble","cocina_frigorifico","cocina_horno","planta_suelo","planta_colgante","alfombra","estanteria"];
}
function demoCatalog(){
  const base = 'img/';
  return [
    { id:'sofa_clasico', slot:'sofa', category:'Sala', name:'Sofá clásico', cost:30, image: base+'sofa1.svg' },
    { id:'sofa_moderno', slot:'sofa', category:'Sala', name:'Sofá moderno', cost:45, image: base+'sofa2.svg' },
    { id:'mesa_roble', slot:'mesa', category:'Sala', name:'Mesa roble', cost:25, image: base+'mesa1.svg' },
    { id:'mesa_vidrio', slot:'mesa', category:'Sala', name:'Mesa vidrio', cost:35, image: base+'mesa2.svg' },
    { id:'lampara_pie', slot:'lampara', category:'Iluminación', name:'Lámpara pie', cost:20, image: base+'lampara1.svg' },
    { id:'lampara_mod', slot:'lampara', category:'Iluminación', name:'Lámpara moderna', cost:32, image: base+'lampara_mod.svg' }
  ];
}
