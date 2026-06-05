import { createContext, useContext, useState } from 'react'
import api from '../api' 

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })

  const login = async (email, password) => {
    try {
      // 👈 RESTORED: /api/ is back so the Gateway can route it!
      const { data } = await api.post('/api/auth/login', { email, password }) 
      
      console.log("🔥 LOGIN SUCCESS! Server returned:", data.user)
      
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      setUser(data.user)
      return data
    } catch (err) {
      console.error("💥 LOGIN FAILED:", err)
      throw err
    }
  }

  const register = async (name, email, password) => {
    // 👈 RESTORED: /api/ is back!
    const { data } = await api.post('/api/auth/register', { name, email, password })
    
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    return data
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
