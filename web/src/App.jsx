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
    login: (username, password) => json('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    me: () => json('/api/auth/me'),
    users: () => json('/api/users'),
    saveUser: (payload) => json('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
    delUser: (username) => json(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),
    getState: () => json('/api/models/state'),
    getBackups: () => json('/api/config/backups'),
    restorePreview: (file) => json('/api/config/restore-preview', { method:'POST', body: JSON.stringify({ file }) }),
    restoreBackup: (file) => json('/api/config/restore', { method: 'POST', body: JSON.stringify({ file }) }),
    setPrimary: (model) => json('/api/models/primary', { method:'POST', body:JSON.stringify({ model }) }),
    addFallback: (model) => json('/api/models/fallbacks', { method:'POST', body:JSON.stringify({ model }) }),
    removeFallback: (model) => json(`/api/models/fallbacks/${encodeURIComponent(model)}`, { method:'DELETE' }),
    clearFallbacks: () => json('/api/models/fallbacks', { method:'DELETE' }),
    registerModel: (payload) => json('/api/models/register', { method:'POST', body:JSON.stringify(payload) }),
    deleteModel: (model) => json(`/api/models/catalog/${encodeURIComponent(model)}`, { method:'DELETE' }),
    upsertProvider: (payload) => json('/api/providers/upsert', { method:'POST', body:JSON.stringify(payload) }),
    setConcurrency: (payload) => json('/api/concurrency', { method:'POST', body:JSON.stringify(payload) }),
    featherAdvice: (model, planLimit=4) => json(`/api/featherless/advice?model=${encodeURIComponent(model)}&planLimit=${planLimit}`),
    applyPreset: (name, apiKey) => json(`/api/presets/${name}`, { method:'POST', body:JSON.stringify({ apiKey }) }),
    selfcheck: () => json('/api/system/selfcheck'),
    backup: () => json('/api/config/backup', { method:'POST' }),
    restart: () => json('/api/gateway/restart', { method:'POST' }),
    testModel: (payload) => json('/api/models/test', { method:'POST', body:JSON.stringify(payload) }),
    logs: (type='gateway') => json(`/api/logs?type=${type}`)
  };
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  return <div className='container'><div className='card' style={{maxWidth:420, margin:'60px auto'}}>
    <h2>OpenClaw Model GUI Login</h2>
    <input value={username} onChange={e=>setUsername(e.target.value)} placeholder='Username' />
    <div style={{height:8}} />
    <input type='password' value={password} onChange={e=>setPassword(e.target.value)} placeholder='Password' />
    <div className='row' style={{marginTop:10}}>
      <button className='btn' onClick={async()=>{ try{ setErr(''); await onLogin(username, password);} catch(e){setErr(e.message);} }}>Sign in</button>
    </div>
    {err && <div className='err' style={{marginTop:8}}>{err}</div>}
  </div></div>;
}

