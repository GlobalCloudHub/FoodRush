import { createContext, useContext, useReducer } from 'react'

const CartContext = createContext(null)

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD': {
      const existing = state.items.find(i => i.id === action.item.id)
      if (existing) {
        return { ...state, items: state.items.map(i => i.id === action.item.id ? { ...i, qty: i.qty + 1 } : i) }
      }
      return { restaurantId: action.restaurantId, items: [...state.items, { ...action.item, qty: 1 }] }
    }
    case 'REMOVE':
      return { ...state, items: state.items.filter(i => i.id !== action.id) }
    case 'UPDATE_QTY':
      return {
        ...state,
        items: state.items.map(i => i.id === action.id ? { ...i, qty: action.qty } : i).filter(i => i.qty > 0)
      }
    case 'CLEAR':
      return { restaurantId: null, items: [] }
    default:
      return state
  }
}

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(cartReducer, { restaurantId: null, items: [] })

  const total = cart.items.reduce((sum, i) => sum + i.price * i.qty, 0)
  const count = cart.items.reduce((sum, i) => sum + i.qty, 0)

  const addItem = (item, restaurantId) => {
    if (cart.restaurantId && cart.restaurantId !== restaurantId) {
      if (!window.confirm('Start a new cart from this restaurant? Your current cart will be cleared.')) return
      dispatch({ type: 'CLEAR' })
    }
    dispatch({ type: 'ADD', item, restaurantId })
  }

  return (
    <CartContext.Provider value={{ cart, total, count, addItem, dispatch }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
