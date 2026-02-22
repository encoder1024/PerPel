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

  const cancelOrder = async (orderId, businessId, orderItems) => {
    setLoading(true);
    setError(null);

    try {
      if (isOnline) {
        // 1. Release Stock in Supabase
        for (const item of orderItems) {
          const { data: adjResult, error: adjError } = await supabase.rpc('adjust_stock', {
            p_item_id: item.item_id || item.id,
            p_business_id: businessId,
            p_account_id: profile.account_id,
            p_quantity_change: item.quantity, // Positive to release
            p_movement_type: 'RESERVE_RELEASE_IN',
            p_reason: `Cancelación de orden POS: ${orderId}`,
            p_user_id: profile.id
          });

          if (adjError || adjResult.status === 'error') {
            console.error(`Error liberando stock para ${item.id}:`, adjError || adjResult.message);
          }
        }

        // 2. Update Order status to ABANDONED
        const { error: updateError } = await supabase
          .schema('core')
          .from('orders')
          .update({ status: 'ABANDONED' })
          .eq('id', orderId);

        if (updateError) throw updateError;
      } else {
        // Offline: Enqueue cancellation
        await syncService.enqueueOperation('UPDATE', 'orders', { id: orderId, status: 'ABANDONED' });
        // Note: Stock release will need to be handled by a more sophisticated sync logic or server-side trigger
      }
      return { success: true };
    } catch (err) {
      console.error('Error cancelling order:', err.message);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const processManualPayment = async (orderId, paymentData) => {
    setLoading(true);
    setError(null);

    const payment = {
      id: uuidv4(),
      account_id: profile.account_id,
      order_id: orderId,
      created_by: profile.id,
      amount: paymentData.amount,
      status: 'approved',
      payment_method_id: paymentData.method, // 'CASH', 'MERCADOPAGO_POS', etc.
      payment_type: paymentData.type || 'point',
      created_at: new Date().toISOString(),
    };

    try {
      if (isOnline) {
        // 1. Register Payment
        const { error: payError } = await supabase.schema('core').from('payments').insert(payment);
        if (payError) throw payError;

        // 2. Update Order to PAID
        const { error: orderError } = await supabase
          .schema('core')
          .from('orders')
          .update({ status: 'PAID' })
          .eq('id', orderId);

        if (orderError) throw orderError;
      } else {
        // Offline Flow
        await syncService.enqueueOperation('INSERT', 'payments', payment);
        await syncService.enqueueOperation('UPDATE', 'orders', { id: orderId, status: 'PAID' });
      }
      return { success: true };
    } catch (err) {
      console.error('Error processing manual payment:', err.message);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const createOrder = async (customerData) => {
    if (cart.length === 0) return { success: false, error: 'El carrito está vacío.' };
    if (!profile?.account_id || !profile?.id || !customerData.business_id) {
        return { success: false, error: 'Información de usuario o negocio incompleta para crear la orden.' };
    }

    setLoading(true);
    setError(null);
    const orderId = uuidv4();
    const totalAmount = calculateTotal();

    const order = {
      id: orderId,
      account_id: profile.account_id,
      client_id: profile.id, // Default to current user if no customer selected
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
      account_id: profile.account_id,
      order_id: orderId,
      item_id: item.id,
      quantity: item.quantity,
      unit_price: item.selling_price,
      created_at: new Date().toISOString(),
    }));

    if (isOnline) {
      try {
        // --- STEP 1: Reserve Stock (Online Only) ---
        const stockReservations = [];
        for (const item of cart) {
            const { data: stockAdjResult, error: stockAdjError } = await supabase.rpc('adjust_stock', {
                p_item_id: item.id,
                p_business_id: customerData.business_id,
                p_account_id: profile.account_id,
                p_quantity_change: -item.quantity, // Negative for RESERVE_OUT
                p_movement_type: 'RESERVE_OUT',
                p_reason: `Reserva para orden POS: ${orderId}`,
                p_user_id: profile.id
            });

            if (stockAdjError) {
                throw new Error(`Error reservando stock para ${item.name}: ${stockAdjError.message}`);
            }
            if (stockAdjResult.status === 'error') {
                throw new Error(`Stock insuficiente para ${item.name}: ${stockAdjResult.message}`);
            }
            stockReservations.push({ itemId: item.id, quantity: item.quantity });
        }

        // --- STEP 2: Create Order in Supabase ---
        const { error: orderError } = await supabase.schema('core').from('orders').insert(order);
        if (orderError) throw orderError;

        const { error: itemsError } = await supabase.schema('core').from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;

        // clearCart();
        return { success: true, orderId };
      } catch (err) {
        console.error('Error creating order or reserving stock:', err.message);
        setError(err.message); // Set error state for UI feedback
        // TODO: If stock reservation partially succeeded, implement a rollback mechanism here
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    } else {
      // Offline Flow - Stock reservation will be handled during sync or online processing
      // For now, only enqueue order creation. Stock check will happen server-side during sync.
      try {
        await syncService.enqueueOperation('INSERT', 'orders', order);
        for (const item of orderItems) {
          await syncService.enqueueOperation('INSERT', 'order_items', item);
        }
        // clearCart();
        return { success: true, orderId, offline: true };
      } catch (err) {
        console.error('Error creating order offline:', err.message);
        setError(err.message); // Set error state for UI feedback
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
    cancelOrder,
    processManualPayment,
  };
};
