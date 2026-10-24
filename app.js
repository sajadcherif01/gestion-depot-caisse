/* Dépôt & Caisse — client-only application. All database access is governed by RLS. */
(() => {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const today = () => new Date().toLocaleDateString('en-CA');
  const money = (n) => new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0)) + ' DH';
  const amount = (value) => Number(String(value ?? 0).replace(',', '.')) || 0;
  const isCash = (row) => !row.mode_paiement || row.mode_paiement === 'Cash';
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

  function render() { renderKpis(); renderSorties(); renderFlux(); renderMonthlyDashboard(); renderWeeklyDashboard(); renderClientPreview(); updateClientSuggestion(); icons(); }
  function ensureCashInterface() {
    const form = $('#flux-form');
    if (!form.elements.mode_paiement) {
      form.elements.montant.closest('div').insertAdjacentHTML('beforebegin', '<div><label class="label">Modalité de paiement</label><select name="mode_paiement" class="input" required><option>Cash</option><option>Chèque</option><option>LC</option></select><p class="mt-1 text-xs text-slate-500">Seul le Cash est comptabilisé dans la caisse.</p></div>');
    }
    if (!$('#monthly-dashboard')) {
      $('#caisse-panel').insertAdjacentHTML('beforeend', '<article id="monthly-dashboard" class="card mt-6 overflow-hidden"><div class="mb-4"><p class="text-sm font-semibold text-brand-700">SUIVI MENSUEL</p><h3 id="monthly-title" class="section-title mt-1">Tableau mensuel</h3></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Sorties stock</th><th>Entrées</th><th>Dépenses</th><th>Net</th></tr></thead><tbody id="monthly-body"></tbody><tfoot><tr><td class="table-total-label">Total du mois</td><td id="monthly-sorties-total" class="table-total-value">0</td><td id="monthly-entrees-total" class="table-total-value text-emerald-700">0,00 DH</td><td id="monthly-depenses-total" class="table-total-value text-red-700">0,00 DH</td><td id="monthly-net-total" class="table-total-value">0,00 DH</td></tr></tfoot></table></div></article>');
    }
    if (!$('#weekly-dashboard')) {
      $('#monthly-dashboard').insertAdjacentHTML('afterend', '<article id="weekly-dashboard" class="card mt-6 overflow-hidden"><div class="mb-4"><p class="text-sm font-semibold text-brand-700">SUIVI HEBDOMADAIRE</p><h3 id="weekly-title" class="section-title mt-1">Récapitulatif hebdomadaire</h3><p class="mt-1 text-sm text-slate-500">Du lundi au dimanche — montants Cash uniquement.</p></div><div class="table-wrap"><table><thead><tr><th>Jour</th><th>Sorties stock</th><th>Entrées</th><th>Dépenses</th><th>Net</th></tr></thead><tbody id="weekly-body"></tbody><tfoot><tr><td class="table-total-label">Total de la semaine</td><td id="weekly-sorties-total" class="table-total-value">0</td><td id="weekly-entrees-total" class="table-total-value text-emerald-700">0,00 DH</td><td id="weekly-depenses-total" class="table-total-value text-red-700">0,00 DH</td><td id="weekly-net-total" class="table-total-value">0,00 DH</td></tr></tfoot></table></div></article>');
    }
  }
  function renderKpis() {
    const d = activeDate(); const daySorties = sorties.filter(x => x.date_operation === d); const dayFlux = flux.filter(x => x.date_operation === d);
    const qty = daySorties.reduce((a, x) => a + Number(x.quantite), 0);
    const entree = dayFlux.filter(x => x.type_flux === 'entree' && isCash(x)).reduce((a, x) => a + amount(x.montant), 0);
    const depense = dayFlux.filter(x => x.type_flux === 'depense' && isCash(x)).reduce((a, x) => a + amount(x.montant), 0);
    $('#kpis').innerHTML = [
      ['package-open','Total articles sortis', `${qty} article${qty !== 1 ? 's' : ''}`, 'bg-blue-50 text-blue-700'],
      ['users','Clients servis', `${new Set(daySorties.map(x => x.client_nom)).size} client(s)`, 'bg-amber-50 text-amber-700'],
      ['arrow-down-left','Entrées Cash', money(entree), 'bg-emerald-50 text-emerald-700'],
      ['wallet','Dépenses Cash / net', `${money(depense)} <span class="block pt-1 text-xs">Net Cash : ${money(entree - depense)}</span>`, 'bg-red-50 text-red-700']
    ].map(([i, label, value, c]) => `<article class="card flex items-start justify-between"><div><p class="text-sm font-semibold text-slate-500">${label}</p><p class="mt-2 text-xl font-bold">${value}</p></div><div class="grid h-10 w-10 place-items-center rounded-xl ${c}"><i data-lucide="${i}" class="h-5"></i></div></article>`).join('');
  }
  function actions(type, id) { return `<div class="flex flex-wrap gap-2"><button class="action-link" data-edit="${type}" data-id="${id}">Modifier</button><button class="action-link action-delete" data-delete="${type}" data-id="${id}">Supprimer</button></div>`; }
  function groupStockRows(rows) { const groups = new Map(); rows.forEach(row => { const key = `${row.client_nom}\u0000${row.ville}`; if (!groups.has(key)) groups.set(key, { client: row.client_nom, ville: row.ville, rows: [] }); groups.get(key).rows.push(row); }); return [...groups.values()]; }
  function renderSorties() { const rows = sorties.filter(x => x.date_operation === activeDate()); const groups = groupStockRows(rows); $('#sorties-body').innerHTML = rows.length ? groups.flatMap(group => group.rows.map((x, index) => `<tr><td>${escape(x.date_operation)}</td>${index === 0 ? `<td rowspan="${group.rows.length}" class="align-middle font-bold text-brand-700">${escape(group.client)}<span class="mt-1 block text-xs font-medium text-slate-500">${escape(group.ville)}</span></td>` : ''}<td>${escape(x.produit_nom)}</td><td>${escape(x.couleur)}<span class="block text-xs text-slate-500">${escape(x.mesure)}</span></td><td class="font-bold">${x.quantite}</td><td>${actions('sortie', x.id)}</td></tr>`)).join('') : empty('Aucune sortie pour cette date.', 6); $('#sorties-total').textContent = rows.reduce((total, x) => total + Number(x.quantite), 0); }
  function renderFlux() {
    const rows = flux.filter(x => x.date_operation === activeDate());
    const row = (x) => `<tr class="${isCash(x) ? '' : 'bg-slate-50/70'}"><td>${escape(x.date_operation)}</td><td class="font-semibold">${escape(x.categorie)}<span class="mt-1 block w-fit rounded-full px-2 py-0.5 text-xs font-medium ${isCash(x) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">${escape(x.mode_paiement || 'Cash')}${isCash(x) ? '' : ' · Hors caisse'}</span></td><td class="max-w-xs whitespace-normal text-slate-600">${escape(x.description || '—')}</td><td class="${x.type_flux === 'entree' ? 'money-positive' : 'money-negative'}">${x.type_flux === 'entree' ? '+' : '−'} ${money(amount(x.montant))}</td><td>${actions('flux', x.id)}</td></tr>`;
    const entree = rows.filter(x => x.type_flux === 'entree');
    const depense = rows.filter(x => x.type_flux === 'depense');
    $('#entrees-body').innerHTML = entree.length ? entree.map(row).join('') : empty('Aucune entrée pour cette date.', 5);
    $('#depenses-body').innerHTML = depense.length ? depense.map(row).join('') : empty('Aucune dépense pour cette date.', 5);
    const totalEntrees = entree.filter(isCash).reduce((total, x) => total + amount(x.montant), 0);
    const totalDepenses = depense.filter(isCash).reduce((total, x) => total + amount(x.montant), 0);
    const ecart = totalEntrees - totalDepenses;
    $('#entrees-total').textContent = money(totalEntrees);
    $('#depenses-total').textContent = money(totalDepenses);
    $('#entrees-total').closest('tr').firstElementChild.textContent = 'Total Cash des entrées';
    $('#depenses-total').closest('tr').firstElementChild.textContent = 'Total Cash des dépenses';
    const solde = $('#solde-caisse');
    solde.className = `mt-4 rounded-xl border px-4 py-4 text-base font-bold ${ecart >= 0 ? 'border-emerald-300 bg-emerald-100 text-emerald-950' : 'border-red-300 bg-red-100 text-red-950'}`;
    solde.innerHTML = `L’entrée nette de la caisse de ce jour : <strong class="ml-2 text-xl ${ecart >= 0 ? 'text-emerald-800' : 'text-red-800'}">${money(ecart)}</strong>`;
  }
  function renderMonthlyDashboard() {
    const month = activeDate().slice(0, 7);
    const dates = [...new Set([...sorties, ...flux].filter(x => x.date_operation?.startsWith(month)).map(x => x.date_operation))].sort();
    const monthlyRows = dates.map(date => {
      const sortiesJour = sorties.filter(x => x.date_operation === date).reduce((total, x) => total + Number(x.quantite), 0);
      const entreesJour = flux.filter(x => x.date_operation === date && x.type_flux === 'entree' && isCash(x)).reduce((total, x) => total + amount(x.montant), 0);
      const depensesJour = flux.filter(x => x.date_operation === date && x.type_flux === 'depense' && isCash(x)).reduce((total, x) => total + amount(x.montant), 0);
      return { date, sorties: sortiesJour, entrees: entreesJour, depenses: depensesJour, net: entreesJour - depensesJour };
    });
    const monthLabel = new Intl.DateTimeFormat('fr-MA', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
    $('#monthly-title').textContent = `Tableau mensuel Cash — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`;
    $('#monthly-body').innerHTML = monthlyRows.length ? monthlyRows.map(x => `<tr><td class="font-semibold">${escape(x.date)}</td><td>${x.sorties}</td><td class="money-positive">${money(x.entrees)}</td><td class="money-negative">${money(x.depenses)}</td><td class="${x.net >= 0 ? 'money-positive' : 'money-negative'}">${money(x.net)}</td></tr>`).join('') : empty('Aucune opération pour ce mois.', 5);
    const totals = monthlyRows.reduce((total, x) => ({ sorties: total.sorties + x.sorties, entrees: total.entrees + x.entrees, depenses: total.depenses + x.depenses }), { sorties: 0, entrees: 0, depenses: 0 });
    $('#monthly-sorties-total').textContent = totals.sorties;
    $('#monthly-entrees-total').textContent = money(totals.entrees);
    $('#monthly-depenses-total').textContent = money(totals.depenses);
    $('#monthly-net-total').textContent = money(totals.entrees - totals.depenses);
    $('#monthly-net-total').className = `table-total-value ${totals.entrees - totals.depenses >= 0 ? 'text-emerald-700' : 'text-red-700'}`;
  }
  function renderWeeklyDashboard() {
    const selected = new Date(`${activeDate()}T12:00:00`);
    const weekday = (selected.getDay() + 6) % 7;
    const monday = new Date(selected); monday.setDate(selected.getDate() - weekday);
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday); date.setDate(monday.getDate() + index);
      return date.toLocaleDateString('en-CA');
    });
    const label = new Intl.DateTimeFormat('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' });
    $('#weekly-title').textContent = `Semaine du ${label.format(monday)} au ${label.format(new Date(`${dates[6]}T12:00:00`))}`;
    const rows = dates.map(date => {
      const stock = sorties.filter(x => x.date_operation === date).reduce((sum, x) => sum + Number(x.quantite), 0);
      const entrees = flux.filter(x => x.date_operation === date && x.type_flux === 'entree' && isCash(x)).reduce((sum, x) => sum + amount(x.montant), 0);
      const depenses = flux.filter(x => x.date_operation === date && x.type_flux === 'depense' && isCash(x)).reduce((sum, x) => sum + amount(x.montant), 0);
      return { date, stock, entrees, depenses, net: entrees - depenses };
    });
    $('#weekly-body').innerHTML = rows.map(x => `<tr><td class="font-semibold">${new Intl.DateTimeFormat('fr-MA', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date(`${x.date}T12:00:00`))}</td><td>${x.stock}</td><td class="money-positive">${money(x.entrees)}</td><td class="money-negative">${money(x.depenses)}</td><td class="${x.net >= 0 ? 'money-positive' : 'money-negative'}">${money(x.net)}</td></tr>`).join('');
    const totals = rows.reduce((total, x) => ({ stock: total.stock + x.stock, entrees: total.entrees + x.entrees, depenses: total.depenses + x.depenses }), { stock: 0, entrees: 0, depenses: 0 });
    $('#weekly-sorties-total').textContent = totals.stock;
    $('#weekly-entrees-total').textContent = money(totals.entrees);
    $('#weekly-depenses-total').textContent = money(totals.depenses);
    $('#weekly-net-total').textContent = money(totals.entrees - totals.depenses);
    $('#weekly-net-total').className = `table-total-value ${totals.entrees - totals.depenses >= 0 ? 'text-emerald-700' : 'text-red-700'}`;
  }
  function empty(text, span) { return `<tr><td colspan="${span}" class="py-10 text-center text-slate-500">${text}</td></tr>`; }
  function clients() { const m = new Map(); sorties.forEach(s => { const c = m.get(s.client_nom) || { name:s.client_nom, city:s.ville, movements:0, qty:0, last:s.date_operation }; c.movements++; c.qty += Number(s.quantite); if (s.date_operation > c.last) c.last=s.date_operation; c.city ||= s.ville; m.set(s.client_nom, c); }); return [...m.values()].sort((a,b) => b.last.localeCompare(a.last)); }
  function renderClientPreview() { const cs = clients(), moves=cs.reduce((a,c)=>a+c.movements,0), qty=cs.reduce((a,c)=>a+c.qty,0); $('#client-summary-preview').innerHTML = `<div class="rounded-xl bg-slate-50 p-3"><p class="text-xs font-bold uppercase text-slate-500">Clients suivis</p><p class="mt-1 text-xl font-bold">${cs.length}</p></div><div class="rounded-xl bg-amber-50 p-3"><p class="text-xs font-bold uppercase text-amber-700">Mouvements enregistrés</p><p class="mt-1 text-xl font-bold text-amber-800">${moves}</p></div><div class="rounded-xl bg-brand-50 p-3"><p class="text-xs font-bold uppercase text-brand-700">Articles sortis</p><p class="mt-1 text-xl font-bold text-brand-700">${qty}</p></div>`; }
  function renderClients() { const cs = clients(); $('#clients-body').innerHTML = cs.length ? cs.map(c => `<tr><td class="font-semibold">${escape(c.name)}</td><td>${escape(c.city)}</td><td>${c.movements}</td><td class="font-bold text-brand-700">${c.qty}</td><td>${escape(c.last)}</td></tr>`).join('') : empty('Aucun client enregistré.', 5); icons(); }

  function setSortieEdit(row) { const f = $('#sortie-form'); Object.entries(row).forEach(([k,v]) => { const e = f.elements[k]; if(e) e.value = v; }); $('#sortie-id').value=row.id; $('#sortie-submit').textContent='Mettre à jour'; $('#sortie-edit-label').classList.remove('hidden'); $('#sortie-cancel').classList.remove('hidden'); window.scrollTo({ top: 0, behavior:'smooth' }); }
  function setFluxEdit(row) { const f = $('#flux-form'); Object.entries(row).forEach(([k,v]) => { const e = f.elements[k]; if(e && v != null) e.value=v; }); $('#flux-id').value=row.id; $('#flux-submit').textContent='Mettre à jour'; $('#flux-edit-label').classList.remove('hidden'); $('#flux-cancel').classList.remove('hidden'); window.scrollTo({ top:0, behavior:'smooth' }); }
  async function saveSortie(e) { e.preventDefault(); const f=e.currentTarget, d=formData(f), id=$('#sortie-id').value; const payload={...d, quantite:Number(d.quantite), user_id:currentUser.id}; const q=id ? sb.from('sorties_stock').update(payload).eq('id',id) : sb.from('sorties_stock').insert(payload); const {error}=await q; if(error)return toast(error.message,true); toast(id?'Sortie mise à jour.':'Sortie enregistrée.'); $('#sortie-id').value=''; f.quantite.value=''; f.quantite.focus(); $('#sortie-submit').textContent='Enregistrer'; $('#sortie-edit-label').classList.add('hidden'); $('#sortie-cancel').classList.add('hidden'); loadData(); }
  async function saveFlux(e) { e.preventDefault(); const f=e.currentTarget,d=formData(f),id=$('#flux-id').value; const payload={...d,montant:Number(d.montant),user_id:currentUser.id}; const request = (data) => id ? sb.from('flux_monetaire').update(data).eq('id',id) : sb.from('flux_monetaire').insert(data); let {error}=await request(payload);
    // Compatibilité temporaire avec les anciennes bases où la colonne n'a pas encore été ajoutée.
    if (error?.message?.includes("mode_paiement") && d.mode_paiement === 'Cash') { const legacyPayload={...payload}; delete legacyPayload.mode_paiement; ({error}=await request(legacyPayload)); if (!error) toast('Opération Cash enregistrée. Mettez à jour Supabase pour activer Chèque et LC.', false); }
    if(error)return toast(error.message,true); if (!id || d.mode_paiement !== 'Cash') toast(id?'Opération mise à jour.':'Opération enregistrée.'); resetForm(f,'flux-id'); $('#flux-submit').textContent='Enregistrer'; $('#flux-edit-label').classList.add('hidden'); $('#flux-cancel').classList.add('hidden'); loadData(); }
  async function remove(type,id) { if(!confirm('Supprimer définitivement cette ligne ?'))return; const {error}=await sb.from(type==='sortie'?'sorties_stock':'flux_monetaire').delete().eq('id',id); if(error)return toast(error.message,true); toast('Ligne supprimée.'); loadData(); }
  function exportCsv(type) { const rows=type==='sorties'?sorties.filter(x=>x.date_operation===activeDate()):flux.filter(x=>x.date_operation===activeDate()); const cols=type==='sorties'?[['date_operation','Date'],['client_nom','Client'],['ville','Ville'],['produit_nom','Produit'],['couleur','Couleur'],['mesure','Mesure'],['quantite','Quantité']]:[['date_operation','Date'],['type_flux','Type'],['categorie','Catégorie'],['mode_paiement','Mode de règlement'],['description','Description'],['montant','Montant']]; const csv=[cols.map(c=>c[1]),...rows.map(r=>cols.map(([k])=>r[k]??''))].map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n'); const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`${type}-${activeDate()}.csv`;a.click();URL.revokeObjectURL(a.href); }
  function printStockTable() { const rows = sorties.filter(x => x.date_operation === activeDate()); const groups = groupStockRows(rows); const body = rows.length ? groups.flatMap(group => group.rows.map((x, index) => `<tr><td>${escape(x.date_operation)}</td>${index === 0 ? `<td rowspan="${group.rows.length}">${escape(group.client)} / ${escape(group.ville)}</td>` : ''}<td>${escape(x.produit_nom)}</td><td>${escape(x.couleur)} — ${escape(x.mesure)}</td><td>${x.quantite}</td></tr>`)).join('') : `<tr><td colspan="5">Aucune sortie pour cette date.</td></tr>`; const total = rows.reduce((sum, x) => sum + Number(x.quantite), 0); return `<table><thead><tr><th>Date</th><th>Client / Ville</th><th>Produit</th><th>Détails</th><th>Qté</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="4">Total des articles sortis</td><td>${total}</td></tr></tfoot></table>`; }
  function printCashTable(rows, title, totalLabel) { const body = rows.length ? rows.map(x => `<tr><td>${escape(x.date_operation)}</td><td>${escape(x.categorie)}</td><td>${escape(x.mode_paiement || 'Cash')}</td><td>${escape(x.description || '—')}</td><td>${money(amount(x.montant))}</td></tr>`).join('') : `<tr><td colspan="5">Aucune opération pour cette date.</td></tr>`; const total = rows.filter(isCash).reduce((sum, x) => sum + amount(x.montant), 0); return `<h2>${title}</h2><table><thead><tr><th>Date</th><th>Catégorie</th><th>Mode</th><th>Description</th><th>Montant</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="4">${totalLabel} (Cash)</td><td>${money(total)}</td></tr></tfoot></table>`; }
  function printReport(type) { const dayFlux = flux.filter(x => x.date_operation === activeDate()); const entries = dayFlux.filter(x => x.type_flux === 'entree'); const expenses = dayFlux.filter(x => x.type_flux === 'depense'); const totalEntries = entries.filter(isCash).reduce((sum, x) => sum + amount(x.montant), 0); const totalExpenses = expenses.filter(isCash).reduce((sum, x) => sum + amount(x.montant), 0); const net = totalEntries - totalExpenses; const content = type === 'sorties' ? printStockTable() : `${printCashTable(entries, 'Entrées monétaires', 'Total des entrées')}${printCashTable(expenses, 'Dépenses / charges', 'Total des dépenses')}<p class="net ${net < 0 ? 'negative' : ''}">L’entrée nette de la caisse de ce jour (Cash uniquement) : ${money(net)}</p>`; const w=window.open('','_blank');w.document.write(`<!doctype html><html lang="fr"><head><title>Rapport ${activeDate()}</title><style>body{font-family:Arial;padding:24px;color:#18212f}table{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 28px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f1f5f9}tfoot td{background:#f8fafc;font-weight:bold}h1{color:#0f766e}h2{margin-top:28px;color:#334155}.net{border:2px solid #34d399;background:#d1fae5;padding:14px;font-size:16px;font-weight:800;color:#065f46}.net.negative{border-color:#f87171;background:#fee2e2;color:#991b1b}</style></head><body><h1>${type==='sorties'?'Sorties de stock':'Caisse quotidienne'} — ${activeDate()}</h1>${content}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close(); }

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
  async function init() { icons(); $('#selected-date').value=today(); ensureCashInterface(); listen(); if(!configured){$('#config-warning').classList.remove('hidden');return;} const {data:{session:s}}=await sb.auth.getSession();await session(s?.user||null);sb.auth.onAuthStateChange((_event,s)=>session(s?.user||null)); }
  init();
})();
