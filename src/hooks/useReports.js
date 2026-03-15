import { useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuthStore } from '../stores/authStore';
import { format, startOfDay, endOfDay } from 'date-fns';

export const useReports = () => {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [kpis, setKpis] = useState([]);
  const [top5, setTop5] = useState([]);
  const [details, setDetails] = useState([]);
  const [pendingDetails, setPendingDetails] = useState([]);
  const [ecommerceDetails, setEcommerceDetails] = useState([]);

  // --- REPORTE 1: FACTURACIÓN ---
  const fetchBillingReport = async (businessId, start, end) => {
    let query = supabase
      .schema('core')
      .from('invoices')
      .select(`
        id, created_at, cbte_nro, punto_venta, total_amount, order_id,
        origin:orders(origin),
        business:business_id(name)
      `)
      .eq('account_id', profile.account_id)
      .eq('is_deleted', false)
      .gte('created_at', start)
      .lte('created_at', end);

    if (businessId !== 'ALL') query = query.eq('business_id', businessId);

    const { data, error } = await query;
    if (error) throw error;

    const totalFacturado = data.reduce((acc, curr) => acc + parseFloat(curr.total_amount || 0), 0);
    const count = data.length;
    const avg = count > 0 ? totalFacturado / count : 0;

    let orderQuery = supabase
      .schema('core')
      .from('orders')
      .select('id, created_at, total_amount, origin, customer:client_id(full_name)')
      .eq('account_id', profile.account_id)
      .eq('status', 'PAID')
      .eq('is_deleted', false)
      .gte('created_at', start)
      .lte('created_at', end);

    if (businessId !== 'ALL') orderQuery = orderQuery.eq('business_id', businessId);

    const { data: ordersPaid } = await orderQuery;
    const invoicedOrderIds = new Set(data.map(inv => inv.order_id).filter(Boolean));
    const pendingOrders = ordersPaid?.filter(o => !invoicedOrderIds.has(o.id)) || [];
    const pendingAmount = pendingOrders.reduce((acc, curr) => acc + parseFloat(curr.total_amount || 0), 0);

    setPendingDetails(pendingOrders.map(o => ({
      id: o.id,
      ref: o.id.toString().substring(0, 8),
      date: format(new Date(o.created_at), 'dd/MM HH:mm'),
      concept: o.customer?.full_name || 'Consumidor Final',
      origin: o.origin,
      amountRaw: parseFloat(o.total_amount),
      amount: `$ ${parseFloat(o.total_amount).toLocaleString('es-AR')}`
    })));

    setKpis([
      { label: 'Facturación Total', value: `$ ${totalFacturado.toLocaleString('es-AR')}`, color: 'primary' },
      { label: 'Ticket Promedio', value: `$ ${Math.round(avg).toLocaleString('es-AR')}`, color: 'info' },
      { label: 'Comprobantes', value: count.toString(), color: 'success' },
      { label: 'Pendiente Facturar', value: `$ ${pendingAmount.toLocaleString('es-AR')}`, color: 'warning', clickable: true, type: 'pending' },
    ]);

    const bizSummary = {};
    data.forEach(inv => {
      const bizName = inv.business?.name || 'N/A';
      const origin = inv.origin?.origin || 'LOCAL';
      const key = `${bizName} (${origin})`;
      bizSummary[key] = (bizSummary[key] || 0) + parseFloat(inv.total_amount);
    });

    setTop5(Object.entries(bizSummary).map(([l, v]) => ({ label: l, valueRaw: v })).sort((a, b) => b.valueRaw - a.valueRaw).slice(0, 5).map(i => ({ label: i.label, value: `$ ${i.valueRaw.toLocaleString('es-AR')}` })));

    setDetails(data.map(inv => ({
      date: format(new Date(inv.created_at), 'dd/MM HH:mm'),
      concept: `Factura ${String(inv.punto_venta || 0).padStart(4, '0')}-${String(inv.cbte_nro || 0).padStart(8, '0')}`,
      origin: inv.origin?.origin || 'LOCAL',
      amount: `$ ${parseFloat(inv.total_amount).toLocaleString('es-AR')}`
    })));
  };

  // --- REPORTE 2: PRODUCTOS ---
  const fetchProductReport = async (businessId, start, end) => {
    let query = supabase
      .schema('core')
      .from('orders')
      .select(`
        id, created_at, origin, total_amount,
        items:order_items (
          quantity, unit_price,
          product:item_id (name, sku)
        )
      `)
      .eq('account_id', profile.account_id)
      .eq('status', 'PAID')
      .eq('is_deleted', false)
      .gte('created_at', start)
      .lte('created_at', end);

    if (businessId !== 'ALL') query = query.eq('business_id', businessId);

    const { data, error } = await query;
    if (error) throw error;

    const stats = {};
    let totalRevenue = 0;
    let totalQtyTN = 0;
    let totalQtyLocal = 0;

    data.forEach(order => {
      const origin = order.origin || 'LOCAL';
      order.items?.forEach(oi => {
        const sku = oi.product?.sku || 'S/SKU';
        const name = oi.product?.name || 'Desconocido';
        const qty = oi.quantity || 0;
        const subtotal = qty * parseFloat(oi.unit_price || 0);

        if (!stats[sku]) stats[sku] = { name, qtyTN: 0, qtyLocal: 0, total: 0 };
        if (origin === 'TIENDANUBE') { stats[sku].qtyTN += qty; totalQtyTN += qty; }
        else { stats[sku].qtyLocal += qty; totalQtyLocal += qty; }
        stats[sku].total += subtotal;
        totalRevenue += subtotal;
      });
    });

    const totalQty = totalQtyTN + totalQtyLocal;
    const ratioTN = totalQty > 0 ? ((totalQtyTN / totalQty) * 100).toFixed(1) : 0;

    const tnOrders = data.filter(o => o.origin === 'TIENDANUBE');
    setEcommerceDetails(tnOrders.map(o => ({
      ref: o.id.toString().substring(0, 8),
      date: format(new Date(o.created_at), 'dd/MM HH:mm'),
      concept: o.items?.map(i => `${i.quantity}x ${i.product?.name}`).join(', ') || 'Varios',
      origin: 'TIENDANUBE',
      amountRaw: parseFloat(o.total_amount),
      amount: `$ ${parseFloat(o.total_amount).toLocaleString('es-AR')}`
    })));

    setKpis([
      { label: 'Producto Estrella', value: Object.entries(stats).sort((a, b) => (b[1].qtyTN + b[1].qtyLocal) - (a[1].qtyTN + a[1].qtyLocal))[0]?.[1].name || 'N/A', color: 'secondary' },
      { label: 'Ingreso Productos', value: `$ ${totalRevenue.toLocaleString('es-AR')}`, color: 'primary' },
      { label: 'Ratio E-commerce', value: `${ratioTN}% TN`, color: 'info', clickable: true, type: 'ecommerce' },
    ]);

    setTop5(Object.entries(stats).map(([s, d]) => ({ label: d.name, valueRaw: d.total })).sort((a, b) => b.valueRaw - a.valueRaw).slice(0, 5).map(i => ({ label: i.label, value: `$ ${i.valueRaw.toLocaleString('es-AR')}` })));

    setDetails(Object.entries(stats).map(([sku, data]) => ({
      sku: sku, name: data.name,
      origin: `L: ${data.qtyLocal} | TN: ${data.qtyTN}`,
      amount: `$ ${data.total.toLocaleString('es-AR')}`
    })));
  };

  // --- REPORTE 3: ÓRDENES ---
  const fetchOrderReport = async (businessId, start, end) => {
    // 1. Obtener Facturas para el cruce de "Órdenes Completas"
    const { data: invoices } = await supabase
      .schema('core')
      .from('invoices')
      .select('order_id')
      .eq('account_id', profile.account_id)
      .eq('is_deleted', false);
    
    const invoicedIds = new Set(invoices?.map(i => i.order_id).filter(Boolean) || []);

    // 2. Obtener Órdenes
    let query = supabase.schema('core')
      .from('orders')
      .select(`id, created_at, status, total_amount, origin, customer:client_id (full_name)`)
      .eq('account_id', profile.account_id)
      .eq('is_deleted', false)
      .gte('created_at', start)
      .lte('created_at', end);

    if (businessId !== 'ALL') query = query.eq('business_id', businessId);
    
    const { data, error } = await query;
    if (error) throw error;

    const totalOrders = data.length;
    const paidOrders = data.filter(o => o.status === 'PAID');
    const completedOrders = paidOrders.filter(o => invoicedIds.has(o.id)).length;
    const cancelledOrders = data.filter(o => o.status === 'CANCELLED');
    const pendingOrders = data.filter(o => o.status === 'PENDING').length;

    setKpis([
      { label: 'Órdenes Totales', value: totalOrders.toString(), color: 'primary' },
      { label: 'Tasa Conversión', value: `${totalOrders > 0 ? ((paidOrders.length / totalOrders) * 100).toFixed(1) : 0}%`, color: 'info' },
      { label: 'Completas (Fac)', value: completedOrders.toString(), color: 'success' },
      { label: 'Canceladas', value: cancelledOrders.length.toString(), color: 'error' },
    ]);

    const customerStats = {};
    data.forEach(o => { const name = o.customer?.full_name || 'Consumidor Final'; customerStats[name] = (customerStats[name] || 0) + 1; });

    setTop5(Object.entries(customerStats).map(([l, v]) => ({ label: l, valueRaw: v })).sort((a, b) => b.valueRaw - a.valueRaw).slice(0, 5).map(i => ({ label: i.label, value: `${i.valueRaw} órdenes` })));

    setDetails(data.map(o => ({
      date: format(new Date(o.created_at), 'dd/MM HH:mm'),
      concept: o.customer?.full_name || 'Cliente sin nombre',
      origin: `${o.origin} - ${o.status}${invoicedIds.has(o.id) ? ' (FAC)' : ''}`,
      amount: `$ ${parseFloat(o.total_amount).toLocaleString('es-AR')}`
    })));
  };

  // --- REPORTE 4: STOCK ---
  const fetchStockReport = async (businessId, start, end) => {
    let moveQuery = supabase.schema('core').from('stock_movements').select(`created_at, quantity_change, movement_type, reason, item:item_id (name, sku)`).eq('account_id', profile.account_id).gte('created_at', start).lte('created_at', end);
    if (businessId !== 'ALL') moveQuery = moveQuery.eq('business_id', businessId);
    const { data: movements, error: moveErr } = await moveQuery;
    if (moveErr) throw moveErr;

    let levelQuery = supabase.schema('core').from('stock_levels').select(`quantity, item:item_id (name, cost_price)`).eq('account_id', profile.account_id);
    if (businessId !== 'ALL') levelQuery = levelQuery.eq('business_id', businessId);
    const { data: levels, error: levelErr } = await levelQuery;
    if (levelErr) throw levelErr;

    setKpis([
      { label: 'Valoración Total', value: `$ ${levels.reduce((acc, curr) => acc + (curr.quantity * parseFloat(curr.item?.cost_price || 0)), 0).toLocaleString('es-AR')}`, color: 'primary' },
      { label: 'Stock Crítico', value: `${levels.filter(l => l.quantity <= 5).length} productos`, color: 'error' },
      { label: 'Mov. Reservas', value: movements.filter(m => m.movement_type === 'RESERVE_OUT').length.toString(), color: 'warning' },
    ]);

    const rotation = {};
    movements.forEach(m => { if (m.quantity_change < 0) { const name = m.item?.name || 'S/N'; rotation[name] = (rotation[name] || 0) + Math.abs(m.quantity_change); }});

    setTop5(Object.entries(rotation)
      .map(([label, value]) => ({ label, valueRaw: value }))
      .sort((a, b) => b.valueRaw - a.valueRaw)
      .slice(0, 5)
      .map(item => ({ label: item.label, value: `$${item.valueRaw.toLocaleString('es-AR')}` })));

    setDetails(movements.map(m => ({
      date: format(new Date(m.created_at), 'dd/MM HH:mm'),
      concept: `${m.item?.name} (${m.reason || 'Sin razón'})`,
      origin: m.movement_type,
      amount: `${m.quantity_change > 0 ? '+' : ''}${m.quantity_change}`
    })));
  };

  // --- REPORTE 5: AUDITORÍA ---
  const fetchAuditReport = async (businessId, start, end) => {
    const { data: profiles } = await supabase.schema('core').from('user_profiles').select('id, full_name').eq('account_id', profile.account_id);
    const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

    let query = supabase.schema('logs').from('audit_log').select(`id, created_at, table_name, action, old_data, new_data, user_id, business_id`).eq('account_id', profile.account_id).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false });
    if (businessId !== 'ALL') query = query.eq('business_id', businessId);

    const { data: logs, error } = await query;
    if (error) throw error;

    setKpis([
      { label: 'Total Acciones', value: logs.length.toString(), color: 'primary' },
      { label: 'Eliminaciones', value: logs.filter(l => l.action === 'DELETE' || (l.new_data?.is_deleted === true)).length.toString(), color: 'error' },
      { label: 'Usuarios Activos', value: new Set(logs.map(l => l.user_id).filter(Boolean)).size.toString(), color: 'info' },
    ]);

    const userActivity = {};
    logs.forEach(l => { const name = profileMap.get(l.user_id) || 'Sistema/Otro'; userActivity[name] = (userActivity[name] || 0) + 1; });

    setTop5(Object.entries(userActivity).map(([l, v]) => ({ label: l, valueRaw: v })).sort((a, b) => b.valueRaw - a.valueRaw).slice(0, 5).map(i => ({ label: i.label, value: `${i.valueRaw} logs` })));

    setDetails(logs.map(l => ({
      date: format(new Date(l.created_at), 'dd/MM HH:mm'),
      concept: `${l.action} en ${l.table_name}`,
      origin: profileMap.get(l.user_id) || 'SISTEMA',
      amount: '-'
    })));
  };

  const generateReport = useCallback(async (type, businessId, startDate, endDate) => {
    if (!profile?.account_id) return;
    setLoading(true); setError(null);
    const start = startOfDay(startDate).toISOString();
    const end = endOfDay(endDate).toISOString();

    try {
      switch (type) {
        case 'billing': await fetchBillingReport(businessId, start, end); break;
        case 'products': await fetchProductReport(businessId, start, end); break;
        case 'orders': await fetchOrderReport(businessId, start, end); break;
        case 'stock': await fetchStockReport(businessId, start, end); break;
        case 'audit': await fetchAuditReport(businessId, start, end); break;
        default: throw new Error('Tipo de reporte no implementado.');
      }
    } catch (err) {
      setError(err.message);
    } finally { setLoading(false); }
  }, [profile?.account_id]);

  return { loading, error, kpis, top5, details, pendingDetails, ecommerceDetails, generateReport };
};
