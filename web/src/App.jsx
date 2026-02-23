import { useEffect, useState } from 'react';

const api = {
  getState: () => fetch('/api/models/state').then(r => r.json()),
  setPrimary: (model) => fetch('/api/models/primary', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model }) }),
  addFallback: (model) => fetch('/api/models/fallbacks', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model }) }),
  removeFallback: (model) => fetch(`/api/models/fallbacks/${encodeURIComponent(model)}`, { method:'DELETE' }),
  clearFallbacks: () => fetch('/api/models/fallbacks', { method:'DELETE' }),
  registerModel: (payload) => fetch('/api/models/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }),
  deleteModel: (model) => fetch(`/api/models/catalog/${encodeURIComponent(model)}`, { method:'DELETE' }),
  upsertProvider: (payload) => fetch('/api/providers/upsert', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }),
  backup: () => fetch('/api/config/backup', { method:'POST' }).then(r=>r.json()),
  restart: () => fetch('/api/gateway/restart', { method:'POST' }).then(r=>r.json())
};

export default function App(){
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ providerId:'featherless', modelId:'moonshotai/Kimi-K2.5', name:'Kimi K2.5', contextWindow:32000, maxTokens:4096 });
  const [provider, setProvider] = useState({ id:'featherless', baseUrl:'https://api.featherless.ai/v1', api:'openai-completions', apiKey:'' });

  const load = async () => setState(await api.getState());
  useEffect(()=>{ load(); },[]);

  async function run(fn, okText='Saved'){
    setBusy(true); setMsg('');
    try { const res = await fn(); if (res && !res.ok && res.status) throw new Error((await res.json()).error || 'Request failed'); setMsg(okText); await load(); }
    catch(e){ setMsg(`Error: ${e.message}`); }
    finally{ setBusy(false); }
  }

  if(!state) return <div className='container'><div className='card'>Loading…</div></div>;

  return <div className='container'>
    <div className='card header'>
      <div>
        <h1 style={{margin:'0 0 6px 0'}}>OpenClaw Model Control Panel</h1>
        <div className='muted'>Professional model management GUI for OpenClaw • by <a href='https://www.grahammiranda.com/' target='_blank'>grahammiranda.com</a></div>
      </div>
      <img src='/logo.jpg' className='logo' alt='logo' />
    </div>

    <div className='card'>
      <div className='row'>
        <strong>Primary:</strong> <span>{state.primary || 'Not set'}</span>
        <span className='badge'>Fallbacks: {state.fallbacks.length}</span>
      </div>
      <div className='muted' style={{marginTop:8}}>Config file: {state.configPath}</div>
      {!!msg && <div style={{marginTop:10}} className={msg.startsWith('Error') ? 'err':'ok'}>{msg}</div>}
    </div>

    <div className='grid grid-2'>
      <div className='card'>
        <h3>Switch Primary Model</h3>
        <select onChange={e=>setForm({...form, fullModel:e.target.value})} value={form.fullModel || state.primary || ''}>
          {[...new Set(state.catalog)].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div style={{marginTop:10}} className='row'>
          <button className='btn' disabled={busy} onClick={()=>run(()=>api.setPrimary(form.fullModel || state.primary),'Primary updated')}>Set Primary</button>
          <button className='btn secondary' disabled={busy} onClick={()=>run(()=>api.backup(),'Backup created')}>Create Backup</button>
          <button className='btn secondary' disabled={busy} onClick={()=>run(()=>api.restart(),'Gateway restart command sent')}>Restart Gateway</button>
        </div>
      </div>

      <div className='card'>
        <h3>Fallback Models</h3>
        <div className='row'>
          <select onChange={e=>setForm({...form, fallbackModel:e.target.value})} value={form.fallbackModel || ''}>
            <option value=''>Select model</option>
            {state.catalog.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className='btn' disabled={busy || !form.fallbackModel} onClick={()=>run(()=>api.addFallback(form.fallbackModel),'Fallback added')}>Add</button>
          <button className='btn danger' disabled={busy} onClick={()=>run(()=>api.clearFallbacks(),'Fallbacks cleared')}>Clear All</button>
        </div>
        <table className='table' style={{marginTop:8}}><tbody>
          {state.fallbacks.map(f => <tr key={f}><td>{f}</td><td><button className='btn danger' onClick={()=>run(()=>api.removeFallback(f),'Fallback removed')}>Remove</button></td></tr>)}
        </tbody></table>
      </div>
    </div>

    <div className='grid grid-2'>
      <div className='card'>
        <h3>Add / Register Model</h3>
        <div className='grid'>
          <input placeholder='provider id' value={form.providerId} onChange={e=>setForm({...form,providerId:e.target.value})} />
          <input placeholder='model id e.g. moonshotai/Kimi-K2.5' value={form.modelId} onChange={e=>setForm({...form,modelId:e.target.value})} />
          <input placeholder='display name' value={form.name} onChange={e=>setForm({...form,name:e.target.value})} />
          <input type='number' placeholder='context window' value={form.contextWindow} onChange={e=>setForm({...form,contextWindow:+e.target.value})} />
          <input type='number' placeholder='max tokens' value={form.maxTokens} onChange={e=>setForm({...form,maxTokens:+e.target.value})} />
          <button className='btn' disabled={busy} onClick={()=>run(()=>api.registerModel(form),'Model registered')}>Register model</button>
        </div>
      </div>

      <div className='card'>
        <h3>Provider Settings</h3>
        <div className='muted'>API keys are saved to OpenClaw config. Keep server access restricted.</div>
        <div className='grid'>
          <input placeholder='provider id' value={provider.id} onChange={e=>setProvider({...provider,id:e.target.value})} />
          <input placeholder='base URL' value={provider.baseUrl} onChange={e=>setProvider({...provider,baseUrl:e.target.value})} />
          <input placeholder='api mode' value={provider.api} onChange={e=>setProvider({...provider,api:e.target.value})} />
          <input placeholder='api key' value={provider.apiKey} onChange={e=>setProvider({...provider,apiKey:e.target.value})} />
          <button className='btn' disabled={busy || !provider.apiKey} onClick={()=>run(()=>api.upsertProvider(provider),'Provider updated')}>Save Provider</button>
        </div>
      </div>
    </div>

    <div className='card'>
      <h3>Model Catalog</h3>
      <table className='table'>
        <thead><tr><th>Model</th><th>Action</th></tr></thead>
        <tbody>
        {state.catalog.map(m => <tr key={m}><td>{m}</td><td><button className='btn danger' disabled={busy || m===state.primary} onClick={()=>run(()=>api.deleteModel(m),'Model removed from catalog')}>Delete</button></td></tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
