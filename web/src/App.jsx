import { useEffect, useMemo, useState } from 'react';

function useApi(token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const json = async (url, options = {}) => {
    const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...headers, ...(options.headers || {}) } });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  };
  return {
    login: (password) => json('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
    getState: () => json('/api/models/state'),
    getBackups: () => json('/api/config/backups'),
    restoreBackup: (file) => json('/api/config/restore', { method: 'POST', body: JSON.stringify({ file }) }),
    setPrimary: (model) => json('/api/models/primary', { method:'POST', body:JSON.stringify({ model }) }),
    addFallback: (model) => json('/api/models/fallbacks', { method:'POST', body:JSON.stringify({ model }) }),
    removeFallback: (model) => json(`/api/models/fallbacks/${encodeURIComponent(model)}`, { method:'DELETE' }),
    clearFallbacks: () => json('/api/models/fallbacks', { method:'DELETE' }),
    registerModel: (payload) => json('/api/models/register', { method:'POST', body:JSON.stringify(payload) }),
    deleteModel: (model) => json(`/api/models/catalog/${encodeURIComponent(model)}`, { method:'DELETE' }),
    upsertProvider: (payload) => json('/api/providers/upsert', { method:'POST', body:JSON.stringify(payload) }),
    backup: () => json('/api/config/backup', { method:'POST' }),
    restart: () => json('/api/gateway/restart', { method:'POST' })
  };
}

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  return <div className='container'><div className='card' style={{maxWidth:420, margin:'60px auto'}}>
    <h2>OpenClaw Model GUI Login</h2>
    <p className='muted'>Use PANEL_PASSWORD configured on server.</p>
    <input type='password' value={password} onChange={e=>setPassword(e.target.value)} placeholder='Password' />
    <div className='row' style={{marginTop:10}}>
      <button className='btn' onClick={async()=>{ try{ setErr(''); await onLogin(password);} catch(e){setErr(e.message);} }}>Sign in</button>
    </div>
    {err && <div className='err' style={{marginTop:8}}>{err}</div>}
  </div></div>;
}

export default function App(){
  const [token, setToken] = useState(localStorage.getItem('ocmg_token') || '');
  const api = useMemo(()=>useApi(token), [token]);
  const [state, setState] = useState(null);
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ providerId:'featherless', modelId:'moonshotai/Kimi-K2.5', name:'Kimi K2.5', contextWindow:32000, maxTokens:4096 });
  const [provider, setProvider] = useState({ id:'featherless', baseUrl:'https://api.featherless.ai/v1', api:'openai-completions', apiKey:'' });

  const load = async () => {
    const [s, b] = await Promise.all([api.getState(), api.getBackups()]);
    setState(s); setBackups(b.items || []);
  };

  useEffect(()=>{ if (token) load().catch(()=>setToken('')); }, [token]);

  async function doLogin(password){
    const r = await useApi('').login(password);
    localStorage.setItem('ocmg_token', r.token);
    setToken(r.token);
  }

  async function run(fn, okText='Saved'){
    setBusy(true); setMsg('');
    try { await fn(); setMsg(okText); await load(); }
    catch(e){ setMsg(`Error: ${e.message}`); }
    finally{ setBusy(false); }
  }

  if (!token) return <Login onLogin={doLogin} />;
  if(!state) return <div className='container'><div className='card'>Loading…</div></div>;

  return <div className='container'>
    <div className='card header'>
      <div>
        <h1 style={{margin:'0 0 6px 0'}}>OpenClaw Model Control Panel</h1>
        <div className='muted'>Project by <a href='https://www.grahammiranda.com/' target='_blank'>grahammiranda.com</a> • Auth + backup/restore + audited changes</div>
      </div>
      <div className='row'>
        <img src='/logo.jpg' className='logo' alt='logo' />
        <button className='btn secondary' onClick={()=>{localStorage.removeItem('ocmg_token');setToken('');}}>Logout</button>
      </div>
    </div>

    <div className='card'>
      <h3>Quick Onboarding Wizard</h3>
      <div className='grid grid-2'>
        <button className='btn' disabled={busy} onClick={()=>run(async()=>{await api.upsertProvider({id:'featherless',baseUrl:'https://api.featherless.ai/v1',api:'openai-completions',apiKey:provider.apiKey});await api.registerModel({providerId:'featherless',modelId:'moonshotai/Kimi-K2.5',name:'Kimi K2.5',contextWindow:32000,maxTokens:4096});await api.setPrimary('featherless/moonshotai/Kimi-K2.5');await api.clearFallbacks();},'Kimi profile applied')}>Apply Featherless + Kimi Safe Profile</button>
        <button className='btn secondary' disabled={busy} onClick={()=>run(async()=>{await api.upsertProvider({id:'featherless',baseUrl:'https://api.featherless.ai/v1',api:'openai-completions',apiKey:provider.apiKey});await api.registerModel({providerId:'featherless',modelId:'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',name:'DeepSeekR1',contextWindow:32000,maxTokens:4096});await api.setPrimary('featherless/deepseek-ai/DeepSeek-R1-Distill-Qwen-14B');await api.clearFallbacks();},'DeepSeek profile applied')}>Apply Featherless + DeepSeek Safe Profile</button>
      </div>
      <p className='muted'>For Kimi plans with strict concurrency units, keep OpenClaw concurrency at 1 and avoid overlapping cron bursts.</p>
    </div>

    <div className='card'>
      <div className='row'>
        <strong>Primary:</strong> <span>{state.primary || 'Not set'}</span>
        <span className='badge'>Fallbacks: {state.fallbacks.length}</span>
      </div>
      <div className='muted' style={{marginTop:8}}>Config file: {state.configPath} • Backups: {state.backupDir}</div>
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
      <h3>Backups & Restore</h3>
      <table className='table'>
        <thead><tr><th>File</th><th>Size</th><th>Action</th></tr></thead>
        <tbody>
          {backups.map(b => <tr key={b.file}><td>{b.file}</td><td>{Math.round(b.size/1024)} KB</td><td><button className='btn secondary' onClick={()=>run(()=>api.restoreBackup(b.file),'Backup restored')}>Restore</button></td></tr>)}
        </tbody>
      </table>
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
