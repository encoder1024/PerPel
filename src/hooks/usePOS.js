import { useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { useOffline } from './useOffline';
import { v4 as uuidv4 } from 'uuid';

export const usePOS = () => {
  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { profile } = useAuthStore();
  const { isOnline, syncService, db } = useOffline();

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

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer(null);
  };

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
          // Solo liberar stock si es un PRODUCTO
          if (item.item_type === 'PRODUCT' || !item.item_type) { // Fallback por si item_type no viene en la orden simplificada
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
        }

        // 2. Update Order status to ABANDONED
        const { error: updateError } = await supabase
          .schema('core')
          .from('orders')
          .update({ status: 'ABANDONED' })
          .eq('id', orderId);

        if (updateError) throw updateError;
      } else {
        // Offline: Enqueue cancellation and local stock recovery
        await syncService.enqueueOperation('UPDATE', 'orders', { id: orderId, status: 'ABANDONED' });
        
        for (const item of orderItems) {
            const stockId = `${item.id}:${businessId}`;
            const stockItem = await db.stock_levels.findOne(stockId).exec();
            if (stockItem) {
                await stockItem.patch({ quantity: stockItem.quantity + item.quantity });
            }
        }
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

  const createOrder = async (customerData) => {
    if (cart.length === 0) return { success: false, error: 'El carrito está vacío.' };
    if (!profile?.account_id || !profile?.id || !customerData.business_id) {
        return { success: false, error: 'Información de usuario o negocio incompleta para crear la orden.' };
    }

    setLoading(true);
    setError(null);
    const orderId = uuidv4();
    const totalAmount = calculateTotal();

    // Support selected customer or manual data
    // If it's CONSUMIDOR_FINAL (id starts with 000...), we send null to the database
    const isConsumidorFinal = selectedCustomer?.id === '00000000-0000-0000-0000-000000000000' || !selectedCustomer;
    const clientId = isConsumidorFinal ? null : selectedCustomer.id;
    
    const customerName = selectedCustomer?.full_name || customerData.name || 'Consumidor Final';
    const customerDocType = selectedCustomer?.doc_type || customerData.docType || '99';
    const customerDocNumber = selectedCustomer?.doc_number || customerData.docNumber || '0';

    const order = {
      id: orderId,
      account_id: profile.account_id,
      client_id: clientId,
      business_id: customerData.business_id,
      total_amount: totalAmount,
      status: 'PENDING',
      customer_name: customerName,
      customer_doc_type: customerDocType,
      customer_doc_number: customerDocNumber,
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

    try {
      if (isOnline) {
        // --- STEP 1: Reserve Stock (Online Only) ---
        for (const item of cart) {
            // SOLO reservar stock si es un PRODUCTO
            if (item.item_type === 'PRODUCT') {
                const { data: stockAdjResult, error: stockAdjError } = await supabase.rpc('adjust_stock', {
                    p_item_id: item.id,
                    p_business_id: customerData.business_id,
                    p_account_id: profile.account_id,
                    p_quantity_change: -item.quantity, // Negative for RESERVE_OUT
                    p_movement_type: 'RESERVE_OUT',
                    p_reason: `Reserva para orden POS: ${orderId}`,
                    p_user_id: profile.id
                });

                if (stockAdjError) throw new Error(`Error reservando stock: ${stockAdjError.message}`);
                if (stockAdjResult.status === 'error') throw new Error(`Stock insuficiente: ${stockAdjResult.message}`);
            }
        }

        // --- STEP 2: Create Order in Supabase ---
        const { error: orderError } = await supabase.schema('core').from('orders').insert(order);
        if (orderError) throw orderError;

        const { error: itemsError } = await supabase.schema('core').from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;

      } else {
        // --- OFFLINE FLOW ---
        // 1. Update stock in RxDB (Offline reservation)
        for (const item of cart) {
            if (item.item_type === 'PRODUCT') {
                const stockId = `${item.id}:${customerData.business_id}`;
                const stockItem = await db.stock_levels.findOne(stockId).exec();
                if (stockItem) {
                    await stockItem.patch({ quantity: stockItem.quantity - item.quantity });
                }
            }
        }

        // 2. Enqueue order creation
        await syncService.enqueueOperation('INSERT', 'orders', order);
        for (const item of orderItems) {
          await syncService.enqueueOperation('INSERT', 'order_items', item);
        }
      }
      return { success: true, orderId };
    } catch (err) {
      console.error('Error creating order:', err.message);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const createCustomer = async (customerData) => {
    setLoading(true);
    setError(null);
    const customerId = uuidv4();
    const newCustomer = {
        id: customerId,
        account_id: profile.account_id,
        business_id: customerData.business_id,
        full_name: customerData.full_name,
        email: customerData.email || '',
        phone_number: customerData.phone_number || '',
        doc_type: customerData.doc_type || '99',
        doc_number: customerData.doc_number || '0',
        iva_condition: customerData.iva_condition || 'Consumidor Final',
        category: 'NEW',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: false
    };

    try {
        if (isOnline) {
            const { error: insertError } = await supabase
                .schema('core')
                .from('customers')
                .insert(newCustomer);
            if (insertError) throw insertError;
        } else {
            // Save to local RxDB
            await db.customers.insert(newCustomer);
            // Enqueue for sync
            await syncService.enqueueOperation('INSERT', 'customers', newCustomer);
        }
        
        // Auto-select the newly created customer
        setSelectedCustomer(newCustomer);
        return { success: true, customer: newCustomer };
    } catch (err) {
        console.error('Error creating customer:', err.message);
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

  const findProductBySKU = async (sku) => {
    if (!sku) return { success: false, error: 'SKU requerido.' };
    setLoading(true);
    setError(null);

    try {
      // 1. Buscar en RxDB (Local)
      const rxItem = await db.inventory_items
        .findOne({
          selector: { sku: sku, account_id: profile.account_id }
        })
        .exec();

      if (rxItem) {
        return { success: true, item: rxItem.toJSON(), source: 'local' };
      }

      // 2. Si no está local, devolver que no se encontró para que la UI pregunte por búsqueda remota
      return { success: false, code: 'NOT_FOUND_LOCAL' };
    } catch (err) {
      console.error('Error en búsqueda local:', err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const findProductRemote = async (sku) => {
    if (!isOnline) return { success: false, error: 'Sin conexión a internet.' };
    setLoading(true);
    setError(null);

    try {
      const { data, error: sbError } = await supabase
        .schema('core')
        .from('inventory_items')
        .select('*')
        .eq('sku', sku)
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false)
        .single();

      if (sbError) {
        if (sbError.code === 'PGRST116') return { success: false, error: 'Producto no encontrado en el servidor.' };
        throw sbError;
      }

      return { success: true, item: data, source: 'remote' };
    } catch (err) {
      console.error('Error en búsqueda remota:', err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  // Flow for "Pay Later"
  const payLater = async (orderId) => {
    // Already in PENDING status, just return success
    return { success: true, status: 'PENDING' };
  };

  return {
    cart,
    selectedCustomer,
    setSelectedCustomer,
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
    payLater,
    findProductBySKU,
    findProductRemote,
    createCustomer
  };
};