export default function App(){
  const [token, setToken] = useState(localStorage.getItem('ocmg_token') || '');
  const [me, setMe] = useState(null);
  const api = useMemo(()=>useApi(token), [token]);
  const [state, setState] = useState(null);
  const [backups, setBackups] = useState([]);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [logs, setLogs] = useState('');
  const [audit, setAudit] = useState('');
  const [preview, setPreview] = useState('');
  const [testOut, setTestOut] = useState('');
  const [advice, setAdvice] = useState(null);
  const [selfcheck, setSelfcheck] = useState(null);
  const [newUser, setNewUser] = useState({ username:'', password:'', role:'viewer' });
  const [test, setTest] = useState({ model:'', prompt:'Hello from OpenClaw GUI' });
  const [concurrency, setConcurrency] = useState({ maxConcurrent: 1, subagentsMaxConcurrent: 1 });
  const [form, setForm] = useState({ providerId:'featherless', modelId:'moonshotai/Kimi-K2.5', name:'Kimi K2.5', contextWindow:32000, maxTokens:4096 });
  const [provider, setProvider] = useState({ id:'featherless', baseUrl:'https://api.featherless.ai/v1', api:'openai-completions', apiKey:'' });

  const isAdmin = me?.role === 'admin';

  const load = async () => {
    const [s, b, m] = await Promise.all([api.getState(), api.getBackups(), api.me()]);
    setState(s); setBackups(b.items || []); setMe(m.user);
    setConcurrency({ maxConcurrent: s.maxConcurrent || 1, subagentsMaxConcurrent: s.subagentMaxConcurrent || 1 });
    if (m.user?.role === 'admin') {
      const u = await api.users();
      setUsers(u.users || []);
    }
  };

  useEffect(()=>{ if (token) load().catch(()=>setToken('')); }, [token]);

  async function doLogin(username, password){
    const r = await useApi('').login(username, password);
    localStorage.setItem('ocmg_token', r.token);
    setToken(r.token); setMe(r.user);
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
        <div className='muted'>Logged in as <b>{me?.username}</b> ({me?.role}) • by <a href='https://www.grahammiranda.com/' target='_blank'>grahammiranda.com</a></div>
      </div>
      <div className='row'>
        <img src='/logo.jpg' className='logo' alt='logo' />
        <button className='btn secondary' onClick={()=>{localStorage.removeItem('ocmg_token');setToken('');}}>Logout</button>
      </div>
    </div>

    {!!msg && <div className='card'><div className={msg.startsWith('Error') ? 'err':'ok'}>{msg}</div></div>}

    <div className='card'>
      <h3>Preflight Safety Checks</h3>
      <div className='row'>
        <button className='btn secondary' onClick={async()=>{const r = await api.selfcheck(); setSelfcheck(r);}}>Run Selfcheck</button>
        <button className='btn secondary' disabled={!isAdmin||busy} onClick={()=>run(()=>api.applyPreset('feather-premium-kimi', provider.apiKey),'Applied Kimi safe preset')}>Apply Feather Premium Kimi Preset</button>
        <button className='btn secondary' disabled={!isAdmin||busy} onClick={()=>run(()=>api.applyPreset('feather-premium-deepseek', provider.apiKey),'Applied DeepSeek balanced preset')}>Apply Feather Premium DeepSeek Preset</button>
      </div>
      <div className='code' style={{marginTop:8}}>{selfcheck ? JSON.stringify(selfcheck, null, 2) : 'Run selfcheck before/after major changes.'}</div>
    </div>

    <div className='card'>
      <h3>Primary + Fallback</h3>
      <div className='row'><strong>Primary:</strong> {state.primary}<span className='badge'>Fallbacks: {state.fallbacks.length}</span></div>
      <div className='grid grid-2' style={{marginTop:8}}>
        <div>
          <select onChange={e=>setForm({...form, fullModel:e.target.value})} value={form.fullModel || state.primary || ''}>
            {[...new Set(state.catalog)].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className='row' style={{marginTop:8}}>
            <button className='btn' disabled={!isAdmin||busy} onClick={()=>run(()=>api.setPrimary(form.fullModel || state.primary),'Primary updated')}>Set Primary</button>
            <button className='btn secondary' disabled={!isAdmin||busy} onClick={()=>run(()=>api.backup(),'Backup created')}>Backup</button>
            <button className='btn secondary' disabled={!isAdmin||busy} onClick={()=>run(()=>api.restart(),'Gateway restarted')}>Restart</button>
          </div>
        </div>
        <div>
          <div className='row'>
            <select onChange={e=>setForm({...form, fallbackModel:e.target.value})} value={form.fallbackModel || ''}>
              <option value=''>Select fallback model</option>
              {state.catalog.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button className='btn' disabled={!isAdmin||busy||!form.fallbackModel} onClick={()=>run(()=>api.addFallback(form.fallbackModel),'Fallback added')}>Add</button>
          </div>
          <table className='table'><tbody>{state.fallbacks.map(f => <tr key={f}><td>{f}</td><td><button className='btn danger' disabled={!isAdmin||busy} onClick={()=>run(()=>api.removeFallback(f),'Removed')}>Remove</button></td></tr>)}</tbody></table>
        </div>
      </div>
    </div>

    <div className='grid grid-2'>
      <div className='card'>
        <h3>Provider + Model Setup</h3>
        <div className='grid'>
          <input value={provider.id} onChange={e=>setProvider({...provider,id:e.target.value})} placeholder='provider id' />
          <input value={provider.baseUrl} onChange={e=>setProvider({...provider,baseUrl:e.target.value})} placeholder='base url' />
          <input value={provider.api} onChange={e=>setProvider({...provider,api:e.target.value})} placeholder='api' />
          <input value={provider.apiKey} onChange={e=>setProvider({...provider,apiKey:e.target.value})} placeholder='api key' />
          <button className='btn' disabled={!isAdmin||busy} onClick={()=>run(()=>api.upsertProvider(provider),'Provider saved')}>Save Provider</button>
          <hr style={{borderColor:'#2c3e75', width:'100%'}} />
          <input value={form.providerId} onChange={e=>setForm({...form,providerId:e.target.value})} placeholder='provider id' />
          <input value={form.modelId} onChange={e=>setForm({...form,modelId:e.target.value})} placeholder='model id' />
          <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder='name' />
          <button className='btn' disabled={!isAdmin||busy} onClick={()=>run(()=>api.registerModel(form),'Model registered')}>Register Model</button>

          <hr style={{borderColor:'#2c3e75', width:'100%'}} />
          <h4 style={{margin:'4px 0'}}>Featherless Concurrency Safety</h4>
          <div className='muted'>For Feather Premium (4 units): Kimi-K2.5 usually costs 4 units/request, DeepSeek/GLM often cost 1 unit/request.</div>
          <div className='row'>
            <input type='number' min='1' max='20' value={concurrency.maxConcurrent} onChange={e=>setConcurrency({...concurrency,maxConcurrent:Number(e.target.value)})} />
            <input type='number' min='1' max='20' value={concurrency.subagentsMaxConcurrent} onChange={e=>setConcurrency({...concurrency,subagentsMaxConcurrent:Number(e.target.value)})} />
            <button className='btn secondary' disabled={!isAdmin||busy} onClick={()=>run(()=>api.setConcurrency(concurrency),'Concurrency updated')}>Save Concurrency</button>
          </div>
          <div className='row'>
            <button className='btn secondary' disabled={busy||!test.model} onClick={async()=>{const r=await api.featherAdvice(test.model,4);setAdvice(r);}}>Check Feather Advice</button>
          </div>
          <div className='code'>{advice ? `Model cost: ${advice.modelConcurrencyCost} units | Safe maxConcurrent: ${advice.safeMaxConcurrent}\n${advice.warning || 'Current settings look safe.'}` : 'Select a model and click Check Feather Advice.'}</div>
        </div>
      </div>

      <div className='card'>
        <h3>Test Model Call</h3>
        <select value={test.model} onChange={e=>setTest({...test,model:e.target.value})}>
          <option value=''>Select model</option>
          {state.catalog.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <textarea rows='4' value={test.prompt} onChange={e=>setTest({...test,prompt:e.target.value})} />
        <div className='row'><button className='btn' disabled={busy||!test.model} onClick={()=>run(async()=>{const r=await api.testModel(test);setTestOut(r.output||'');},'Model test completed')}>Run Test</button></div>
        <div className='code' style={{marginTop:8}}>{testOut || 'No test output yet.'}</div>
      </div>
    </div>

    <div className='card'>
      <h3>Backup Restore with Diff Preview</h3>
      <table className='table'>
        <thead><tr><th>File</th><th>Action</th></tr></thead>
        <tbody>{backups.map(b => <tr key={b.file}><td>{b.file}</td><td className='row'><button className='btn secondary' onClick={async()=>{const r=await api.restorePreview(b.file);setPreview(r.diff);}}>Preview Diff</button><button className='btn' disabled={!isAdmin||busy} onClick={()=>run(()=>api.restoreBackup(b.file),'Backup restored')}>Restore</button></td></tr>)}</tbody>
      </table>
      <div className='code'>{preview || 'Select a backup and click Preview Diff.'}</div>
    </div>

    <div className='grid grid-2'>
      <div className='card'>
        <h3>Live Logs (Gateway)</h3>
        <div className='row'><button className='btn secondary' onClick={async()=>setLogs((await api.logs('gateway')).text)}>Refresh</button></div>
        <div className='code'>{logs || 'No logs loaded yet.'}</div>
      </div>
      <div className='card'>
        <h3>Audit Log</h3>
        <div className='row'><button className='btn secondary' onClick={async()=>setAudit((await api.logs('audit')).text)}>Refresh</button></div>
        <div className='code'>{audit || 'No audit logs loaded yet.'}</div>
      </div>
    </div>

    {isAdmin && <div className='card'>
      <h3>User Management</h3>
      <div className='grid grid-2'>
        <div>
          <input placeholder='username' value={newUser.username} onChange={e=>setNewUser({...newUser,username:e.target.value})} />
          <input placeholder='password (min 6)' type='password' value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})} />
          <select value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})}><option value='viewer'>viewer</option><option value='admin'>admin</option></select>
          <button className='btn' disabled={busy} onClick={()=>run(()=>api.saveUser(newUser),'User saved')}>Save user</button>
        </div>
        <div>
          <table className='table'><thead><tr><th>User</th><th>Role</th><th></th></tr></thead><tbody>{users.map(u=><tr key={u.username}><td>{u.username}</td><td>{u.role}</td><td><button className='btn danger' onClick={()=>run(()=>api.delUser(u.username),'User deleted')}>Delete</button></td></tr>)}</tbody></table>
        </div>
      </div>
    </div>}
  </div>;
}
