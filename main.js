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
let SITE_BASE = ''; // base absoluta construida al cargar la página

// helper para construir URL absoluta desde rutas relativas/absolutas internas
function makeAbsolutePath(p){
  if(!p) return p;
  if(p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;
  const clean = p.startsWith('/') ? p.slice(1) : p;
  const base = SITE_BASE || (location.origin + '/');
  return base + clean;
}

// --- LocalStore: persistencia en localStorage para modo sin backend ---
const LOCAL_KEY = 'game_state_v1';
const LocalStore = {
  load() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  },
  save(obj) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(obj));
    } catch (e) { console.warn('LocalStore save failed', e); }
  },
  seed() {
    const base = 'img/';
    const catalog = [
      { id:'sofa_clasico', slot:'sofa', category:'Sala', name:'Sofá clásico', cost:30, image: base+'sofa1.svg' },
      { id:'sofa_moderno', slot:'sofa', category:'Sala', name:'Sofá moderno', cost:45, image: base+'sofa2.svg' },
      { id:'sofa_combo', slot:'sofa', category:'Sala', name:'Sofá 3 plazas', cost:60, image: base+'sofa2.svg' },
      { id:'mesa_roble', slot:'mesa', category:'Sala', name:'Mesa roble', cost:25, image: base+'mesa1.svg' },
      { id:'mesa_vidrio', slot:'mesa', category:'Sala', name:'Mesa vidrio', cost:35, image: base+'mesa2.svg' },
      { id:'mesa_cafe', slot:'mesa', category:'Sala', name:'Mesa de café', cost:18, image: base+'mesa1.svg' },
      { id:'lampara_pie', slot:'lampara', category:'Iluminación', name:'Lámpara pie', cost:20, image: base+'lampara1.svg' },
      { id:'lampara_mod', slot:'lampara', category:'Iluminación', name:'Lámpara moderna', cost:32, image: base+'lampara_mod.svg' },
      { id:'lampara_colgante', slot:'lampara', category:'Iluminación', name:'Lámpara colgante', cost:28, image: base+'lampara_mod.svg' },
      { id:'cocina_mueble_blanco', slot:'cocina_mueble', category:'Cocina', name:'Mueble blanco', cost:40, image: base+'cocina_mueble_blanco.svg' },
      { id:'cocina_mueble_madera', slot:'cocina_mueble', category:'Cocina', name:'Mueble madera', cost:42, image: base+'cocina_mueble_madera.svg' },
      { id:'frigo_acero', slot:'cocina_frigorifico', category:'Cocina', name:'Frigorífico acero', cost:50, image: base+'frigo_acero.svg' },
      { id:'frigo_blanco', slot:'cocina_frigorifico', category:'Cocina', name:'Frigorífico blanco', cost:46, image: base+'frigo_blanco.svg' },
      { id:'horno_inox', slot:'cocina_horno', category:'Cocina', name:'Horno inox', cost:30, image: base+'horno_inox.svg' },
      { id:'horno_negro', slot:'cocina_horno', category:'Cocina', name:'Horno negro', cost:28, image: base+'horno_negro.svg' },
      { id:'alfombra_moderna', slot:'alfombra', category:'Decoración', name:'Alfombra moderna', cost:22, image: base+'alfombra_moderna.svg' },
      { id:'alfombra_roja', slot:'alfombra', category:'Decoración', name:'Alfombra roja', cost:24, image: base+'alfombra_roja.svg' },
      { id:'cuadro_montana', slot:'cuadro', category:'Decoración', name:'Cuadro montaña', cost:12, image: base+'cuadro_montana.svg' },
      { id:'cuadro1', slot:'cuadro', category:'Decoración', name:'Cuadro abstracto', cost:15, image: base+'cuadro1.svg' },
      { id:'estanteria_blanca', slot:'estanteria', category:'Almacenaje', name:'Estantería blanca', cost:35, image: base+'estanteria_blanca.svg' },
      { id:'estanteria_madera', slot:'estanteria', category:'Almacenaje', name:'Estantería madera', cost:38, image: base+'estanteria_madera.svg' },
      { id:'planta_alta', slot:'planta_suelo', category:'Plantas', name:'Planta alta', cost:10, image: base+'planta_alta.svg' },
      { id:'planta_baja', slot:'planta_suelo', category:'Plantas', name:'Planta baja', cost:8, image: base+'planta_baja.svg' },
      { id:'planta_colgante', slot:'planta_colgante', category:'Plantas', name:'Planta colgante', cost:14, image: base+'planta_colgante.svg' },
      { id:'sofa_alt', slot:'sofa', category:'Sala', name:'Sofá alt', cost:48, image: base+'sofa1.svg' },
      { id:'mesa_larga', slot:'mesa', category:'Comedor', name:'Mesa larga', cost:55, image: base+'mesa2.svg' },
      { id:'lampara_decor', slot:'lampara', category:'Iluminación', name:'Lámpara decorativa', cost:26, image: base+'lampara1.svg' },
      // duplicados para rellenar el catálogo
      { id:'sofa_extra1', slot:'sofa', category:'Sala', name:'Sofá vintage', cost:34, image: base+'sofa1.svg' },
      { id:'sofa_extra2', slot:'sofa', category:'Sala', name:'Sofá minimal', cost:40, image: base+'sofa2.svg' },
      { id:'mesa_extra1', slot:'mesa', category:'Sala', name:'Mesa auxiliar', cost:15, image: base+'mesa1.svg' },
      { id:'alfombra_extra1', slot:'alfombra', category:'Decoración', name:'Alfombra clásica', cost:20, image: base+'alfombra_moderna.svg' },
      { id:'cuadro_extra1', slot:'cuadro', category:'Decoración', name:'Cuadro paisaje', cost:18, image: base+'cuadro1.svg' }
    ];
    const slots = ["all","sofa","mesa","lampara","cuadro","cocina_mueble","cocina_frigorifico","cocina_horno","planta_suelo","planta_colgante","alfombra","estanteria"];
    const now = new Date().toISOString();
    return {
      points: 0,
      timer: { isRunning:false, startUtc: now, durationSeconds:0, cancelled:false },
      catalog,
      house: { slots, placed: {} },
      theme: 'default',
      achievements: []
    };
  },
  initIfNeeded() {
    let st = this.load();
    const seedData = this.seed();
    if (!st) {
      st = seedData;
      this.save(st);
    } else {
      // ensure catalog and slots exist - merge missing items by id
      if(!Array.isArray(st.catalog) || st.catalog.length===0) st.catalog = seedData.catalog;
      else {
        const existingIds = new Set(st.catalog.map(i=>i.id));
        const toAdd = seedData.catalog.filter(i=>!existingIds.has(i.id));
        if(toAdd.length>0){
          st.catalog = st.catalog.concat(toAdd);
        }
      }
      if(!st.house || !Array.isArray(st.house.slots)) st.house = seedData.house;
      else {
        // ensure house slots include seed slots
        const slotSet = new Set(st.house.slots || []);
        for(const s of seedData.house.slots || []) slotSet.add(s);
        st.house.slots = Array.from(slotSet);
        st.house.placed = st.house.placed || {};
      }
    }
    return st;
  },
  getState() {
    const s = this.initIfNeeded();
    return s;
  },
  setState(s) {
    this.save(s);
  },
  startTimer(seconds) {
    const s = this.getState();
    s.timer = { isRunning:true, startUtc: new Date().toISOString(), durationSeconds: seconds, cancelled:false };
    this.setState(s);
    return s;
  },
  cancelTimer() {
    const s = this.getState();
    if(s.timer) s.timer = { isRunning:false, startUtc: new Date().toISOString(), durationSeconds:0, cancelled:true };
    this.setState(s);
    return s;
  },
  claimTimer() {
    const s = this.getState();
    if(!s.timer) throw new Error('No timer');
    // Si el timer sigue marcado como isRunning comprobamos si ya pasó su duración
    const t = s.timer;
    if(t.isRunning){
      const startMs = Date.parse(t.startUtc);
      const durMs = (t.durationSeconds||0) * 1000;
      const elapsed = Date.now() - startMs;
      if(elapsed < durMs) throw new Error('Timer not finished');
    }
    const reward = Math.max(1, Math.floor((t.durationSeconds||0) / 5));
    s.points = (s.points||0) + reward;
    s.timer = { isRunning:false, startUtc: new Date().toISOString(), durationSeconds:0, cancelled:false };
    this.setState(s);
    return s;
  },
  preview(slot, itemId) {
    const s = this.getState();
    const item = s.catalog.find(x => x.id === itemId) || null;
    return { preview: item };
  },
  purchase(slot, itemId) {
    const s = this.getState();
    const item = s.catalog.find(x => x.id === itemId);
    if(!item) throw new Error('Item not found');
    if((s.points||0) < item.cost) throw new Error('Insufficient points');
    s.points = (s.points||0) - item.cost;
    if(!s.house) s.house = { slots: [], placed: {} };
    s.house.placed = s.house.placed || {};
    s.house.placed[slot] = item.id;
    this.setState(s);
    return { points: s.points, placed: s.house.placed };
  }
};

