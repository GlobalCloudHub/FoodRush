import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import './Orders.css'

const STATUS_STEPS = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered']
const STATUS_LABELS = {
  pending: '⏳ Pending', confirmed: '✅ Confirmed', preparing: '👨‍🍳 Preparing',
  out_for_delivery: '🛵 Out for delivery', delivered: '🎉 Delivered', cancelled: '❌ Cancelled'
}

export default function Orders() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    api.get('/api/orders/my').then(r => setOrders(r.data)).finally(() => setLoading(false))
  }, [user])

  if (loading) return <div className="spinner" style={{ marginTop: 80 }} />

  return (
    <div className="orders-page">
      <div className="orders-container">
        <h1 className="orders-title">My Orders</h1>
        {orders.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 56 }}>📦</div>
            <p>No orders yet. Start exploring!</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>Browse restaurants</button>
          </div>
        ) : (
          <div className="orders-list fade-in">
            {orders.map(order => {
              const stepIdx = STATUS_STEPS.indexOf(order.status)
              return (
                <div key={order.id} className="order-card">
                  <div className="order-header">
                    <div>
                      <span className="order-id">Order #{order.id}</span>
                      <span className={`status-badge status-${order.status}`}>{STATUS_LABELS[order.status]}</span>
                    </div>
                    <div className="order-meta">
                      <span>₹{order.total_amount}</span>
                      <span className="dot">·</span>
                      <span>{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>

                  {order.status !== 'cancelled' && order.status !== 'delivered' && (
                    <div className="progress-track">
                      {STATUS_STEPS.map((s, i) => (
                        <div key={s} className={`progress-step ${i <= stepIdx ? 'done' : ''} ${i === stepIdx ? 'current' : ''}`}>
                          <div className="step-dot" />
                          <span className="step-label">{s.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="order-address">
                    <span>📍</span> {order.delivery_address}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
