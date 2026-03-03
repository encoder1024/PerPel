import { useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';

export const useInvoices = () => {
  const { profile } = useAuthStore();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Obtiene la lista de facturas filtrada por cuenta y opcionalmente por negocio.
   * Obtiene datos del cliente e ítems a través de la relación con la orden.
   */
  const fetchInvoices = useCallback(async (businessId = null) => {
    if (!profile?.account_id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      let query = supabase
        .schema('core')
        .from('invoices')
        .select(`
          *,
          businesses:business_id (name),
          order:order_id (
            customer_name,
            customer_doc_number,
            customer_doc_type,
            customers (full_name, doc_number, doc_type),
            order_items (
              quantity,
              unit_price,
              inventory_items (name)
            )
          )
        `)
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (businessId) {
        query = query.eq('business_id', businessId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setInvoices(data || []);
    } catch (err) {
      console.error('Error fetching invoices:', err.message);
      setError('No se pudieron cargar las facturas.');
    } finally {
      setLoading(false);
    }
  }, [profile?.account_id]);

  /**
   * Obtiene los logs de la API para una orden específica.
   */
  const fetchInvoiceLogs = async (orderId) => {
    if (!orderId) return [];
    try {
      const { data, error: logsError } = await supabase
        .schema('logs')
        .from('api_logs')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (logsError) throw logsError;
      return data || [];
    } catch (err) {
      console.error('Error fetching invoice logs:', err.message);
      return [];
    }
  };

  /**
   * Invoca la Edge Function para generar una factura en TusFacturasApp.
   */
  const generateInvoice = async (orderId, invoiceOptions = {}) => {
    if (!orderId) return { success: false, error: 'orderId es requerido' };
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tfa-invoice-generator', {
        body: { action: 'create', orderId, invoiceOptions }
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      await fetchInvoices();
      return { success: true, data };
    } catch (err) {
      console.error('Error generating invoice:', err.message);
      setError(err.message || 'Error al generar la factura.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Obtiene las alícuotas de IVA desde la tabla local de Supabase.
   */
  const fetchVatRates = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .schema('core')
        .from('tax_rates')
        .select('id:tfa_id, nombre:name')
        .eq('is_active', true)
        .order('value', { ascending: false });

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      console.error('Error fetching VAT rates from DB:', err.message);
      return [];
    }
  };

  /**
   * Actualiza los datos de una factura (ej. observaciones) antes de imprimir/enviar.
   */
  const updateInvoice = async (invoiceId, updates) => {
    if (!invoiceId) return { success: false, error: 'invoiceId es requerido' };
    
    setLoading(true);
    setError(null);
    
    try {
      const { error: updateError } = await supabase
        .schema('core')
        .from('invoices')
        .update(updates)
        .eq('id', invoiceId)
        .eq('account_id', profile.account_id);

      if (updateError) throw updateError;

      // Si la factura ya fue enviada a Alegra, se podría invocar un sync opcionalmente aquí
      await fetchInvoices();
      return { success: true };
    } catch (err) {
      console.error('Error updating invoice:', err.message);
      setError('No se pudo actualizar la factura.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Anula una factura fiscalmente en Alegra.
   */
  const voidInvoice = async (invoiceId) => {
    if (!invoiceId) return { success: false, error: 'invoiceId es requerido' };
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('alegra-invoice-generator', {
        body: { action: 'void', invoiceId }
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      await fetchInvoices();
      return { success: true };
    } catch (err) {
      console.error('Error voiding invoice:', err.message);
      setError(err.message || 'Error al anular la factura en Alegra.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Borrado lógico del registro de la factura en Supabase.
   */
  const deleteInvoice = async (invoiceId) => {
    if (!invoiceId) return { success: false, error: 'invoiceId es requerido' };
    
    setLoading(true);
    setError(null);
    
    try {
      const { error: deleteError } = await supabase
        .schema('core')
        .from('invoices')
        .update({ is_deleted: true })
        .eq('id', invoiceId)
        .eq('account_id', profile.account_id);

      if (deleteError) throw deleteError;

      setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
      return { success: true };
    } catch (err) {
      console.error('Error deleting invoice:', err.message);
      setError('No se pudo eliminar el registro.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Obtiene la URL firmada del PDF para visualización o envío.
   */
  const getInvoiceDownloadUrl = async (storagePath) => {
    if (!storagePath) return null;
    
    try {
      const { data, error: storageError } = await supabase.storage
        .from('perpel_data')
        .createSignedUrl(storagePath, 3600); // 1 hora de validez

      if (storageError) throw storageError;
      return data.signedUrl;
    } catch (err) {
      console.error('Error getting download URL:', err.message);
      return null;
    }
  };

  /**
   * Lista órdenes pagadas o pendientes sin factura emitida.
   */
  const fetchPendingOrders = useCallback(async (businessId = null) => {
    if (!profile?.account_id) return [];
    
    try {
      let query = supabase
        .schema('core')
        .from('orders')
        .select(`
          *,
          customers!orders_customer_id_fkey(*),
          businesses(*),
          order_items(
            *,
            inventory_items(name)
          )
        `)
        .eq('account_id', profile.account_id)
        .in('status', ['PAID', 'PENDING'])
        .eq('is_deleted', false);

      if (businessId) {
        query = query.eq('business_id', businessId);
      }

      const { data: orders, error: ordersError } = await query;
      if (ordersError) throw ordersError;

      const { data: existingInvoices, error: invError } = await supabase
        .schema('core')
        .from('invoices')
        .select('order_id')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);
      
      if (invError) throw invError;
      
      const invoicedOrderIds = new Set(existingInvoices.map(inv => inv.order_id));
      return orders.filter(order => !invoicedOrderIds.has(order.id));
    } catch (err) {
      console.error('Error fetching pending orders:', err.message);
      return [];
    }
  }, [profile?.account_id]);

  /**
   * Marca una orden como pagada manualmente.
   */
  const markOrderAsPaid = async (orderId) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('orders')
        .update({ status: 'PAID' })
        .eq('id', orderId);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  /**
   * Obtiene las provincias desde TusFacturasApp.
   */
  const fetchProvinces = async (businessId) => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tfa-invoice-generator', {
        body: { action: 'provincias', businessId }
      });
      if (invokeError) throw invokeError;
      return data.datos?.map(item => ({ id: item.valor, nombre: item.nombre })) || [];
    } catch (err) {
      console.error('Error fetching provinces:', err.message);
      return [];
    }
  };

  /**
   * Obtiene los tipos de comprobantes desde TusFacturasApp.
   */
  const fetchInvoiceTypes = async (businessId) => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tfa-invoice-generator', {
        body: { action: 'comprobantes_tipos', businessId }
      });
      if (invokeError) throw invokeError;
      return data.datos?.map(item => ({ id: item.valor, nombre: item.nombre })) || [];
    } catch (err) {
      console.error('Error fetching invoice types:', err.message);
      return [];
    }
  };

  /**
   * Obtiene las condiciones de venta (pago) desde TusFacturasApp.
   */
  const fetchPaymentConditions = async (businessId) => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tfa-invoice-generator', {
        body: { action: 'condiciones_venta', businessId }
      });
      if (invokeError) throw invokeError;
      return data.datos?.map(item => ({ id: item.valor, nombre: item.nombre })) || [];
    } catch (err) {
      console.error('Error fetching payment conditions:', err.message);
      return [];
    }
  };

  /**
   * Obtiene las condiciones de IVA desde TusFacturasApp.
   */
  const fetchIvaConditions = async (businessId) => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tfa-invoice-generator', {
        body: { action: 'condiciones_iva', businessId }
      });
      if (invokeError) throw invokeError;
      return data.datos?.map(item => ({ id: item.valor, nombre: item.nombre })) || [];
    } catch (err) {
      console.error('Error fetching IVA conditions:', err.message);
      return [];
    }
  };

  /**
   * Obtiene los tipos de documentos desde TusFacturasApp.
   */
  const fetchDocumentTypes = async (businessId) => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('tfa-invoice-generator', {
        body: { action: 'documentos_tipos', businessId }
      });
      if (invokeError) throw invokeError;
      return data.datos?.map(item => ({ id: item.valor, nombre: item.nombre })) || [];
    } catch (err) {
      console.error('Error fetching document types:', err.message);
      return [];
    }
  };

  /**
   * Busca clientes en la base de datos por nombre o documento.
   */
  const searchCustomers = async (search) => {
    if (!profile?.account_id) return [];
    try {
      let query = supabase
        .schema('core')
        .from('customers')
        .select('*')
        .eq('account_id', profile.account_id)
        .eq('is_deleted', false);

      if (search) {
        query = query.or(`full_name.ilike.%${search}%,doc_number.ilike.%${search}%`);
      }

      const { data, error: searchError } = await query.limit(10);
      if (searchError) throw searchError;
      return data || [];
    } catch (err) {
      console.error('Error searching customers:', err.message);
      return [];
    }
  };

  /**
   * Crea un nuevo cliente en core.customers.
   */
  const createCustomer = async (customerData) => {
    if (!profile?.account_id) return { success: false, error: 'No account session' };
    try {
      const { data, error } = await supabase
        .schema('core')
        .from('customers')
        .insert({ ...customerData, account_id: profile.account_id })
        .select()
        .single();
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  /**
   * Actualiza un cliente existente en core.customers.
   */
  const updateCustomer = async (customerId, customerData) => {
    try {
      const { data, error } = await supabase
        .schema('core')
        .from('customers')
        .update(customerData)
        .eq('id', customerId)
        .select()
        .single();
      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  /**
   * Actualiza el cliente vinculado a una orden.
   */
  const updateOrderCustomer = async (orderId, customerId, customerName) => {
    try {
      const { error } = await supabase
        .schema('core')
        .from('orders')
        .update({ client_id: customerId, customer_name: customerName })
        .eq('id', orderId);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return {
    invoices,
    loading,
    error,
    fetchInvoices,
    generateInvoice,
    updateInvoice,
    voidInvoice,
    deleteInvoice,
    getInvoiceDownloadUrl,
    fetchPendingOrders,
    fetchInvoiceLogs,
    fetchVatRates,
    fetchProvinces,
    fetchInvoiceTypes,
    fetchPaymentConditions,
    fetchIvaConditions,
    fetchDocumentTypes,
    searchCustomers,
    createCustomer,
    updateCustomer,
    updateOrderCustomer,
    markOrderAsPaid
  };
};