// Helper: small timeout for fetch
function fetchWithTimeout(resource, options = {}){
  const { timeout = 4000 } = options;
  return Promise.race([
    fetch(resource, options),
    new Promise((_, reject) => setTimeout(()=> reject(new Error('timeout')), timeout))
  ]);
}

// Reemplazamos getJSON/postJSON para usar fetch si está disponible, sino fallback a LocalStore.
async function getJSON(url, opts){
  // Intentionally attempt network fetch first for full functionality
  try{
    const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' }, ...opts, timeout:4000 });
    if(!res.ok) throw new Error(await res.text().catch(()=>res.statusText));
    return await res.json();
  }catch(err){
    // Fallback local handlers
    // Support exact endpoints used by the app
    if(url === '/api/state'){
      return LocalStore.getState();
    }
    if(url === '/api/catalog'){
      const s = LocalStore.getState(); return s.catalog;
    }
    if(url === '/api/house'){
      const s = LocalStore.getState(); return s.house;
    }
    if(url === '/api/achievements'){
      const s = LocalStore.getState(); return s.achievements || [];
    }
    if(url.startsWith('/api/theme')){
      const s = LocalStore.getState(); return { theme: s.theme || 'default' };
    }
    // If not handled, rethrow
    throw err;
  }
}

async function postJSON(url, body){
  try{
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body||{}), timeout:4000 });
    if(!res.ok) throw new Error(await res.text().catch(()=>res.statusText));
    return await res.json();
  }catch(err){
    // Fallback local handlers
    if(url === '/api/timer/start'){
      const sec = body && (body.seconds || body.seconds===0) ? body.seconds : (body && body.seconds);
      const s = LocalStore.startTimer(sec);
      return s;
    }
    if(url === '/api/timer/cancel'){
      return LocalStore.cancelTimer();
    }
    if(url === '/api/timer/claim'){
      return LocalStore.claimTimer();
    }
    if(url === '/api/preview'){
      return LocalStore.preview(body.slot, body.itemId);
    }
    if(url === '/api/purchase'){
      return LocalStore.purchase(body.slot, body.itemId);
    }
    if(url === '/api/theme'){ // set theme
      const s = LocalStore.getState(); s.theme = body.theme || s.theme; LocalStore.setState(s); return { theme: s.theme };
    }
    // If not handled, rethrow
    throw err;
  }
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
  // Normalizar imágenes del catálogo a rutas absolutas para que no dependan de la carpeta actual
  try{
    if(Array.isArray(state.catalog)){
      state.catalog.forEach(i=>{ if(i && i.image) i.image = makeAbsolutePath(i.image); });
    }
  }catch(e){/* silencioso */}
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
  pollHandle = setInterval(async () => {
    try{
      await refreshState();
    }catch(e){ /* silencioso */ }
  }, POLL_MS);
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
    rewardSpan.textContent = Math.max(1, Math.floor(rewardSeconds / 5));
  }
  dlg.showModal();
  const confirmBtn = document.getElementById('claimConfirm');
  confirmBtn.onclick = async (e)=>{
    e.preventDefault();
    if(!pendingClaim) { dlg.close(); return; }
    confirmBtn.disabled = true;
    try{
      const res = await postJSON('/api/timer/claim');
      state.points = res.points || res.points === 0 ? res.points : (state.points||0);
      pendingClaim = false;
      state.timer = null;
      renderPoints();
      updateTimerStatus('Esperando siguiente concentración');
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
  const disp = document.getElementById('timerDisplay');
  status.textContent = text;
  if(disp){
    // Si el texto tiene formato Restante: MM:SS o 00:00, mostrar solo la parte de tiempo cuando aplique
    if(text && text.startsWith('Restante:')){
      disp.textContent = text.replace('Restante:','').trim();
    } else if(text && text === 'Listo para reclamar'){
      disp.textContent = '00:00';
    } else if(text && text === 'Esperando siguiente concentración'){
      disp.textContent = '--:--';
    } else {
      // por defecto, mostrar el texto breve
      disp.textContent = text;
    }
  }
}

function renderTimer(){
  if(!state.timer || !state.timer.isRunning){
    clearInterval(localTimerInterval);
    updateTimerStatus('Esperando siguiente concentración');
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
    if (id === currentFilter) b.classList.add('active');
    b.onclick = ()=>{ currentFilter = id; buildFilters(); renderCatalog(); };
    return b;
  };
  filters.appendChild(mkBtn('all','Todos'));
  // ordenar por nombre de slot
  slots.sort().forEach(s=> filters.appendChild(mkBtn(s, s)));
}

function showCatalogCategories(){
  // Anteriormente creábamos una lista de botones dentro del grid que duplicaba
  // los filtros ya presentes en `#catalogFilters`. Ahora delegamos a
  // `showCatalogCategory('all')` para que la vista inicial muestre todos los productos
  // y mantenga la fila superior de filtros como el único control de filtrado.
  showCatalogCategory('all');
}

function showCatalogCategory(slot){
  const filters = document.getElementById('catalogFilters');
  const grid = document.getElementById('catalogGrid');
  const backBtn = document.getElementById('catalogBackBtn');
  // Mostrar u ocultar el botón "Volver" solo cuando se está dentro de una
  // categoría específica (slot != 'all')
  backBtn.style.display = slot === 'all' ? 'none' : 'inline-block';
  // Mantener la fila superior de filtros visible cuando mostramos 'all'; ocultarla para
  // vistas por categoría para dejar espacio al encabezado/volver.
  filters.style.display = slot === 'all' ? 'flex' : 'none';
  grid.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'catalog-page';
  const title = document.createElement('h3');
  title.textContent = slot === 'all' ? 'Todos los productos' : slot;
  title.style.textAlign = 'center';
  page.appendChild(title);
  const storeGrid = document.createElement('div');
  storeGrid.className = 'store-grid';
  const items = slot === 'all' ? state.catalog : state.catalog.filter(i=>i.slot===slot);
  if(items.length===0){
    const p = document.createElement('p'); p.textContent = 'No hay elementos.'; page.appendChild(p);
  }
  items.forEach(item=>{
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <img src="${item.image}" alt="${item.name}"/>
      <div class="meta">
        <div>
          <div class="item-name">${item.name}</div>
          <div class="slot-name">${item.slot}</div>
        </div>
        <div class="price">${item.cost} pt</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button data-act="preview" data-slot="${item.slot}" data-id="${item.id}">Ver</button>
        <button data-act="buy" data-slot="${item.slot}" data-id="${item.id}">Comprar</button>
      </div>`;
    storeGrid.appendChild(card);
  });
  page.appendChild(storeGrid);
  grid.appendChild(page);
  // back handler
  backBtn.onclick = ()=>{ showCatalogCategories(); };
  // ensure focus/top
  if(window.matchMedia('(max-width:600px)').matches){ setTimeout(()=>{ grid.scrollTo({ top:0, behavior:'smooth' }); }, 40); }
}

// Reemplazamos renderCatalog por una llamada a showCatalogCategories (vista inicial)
function renderCatalog(){
  // Si se está filtrando por slot específico (currentFilter != 'all') mostrar esa categoría
  if(currentFilter && currentFilter !== 'all'){
    showCatalogCategory(currentFilter);
  } else {
    showCatalogCategories();
  }
}

// Ajustes en el click de items en grid: el container onclick maneja buy/preview ya
// function renderCatalog(){
//   const container = document.getElementById('catalogGrid');
//   container.innerHTML = '';
//   // filtrar por slot si aplica
//   const itemsFiltered = currentFilter==='all' ? state.catalog : state.catalog.filter(i=>i.slot===currentFilter);
//   // Agrupar por categoría
//   const groups = new Map();
//   for(const item of itemsFiltered){
//     const cat = item.category || 'Otros';
//     if(!groups.has(cat)) groups.set(cat, []);
//     groups.get(cat).push(item);
//   }
//   // Limpiar categorías obsoletas del set
//   const existingCats = new Set(groups.keys());
//   for(const cat of Array.from(openCategories)){
//     if(!existingCats.has(cat)) openCategories.delete(cat);
//   }
//   const cats = Array.from(groups.keys()).sort();
//   if(cats.length===0){
//     const p = document.createElement('p');
//     p.textContent = 'No hay elementos para este filtro.';
//     container.appendChild(p);
//     return;
//   }
//   const layoutClass = currentFilter==='all' ? 'row' : 'grid';
//   cats.forEach(cat =>{
//     const details = document.createElement('details');
//     details.className = 'cat';
//     details.dataset.cat = cat;
//     const isOpen = openCategories.has(cat);
//     if(isOpen) {
//       details.open = true; // restaurar estado
//       if(currentFilter==='all') details.classList.add('expanded');
//     }
//     details.addEventListener('toggle', ()=>{
//       if(details.open){
//         openCategories.add(cat);
//         if(currentFilter==='all'){
//           // marcar expandida y cerrar las demás
//           details.classList.add('expanded');
//           const all = container.querySelectorAll('details.cat');
//           all.forEach(other=>{
//             if(other!==details){
//               other.open = false;
//               other.classList.remove('expanded');
//               if(other.dataset.cat) openCategories.delete(other.dataset.cat);
//             }
//           });
//         }
//       } else {
//         openCategories.delete(cat);
//         details.classList.remove('expanded');
//       }
//     });
//     const summary = document.createElement('summary');
//     const items = groups.get(cat);
//     summary.textContent = `${cat} (${items.length})`;
//     const wrap = document.createElement('div');
//     wrap.className = `cat-items ${layoutClass}`;
//     items.forEach(item =>{
//       const card = document.createElement('div');
//       card.className='card';
//       card.innerHTML = `
//         <img src="${item.image}" alt="${item.name}"/>
//         <div class="meta">
//           <div>
//             <div>${item.name}</div>
//             <div class="slot-name">${item.slot}</div>
//           </div>
//             <div>${item.cost} pt</div>
//         </div>
//         <div style="display:flex;gap:8px;margin-top:8px;">
//           <button data-act="preview" data-slot="${item.slot}" data-id="${item.id}">Ver</button>
//           <button data-act="buy" data-slot="${item.slot}" data-id="${item.id}">Comprar</button>
//         </div>`;
//       wrap.appendChild(card);
//     });
//     details.appendChild(summary);
//     details.appendChild(wrap);
//     container.appendChild(details);
//   });

//   container.onclick = async (e)=>{
//     const btn = e.target.closest('button');
//     if(!btn) return;
//     const { act, slot, id } = btn.dataset;
//     try{
//       if(act==='preview'){
//         const { preview } = await postJSON('/api/preview', { slot, itemId:id });
//         openPreview(preview, slot);
//       } else if(act==='buy'){
//         const res = await postJSON('/api/purchase', { slot, itemId:id });
//         state.points = res.points;
//         state.house.placed = res.placed;
//         renderPoints();
//         renderHouse();
//         // En móvil cerrar panel para evitar scroll adicional
//         if(window.matchMedia('(max-width:600px)').matches){
//           const panel = document.getElementById('catalogPanel');
//           if(panel) panel.classList.add('hidden');
//           catalogPanelOpen = false;
//         }
//       }
//     }catch(err){ alert(err.message||err); }
//   };
// }

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
  // Construir SITE_BASE desde <base href> si existe, o usar origin
  (function computeSiteBase(){
    try{
      const baseEl = document.querySelector('base');
      let baseHref = baseEl ? baseEl.getAttribute('href') : '/';
      if(!baseHref) baseHref = '/';
      if(!baseHref.endsWith('/')) baseHref += '/';
      // Asegurarnos de que comienza con '/'
      if(!baseHref.startsWith('/')) baseHref = '/' + baseHref;
      SITE_BASE = location.origin + baseHref;
    }catch(e){ SITE_BASE = location.origin + '/'; }
  })();

  // FixPaths: convertir rutas internas a absolutas para que no dependan de la carpeta actual
  (function makeAbsoluteUrlsInDOM(){
    try{
      // imgs
      document.querySelectorAll('img').forEach(img=>{
        const src = img.getAttribute('src');
        if(src) img.setAttribute('src', makeAbsolutePath(src));
        const srcset = img.getAttribute('srcset');
        if(srcset){
          const parts = srcset.split(',').map(p=>p.trim()).map(p=>{
            const [url, w] = p.split(/\s+/);
            return makeAbsolutePath(url) + (w ? ' '+w : '');
          });
          img.setAttribute('srcset', parts.join(', '));
        }
      });
      // elements with data-src or data-bg
      document.querySelectorAll('[data-src]').forEach(el=> el.setAttribute('data-src', makeAbsolutePath(el.getAttribute('data-src'))));
      document.querySelectorAll('[data-bg]').forEach(el=> el.setAttribute('data-bg', makeAbsolutePath(el.getAttribute('data-bg'))));
      // inline styles background-image
      document.querySelectorAll('[style]').forEach(el=>{
        const style = el.getAttribute('style');
        if(style && style.includes('background-image')){
          const replaced = style.replace(/url\((['"]?)([^)'"]+)\1\)/g, (m, q, url)=> `url(${q}${makeAbsolutePath(url)}${q})`);
          if(replaced !== style) el.setAttribute('style', replaced);
        }
      });
      // <source> elements (picture, video)
      document.querySelectorAll('source').forEach(s=>{
        const src = s.getAttribute('src'); if(src) s.setAttribute('src', makeAbsolutePath(src));
        const srcset = s.getAttribute('srcset'); if(srcset){
          const parts = srcset.split(',').map(p=>p.trim()).map(p=>{
            const [url, w] = p.split(/\s+/);
            return makeAbsolutePath(url) + (w ? ' '+w : '');
          });
          s.setAttribute('srcset', parts.join(', '));
        }
      });
    }catch(e){ console.warn('makeAbsoluteUrlsInDOM failed', e); }
  })();

  loadAll().catch(e=>alert(e.message||e));

  // Manejadores para la barra de navegación móvil
  const navCatalog = document.getElementById('navCatalog');
  const navTimer = document.getElementById('navTimer');
  const navShop = document.getElementById('navShop');
  const closeCatalog = document.getElementById('closeCatalogBtn');
  if(closeCatalog) closeCatalog.addEventListener('click', ()=>{
    const panel = document.getElementById('catalogPanel');
    if(panel) panel.classList.add('hidden');
    catalogPanelOpen = false;
  });

  if(navCatalog) navCatalog.addEventListener('click', ()=>{
    const panel = document.getElementById('catalogPanel');
    if(panel) panel.classList.toggle('hidden');
    // mostrar acciones accesibles
    catalogPanelOpen = !panel.classList.contains('hidden');
    // Si se acaba de abrir, asegurarnos de que empiece en la parte superior en pantallas pequeñas
    if(catalogPanelOpen && window.matchMedia('(max-width:600px)').matches){
      setTimeout(()=>{ panel.scrollTo({ top: 0, behavior: 'smooth' }); }, 60);
    }
  });
  if(navTimer) navTimer.addEventListener('click', ()=>{
    // Hacer scroll suave al temporizador para usuarios móviles
    const t = document.querySelector('.timer');
    if(t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  if(navShop) navShop.addEventListener('click', ()=>{
    const t = document.querySelector('.timer');
    const p = document.querySelector('#catalogPanel');
    if(p && p.classList.contains('hidden')){
      // abrir catálogo si está cerrado
      p.classList.remove('hidden');
      catalogPanelOpen = true;
    } else if(p){
      // si ya abierto, mostrar sección de ofertas (scroll arriba)
      p.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  const resetBtn = document.getElementById('resetStateBtn');
  if(resetBtn) resetBtn.addEventListener('click', ()=>{
    if(confirm('Borrar estado local y recargar? Esto restablecerá puntos y colocados.')){
      try{ localStorage.removeItem(LOCAL_KEY); }catch(e){}
      location.reload();
    }
  });

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
  if(span) span.textContent = state.points;
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
      // En móvil, asegurarnos de que el contenido comience desde arriba y no nos obligue a scroll largo
      if(window.matchMedia('(max-width:600px)').matches){
        setTimeout(()=>{ panel.scrollTo({ top: 0, behavior: 'smooth' }); }, 80);
      }
    }
  });
}

// Restaurar renderHouse 2D (versión simple anterior)
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
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.name;
        div.appendChild(img);
        div.classList.add('filled');
      }
    } else {
      div.classList.add('empty');
    }
    div.appendChild(label);
    host.appendChild(div);
  }
}

// Global handler para clicks dentro del grid del catálogo (tanto categorías como tienda)
document.addEventListener('click', async (e)=>{
  const grid = document.getElementById('catalogGrid');
  if(!grid) return;
  if(!grid.contains(e.target)) return;
  const btn = e.target.closest('button');
  if(!btn) return;
  const act = btn.dataset.act;
  const slot = btn.dataset.slot;
  const id = btn.dataset.id;
  try{
    if(act === 'preview'){
      const { preview } = await postJSON('/api/preview', { slot, itemId: id });
      openPreview(preview, slot);
    } else if(act === 'buy'){
      const res = await postJSON('/api/purchase', { slot, itemId: id });
      state.points = res.points;
      state.house.placed = res.placed;
      renderPoints();
      renderHouse();
      // cerrar en móvil para evitar scroll largo
      if(window.matchMedia('(max-width:600px)').matches){
        const panel = document.getElementById('catalogPanel');
        if(panel) panel.classList.add('hidden');
        catalogPanelOpen = false;
      }
    } else if(btn.dataset.slot && !act){
      // Si el click fue sobre un botón de categoría creado en showCatalogCategories
      const s = btn.dataset.slot;
      if(s) showCatalogCategory(s);
    }
  }catch(err){ alert(err.message || err); }
});

