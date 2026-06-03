import { useState, useCallback } from 'react'
import './TestDashboard.css'

const BASE = 'http://localhost:8080'

const TABS = ['health', 'auth', 'restaurants', 'menu', 'orders', 'status']
const TAB_LABELS = { health: '🟢 Health', auth: '👤 Auth', restaurants: '🍽️ Restaurants', menu: '🍕 Menu', orders: '📦 Orders', status: '🔄 Status' }

const STATUS_FLOW = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered']

const SERVICES = [
  { name: 'API Gateway',        url: `${BASE}/health` },
  { name: 'User Service',       url: 'http://localhost:3001/health' },
  { name: 'Restaurant Service', url: 'http://localhost:3002/health' },
  { name: 'Menu Service',       url: 'http://localhost:3003/health' },
  { name: 'Order Service',      url: 'http://localhost:3004/health' },
]

function ResultBox({ result }) {
  if (!result) return null
  const ok = result.ok
  return (
    <div className={`result-box ${ok ? 'result-ok' : 'result-err'}`}>
      <div className="result-status">{ok ? '✅ Success' : '❌ Error'} — HTTP {result.status}</div>
      <pre>{JSON.stringify(result.data, null, 2)}</pre>
    </div>
  )
}

async function apiFetch(path, opts = {}, token = '') {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  try {
    const res = await fetch(BASE + path, { headers, ...opts })
    const data = await res.json().catch(() => ({ error: 'Non-JSON response' }))
    return { ok: res.ok, status: res.status, data }
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message + ' — is Docker running?' } }
  }
}

