import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import './Navbar.css'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { count } = useCart()
  const navigate = useNavigate()

  // 🔥 THE ULTIMATE FIX: Read the exact role directly from the secure JWT Token!
  let isAdmin = false;
  const token = localStorage.getItem('token');
  if (token) {
    try {
      // Decode the token payload right here in the browser
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role === 'admin' || payload.role === 'Admin') {
        isAdmin = true;
      }
    } catch (e) {
      console.error("Token read error", e);
    }
  }

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
            
            {/* If the token says you are an admin, show the button! */}
            {isAdmin && (
              <Link to="/admin" className="nav-link admin-link" style={{ fontWeight: 'bold', color: '#92400e', background: '#fef3c7', padding: '5px 10px', borderRadius: '5px' }}>
                ⚙️ Admin
              </Link>
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