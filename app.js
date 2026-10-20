/* Dépôt & Caisse — client-only application. All database access is governed by RLS. */
(() => {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const today = () => new Date().toLocaleDateString('en-CA');
  const money = (n) => new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + ' DH';
  const escape = (v = '') => String(v).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
  const configured = /^https:\/\//.test(cfg.SUPABASE_URL || '') && (cfg.SUPABASE_PUBLISHABLE_KEY || '').length > 20;
  const sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
  let sorties = [], flux = [], currentUser = null;

  function icons() { window.lucide?.createIcons(); }
  function toast(message, bad = false) { const t = $('#toast'); t.textContent = message; t.className = `fixed bottom-5 right-5 z-50 max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-xl ${bad ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`; setTimeout(() => t.classList.add('hidden'), 3500); }
  function showAuthMessage(message, bad = true) { const e = $('#auth-message'); e.textContent = message; e.className = `rounded-xl p-3 text-sm ${bad ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`; }
  function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
  function resetForm(form, id) { form.reset(); form.querySelector('[name=date_operation]').value = $('#selected-date').value; $('#'+id).value = ''; }
  function activeDate() { return $('#selected-date').value; }
  function updateClientSuggestion() { const names = [...new Set(sorties.map(s => s.client_nom))].sort(); $('#clients-list').innerHTML = names.map(n => `<option value="${escape(n)}">`).join(''); }

  async function loadData() {
    const [{ data: s, error: se }, { data: f, error: fe }] = await Promise.all([
      sb.from('sorties_stock').select('*').order('date_operation', { ascending: false }).order('created_at', { ascending: false }),
      sb.from('flux_monetaire').select('*').order('date_operation', { ascending: false }).order('created_at', { ascending: false })
    ]);
    if (se || fe) { toast((se || fe).message, true); return; }
    sorties = s || []; flux = f || []; render();
  }

  function render() { renderKpis(); renderSorties(); renderFlux(); renderClientPreview(); updateClientSuggestion(); icons(); }
  function renderKpis() {
    const d = activeDate(); const daySorties = sorties.filter(x => x.date_operation === d); const dayFlux = flux.filter(x => x.date_operation === d);
    const qty = daySorties.reduce((a, x) => a + Number(x.quantite), 0);
    const entree = dayFlux.filter(x => x.type_flux === 'entree').reduce((a, x) => a + Number(x.montant), 0);
    const depense = dayFlux.filter(x => x.type_flux === 'depense').reduce((a, x) => a + Number(x.montant), 0);
    $('#kpis').innerHTML = [
      ['package-open','Total articles sortis', `${qty} article${qty !== 1 ? 's' : ''}`, 'bg-blue-50 text-blue-700'],
      ['users','Clients servis', `${new Set(daySorties.map(x => x.client_nom)).size} client(s)`, 'bg-amber-50 text-amber-700'],
      ['arrow-down-left','Entrées monétaires', money(entree), 'bg-emerald-50 text-emerald-700'],
      ['wallet','Dépenses / solde net', `${money(depense)} <span class="block pt-1 text-xs">Net : ${money(entree - depense)}</span>`, 'bg-red-50 text-red-700']
    ].map(([i, label, value, c]) => `<article class="card flex items-start justify-between"><div><p class="text-sm font-semibold text-slate-500">${label}</p><p class="mt-2 text-xl font-bold">${value}</p></div><div class="grid h-10 w-10 place-items-center rounded-xl ${c}"><i data-lucide="${i}" class="h-5"></i></div></article>`).join('');
  }
  function actions(type, id) { return `<div class="flex flex-wrap gap-2"><button class="action-link" data-edit="${type}" data-id="${id}">Modifier</button><button class="action-link action-delete" data-delete="${type}" data-id="${id}">Supprimer</button></div>`; }
  function renderSorties() { const rows = sorties.filter(x => x.date_operation === activeDate()); $('#sorties-body').innerHTML = rows.length ? rows.map(x => `<tr><td>${escape(x.date_operation)}</td><td class="font-semibold">${escape(x.client_nom)}<span class="block text-xs font-normal text-slate-500">${escape(x.ville)}</span></td><td>${escape(x.produit_nom)}</td><td>${escape(x.couleur)}<span class="block text-xs text-slate-500">${escape(x.mesure)}</span></td><td>${x.quantite}</td><td>${actions('sortie', x.id)}</td></tr>`).join('') : empty('Aucune sortie pour cette date.', 6); $('#sorties-total').textContent = rows.reduce((total, x) => total + Number(x.quantite), 0); }
  function renderFlux() {
    const rows = flux.filter(x => x.date_operation === activeDate());
    const row = (x) => `<tr><td>${escape(x.date_operation)}</td><td class="font-semibold">${escape(x.categorie)}</td><td class="max-w-xs whitespace-normal text-slate-600">${escape(x.description || '—')}</td><td class="${x.type_flux === 'entree' ? 'money-positive' : 'money-negative'}">${x.type_flux === 'entree' ? '+' : '−'} ${money(x.montant)}</td><td>${actions('flux', x.id)}</td></tr>`;
    const entree = rows.filter(x => x.type_flux === 'entree');
    const depense = rows.filter(x => x.type_flux === 'depense');
    $('#entrees-body').innerHTML = entree.length ? entree.map(row).join('') : empty('Aucune entrée pour cette date.', 5);
    $('#depenses-body').innerHTML = depense.length ? depense.map(row).join('') : empty('Aucune dépense pour cette date.', 5);
    const totalEntrees = entree.reduce((total, x) => total + Number(x.montant), 0);
    const totalDepenses = depense.reduce((total, x) => total + Number(x.montant), 0);
    const ecart = totalEntrees - totalDepenses;
    $('#entrees-total').textContent = money(totalEntrees);
    $('#depenses-total').textContent = money(totalDepenses);
    $('#solde-caisse').innerHTML = `Écart du jour <span class="mx-1 text-slate-400">(entrées − dépenses)</span> : <strong class="${ecart >= 0 ? 'text-emerald-700' : 'text-red-700'}">${money(ecart)}</strong>`;
  }
  function empty(text, span) { return `<tr><td colspan="${span}" class="py-10 text-center text-slate-500">${text}</td></tr>`; }
  function clients() { const m = new Map(); sorties.forEach(s => { const c = m.get(s.client_nom) || { name:s.client_nom, city:s.ville, movements:0, qty:0, last:s.date_operation }; c.movements++; c.qty += Number(s.quantite); if (s.date_operation > c.last) c.last=s.date_operation; c.city ||= s.ville; m.set(s.client_nom, c); }); return [...m.values()].sort((a,b) => b.last.localeCompare(a.last)); }
  function renderClientPreview() { const cs = clients(), moves=cs.reduce((a,c)=>a+c.movements,0), qty=cs.reduce((a,c)=>a+c.qty,0); $('#client-summary-preview').innerHTML = `<div class="rounded-xl bg-slate-50 p-3"><p class="text-xs font-bold uppercase text-slate-500">Clients suivis</p><p class="mt-1 text-xl font-bold">${cs.length}</p></div><div class="rounded-xl bg-amber-50 p-3"><p class="text-xs font-bold uppercase text-amber-700">Mouvements enregistrés</p><p class="mt-1 text-xl font-bold text-amber-800">${moves}</p></div><div class="rounded-xl bg-brand-50 p-3"><p class="text-xs font-bold uppercase text-brand-700">Articles sortis</p><p class="mt-1 text-xl font-bold text-brand-700">${qty}</p></div>`; }
  function renderClients() { const cs = clients(); $('#clients-body').innerHTML = cs.length ? cs.map(c => `<tr><td class="font-semibold">${escape(c.name)}</td><td>${escape(c.city)}</td><td>${c.movements}</td><td class="font-bold text-brand-700">${c.qty}</td><td>${escape(c.last)}</td></tr>`).join('') : empty('Aucun client enregistré.', 5); icons(); }

  function setSortieEdit(row) { const f = $('#sortie-form'); Object.entries(row).forEach(([k,v]) => { const e = f.elements[k]; if(e) e.value = v; }); $('#sortie-id').value=row.id; $('#sortie-submit').textContent='Mettre à jour'; $('#sortie-edit-label').classList.remove('hidden'); $('#sortie-cancel').classList.remove('hidden'); window.scrollTo({ top: 0, behavior:'smooth' }); }
  function setFluxEdit(row) { const f = $('#flux-form'); Object.entries(row).forEach(([k,v]) => { const e = f.elements[k]; if(e && v != null) e.value=v; }); $('#flux-id').value=row.id; $('#flux-submit').textContent='Mettre à jour'; $('#flux-edit-label').classList.remove('hidden'); $('#flux-cancel').classList.remove('hidden'); window.scrollTo({ top:0, behavior:'smooth' }); }
  async function saveSortie(e) { e.preventDefault(); const f=e.currentTarget, d=formData(f), id=$('#sortie-id').value; const payload={...d, quantite:Number(d.quantite), user_id:currentUser.id}; const q=id ? sb.from('sorties_stock').update(payload).eq('id',id) : sb.from('sorties_stock').insert(payload); const {error}=await q; if(error)return toast(error.message,true); toast(id?'Sortie mise à jour.':'Sortie enregistrée.'); $('#sortie-id').value=''; f.quantite.value=''; f.quantite.focus(); $('#sortie-submit').textContent='Enregistrer'; $('#sortie-edit-label').classList.add('hidden'); $('#sortie-cancel').classList.add('hidden'); loadData(); }
  async function saveFlux(e) { e.preventDefault(); const f=e.currentTarget,d=formData(f),id=$('#flux-id').value; const payload={...d,montant:Number(d.montant),user_id:currentUser.id}; const q=id?sb.from('flux_monetaire').update(payload).eq('id',id):sb.from('flux_monetaire').insert(payload); const {error}=await q;if(error)return toast(error.message,true); toast(id?'Opération mise à jour.':'Opération enregistrée.'); resetForm(f,'flux-id'); $('#flux-submit').textContent='Enregistrer'; $('#flux-edit-label').classList.add('hidden'); $('#flux-cancel').classList.add('hidden'); loadData(); }
  async function remove(type,id) { if(!confirm('Supprimer définitivement cette ligne ?'))return; const {error}=await sb.from(type==='sortie'?'sorties_stock':'flux_monetaire').delete().eq('id',id); if(error)return toast(error.message,true); toast('Ligne supprimée.'); loadData(); }
  function exportCsv(type) { const rows=type==='sorties'?sorties.filter(x=>x.date_operation===activeDate()):flux.filter(x=>x.date_operation===activeDate()); const cols=type==='sorties'?[['date_operation','Date'],['client_nom','Client'],['ville','Ville'],['produit_nom','Produit'],['couleur','Couleur'],['mesure','Mesure'],['quantite','Quantité']]:[['date_operation','Date'],['type_flux','Type'],['categorie','Catégorie'],['description','Description'],['montant','Montant']]; const csv=[cols.map(c=>c[1]),...rows.map(r=>cols.map(([k])=>r[k]??''))].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n'); const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`${type}-${activeDate()}.csv`;a.click();URL.revokeObjectURL(a.href); }
  function printableTable(bodyId) { const table = $('#'+bodyId).closest('table').cloneNode(true); table.querySelectorAll('tr').forEach(row => row.lastElementChild?.remove()); return table.outerHTML; }
  function printReport(type) { const content=type==='sorties'?printableTable('sorties-body'):`<h2>Entrées monétaires</h2>${printableTable('entrees-body')}<h2>Dépenses / charges</h2>${printableTable('depenses-body')}<p class="net">${$('#solde-caisse').textContent}</p>`; const w=window.open('','_blank');w.document.write(`<!doctype html><html lang="fr"><head><title>Rapport ${activeDate()}</title><style>body{font-family:Arial;padding:24px;color:#18212f}table{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 28px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f1f5f9}tfoot td{background:#f8fafc;font-weight:bold}h1{color:#0f766e}h2{margin-top:28px;color:#334155}.net{border:1px solid #99f6e4;background:#f0fdfa;padding:10px;font-weight:bold}</style></head><body><h1>${type==='sorties'?'Sorties de stock':'Caisse quotidienne'} — ${activeDate()}</h1>${content}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close(); }

  async function signIn(e) { e.preventDefault(); if(!sb)return; const {error}=await sb.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value}); if(error)showAuthMessage(error.message); }
  async function signUp() { if(!sb)return; const email=$('#login-email').value.trim(),password=$('#login-password').value; if(!email||password.length<6)return showAuthMessage('Saisissez un e-mail et un mot de passe d’au moins 6 caractères.'); const {error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.href}}); showAuthMessage(error?error.message:'Compte créé. Vérifiez votre e-mail si la confirmation est activée.',!!error); }
  async function resetPassword() { if(!sb)return; const email=$('#login-email').value.trim(); if(!email)return showAuthMessage('Saisissez votre adresse e-mail.'); const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.href}); showAuthMessage(error?error.message:'E-mail de réinitialisation envoyé.',!!error); }
  async function session(user) { currentUser=user; $('#login-view').classList.toggle('hidden',!!user); $('#app-view').classList.toggle('hidden',!user); if(user){$('#user-email').textContent=user.email; $('#selected-date').value ||= today(); resetForm($('#sortie-form'),'sortie-id'); resetForm($('#flux-form'),'flux-id'); await loadData();} }
  function listen() {
    $('#login-form').addEventListener('submit',signIn);$('#signup-btn').addEventListener('click',signUp);$('#reset-btn').addEventListener('click',resetPassword);$('#logout-btn').addEventListener('click',()=>sb.auth.signOut());
    $('#selected-date').addEventListener('change',render);$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>{$$('[data-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#sorties-panel').classList.toggle('hidden',b.dataset.tab!=='sorties');$('#caisse-panel').classList.toggle('hidden',b.dataset.tab!=='caisse');}));
    $('#sortie-form').addEventListener('submit',saveSortie);$('#flux-form').addEventListener('submit',saveFlux);
    $('#sortie-cancel').addEventListener('click',()=>{resetForm($('#sortie-form'),'sortie-id');$('#sortie-submit').textContent='Enregistrer';$('#sortie-edit-label').classList.add('hidden');$('#sortie-cancel').classList.add('hidden');});$('#flux-cancel').addEventListener('click',()=>{resetForm($('#flux-form'),'flux-id');$('#flux-submit').textContent='Enregistrer';$('#flux-edit-label').classList.add('hidden');$('#flux-cancel').classList.add('hidden');});
    document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.edit){const r=(b.dataset.edit==='sortie'?sorties:flux).find(x=>x.id===b.dataset.id);b.dataset.edit==='sortie'?setSortieEdit(r):setFluxEdit(r);}if(b.dataset.delete)remove(b.dataset.delete,b.dataset.id);if(b.dataset.export)exportCsv(b.dataset.export);if(b.dataset.print)printReport(b.dataset.print);if(b.dataset.closeModal)$('#clients-modal').close();});
    $('#clients-modal-btn').addEventListener('click',()=>{renderClients();$('#clients-modal').showModal();});
  }
  async function init() { icons(); $('#selected-date').value=today(); listen(); if(!configured){$('#config-warning').classList.remove('hidden');return;} const {data:{session:s}}=await sb.auth.getSession();await session(s?.user||null);sb.auth.onAuthStateChange((_event,s)=>session(s?.user||null)); }
  init();
})();
