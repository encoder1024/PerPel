import { useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { useOffline } from './useOffline';
import { v4 as uuidv4 } from 'uuid';

export const usePOS = () => {
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { profile } = useAuthStore();
  const { isOnline, syncService } = useOffline();

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCart((prev) => prev.filter((i) => i.id !== itemId));
  };

  const updateQuantity = (itemId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, quantity } : i))
    );
  };

  const clearCart = () => setCart([]);

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + item.selling_price * item.quantity, 0);
  };

  const createOrder = async (customerData) => {
    if (cart.length === 0) return { success: false, error: 'El carrito está vacío.' };
    
    setLoading(true);
    const orderId = uuidv4();
    const totalAmount = calculateTotal();

    const order = {
      id: orderId,
      account_id: profile?.account_id,
      client_id: profile?.id, // Default to current user if no customer selected
      business_id: customerData.business_id, // This should come from a business selector
      total_amount: totalAmount,
      status: 'PENDING',
      customer_name: customerData.name || 'Consumidor Final',
      customer_doc_type: customerData.docType || '99',
      customer_doc_number: customerData.docNumber || '0',
      created_at: new Date().toISOString(),
    };

    const orderItems = cart.map((item) => ({
      id: uuidv4(),
      account_id: profile?.account_id,
      order_id: orderId,
      item_id: item.id,
      quantity: item.quantity,
      unit_price: item.selling_price,
      created_at: new Date().toISOString(),
    }));

    if (isOnline) {
      try {
        // Create Order
        const { error: orderError } = await supabase.from('orders').insert(order);
        if (orderError) throw orderError;

        // Create Order Items
        const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;

        clearCart();
        return { success: true, orderId };
      } catch (err) {
        console.error('Error creating order in Supabase:', err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    } else {
      // Offline Flow
      try {
        await syncService.enqueueOperation('INSERT', 'orders', order);
        for (const item of orderItems) {
          await syncService.enqueueOperation('INSERT', 'order_items', item);
        }
        clearCart();
        return { success: true, orderId, offline: true };
      } catch (err) {
        console.error('Error creating order offline:', err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    }
  };

  return {
    cart,
    loading,
    error,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    calculateTotal,
    createOrder,
  };
};
