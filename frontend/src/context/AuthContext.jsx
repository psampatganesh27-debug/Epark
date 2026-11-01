import React, { createContext, useContext, useState, useEffect } from 'react'
import { getMe, loginUser, registerUser } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('epark_token'))
  const [loading, setLoading] = useState(true)

  // Verify token on initial application load
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('epark_token')
      if (storedToken) {
        try {
          const profile = await getMe()
          setUser(profile)
        } catch {
          // Token expired or invalid
          localStorage.removeItem('epark_token')
          setUser(null)
          setToken(null)
        }
      }
      setLoading(false)
    }
    initAuth()
  }, [])

  const login = async (phone, pin) => {
    const res = await loginUser({ phone, pin })
    localStorage.setItem('epark_token', res.access_token)
    setToken(res.access_token)
    setUser(res.user)
    return res.user
  }

  const register = async (formData) => {
    const res = await registerUser(formData)
    localStorage.setItem('epark_token', res.access_token)
    setToken(res.access_token)
    setUser(res.user)
    return res.user
  }

  const logout = () => {
    localStorage.removeItem('epark_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
