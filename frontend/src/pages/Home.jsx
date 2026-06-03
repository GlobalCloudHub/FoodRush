import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'
import './Home.css'

export default function Home() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/restaurants').then(r => setRestaurants(r.data)).finally(() => setLoading(false))
  }, [])

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!search.trim()) {
      const r = await api.get('/api/restaurants')
      setRestaurants(r.data)
      return
    }
    const r = await api.get(`/api/restaurants/search/${search}`)
    setRestaurants(r.data)
  }

  const cuisines = [...new Set(restaurants.map(r => r.cuisine))]

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">🚀 Fast delivery in Pune</div>
          <h1 className="hero-title">
            Hunger?<br />
            <span className="accent-text">Sorted.</span>
          </h1>
          <p className="hero-sub">From the city's finest kitchens to your doorstep in 30 minutes.</p>
          <form onSubmit={handleSearch} className="search-form">
            <span className="search-icon">🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search restaurants or cuisines…"
              className="search-input"
            />
            <button type="submit" className="btn btn-primary">Search</button>
          </form>
        </div>
        <div className="hero-visual">
          <div className="hero-blob" />
          <div className="hero-emoji-float">🍕</div>
          <div className="hero-emoji-float" style={{ animationDelay: '0.4s' }}>🍜</div>
          <div className="hero-emoji-float" style={{ animationDelay: '0.8s' }}>🍔</div>
        </div>
      </section>

      {cuisines.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="section-title">Browse by cuisine</h2>
            <div className="cuisine-pills">
              {cuisines.map(c => (
                <button key={c} className="cuisine-pill" onClick={async () => {
                  const r = await api.get(`/api/restaurants/search/${c}`)
                  setRestaurants(r.data)
                }}>{c}</button>
              ))}
              <button className="cuisine-pill active" onClick={async () => {
                const r = await api.get('/api/restaurants')
                setRestaurants(r.data)
              }}>All</button>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <h2 className="section-title">Restaurants near you</h2>
          {loading ? <div className="spinner" /> : (
            <div className="restaurants-grid fade-in">
              {restaurants.map(r => (
                <Link to={`/restaurant/${r.id}`} key={r.id} className="restaurant-card">
                  <div className="card-img-wrap">
                    <img src={r.image_url} alt={r.name} className="card-img" />
                    <div className="card-badge">
                      <span className="star">⭐</span> {r.rating}
                    </div>
                    {!r.is_open && <div className="closed-overlay">Closed</div>}
                  </div>
                  <div className="card-body">
                    <div className="card-top">
                      <h3 className="card-name">{r.name}</h3>
                      <span className="tag">{r.cuisine}</span>
                    </div>
                    <p className="card-desc">{r.description}</p>
                    <div className="card-meta">
                      <span>🕐 {r.delivery_time}</span>
                      <span>·</span>
                      <span>₹{r.delivery_fee} delivery</span>
                      <span>·</span>
                      <span>Min ₹{r.min_order}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {!loading && restaurants.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: 48 }}>🍽️</div>
              <p>No restaurants found. Try a different search.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