export default function TestDashboard() {
  const [tab, setTab] = useState('health')
  const [token, setToken] = useState('')

  // Health
  const [healthResults, setHealthResults] = useState([])
  const [healthLoading, setHealthLoading] = useState(false)

  // Auth
  const [regForm, setRegForm] = useState({ name: 'Test User', email: 'test@foodrush.com', password: 'test1234' })
  const [loginForm, setLoginForm] = useState({ email: 'test@foodrush.com', password: 'test1234' })
  const [regResult, setRegResult] = useState(null)
  const [loginResult, setLoginResult] = useState(null)
  const [profileResult, setProfileResult] = useState(null)

  // Restaurants
  const [restListResult, setRestListResult] = useState(null)
  const [restSearchQ, setRestSearchQ] = useState('Indian')
  const [restSearchResult, setRestSearchResult] = useState(null)
  const [restId, setRestId] = useState('1')
  const [restSingleResult, setRestSingleResult] = useState(null)

  // Menu
  const [menuRestId, setMenuRestId] = useState('1')
  const [menuResult, setMenuResult] = useState(null)
  const [menuItemId, setMenuItemId] = useState('1')
  const [menuItemResult, setMenuItemResult] = useState(null)

  // Orders
  const [orderForm, setOrderForm] = useState({
    restaurant_id: '1',
    delivery_address: '123 MG Road, Pune 411001',
    notes: 'Extra spicy please',
    items: '[{"menu_item_id":1,"quantity":2},{"menu_item_id":4,"quantity":1}]'
  })
  const [orderPlaceResult, setOrderPlaceResult] = useState(null)
  const [myOrdersResult, setMyOrdersResult] = useState(null)
  const [getOrderId, setGetOrderId] = useState('')
  const [getOrderResult, setGetOrderResult] = useState(null)

  // Status
  const [statusOrderId, setStatusOrderId] = useState('')
  const [statusValue, setStatusValue] = useState('confirmed')
  const [statusResult, setStatusResult] = useState(null)
  const [currentStatus, setCurrentStatus] = useState('')
  const [autoFlowing, setAutoFlowing] = useState(false)

  // ── Health ──────────────────────────────────────────────────────────────────
  const checkHealth = async () => {
    setHealthLoading(true)
    setHealthResults(SERVICES.map(s => ({ ...s, status: 'checking' })))
    const results = await Promise.all(
      SERVICES.map(async s => {
        try {
          const res = await fetch(s.url, { signal: AbortSignal.timeout(3000) })
          const data = await res.json()
          return { ...s, status: res.ok ? 'ok' : 'error', data }
        } catch {
          return { ...s, status: 'error', data: null }
        }
      })
    )
    setHealthResults(results)
    setHealthLoading(false)
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const doRegister = async () => {
    const r = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(regForm) })
    if (r.ok && r.data.token) setToken(r.data.token)
    setRegResult(r)
  }

  const doLogin = async () => {
    const r = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(loginForm) })
    if (r.ok && r.data.token) setToken(r.data.token)
    setLoginResult(r)
  }

  const doProfile = async () => {
    const r = await apiFetch('/api/users/me', {}, token)
    setProfileResult(r)
  }

  // ── Restaurants ─────────────────────────────────────────────────────────────
  const doListRestaurants = async () => setRestListResult(await apiFetch('/api/restaurants'))
  const doSearchRestaurants = async () => setRestSearchResult(await apiFetch(`/api/restaurants/search/${encodeURIComponent(restSearchQ)}`))
  const doGetRestaurant = async () => setRestSingleResult(await apiFetch(`/api/restaurants/${restId}`))

  // ── Menu ────────────────────────────────────────────────────────────────────
  const doGetMenu = async () => setMenuResult(await apiFetch(`/api/menu/restaurant/${menuRestId}`))
  const doGetItem = async () => setMenuItemResult(await apiFetch(`/api/menu/item/${menuItemId}`))

  // ── Orders ──────────────────────────────────────────────────────────────────
  const doPlaceOrder = async () => {
    let items
    try { items = JSON.parse(orderForm.items) } catch { alert('Invalid JSON in items field'); return }
    const body = { restaurant_id: parseInt(orderForm.restaurant_id), delivery_address: orderForm.delivery_address, notes: orderForm.notes, items }
    const r = await apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(body) }, token)
    if (r.ok && r.data.id) { setStatusOrderId(String(r.data.id)); setGetOrderId(String(r.data.id)) }
    setOrderPlaceResult(r)
  }

  const doMyOrders = async () => setMyOrdersResult(await apiFetch('/api/orders/my', {}, token))
  const doGetOrder = async () => setGetOrderResult(await apiFetch(`/api/orders/${getOrderId}`, {}, token))

  // ── Status ──────────────────────────────────────────────────────────────────
  const doUpdateStatus = async () => {
    const r = await apiFetch(`/api/orders/${statusOrderId}/status`, { method: 'PATCH', body: JSON.stringify({ status: statusValue }) }, token)
    if (r.ok) setCurrentStatus(statusValue)
    setStatusResult(r)
  }

  const doAutoFlow = async () => {
    if (!statusOrderId) { alert('Place an order first to get an Order ID'); return }
    setAutoFlowing(true)
    for (const s of ['confirmed', 'preparing', 'out_for_delivery', 'delivered']) {
      await new Promise(r => setTimeout(r, 900))
      const r = await apiFetch(`/api/orders/${statusOrderId}/status`, { method: 'PATCH', body: JSON.stringify({ status: s }) }, token)
      setCurrentStatus(s)
      setStatusResult(r)
    }
    setAutoFlowing(false)
  }

  return (
    <div className="td-page">
      <div className="td-header">
        <div>
          <h1 className="td-title">🧪 E2E Test Dashboard</h1>
          <p className="td-sub">Test all FoodRush APIs end-to-end against your local Docker stack</p>
        </div>
        <div className="td-token-box">
          <span className="td-token-label">JWT</span>
          <span className="td-token-val">{token ? token.slice(0, 40) + '…' : 'not logged in'}</span>
          {token && <button className="td-clear-btn" onClick={() => setToken('')}>Clear</button>}
        </div>
      </div>

      <div className="td-tabs">
        {TABS.map(t => (
          <button key={t} className={`td-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="td-body">

        {/* ── HEALTH ── */}
        {tab === 'health' && (
          <div className="td-section">
            <h2 className="td-section-title">Service health checks</h2>
            <button className="td-btn primary" onClick={checkHealth} disabled={healthLoading}>
              {healthLoading ? 'Checking…' : '🔄 Check all services'}
            </button>
            {healthResults.length > 0 && (
              <div className="health-grid">
                {healthResults.map(s => (
                  <div key={s.name} className={`health-card ${s.status}`}>
                    <span className="health-dot">{s.status === 'ok' ? '🟢' : s.status === 'checking' ? '🟡' : '🔴'}</span>
                    <span className="health-name">{s.name}</span>
                    <span className="health-state">{s.status === 'ok' ? 'online' : s.status === 'checking' ? 'checking…' : 'offline'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AUTH ── */}
        {tab === 'auth' && (
          <>
            <div className="td-section">
              <h2 className="td-section-title">1 · Register</h2>
              <div className="td-grid2">
                <div className="td-field"><label>Name</label><input value={regForm.name} onChange={e => setRegForm({ ...regForm, name: e.target.value })} /></div>
                <div className="td-field"><label>Email</label><input type="email" value={regForm.email} onChange={e => setRegForm({ ...regForm, email: e.target.value })} /></div>
              </div>
              <div className="td-field"><label>Password</label><input type="password" value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })} /></div>
              <button className="td-btn primary" onClick={doRegister}>POST /api/auth/register</button>
              <ResultBox result={regResult} />
            </div>

            <div className="td-section">
              <h2 className="td-section-title">2 · Login</h2>
              <div className="td-grid2">
                <div className="td-field"><label>Email</label><input value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} /></div>
                <div className="td-field"><label>Password</label><input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} /></div>
              </div>
              <button className="td-btn primary" onClick={doLogin}>POST /api/auth/login</button>
              <ResultBox result={loginResult} />
            </div>

            <div className="td-section">
              <h2 className="td-section-title">3 · Get my profile <span className="td-badge">requires login</span></h2>
              <button className="td-btn" onClick={doProfile}>GET /api/users/me</button>
              <ResultBox result={profileResult} />
            </div>
          </>
        )}

        {/* ── RESTAURANTS ── */}
        {tab === 'restaurants' && (
          <>
            <div className="td-section">
              <h2 className="td-section-title">List all restaurants</h2>
              <button className="td-btn primary" onClick={doListRestaurants}>GET /api/restaurants</button>
              <ResultBox result={restListResult} />
            </div>
            <div className="td-section">
              <h2 className="td-section-title">Search</h2>
              <div className="td-row">
                <input value={restSearchQ} onChange={e => setRestSearchQ(e.target.value)} placeholder="e.g. Indian, Burger…" />
                <button className="td-btn primary" onClick={doSearchRestaurants}>Search</button>
              </div>
              <ResultBox result={restSearchResult} />
            </div>
            <div className="td-section">
              <h2 className="td-section-title">Get by ID</h2>
              <div className="td-row">
                <input type="number" value={restId} onChange={e => setRestId(e.target.value)} style={{ maxWidth: 80 }} />
                <button className="td-btn" onClick={doGetRestaurant}>GET /api/restaurants/:id</button>
              </div>
              <ResultBox result={restSingleResult} />
            </div>
          </>
        )}

        {/* ── MENU ── */}
        {tab === 'menu' && (
          <>
            <div className="td-section">
              <h2 className="td-section-title">Get menu for restaurant</h2>
              <div className="td-row">
                <input type="number" value={menuRestId} onChange={e => setMenuRestId(e.target.value)} style={{ maxWidth: 80 }} placeholder="Restaurant ID" />
                <button className="td-btn primary" onClick={doGetMenu}>GET /api/menu/restaurant/:id</button>
              </div>
              <ResultBox result={menuResult} />
            </div>
            <div className="td-section">
              <h2 className="td-section-title">Get single menu item</h2>
              <div className="td-row">
                <input type="number" value={menuItemId} onChange={e => setMenuItemId(e.target.value)} style={{ maxWidth: 80 }} placeholder="Item ID" />
                <button className="td-btn" onClick={doGetItem}>GET /api/menu/item/:id</button>
              </div>
              <ResultBox result={menuItemResult} />
            </div>
          </>
        )}

        {/* ── ORDERS ── */}
        {tab === 'orders' && (
          <>
            <div className="td-section">
              <h2 className="td-section-title">Place order <span className="td-badge">requires login</span></h2>
              <div className="td-grid2">
                <div className="td-field"><label>Restaurant ID</label><input type="number" value={orderForm.restaurant_id} onChange={e => setOrderForm({ ...orderForm, restaurant_id: e.target.value })} /></div>
                <div className="td-field"><label>Delivery address</label><input value={orderForm.delivery_address} onChange={e => setOrderForm({ ...orderForm, delivery_address: e.target.value })} /></div>
              </div>
              <div className="td-field">
                <label>Items JSON</label>
                <input value={orderForm.items} onChange={e => setOrderForm({ ...orderForm, items: e.target.value })} style={{ fontFamily: 'monospace', fontSize: 12 }} />
              </div>
              <div className="td-field"><label>Notes</label><input value={orderForm.notes} onChange={e => setOrderForm({ ...orderForm, notes: e.target.value })} /></div>
              <button className="td-btn primary" onClick={doPlaceOrder}>POST /api/orders</button>
              <ResultBox result={orderPlaceResult} />
            </div>

            <div className="td-section">
              <h2 className="td-section-title">My orders <span className="td-badge">requires login</span></h2>
              <button className="td-btn" onClick={doMyOrders}>GET /api/orders/my</button>
              <ResultBox result={myOrdersResult} />
            </div>

            <div className="td-section">
              <h2 className="td-section-title">Get order by ID <span className="td-badge">requires login</span></h2>
              <div className="td-row">
                <input type="number" value={getOrderId} onChange={e => setGetOrderId(e.target.value)} placeholder="Order ID" style={{ maxWidth: 100 }} />
                <button className="td-btn" onClick={doGetOrder}>GET /api/orders/:id</button>
              </div>
              <ResultBox result={getOrderResult} />
            </div>
          </>
        )}

        {/* ── STATUS ── */}
        {tab === 'status' && (
          <div className="td-section">
            <h2 className="td-section-title">Update order status <span className="td-badge">requires login</span></h2>

            <div className="status-track">
              {STATUS_FLOW.map((s, i) => {
                const idx = STATUS_FLOW.indexOf(currentStatus)
                const done = currentStatus && i < idx
                const active = s === currentStatus
                return (
                  <div key={s} className={`status-node ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                    <div className="status-dot" />
                    <span>{s.replace(/_/g, ' ')}</span>
                    {i < STATUS_FLOW.length - 1 && <div className={`status-line ${done || active ? 'filled' : ''}`} />}
                  </div>
                )
              })}
            </div>

            <div className="td-grid2" style={{ marginTop: 20 }}>
              <div className="td-field"><label>Order ID</label><input type="number" value={statusOrderId} onChange={e => setStatusOrderId(e.target.value)} placeholder="e.g. 1" /></div>
              <div className="td-field">
                <label>New status</label>
                <select value={statusValue} onChange={e => setStatusValue(e.target.value)}>
                  <option value="confirmed">confirmed</option>
                  <option value="preparing">preparing</option>
                  <option value="out_for_delivery">out_for_delivery</option>
                  <option value="delivered">delivered</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
            </div>
            <div className="td-row">
              <button className="td-btn primary" onClick={doUpdateStatus}>PATCH /api/orders/:id/status</button>
              <button className="td-btn success" onClick={doAutoFlow} disabled={autoFlowing}>
                {autoFlowing ? '▶ Running…' : '▶ Auto-flow all steps'}
              </button>
            </div>
            <ResultBox result={statusResult} />
          </div>
        )}

      </div>
    </div>
  )
}
