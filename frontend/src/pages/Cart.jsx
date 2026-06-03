import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import './Cart.css'

export default function Cart() {
  const { cart, total, dispatch } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')

  const handlePlaceOrder = async () => {
    if (!user) { navigate('/login'); return }
    if (!address.trim()) { setError('Please enter a delivery address'); return }

    setPlacing(true)
    setError('')
    try {
      const items = cart.items.map(i => ({ menu_item_id: i.id, quantity: i.qty }))
      const { data } = await api.post('/api/orders', {
        restaurant_id: cart.restaurantId,
        items,
        delivery_address: address,
        notes,
      })
      dispatch({ type: 'CLEAR' })
      navigate(`/orders`)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to place order. Please try again.')
    } finally {
      setPlacing(false)
    }
  }

  if (!cart.items.length) return (
    <div className="cart-empty">
      <div style={{ fontSize: 64 }}>🛒</div>
      <h2>Your cart is empty</h2>
      <p>Add items from a restaurant to get started</p>
      <button className="btn btn-primary" onClick={() => navigate('/')}>Browse Restaurants</button>
    </div>
  )

  return (
    <div className="cart-page">
      <div className="cart-container">
        <h1 className="cart-title">Your Order</h1>

        <div className="cart-layout">
          <div className="cart-items">
            {cart.items.map(item => (
              <div key={item.id} className="cart-item">
                <div className="cart-item-info">
                  <span className="cart-item-name">{item.name}</span>
                  <span className="cart-item-price">₹{item.price}</span>
                </div>
                <div className="cart-item-controls">
                  <button className="qty-btn" onClick={() => dispatch({ type: 'UPDATE_QTY', id: item.id, qty: item.qty - 1 })}>–</button>
                  <span className="qty-num">{item.qty}</span>
                  <button className="qty-btn" onClick={() => dispatch({ type: 'UPDATE_QTY', id: item.id, qty: item.qty + 1 })}>+</button>
                  <button className="remove-btn" onClick={() => dispatch({ type: 'REMOVE', id: item.id })}>🗑️</button>
                </div>
                <span className="cart-item-subtotal">₹{(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="cart-checkout">
            <div className="checkout-section">
              <label className="form-label">Delivery address *</label>
              <textarea
                className="form-input"
                rows={3}
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Enter your full delivery address"
              />
            </div>
            <div className="checkout-section">
              <label className="form-label">Special instructions</label>
              <textarea
                className="form-input"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any notes for the restaurant?"
              />
            </div>
            <div className="order-summary">
              <div className="summary-row"><span>Subtotal</span><span>₹{total.toFixed(2)}</span></div>
              <div className="summary-row"><span>Delivery fee</span><span>₹30</span></div>
              <div className="summary-row total-row"><span>Total</span><span>₹{(total + 30).toFixed(2)}</span></div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <button
              className="btn btn-primary place-order-btn"
              onClick={handlePlaceOrder}
              disabled={placing}
            >
              {placing ? 'Placing order…' : `Place Order — ₹${(total + 30).toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
