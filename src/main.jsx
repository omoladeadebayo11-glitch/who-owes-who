import React,{useEffect,useMemo,useState}from'react';
import{createRoot}from'react-dom/client';
import{createClient}from'@supabase/supabase-js';
import{Plus,Users,ReceiptText,WalletCards,CheckCircle2,Trash2,ChevronLeft,CalendarDays,Pencil,History,Settings,LogIn,Cloud,CloudOff,Bell,Copy,UserPlus,ChevronRight,X,Save,HandCoins}from'lucide-react';
import'./style.css';

const MAX_AMOUNT=1_000_000_000;
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:2}).format(Number(n)||0);
const fmtDate=d=>new Intl.DateTimeFormat('en-NG',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${d}T12:00:00`));
const supabaseUrl=import.meta.env.VITE_SUPABASE_URL;
const supabaseKey=import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase=supabaseUrl&&supabaseKey?createClient(supabaseUrl,supabaseKey):null;

const fresh=()=>({version:2,groups:[{id:'local-group',name:'My Group',inviteCode:'LOCAL',people:[{id:'me',name:'You',linked:true}],expenses:[],payments:[]}],activeGroupId:'local-group',settings:{reminders:false,reminderTime:'19:00'}});
const normalize=d=>{if(!d?.version||d.version<2)return fresh();return d};
const loadLocal=()=>{try{return normalize(JSON.parse(localStorage.getItem('wow-v2')))}catch{return fresh()}};

function calculate(group){
  const people=group.people||[], expenses=group.expenses||[], payments=(group.payments||[]).filter(p=>p.status!=='pending');
  const pair={}; const obligations=[];
  const add=(from,to,amount,meta)=>{if(from===to||amount<=0)return;const k=`${from}|${to}`;pair[k]=(pair[k]||0)+amount;if(meta)obligations.push({from,to,amount,...meta})};
  expenses.forEach(e=>{const members=e.members||[];if(!members.length)return;const share=Number(e.amount)/members.length;members.forEach(id=>{if(id!==e.payer)add(id,e.payer,share,{expenseId:e.id,date:e.date,title:e.title})})});
  payments.forEach(p=>add(p.to,p.from,Number(p.amount),null));
  const ids=people.map(p=>p.id), net=[];
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const a=ids[i],b=ids[j],ab=pair[`${a}|${b}`]||0,ba=pair[`${b}|${a}`]||0,d=ab-ba;
    if(Math.abs(d)>.009)net.push(d>0?{from:a,to:b,amount:d}:{from:b,to:a,amount:-d});
  }
  // Direct payments are applied FIFO to same-direction expense obligations for open-bill display.
  const remPayments={};
  payments.forEach(p=>{const k=`${p.from}|${p.to}`;remPayments[k]=(remPayments[k]||0)+Number(p.amount)});
  const openByExpense={};
  obligations.sort((a,b)=>a.date.localeCompare(b.date)).forEach(o=>{
    const k=`${o.from}|${o.to}`;let left=o.amount,available=remPayments[k]||0;
    const used=Math.min(left,available);left-=used;remPayments[k]=available-used;
    if(left>.009)openByExpense[o.expenseId]=(openByExpense[o.expenseId]||0)+left;
  });
  return{net,openByExpense};
}

function App(){
  const[data,setData]=useState(loadLocal);
  const[page,setPage]=useState('home');
  const[session,setSession]=useState(null);
  const[authReady,setAuthReady]=useState(!supabase);
  const[cloudBusy,setCloudBusy]=useState(false);
  const[toast,setToast]=useState('');
  const group=data.groups.find(g=>g.id===data.activeGroupId)||data.groups[0]||fresh().groups[0];
  const calc=useMemo(()=>calculate(group),[group]);
  const person=id=>group.people.find(p=>p.id===id)?.name||'Unknown';
  const openExpenses=group.expenses.filter(e=>(calc.openByExpense[e.id]||0)>.009);

  // Signed-out work belongs to this browser only. Signed-in work is loaded from Supabase.
  useEffect(()=>{if(authReady&&!session)localStorage.setItem('wow-v2',JSON.stringify(data))},[data,session,authReady]);
  useEffect(()=>{
    if(!supabase)return;
    supabase.auth.getSession().then(({data:a})=>{setSession(a.session);setAuthReady(true)});
    const{data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setAuthReady(true)});
    return()=>listener.subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!authReady)return;
    if(session){loadCloudWorkspace(true)}
    else{setData(loadLocal());setPage('home')}
  },[authReady,session?.user?.id]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),2400);return()=>clearTimeout(t)},[toast]);
  useEffect(()=>{
    if(!data.settings.reminders||!('Notification'in window))return;
    const myPerson=group.people.find(p=>p.linked)||group.people.find(p=>p.id==='me');
    const debt=myPerson&&calc.net.find(x=>x.from===myPerson.id);
    if(!debt)return;
    const key=`wow-reminded-${today()}`;
    if(localStorage.getItem(key))return;
    const now=new Date(),[h,m]=data.settings.reminderTime.split(':').map(Number);
    const target=new Date();target.setHours(h,m,0,0);
    const delay=Math.max(1000,target-now);
    const timer=setTimeout(()=>{if(Notification.permission==='granted'){new Notification('Who Owes Who?',{body:`You still owe ${person(debt.to)} ${money(debt.amount)}.`});localStorage.setItem(key,'1')}},delay);
    return()=>clearTimeout(timer);
  },[data.settings,calc.net,group.people]);

  const go=p=>{setPage(p);window.scrollTo({top:0,behavior:'smooth'})};

  async function fetchCloudGroups(){
    const{data:members,error}=await supabase.from('group_members').select('group_id,display_name,role,groups(id,name,invite_code,created_at)').eq('user_id',session.user.id);
    if(error)throw error;
    const groups=[];
    for(const m of members||[]){
      const gid=m.group_id;
      const[{data:people,error:pe},{data:expenses,error:ee},{data:em,error:eme},{data:payments,error:pae}]=await Promise.all([
        supabase.from('people').select('*').eq('group_id',gid).order('created_at'),
        supabase.from('expenses').select('*').eq('group_id',gid).order('expense_date',{ascending:false}),
        supabase.from('expense_members').select('expense_id,person_id'),
        supabase.from('payments').select('*').eq('group_id',gid).order('payment_date',{ascending:false})
      ]);
      if(pe||ee||eme||pae)throw(pe||ee||eme||pae);
      groups.push({id:gid,name:m.groups.name,inviteCode:m.groups.invite_code,people:(people||[]).map(p=>({id:p.id,name:p.name,linked:p.linked_user_id===session.user.id})),expenses:(expenses||[]).map(e=>({id:e.id,title:e.title,amount:Number(e.amount),date:e.expense_date,payer:e.payer_person_id,members:(em||[]).filter(x=>x.expense_id===e.id).map(x=>x.person_id)})),payments:(payments||[]).map(p=>({id:p.id,from:p.from_person_id,to:p.to_person_id,amount:Number(p.amount),date:p.payment_date,note:p.note||'',status:p.status}))});
    }
    return groups;
  }

  async function loadCloudWorkspace(createIfEmpty=false){
    if(!supabase||!session)return;
    setCloudBusy(true);
    try{
      let groups=await fetchCloudGroups();
      if(!groups.length&&createIfEmpty){
        const display=session.user.user_metadata?.display_name||'You';
        const{error}=await supabase.rpc('create_group_with_me',{group_name:'My Group',my_name:display});
        if(error)throw error;
        groups=await fetchCloudGroups();
      }
      if(groups.length)setData(d=>({version:2,groups,activeGroupId:groups.some(g=>g.id===d.activeGroupId)?d.activeGroupId:groups[0].id,settings:d.settings||fresh().settings}));
      setToast('Cloud workspace loaded.');
    }catch(e){setToast(e.message||'Cloud sync failed.')}finally{setCloudBusy(false)}
  }

  async function persistCloudGroup(next,prev){
    if(!supabase||!session)return;
    try{
      if(next.name!==prev.name){const{error}=await supabase.from('groups').update({name:next.name}).eq('id',next.id);if(error)throw error}
      const peopleRows=next.people.map(p=>({id:p.id,group_id:next.id,linked_user_id:p.linked?session.user.id:null,name:p.name}));
      if(peopleRows.length){const{error}=await supabase.from('people').upsert(peopleRows);if(error)throw error}
      const removedPeople=prev.people.filter(p=>!next.people.some(x=>x.id===p.id)).map(p=>p.id);
      if(removedPeople.length){const{error}=await supabase.from('people').delete().in('id',removedPeople);if(error)throw error}

      const expRows=next.expenses.map(e=>({id:e.id,group_id:next.id,title:e.title,amount:e.amount,expense_date:e.date,payer_person_id:e.payer,created_by:session.user.id}));
      if(expRows.length){const{error}=await supabase.from('expenses').upsert(expRows);if(error)throw error}
      const removedExp=prev.expenses.filter(e=>!next.expenses.some(x=>x.id===e.id)).map(e=>e.id);
      if(removedExp.length){const{error}=await supabase.from('expenses').delete().in('id',removedExp);if(error)throw error}
      for(const e of next.expenses){
        const{error:de}=await supabase.from('expense_members').delete().eq('expense_id',e.id);if(de)throw de;
        if(e.members.length){const{error:ie}=await supabase.from('expense_members').insert(e.members.map(pid=>({expense_id:e.id,person_id:pid})));if(ie)throw ie}
      }

      const payRows=next.payments.map(p=>({id:p.id,group_id:next.id,from_person_id:p.from,to_person_id:p.to,amount:p.amount,payment_date:p.date,note:p.note||'',status:p.status||'confirmed',created_by:session.user.id}));
      if(payRows.length){const{error}=await supabase.from('payments').upsert(payRows);if(error)throw error}
      const removedPay=prev.payments.filter(p=>!next.payments.some(x=>x.id===p.id)).map(p=>p.id);
      if(removedPay.length){const{error}=await supabase.from('payments').delete().in('id',removedPay);if(error)throw error}
    }catch(e){setToast(`Cloud save failed: ${e.message}`);loadCloudWorkspace(false)}
  }

  const patchGroup=fn=>setData(d=>{
    const prev=d.groups.find(g=>g.id===d.activeGroupId);if(!prev)return d;
    const next=fn(prev);
    if(session)persistCloudGroup(next,prev);
    return{...d,groups:d.groups.map(g=>g.id===d.activeGroupId?next:g)};
  });

  async function importLocalWorkspace(){
    if(!session)return;
    const local=loadLocal(),src=local.groups.find(g=>g.id===local.activeGroupId)||local.groups[0];
    const hasWork=src&&(src.expenses.length||src.payments.length||src.people.length>1||src.name!=='My Group');
    if(!hasWork)return setToast('There is no local work to import.');
    if(!confirm('Copy your signed-out local expenses into this cloud account? Your local copy will stay on this device too.'))return;
    setCloudBusy(true);
    try{
      const current=data.groups.find(g=>g.id===data.activeGroupId);
      const me=current.people.find(p=>p.linked)||current.people[0];
      const idMap={};
      const localMe=src.people.find(p=>p.id==='me')||src.people[0];idMap[localMe.id]=me.id;
      const added=[];
      for(const p of src.people.filter(p=>p.id!==localMe.id)){const id=uid();idMap[p.id]=id;added.push({id,name:p.name,linked:false})}
      const migrated={...current,name:src.name||current.name,people:[me,...added],expenses:src.expenses.map(e=>({id:uid(),title:e.title,amount:e.amount,date:e.date,payer:idMap[e.payer],members:e.members.map(x=>idMap[x]).filter(Boolean)})),payments:src.payments.map(p=>({id:uid(),from:idMap[p.from],to:idMap[p.to],amount:p.amount,date:p.date,note:p.note,status:p.status||'confirmed'})).filter(p=>p.from&&p.to)};
      await persistCloudGroup(migrated,current);setData(d=>({...d,groups:d.groups.map(g=>g.id===current.id?migrated:g)}));setToast('Local workspace copied to your account.');
    }catch(e){setToast(e.message||'Import failed.')}finally{setCloudBusy(false)}
  }

  if(!authReady)return <div className="app"><section className="card notice"><Cloud/><b>Loading your workspace…</b></section></div>;
  return <div className="app">
    {toast&&<div className="toast">{toast}</div>}
    <header>
      {page!=='home'?<button className="icon" onClick={()=>go('home')} aria-label="Back"><ChevronLeft/></button>:<div className="mark">₦</div>}
      <div className="headGrow"><small>WHO OWES WHO?</small><h1>{group.name}</h1></div>
      <button className="cloudPill" onClick={()=>go('account')}>{session?<><Cloud/> Cloud</>:<><CloudOff/> Local</>}</button>
    </header>

    {page==='home'&&<>
      <section className="hero"><span>GROUP BALANCE</span><strong>{calc.net.length?`${calc.net.length} balance${calc.net.length>1?'s':''} to settle`:'All settled up'}</strong><p>{group.people.length} people · {openExpenses.length} unsettled bill{openExpenses.length===1?'':'s'}</p></section>
      <div className="grid"><button className="action primary" onClick={()=>go('add')}><Plus/><b>Add expense</b><span>Split a new bill</span></button><button className="action" onClick={()=>go('people')}><Users/><b>People</b><span>Manage group</span></button></div>
      <div className="quick"><button onClick={()=>go('history')}><History/> History</button><button onClick={()=>go('settings')}><Settings/> Settings</button></div>
      <h2>Who owes who?</h2>
      <section className="card">{calc.net.length?calc.net.map(s=><button className="settle" key={`${s.from}-${s.to}`} onClick={()=>go(`debt:${s.from}:${s.to}`)}><div><b>{person(s.from)}</b><span> owes </span><b>{person(s.to)}</b></div><strong>{money(s.amount)}</strong><ChevronRight/></button>):<div className="empty"><CheckCircle2/><b>Nobody owes anything</b><span>Everything is settled.</span></div>}</section>
      <div className="titleRow"><h2>Unsettled expenses</h2><ReceiptText/></div>
      <section className="card">{openExpenses.length?openExpenses.map(e=><ExpenseRow key={e.id} e={e} person={person} outstanding={calc.openByExpense[e.id]} onClick={()=>go(`expense:${e.id}`)}/>):<div className="empty compact"><WalletCards/><b>No unsettled expenses</b><span>Paid bills move to History.</span></div>}</section>
    </>}
    {page==='add'&&<ExpenseForm group={group} patchGroup={patchGroup} onDone={()=>go('home')} setToast={setToast}/>} 
    {page==='people'&&<People group={group} patchGroup={patchGroup} setToast={setToast}/>} 
    {page==='history'&&<HistoryPage group={group} calc={calc} person={person}/>} 
    {page==='settings'&&<SettingsPage data={data} setData={setData} group={group} patchGroup={patchGroup} setToast={setToast}/>} 
    {page==='account'&&<AccountPage supabase={supabase} session={session} cloudBusy={cloudBusy} cloudSync={()=>loadCloudWorkspace(false)} importLocalWorkspace={importLocalWorkspace} setToast={setToast}/>} 
    {page.startsWith('debt:')&&<DebtPage page={page} group={group} calc={calc} person={person} patchGroup={patchGroup} setToast={setToast} onDone={()=>go('home')}/>} 
    {page.startsWith('expense:')&&<ExpenseDetail page={page} group={group} patchGroup={patchGroup} person={person} setToast={setToast} onDone={()=>go('home')}/>} 
    <footer>WHO OWES WHO? · {session?'cloud account connected':'local device workspace'}</footer>
  </div>
}
function ExpenseRow({e,person,outstanding,onClick}){
  return <button className="expense" onClick={onClick}><div className="receipt">₦</div><div className="grow"><b>{e.title}</b><span>{person(e.payer)} paid · {fmtDate(e.date)} · split {e.members.length} ways</span></div><div className="amountStack"><strong>{money(e.amount)}</strong>{outstanding>0&&<small>{money(outstanding)} open</small>}</div><ChevronRight/></button>
}

function ExpenseForm({group,patchGroup,onDone,setToast,editing}){
  const base=editing||{title:'',amount:'',payer:group.people[0]?.id||'',members:group.people.map(p=>p.id),date:today()};
  const[form,setForm]=useState({...base,amount:String(base.amount||'')});
  const toggle=id=>setForm(f=>({...f,members:f.members.includes(id)?f.members.filter(x=>x!==id):[...f.members,id]}));
  function save(e){
    e.preventDefault();const amount=Number(form.amount);
    if(!form.title.trim())return setToast('Add a description.');
    if(!Number.isFinite(amount)||amount<=0)return setToast('Enter a valid amount.');
    if(amount>MAX_AMOUNT)return setToast(`Maximum expense is ${money(MAX_AMOUNT)}.`);
    if(!form.payer||!form.members.length)return setToast('Choose a payer and at least one person.');
    const item={id:editing?.id||uid(),title:form.title.trim(),amount,date:form.date,payer:form.payer,members:form.members};
    patchGroup(g=>({...g,expenses:editing?g.expenses.map(x=>x.id===editing.id?item:x):[item,...g.expenses]}));setToast(editing?'Expense updated.':'Expense added.');onDone();
  }
  return <><h2>{editing?'Edit expense':'Add an expense'}</h2><form className="card form" onSubmit={save}>
    <label>WHAT WAS IT FOR?<input autoFocus placeholder="e.g. Rice & stew" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <div className="two"><label>AMOUNT (₦)<input inputMode="decimal" type="number" min="1" max={MAX_AMOUNT} step="0.01" placeholder="8500" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label>DATE<input type="date" value={form.date} max={today()} onChange={e=>setForm({...form,date:e.target.value})}/></label></div>
    <label>WHO PAID?<select value={form.payer} onChange={e=>setForm({...form,payer:e.target.value})}>{group.people.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
    <label>SPLIT BETWEEN</label><div className="chips">{group.people.map(p=><button type="button" className={form.members.includes(p.id)?'chip on':'chip'} onClick={()=>toggle(p.id)} key={p.id}>{p.name}</button>)}</div>
    {form.amount&&form.members.length>0&&<div className="preview">Each person's share <b>{money(Number(form.amount)/form.members.length)}</b></div>}
    <button className="submit"><Save/> {editing?'Save changes':'Split expense'}</button>
  </form></>
}

function People({group,patchGroup,setToast}){
  const[name,setName]=useState('');
  function add(e){e.preventDefault();const n=name.trim();if(!n)return;if(group.people.some(p=>p.name.toLowerCase()===n.toLowerCase()))return setToast('That person already exists.');patchGroup(g=>({...g,people:[...g.people,{id:uid(),name:n,linked:false}]}));setName('')}
  function rename(p){const n=prompt('New name',p.name)?.trim();if(!n||n===p.name)return;if(group.people.some(x=>x.id!==p.id&&x.name.toLowerCase()===n.toLowerCase()))return setToast('That name already exists.');patchGroup(g=>({...g,people:g.people.map(x=>x.id===p.id?{...x,name:n}:x)}))}
  function remove(p){const used=group.expenses.some(e=>e.payer===p.id||e.members.includes(p.id))||group.payments.some(x=>x.from===p.id||x.to===p.id);if(used)return setToast('This person has history, so rename them instead of deleting.');if(!confirm(`Remove ${p.name}?`))return;patchGroup(g=>({...g,people:g.people.filter(x=>x.id!==p.id)}))}
  return <><h2>People</h2><section className="card people">{group.people.map(p=><div className="person" key={p.id}><div className="avatar">{p.name[0]?.toUpperCase()}</div><b>{p.name}</b>{p.linked&&<span className="linked">Linked</span>}<button className="mini" onClick={()=>rename(p)}><Pencil/></button>{group.people.length>1&&<button className="mini danger" onClick={()=>remove(p)}><Trash2/></button>}</div>)}</section><form className="addPerson" onSubmit={add}><input placeholder="Person's name" value={name} onChange={e=>setName(e.target.value)}/><button><Plus/> Add</button></form><p className="hint">People with expense/payment history are protected from deletion so old records stay accurate.</p></>
}

function DebtPage({page,group,calc,person,patchGroup,setToast,onDone}){
  const[,from,to]=page.split(':');const debt=calc.net.find(x=>x.from===from&&x.to===to);const[amount,setAmount]=useState(debt?String(debt.amount.toFixed(2)):'');const[date,setDate]=useState(today());
  if(!debt)return <div className="empty"><CheckCircle2/><b>This balance is already settled.</b><button className="submit" onClick={onDone}>Back home</button></div>;
  const related=group.expenses.filter(e=>{const share=e.amount/e.members.length;return (e.payer===to&&e.members.includes(from)&&from!==to)||(e.payer===from&&e.members.includes(to)&&to!==from)});
  function pay(e){e.preventDefault();const a=Number(amount);if(!a||a<=0||a>debt.amount+.01)return setToast('Enter an amount up to the outstanding balance.');patchGroup(g=>({...g,payments:[{id:uid(),from,to,amount:a,date,note:'Settlement',status:'confirmed'},...g.payments]}));setToast(a+0.01>=debt.amount?'Balance settled.':'Partial payment recorded.');onDone()}
  return <><h2>Balance details</h2><section className="hero debtHero"><span>RUNNING NET BALANCE</span><strong>{person(from)} owes {person(to)}</strong><p className="bigMoney">{money(debt.amount)}</p></section><h2>Expenses behind this balance</h2><section className="card">{related.length?related.map(e=><div className="breakdown" key={e.id}><div><b>{e.title}</b><span>{fmtDate(e.date)}</span></div><strong>{money(e.amount/e.members.length)}</strong></div>):<div className="empty compact">Balance includes previous payments/offsets.</div>}</section><h2>Record payment</h2><form className="card form" onSubmit={pay}><div className="two"><label>AMOUNT (₦)<input type="number" min="0.01" step="0.01" max={debt.amount} value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>DATE<input type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)}/></label></div><div className="payChoices"><button type="button" onClick={()=>setAmount(String(debt.amount.toFixed(2)))}>Full {money(debt.amount)}</button><button type="button" onClick={()=>setAmount('')}>Partial</button></div><button className="submit"><HandCoins/> Record payment</button></form></>
}

function ExpenseDetail({page,group,patchGroup,person,setToast,onDone}){
  const id=page.split(':')[1],e=group.expenses.find(x=>x.id===id);const[edit,setEdit]=useState(false);
  if(!e)return <div className="empty"><b>Expense not found.</b></div>;
  if(edit)return <ExpenseForm group={group} patchGroup={patchGroup} editing={e} setToast={setToast} onDone={onDone}/>;
  function del(){if(!confirm(`Delete "${e.title}"? Balances will recalculate.`))return;patchGroup(g=>({...g,expenses:g.expenses.filter(x=>x.id!==e.id)}));setToast('Expense deleted.');onDone()}
  return <><h2>Expense</h2><section className="card detail"><div className="detailTop"><div><small>{fmtDate(e.date)}</small><h3>{e.title}</h3></div><strong>{money(e.amount)}</strong></div><div className="facts"><span>Paid by <b>{person(e.payer)}</b></span><span>Split between <b>{e.members.map(person).join(', ')}</b></span><span>Each share <b>{money(e.amount/e.members.length)}</b></span></div><div className="detailActions"><button onClick={()=>setEdit(true)}><Pencil/> Edit</button><button className="dangerBtn" onClick={del}><Trash2/> Delete</button></div></section></>
}

function HistoryPage({group,calc,person}){
  const settled=group.expenses.filter(e=>!(calc.openByExpense[e.id]>0.009));
  return <><h2>Payment history</h2><section className="card">{group.payments.length?group.payments.map(p=><div className="historyRow" key={p.id}><div className="receipt"><HandCoins/></div><div className="grow"><b>{person(p.from)} paid {person(p.to)}</b><span>{fmtDate(p.date)}{p.note?` · ${p.note}`:''}</span></div><strong>{money(p.amount)}</strong></div>):<div className="empty compact"><History/><b>No payments recorded yet</b></div>}</section><h2>Settled expenses</h2><section className="card">{settled.length?settled.map(e=><ExpenseRow key={e.id} e={e} person={person} outstanding={0}/>):<div className="empty compact"><CheckCircle2/><b>No settled expenses yet</b></div>}</section></>
}

function SettingsPage({data,setData,group,patchGroup,setToast}){
  const[name,setName]=useState(group.name);
  async function toggleReminder(){
    if(!data.settings.reminders&&'Notification'in window&&Notification.permission!=='granted'){const p=await Notification.requestPermission();if(p!=='granted')return setToast('Notification permission was not granted.')}
    setData(d=>({...d,settings:{...d.settings,reminders:!d.settings.reminders}}));
  }
  return <><h2>Group</h2><section className="card form"><label>GROUP NAME<input value={name} onChange={e=>setName(e.target.value)}/></label><button className="submit" onClick={()=>{const n=name.trim();if(!n)return;patchGroup(g=>({...g,name:n}));setToast('Group renamed.')}}><Save/> Save group name</button>{group.inviteCode&&group.inviteCode!=='LOCAL'&&<div className="invite"><span>Invite code</span><b>{group.inviteCode}</b><button onClick={()=>navigator.clipboard?.writeText(group.inviteCode)}><Copy/></button></div>}</section><h2>Debt reminders</h2><section className="card form"><div className="switchRow"><div><b>Daily reminder</b><span>Remind me while I still owe someone.</span></div><button className={data.settings.reminders?'switch on':'switch'} onClick={toggleReminder}><i/></button></div><label>REMINDER TIME<input type="time" value={data.settings.reminderTime} onChange={e=>setData(d=>({...d,settings:{...d.settings,reminderTime:e.target.value}}))}/></label><p className="hint">Browser notifications work while the browser can run this app. Reliable closed-app push reminders need the hosted push service in a later deployment step.</p></section></>
}

function AccountPage({supabase,session,cloudBusy,cloudSync,importLocalWorkspace,setToast}){
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState('You'),[groupName,setGroupName]=useState('My Group'),[code,setCode]=useState('');
  if(!supabase)return <><h2>Account & cloud</h2><section className="card notice"><CloudOff/><b>Local Demo Mode</b><p>The app is fully testable on this device. To enable sign-in, cross-device records and shared groups, add your Supabase URL and anon key to the project environment.</p><code>VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY</code><p>Run the included <b>supabase-schema.sql</b> once in Supabase.</p></section></>;
  async function signUp(){const{error}=await supabase.auth.signUp({email,password,options:{data:{display_name:name}}});setToast(error?error.message:'Account created. Check your email if confirmation is enabled.')}
  async function signIn(){const{error}=await supabase.auth.signInWithPassword({email,password});setToast(error?error.message:'Signed in.')}
  async function createGroup(){const{error}=await supabase.rpc('create_group_with_me',{group_name:groupName,my_name:name});if(error)return setToast(error.message);setToast('Cloud group created.');cloudSync()}
  async function join(){const{error}=await supabase.rpc('join_group_by_code',{code,my_name:name});if(error)return setToast(error.message);setToast('Group joined.');cloudSync()}
  if(session)return <><h2>Account & cloud</h2><section className="card notice"><Cloud/><b>{session.user.email}</b><p>Your account is connected. Sync loads your shared cloud groups and records.</p><button className="submit" disabled={cloudBusy} onClick={cloudSync}>{cloudBusy?'Syncing…':'Sync cloud data'}</button><button className="ghost" disabled={cloudBusy} onClick={importLocalWorkspace}>Import signed-out local expenses</button><button className="ghost" onClick={()=>supabase.auth.signOut()}>Sign out</button></section><h2>Create shared group</h2><section className="card form"><label>YOUR DISPLAY NAME<input value={name} onChange={e=>setName(e.target.value)}/></label><label>GROUP NAME<input value={groupName} onChange={e=>setGroupName(e.target.value)}/></label><button className="submit" onClick={createGroup}><Users/> Create group</button></section><h2>Join with invite code</h2><section className="card form"><label>INVITE CODE<input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label><button className="submit" onClick={join}><UserPlus/> Join group</button></section></>;
  return <><h2>Sign in</h2><section className="card form"><label>DISPLAY NAME<input value={name} onChange={e=>setName(e.target.value)}/></label><label>EMAIL<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>PASSWORD<input type="password" minLength="6" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="twoButtons"><button type="button" className="submit" onClick={signIn}><LogIn/> Sign in</button><button type="button" className="ghost" onClick={signUp}>Create account</button></div></section></>
}

createRoot(document.getElementById('root')).render(<App/>);
