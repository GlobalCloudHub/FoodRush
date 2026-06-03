import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../api'
import { useCart } from '../context/CartContext'
import './Restaurant.css'

export default function Restaurant() {
  const { id } = useParams()
  const [restaurant, setRestaurant] = useState(null)
  const [menu, setMenu] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState(null)
  const { addItem, cart } = useCart()

  useEffect(() => {
    Promise.all([
      api.get(`/api/restaurants/${id}`),
      api.get(`/api/menu/restaurant/${id}`)
    ]).then(([rRes, mRes]) => {
      setRestaurant(rRes.data)
      setMenu(mRes.data)
      const cats = Object.keys(mRes.data)
      if (cats.length) setActiveCategory(cats[0])
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="spinner" style={{ marginTop: 80 }} />
  if (!restaurant) return <div style={{ padding: 40, textAlign: 'center' }}>Restaurant not found.</div>

  const categories = Object.keys(menu)
  const getQty = (itemId) => cart.items.find(i => i.id === itemId)?.qty || 0

  return (
    <div className="restaurant-detail">
      <div className="restaurant-hero" style={{ backgroundImage: `url(${restaurant.image_url})` }}>
        <div className="restaurant-hero-overlay">
          <div className="restaurant-hero-content">
            <span className="tag">{restaurant.cuisine}</span>
            <h1 className="restaurant-hero-title">{restaurant.name}</h1>
            <p className="restaurant-hero-desc">{restaurant.description}</p>
            <div className="restaurant-stats">
              <div className="stat"><span>⭐</span><span>{restaurant.rating}</span></div>
              <div className="stat"><span>🕐</span><span>{restaurant.delivery_time}</span></div>
              <div className="stat"><span>🛵</span><span>₹{restaurant.delivery_fee} delivery</span></div>
              <div className="stat"><span>📦</span><span>Min ₹{restaurant.min_order}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="menu-layout">
        <aside className="category-nav">
          <div className="category-nav-inner">
            <h3 className="category-nav-title">Menu</h3>
            {categories.map(cat => (
              <button
                key={cat}
                className={`category-item ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
                <span className="cat-count">{menu[cat].length}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="menu-items">
          {categories.map(cat => (
            <section key={cat} className={`menu-section fade-in ${activeCategory === cat ? 'active-section' : ''}`}>
              <h2 className="menu-section-title">{cat}</h2>
              <div className="items-list">
                {menu[cat].map(item => {
                  const qty = getQty(item.id)
                  return (
                    <div key={item.id} className="menu-item-card">
                      <div className="item-info">
                        <h4 className="item-name">{item.name}</h4>
                        <p className="item-desc">{item.description}</p>
                        <div className="item-price">₹{item.price}</div>
                      </div>
                      <div className="item-right">
                        {item.image_url && (
                          <img src={item.image_url} alt={item.name} className="item-img" />
                        )}
                        {qty === 0 ? (
                          <button
                            className="btn btn-primary add-btn"
                            onClick={() => addItem({ id: item.id, name: item.name, price: item.price }, parseInt(id))}
                          >
                            + Add
                          </button>
                        ) : (
                          <div className="qty-control">
                            <button className="qty-btn">–</button>
                            <span className="qty-num">{qty}</span>
                            <button className="qty-btn" onClick={() => addItem({ id: item.id, name: item.name, price: item.price }, parseInt(id))}>+</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  )
}
