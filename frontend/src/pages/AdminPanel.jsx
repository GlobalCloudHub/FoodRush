import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import './AdminPanel.css'

const TABS = ['orders', 'restaurants', 'menu', 'users']
const TAB_LABELS = { orders: '📦 Orders', restaurants: '🍽️ Restaurants', menu: '🍕 Menu Items', users: '👥 Users' }

const ORDER_STATUSES = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']
const STATUS_COLORS = {
  pending: '#f59e0b', confirmed: '#3b82f6', preparing: '#8b5cf6',
  out_for_delivery: '#f97316', delivered: '#22c55e', cancelled: '#ef4444'
}

// ── Shared components ──────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="ap-field">
      <label>{label}</label>
      {children}
    </div>
  )
}

// ── Orders Tab ─────────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [updating, setUpdating] = useState(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter ? `/api/orders?status=${filter}` : '/api/orders'
      const { data } = await api.get(url)
      setOrders(data)
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { loadOrders() }, [loadOrders])

  const updateStatus = async (orderId, status) => {
    setUpdating(orderId)
    try {
      await api.patch(`/api/orders/${orderId}/status`, { status })
      await loadOrders()
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to update status')
    } finally { setUpdating(null) }
  }

  return (
    <div>
      <div className="ap-toolbar">
        <h2 className="ap-section-title">All Orders</h2>
        <div className="ap-row">
          <select className="ap-select" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="ap-btn" onClick={loadOrders}>🔄 Refresh</button>
        </div>
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr><th>#</th><th>Customer</th><th>Restaurant</th><th>Amount</th><th>Status</th><th>Date</th><th>Action</th></tr>
            </thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={7} className="ap-empty">No orders found</td></tr>}
              {orders.map(o => (
                <tr key={o.id}>
                  <td className="ap-id">#{o.id}</td>
                  <td>
                    <div className="ap-cell-main">{o.user_name}</div>
                    <div className="ap-cell-sub">{o.user_email}</div>
                  </td>
                  <td>Restaurant #{o.restaurant_id}</td>
                  <td className="ap-amount">₹{parseFloat(o.total_amount).toFixed(2)}</td>
                  <td>
                    <span className="ap-status-badge" style={{ background: STATUS_COLORS[o.status] + '22', color: STATUS_COLORS[o.status], border: `1px solid ${STATUS_COLORS[o.status]}44` }}>
                      {o.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="ap-date">{new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>
                    {o.status !== 'delivered' && o.status !== 'cancelled' && (
                      <select
                        className="ap-select ap-select-sm"
                        value={o.status}
                        disabled={updating === o.id}
                        onChange={e => updateStatus(o.id, e.target.value)}
                      >
                        {ORDER_STATUSES.filter(s => s !== 'pending').map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    )}
                    {(o.status === 'delivered' || o.status === 'cancelled') && (
                      <span className="ap-cell-sub">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Restaurants Tab ────────────────────────────────────────────────────────
function RestaurantsTab() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', cuisine: '', address: '', delivery_time: '30-45 min', delivery_fee: 30, min_order: 100, image_url: '', is_open: true })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/api/restaurants/admin/all')
      setRestaurants(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', description: '', cuisine: '', address: '', delivery_time: '30-45 min', delivery_fee: 30, min_order: 100, image_url: '', is_open: true })
    setShowModal(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({ name: r.name, description: r.description || '', cuisine: r.cuisine || '', address: r.address || '', delivery_time: r.delivery_time || '30-45 min', delivery_fee: r.delivery_fee, min_order: r.min_order, image_url: r.image_url || '', is_open: r.is_open })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/api/restaurants/${editing.id}`, form)
      } else {
        await api.post('/api/restaurants', form)
      }
      setShowModal(false)
      await load()
    } catch (e) {
      alert(e.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const toggleStatus = async (r) => {
    try {
      await api.put(`/api/restaurants/${r.id}`, { status: r.status === 'active' ? 'inactive' : 'active' })
      await load()
    } catch (e) { alert('Failed to update') }
  }

  return (
    <div>
      <div className="ap-toolbar">
        <h2 className="ap-section-title">Restaurants</h2>
        <button className="ap-btn primary" onClick={openAdd}>+ Add Restaurant</button>
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="ap-cards">
          {restaurants.map(r => (
            <div key={r.id} className="ap-rest-card">
              {r.image_url && <img src={r.image_url} alt={r.name} className="ap-rest-img" />}
              <div className="ap-rest-body">
                <div className="ap-rest-top">
                  <h3 className="ap-rest-name">{r.name}</h3>
                  <span className={`ap-pill ${r.status === 'active' ? 'pill-green' : 'pill-red'}`}>{r.status}</span>
                </div>
                <div className="ap-rest-meta">
                  <span>🍽️ {r.cuisine}</span>
                  <span>⭐ {r.rating}</span>
                  <span>🕐 {r.delivery_time}</span>
                  <span>₹{r.delivery_fee} delivery</span>
                </div>
                <p className="ap-rest-desc">{r.description}</p>
                <div className="ap-rest-actions">
                  <button className="ap-btn ap-btn-sm" onClick={() => openEdit(r)}>✏️ Edit</button>
                  <button className="ap-btn ap-btn-sm" onClick={() => toggleStatus(r)}>
                    {r.status === 'active' ? '🔴 Deactivate' : '🟢 Activate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Restaurant' : 'Add Restaurant'} onClose={() => setShowModal(false)}>
          <div className="ap-form">
            <div className="ap-grid2">
              <Field label="Name *"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Restaurant name" /></Field>
              <Field label="Cuisine *"><input value={form.cuisine} onChange={e => setForm({ ...form, cuisine: e.target.value })} placeholder="e.g. Indian, Italian" /></Field>
            </div>
            <Field label="Description"><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Short description" /></Field>
            <Field label="Address"><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Full address" /></Field>
            <div className="ap-grid3">
              <Field label="Delivery time"><input value={form.delivery_time} onChange={e => setForm({ ...form, delivery_time: e.target.value })} placeholder="30-45 min" /></Field>
              <Field label="Delivery fee (₹)"><input type="number" value={form.delivery_fee} onChange={e => setForm({ ...form, delivery_fee: parseFloat(e.target.value) })} /></Field>
              <Field label="Min order (₹)"><input type="number" value={form.min_order} onChange={e => setForm({ ...form, min_order: parseFloat(e.target.value) })} /></Field>
            </div>
            <Field label="Image URL"><input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></Field>
            <div className="ap-checkbox">
              <input type="checkbox" id="is_open" checked={form.is_open} onChange={e => setForm({ ...form, is_open: e.target.checked })} />
              <label htmlFor="is_open">Open for orders</label>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="ap-btn primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Restaurant'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Menu Tab ───────────────────────────────────────────────────────────────
function MenuTab() {
  const [restaurants, setRestaurants] = useState([])
  const [selectedRest, setSelectedRest] = useState('')
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ restaurant_id: '', name: '', description: '', price: '', category: 'Main Course', image_url: '', is_available: true })

  useEffect(() => {
    api.get('/api/restaurants/admin/all').then(r => {
      setRestaurants(r.data)
      if (r.data.length) setSelectedRest(String(r.data[0].id))
    })
  }, [])

  useEffect(() => {
    if (!selectedRest) return
    setLoading(true)
    api.get(`/api/menu/restaurant/${selectedRest}`)
      .then(r => {
        const flat = Object.values(r.data).flat()
        setMenuItems(flat)
      })
      .finally(() => setLoading(false))
  }, [selectedRest])

  const openAdd = () => {
    setEditing(null)
    setForm({ restaurant_id: selectedRest, name: '', description: '', price: '', category: 'Main Course', image_url: '', is_available: true })
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setForm({ restaurant_id: item.restaurant_id, name: item.name, description: item.description || '', price: item.price, category: item.category || 'Main Course', image_url: item.image_url || '', is_available: item.is_available })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/api/menu/${editing.id}`, form)
      } else {
        await api.post('/api/menu', { ...form, restaurant_id: parseInt(selectedRest), price: parseFloat(form.price) })
      }
      setShowModal(false)
      // Reload menu
      const r = await api.get(`/api/menu/restaurant/${selectedRest}`)
      setMenuItems(Object.values(r.data).flat())
    } catch (e) {
      alert(e.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    try {
      await api.delete(`/api/menu/${item.id}`)
      setMenuItems(prev => prev.filter(i => i.id !== item.id))
    } catch (e) { alert('Delete failed') }
  }

  const toggleAvailable = async (item) => {
    try {
      await api.put(`/api/menu/${item.id}`, { is_available: !item.is_available })
      setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i))
    } catch (e) { alert('Update failed') }
  }

  return (
    <div>
      <div className="ap-toolbar">
        <div className="ap-row">
          <h2 className="ap-section-title">Menu Items</h2>
          <select className="ap-select" value={selectedRest} onChange={e => setSelectedRest(e.target.value)}>
            {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <button className="ap-btn primary" onClick={openAdd}>+ Add Item</button>
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr><th>Item</th><th>Category</th><th>Price</th><th>Available</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {menuItems.length === 0 && <tr><td colSpan={5} className="ap-empty">No items — add one above</td></tr>}
              {menuItems.map(item => (
                <tr key={item.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {item.image_url && <img src={item.image_url} alt={item.name} style={{ width: 40, height: 36, objectFit: 'cover', borderRadius: 6 }} />}
                      <div>
                        <div className="ap-cell-main">{item.name}</div>
                        <div className="ap-cell-sub">{item.description?.slice(0, 40)}{item.description?.length > 40 ? '…' : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="ap-pill pill-blue">{item.category}</span></td>
                  <td className="ap-amount">₹{item.price}</td>
                  <td>
                    <button className={`ap-toggle ${item.is_available ? 'on' : 'off'}`} onClick={() => toggleAvailable(item)}>
                      {item.is_available ? '✅ Yes' : '❌ No'}
                    </button>
                  </td>
                  <td>
                    <div className="ap-row">
                      <button className="ap-btn ap-btn-sm" onClick={() => openEdit(item)}>✏️</button>
                      <button className="ap-btn ap-btn-sm danger" onClick={() => handleDelete(item)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Menu Item' : 'Add Menu Item'} onClose={() => setShowModal(false)}>
          <div className="ap-form">
            <div className="ap-grid2">
              <Field label="Name *"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Item name" /></Field>
              <Field label="Category"><input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Main Course" /></Field>
            </div>
            <Field label="Description"><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Short description" /></Field>
            <div className="ap-grid2">
              <Field label="Price (₹) *"><input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0.00" /></Field>
              <Field label="Image URL"><input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></Field>
            </div>
            <div className="ap-checkbox">
              <input type="checkbox" id="is_avail" checked={form.is_available} onChange={e => setForm({ ...form, is_available: e.target.checked })} />
              <label htmlFor="is_avail">Available for ordering</label>
            </div>
            <div className="ap-modal-actions">
              <button className="ap-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="ap-btn primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Users Tab ──────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/users').then(r => setUsers(r.data)).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="ap-toolbar">
        <h2 className="ap-section-title">Users</h2>
        <span className="ap-cell-sub">{users.length} total</span>
      </div>
      {loading ? <div className="spinner" /> : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className="ap-id">#{u.id}</td>
                  <td className="ap-cell-main">{u.name}</td>
                  <td className="ap-cell-sub">{u.email}</td>
                  <td><span className={`ap-pill ${u.role === 'admin' ? 'pill-orange' : 'pill-blue'}`}>{u.role}</span></td>
                  <td className="ap-date">{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Admin Panel ───────────────────────────────────────────────────────
export default function AdminPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('orders')

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    if (user.role !== 'admin') navigate('/')
  }, [user, navigate])

  if (!user || user.role !== 'admin') return null

  return (
    <div className="ap-page">
      <div className="ap-header">
        <div>
          <h1 className="ap-title">⚙️ Admin Panel</h1>
          <p className="ap-sub">Manage orders, restaurants, menus and users</p>
        </div>
        <div className="ap-admin-badge">
          <span>👑</span>
          <span>{user.name}</span>
        </div>
      </div>

      <div className="ap-tabs">
        {TABS.map(t => (
          <button key={t} className={`ap-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="ap-content">
        {tab === 'orders'      && <OrdersTab />}
        {tab === 'restaurants' && <RestaurantsTab />}
        {tab === 'menu'        && <MenuTab />}
        {tab === 'users'       && <UsersTab />}
      </div>
    </div>
  )
}
