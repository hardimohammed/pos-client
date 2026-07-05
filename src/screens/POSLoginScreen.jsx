// ============================================================
//  pos-client/src/screens/POSLoginScreen.jsx
//  Fixed to handle your API's auth response structure
// ============================================================
import { useState } from 'react';

export default function POSLoginScreen({ apiBase, onSuccess }) {
  const [form,    setForm]    = useState({
    email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`${apiBase}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();

      // Debug: log the full response shape
      console.log('Auth response:', JSON.stringify(data));

      if (!data.success)
        throw new Error(data.message || 'Login failed');

      // Handle different possible response shapes from your API
      const payload  = data.data || data;
      const token    = payload.token || payload.accessToken;
      const user     = payload.user  || payload;

      // Extract org info — try multiple possible locations
      const org = payload.organization
        || payload.org
        || { id: user?.org_id || user?.orgId || 1 };

      if (!token) throw new Error('No token in response');

      onSuccess(token, user, org);
    } catch (err) {
      setError(err.message);
      console.error('Login error:', err);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ height:'100vh',
      background:'linear-gradient(135deg,#0d1b2a,#1a2f4a)',
      display:'flex', alignItems:'center',
      justifyContent:'center', padding:20 }}>
      <div style={{ background:'white', borderRadius:20,
        padding:48, width:'100%', maxWidth:420,
        boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ width:64, height:64, borderRadius:18,
            background:'linear-gradient(135deg,#1e6bbd,#3d9fff)',
            display:'flex', alignItems:'center',
            justifyContent:'center', fontSize:28,
            fontWeight:900, color:'white',
            margin:'0 auto 16px' }}>F</div>
          <div style={{ fontSize:22, fontWeight:800,
            color:'#1a2740' }}>FinSuite POS</div>
          <div style={{ fontSize:13, color:'#6b7fa3',
            marginTop:4 }}>Cashier Sign In</div>
        </div>

        {error && (
          <div style={{ background:'#fff5f5',
            border:'1px solid #fca5a5', borderRadius:10,
            padding:'12px 16px', marginBottom:20,
            fontSize:13, color:'#c04040',
            textAlign:'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom:18 }}>
            <label style={{ display:'block', fontSize:12,
              fontWeight:600, color:'#6b7fa3',
              marginBottom:8, textTransform:'uppercase',
              letterSpacing:.5 }}>Email</label>
            <input type="email" required
              autoFocus
              value={form.email}
              onChange={e =>
                setForm(p => ({...p, email:e.target.value}))}
              style={{ width:'100%', padding:'14px 16px',
                border:'2px solid #e2e8f0', borderRadius:12,
                fontSize:15, outline:'none',
                fontFamily:'sans-serif',
                boxSizing:'border-box' }}/>
          </div>
          <div style={{ marginBottom:28 }}>
            <label style={{ display:'block', fontSize:12,
              fontWeight:600, color:'#6b7fa3',
              marginBottom:8, textTransform:'uppercase',
              letterSpacing:.5 }}>Password</label>
            <input type="password" required
              value={form.password}
              onChange={e =>
                setForm(p => ({...p, password:e.target.value}))}
              style={{ width:'100%', padding:'14px 16px',
                border:'2px solid #e2e8f0', borderRadius:12,
                fontSize:15, outline:'none',
                fontFamily:'sans-serif',
                boxSizing:'border-box' }}/>
          </div>
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:16,
              background: loading ? '#6b7fa3' : '#1e6bbd',
              color:'white', border:'none', borderRadius:12,
              fontSize:16, fontWeight:700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily:'sans-serif',
              transition:'background .2s' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:20,
          fontSize:12, color:'#6b7fa3' }}>
          After signing in, set your 4-digit POS PIN
          for faster access next time
        </div>
      </div>
    </div>
  );
}
