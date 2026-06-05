import { useState, useEffect } from 'react'
import api from '../api' // Ensures we use the correct Axios instance

export default function AdminPanel() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      // 🔥 FIXED: Added /api/ prefix so the Gateway can route it!
      const { data } = await api.get('/api/orders')
      setOrders(data)
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch orders:', err)
      setError(err.response?.status === 403 ? 'Access Denied: You must be an Admin' : 'Failed to load orders')
      setLoading(false)
    }
  }

  const updateStatus = async (orderId, newStatus) => {
    try {
      // 🔥 FIXED: Added /api/ prefix here too!
      await api.patch(`/api/orders/${orderId}/status`, { status: newStatus })
      fetchOrders() // Refresh the list instantly
    } catch (err) {
      console.error('Failed to update status:', err)
      alert('Error updating status')
    }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontSize: '20px', color: 'white' }}>Loading Admin Panel...</div>
  if (error) return <div style={{ padding: '40px', color: '#ef4444', textAlign: 'center', fontSize: '20px' }}>{error}</div>

  return (
    <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif', color: 'white' }}>
      <h2 style={{ fontSize: '26px', fontWeight: 'bold', marginBottom: '20px' }}>👑 Admin Dashboard - Order Management</h2>
      
      <div style={{ overflowX: 'auto', backgroundColor: '#1f2937', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #374151' }}>
              <th style={{ padding: '16px', color: '#9ca3af' }}>Order ID</th>
              <th style={{ padding: '16px', color: '#9ca3af' }}>Customer</th>
              <th style={{ padding: '16px', color: '#9ca3af' }}>Total Amount</th>
              <th style={{ padding: '16px', color: '#9ca3af' }}>Current Status</th>
              <th style={{ padding: '16px', color: '#9ca3af' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>No orders found in the database.</td></tr>
            ) : (
              orders.map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid #374151' }}>
                  
                  <td style={{ padding: '16px', fontSize: '16px', fontWeight: 'bold', color: '#e5e7eb' }}>
                    #{order.id} 
                  </td>

                  <td style={{ padding: '16px' }}>
                    <div style={{ fontWeight: 'bold', color: '#f3f4f6' }}>{order.user_name}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>{order.user_email}</div>
                  </td>
                  <td style={{ padding: '16px', fontWeight: 'bold', color: '#10b981', fontSize: '16px' }}>
                    ${order.total_amount}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span style={{
                      padding: '6px 12px', 
                      borderRadius: '9999px', 
                      fontSize: '12px',
                      fontWeight: 'bold',
                      backgroundColor: order.status === 'delivered' ? '#065f46' : order.status === 'cancelled' ? '#7f1d1d' : '#92400e',
                      color: 'white'
                    }}>
                      {order.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <select
                      style={{ padding: '8px', borderRadius: '6px', cursor: 'pointer', backgroundColor: '#374151', color: 'white', border: '1px solid #4b5563' }}
                      value={order.status}
                      onChange={(e) => updateStatus(order.id, e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="preparing">Preparing</option>
                      <option value="out_for_delivery">Out for Delivery</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}