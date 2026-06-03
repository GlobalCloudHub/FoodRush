import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import './Navbar.css'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { count } = useCart()
  const navigate = useNavigate()

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <span className="brand-icon">🔥</span>
        <span className="brand-name">FoodRush</span>
      </Link>

      <div className="navbar-actions">
        {user ? (
          <>
            <Link to="/orders" className="nav-link">My Orders</Link>
            {user.role === 'admin' && (
              <Link to="/admin" className="nav-link admin-link">⚙️ Admin</Link>
            )}
            <button className="btn btn-ghost" onClick={() => { logout(); navigate('/') }}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-link">Login</Link>
            <Link to="/register" className="btn btn-primary">Sign up</Link>
          </>
        )}
        <Link to="/cart" className="cart-btn">
          <span>🛒</span>
          {count > 0 && <span className="cart-badge">{count}</span>}
        </Link>
      </div>
    </nav>
  )
}
