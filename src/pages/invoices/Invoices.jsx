import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Grid,
  Alert,
  Snackbar,
  CircularProgress,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Autocomplete,
} from "@mui/material";
import { DataGrid, GridActionsCellItem } from "@mui/x-data-grid";
import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/Download";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete";
import BlockIcon from "@mui/icons-material/Block";
import ReceiptIcon from "@mui/icons-material/Receipt";
import SearchIcon from "@mui/icons-material/Search";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import EmailIcon from "@mui/icons-material/Email";
import HistoryIcon from "@mui/icons-material/History";
import ListAltIcon from "@mui/icons-material/ListAlt";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import PaymentsIcon from "@mui/icons-material/Payments";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import CancelIcon from "@mui/icons-material/Cancel";
import PaymentGateway from "../../components/common/PaymentGateway";
import { useInvoices } from "../../hooks/useInvoices";
import { useAuthStore } from "../../stores/authStore";
import { useMercadoPagoPoint } from "../../hooks/useMercadoPagoPoint";
import { supabase } from "../../services/supabaseClient";

export default function Invoices() {
  const {
    invoices,
    loading,
    error,
    fetchInvoices,
    generateInvoice,
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
    registerPayment,
  } = useInvoices();

  const {
    loading: mpPointLoading,
    error: mpPointError,
    createPointPaymentIntent,
  } = useMercadoPagoPoint();

  const { profile } = useAuthStore();
  const [pendingOrders, setPendingOrders] = useState([]);
  const [vatRates, setVatRates] = useState([]);
  const [ivaConditions, setIvaConditions] = useState([]);
  const [paymentConditions, setPaymentConditions] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [invoiceTypes, setInvoiceTypes] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [openPendingDialog, setOpenPendingDialog] = useState(false);
  const [openDetailDialog, setOpenDetailDialog] = useState(false);
  const [openOptionsDialog, setOpenOptionsDialog] = useState(false);
  const [openCustomerDialog, setOpenCustomerDialog] = useState(false);
  const [openPaymentDialog, setOpenPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [invoiceToPay, setInvoiceToPay] = useState(null);
  
  const [pointDevices, setPointDevices] = useState([]);
  const [selectedPointDeviceId, setSelectedPointDeviceId] = useState('');
  const [intentStatus, setIntentStatus] = useState(null); // 'WAITING', 'SUCCESS', 'ERROR'
  
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceLogs, setInvoiceLogs] = useState([]);
  const [detailTab, setDetailTab] = useState(0);
  
  const [customerForm, setCustomerForm] = useState({
    full_name: "",
    doc_type: "99",
    doc_number: "",
    iva_condition: "Consumidor Final",
    email: "",
    phone_number: "",
    address: "",
  });

  const [invoiceOptions, setInvoiceOptions] = useState({
    comprobante_tipo: "11",
    iva_id: "3", 
    punto_venta: 1,
    customer_name: "",
    customer_doc_number: "",
    customer_doc_type: "OTRO",
    iva_condition_id: "CF",
    condicion_pago_id: "1",
    observaciones: "",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  const isEmployee = profile?.app_role === "EMPLOYEE";

  // Efecto para buscar clientes
  useEffect(() => {
    const fetchCustomers = async () => {
      if (customerSearchTerm.length >= 2 || customerSearchTerm === "") {
        const results = await searchCustomers(customerSearchTerm);
        setCustomerOptions(results);
      }
    };
    fetchCustomers();
  }, [customerSearchTerm]);

  // Efecto para ajustar IVA según tipo de factura
  useEffect(() => {
    const type = String(invoiceOptions.comprobante_tipo).toUpperCase();
    const isB = type === '6' || type.includes('FACTURA B');
    const isC = type === '11' || type.includes('FACTURA C');
    const isA = type === '1' || type.includes('FACTURA A');

    if (isB || isC) {
      setInvoiceOptions(prev => ({ ...prev, iva_id: '3' })); // ID 3 = IVA 0%
    } else if (isA) {
      setInvoiceOptions(prev => ({ ...prev, iva_id: '5' })); // ID 5 = IVA 21%
    }
  }, [invoiceOptions.comprobante_tipo]);

  const loadData = useCallback(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData();
  };

  const handleOpenPending = async () => {
    const orders = await fetchPendingOrders();
    setPendingOrders(orders);
    setOpenPendingDialog(true);
  };

  const handleMarkPaid = async (invoice) => {
    setInvoiceToPay(invoice);
    setPaymentMethod(null);
    setOpenPaymentDialog(true);
  };

  const handleManualPayment = async (method) => {
    setIsProcessing(true);
    const paymentData = {
      order_id: invoiceToPay.order_id,
      amount: invoiceToPay.total_amount,
      payment_method_id: method, // CASH, etc.
      payment_type: 'point', // 'point' para manual/fisico segun usePOS
      status: 'approved',
      notes: "Pago registrado desde módulo de facturación"
    };

    const result = await registerPayment(paymentData);
    if (result.success) {
      setSnackbar({ open: true, message: "Pago registrado con éxito.", severity: "success" });
      setOpenPaymentDialog(false);
      loadData();
    } else {
      setSnackbar({ open: true, message: "Error: " + result.error, severity: "error" });
    }
    setIsProcessing(false);
  };

  const fetchPointDevices = async (businessId) => {
    if (!businessId || !profile?.account_id) return;
    
    const { data, error } = await supabase
      .schema('core')
      .from('point_devices')
      .select('*')
      .eq('business_id', businessId)
      .eq('account_id', profile.account_id)
      .eq('status', 'ACTIVE')
      .eq('is_deleted', false);

    if (error) {
      setSnackbar({ open: true, message: `Error al cargar dispositivos: ${error.message}`, severity: 'error' });
      return;
    }

    setPointDevices(data);
    if (data.length > 0) {
      setSelectedPointDeviceId(data[0].id);
    }
  };

  const handleSelectPaymentMethod = (method) => {
    setPaymentMethod(method);
    if (method === 'POINT_MP') {
      fetchPointDevices(invoiceToPay.business_id);
    }
  };

  const handleSendPointIntent = async () => {
    if (!invoiceToPay?.order_id || !selectedPointDeviceId) {
      setSnackbar({ open: true, message: 'Faltan datos para procesar el cobro', severity: 'error' });
      return;
    }

    setIntentStatus('WAITING');
    const result = await createPointPaymentIntent(invoiceToPay.order_id, selectedPointDeviceId);
    
    if (result.success) {
      // El webhook se encargará de actualizar el estado de la orden, pero podemos simular éxito aquí
      // o esperar a que el usuario cierre el modal tras ver el éxito en la terminal.
      setIntentStatus('SUCCESS');
      setSnackbar({ open: true, message: "Cobro enviado a la terminal.", severity: "success" });
    } else {
      setIntentStatus('ERROR');
      setSnackbar({ open: true, message: `Error al enviar cobro: ${result.error}`, severity: 'error' });
    }
  };

  const handleClosePayment = () => {
    setOpenPaymentDialog(false);
    setInvoiceToPay(null);
    setPaymentMethod(null);
    setPointDevices([]);
    setSelectedPointDeviceId('');
    setIntentStatus(null);
    loadData();
  };

  const handleOpenCustomerModal = (customer = null) => {
    if (customer) {
      setCustomerForm({
        full_name: customer.full_name || "",
        doc_type: customer.doc_type || "99",
        doc_number: customer.doc_number || "",
        iva_condition: customer.iva_condition || "Consumidor Final",
        email: customer.email || "",
        phone_number: customer.phone_number || "",
        address: customer.address || "",
      });
    } else {
      setCustomerForm({
        full_name: "",
        doc_type: "99",
        doc_number: "",
        iva_condition: "Consumidor Final",
        email: "",
        phone_number: "",
        address: "",
      });
    }
    setOpenCustomerDialog(true);
  };

  const handleSaveCustomer = async () => {
    setIsProcessing(true);
    let result;
    if (selectedCustomer && selectedCustomer.full_name !== "Consumidor Final" && selectedCustomer.id) {
      result = await updateCustomer(selectedCustomer.id, customerForm);
    } else {
      result = await createCustomer(customerForm);
    }

    if (result.success) {
      await updateOrderCustomer(selectedOrder.id, result.data.id, result.data.full_name);
      setSelectedCustomer(result.data);
      setInvoiceOptions(prev => ({
        ...prev,
        customer_name: result.data.full_name,
        customer_doc_number: result.data.doc_number,
        customer_doc_type: result.data.doc_type === '80' ? 'CUIT' : (result.data.doc_type === '96' ? 'DNI' : 'OTRO'),
        iva_condition_id: result.data.iva_condition === 'Responsable Inscripto' ? 'RI' : 'CF'
      }));
      setOpenCustomerDialog(false);
      setSnackbar({ open: true, message: "Cliente vinculado.", severity: "success" });
    }
    setIsProcessing(false);
  };

  const handleSelectOrder = async (order) => {
    setSelectedOrder(order);
    setIsProcessing(true);
    const businessData = Array.isArray(order.businesses) ? order.businesses[0] : order.businesses;
    const business = businessData || {};
    const defaultPV = business.default_punto_venta || 1;
    const businessName = business.name || "Sucursal";
    const defaultType = business.default_comprobante_tipo || '11';
    const defaultPayment = business.default_condicion_pago || 1;

    try {
      const [rates, conds, payments, docs, types, customersCF] = await Promise.all([
        vatRates.length === 0 ? fetchVatRates() : Promise.resolve(vatRates),
        ivaConditions.length === 0 ? fetchIvaConditions(order.business_id) : Promise.resolve(ivaConditions),
        paymentConditions.length === 0 ? fetchPaymentConditions(order.business_id) : Promise.resolve(paymentConditions),
        documentTypes.length === 0 ? fetchDocumentTypes(order.business_id) : Promise.resolve(documentTypes),
        invoiceTypes.length === 0 ? fetchInvoiceTypes(order.business_id) : Promise.resolve(invoiceTypes),
        searchCustomers("Consumidor Final")
      ]);

      setVatRates(rates);
      setIvaConditions(conds);
      setPaymentConditions(payments);
      setDocumentTypes(docs);
      setInvoiceTypes(types);

      const cf = customersCF.find(c => c.full_name === "Consumidor Final");
      const initialCustomer = order.customers || cf || null;
      setSelectedCustomer(initialCustomer);

      const initialType = initialCustomer?.doc_type === '80' ? '1' : String(defaultType);
      const initialIva = (initialType === '6' || initialType === '11') ? '3' : '5';

      setInvoiceOptions({
        comprobante_tipo: initialType,
        iva_id: initialIva,
        punto_venta: String(defaultPV),
        punto_venta_display: `${defaultPV} - ${businessName}`,
        customer_name: order.customer_name || initialCustomer?.full_name || "Consumidor Final",
        customer_doc_number: order.customer_doc_number || initialCustomer?.doc_number || "0",
        customer_doc_type: (order.customer_doc_type || initialCustomer?.doc_type) === '80' ? 'CUIT' : ((order.customer_doc_type || initialCustomer?.doc_type) === '96' ? 'DNI' : 'OTRO'),
        iva_condition_id: (order.iva_condition || initialCustomer?.iva_condition) === 'Responsable Inscripto' ? 'RI' : 'CF',
        condicion_pago_id: String(defaultPayment),
        observaciones: "",
      });
      setOpenOptionsDialog(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateInvoice = async () => {
    setIsProcessing(true);
    const result = await generateInvoice(selectedOrder.id, invoiceOptions);
    if (result.success) {
      setSnackbar({ open: true, message: "Factura generada.", severity: "success" });
      setOpenOptionsDialog(false);
      setOpenPendingDialog(false);
    } else {
      // Detección de error de servicios de ARCA/AFIP
      const errorMsg = result.error || "";
      const isArcaError = errorMsg.includes("servicios web de facturacion de ARCA") || 
                          errorMsg.includes("errores en los servicios web");

      if (isArcaError) {
        setSnackbar({
          open: true,
          message: "Los servicios de ARCA (AFIP) están experimentando demoras. Por favor, intenta nuevamente en 10 minutos.",
          severity: "warning",
        });
      } else {
        setSnackbar({ open: true, message: "Error: " + errorMsg, severity: "error" });
      }
    }
    setIsProcessing(false);
  };

  const handleDownload = async (storagePath) => {
    const url = await getInvoiceDownloadUrl(storagePath);
    if (url) window.open(url, "_blank");
  };

  const handleShare = async (storagePath, method) => {
    const url = await getInvoiceDownloadUrl(storagePath);
    if (!url) return;
    const clientName = selectedInvoice?.order?.customer_name || "Cliente";
    const text = `Hola ${clientName}, adjunto tu factura: ${url}`;
    if (method === "whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    else if (method === "email") window.open(`mailto:?subject=Factura PerPel&body=${encodeURIComponent(text)}`, "_blank");
  };

  const handleVoid = async (id) => {
    if (isEmployee) return;
    if (window.confirm("¿Anular fiscalmente?")) {
      setIsProcessing(true);
      const result = await voidInvoice(id);
      if (result.success) setSnackbar({ open: true, message: "Anulada.", severity: "success" });
      setIsProcessing(false);
    }
  };

  const handleViewDetail = async (invoice) => {
    setSelectedInvoice(invoice);
    setDetailTab(0);
    setOpenDetailDialog(true);
    const logs = await fetchInvoiceLogs(invoice.order_id);
    setInvoiceLogs(logs);
  };

  const filteredInvoices = invoices.filter((inv) => {
    const clientName = inv.order?.customer_name || inv.order?.customers?.full_name || "";
    const nro = `${inv.punto_venta}-${inv.cbte_nro}`;
    return clientName.toLowerCase().includes(searchTerm.toLowerCase()) || nro.includes(searchTerm);
  });

  const columns = [
    { field: "created_at", headerName: "Fecha", width: 180, valueFormatter: (v) => new Date(v).toLocaleString() },
    { field: "number", headerName: "Comprobante", width: 150, valueGetter: (p, r) => `${r.punto_venta}-${r.cbte_nro}` },
    { field: "business", headerName: "Sucursal", width: 150, valueGetter: (p, r) => r.businesses?.name || "N/A" },
    { field: "client", headerName: "Cliente", flex: 1, minWidth: 200, valueGetter: (p, r) => r.order?.customer_name || r.order?.customers?.full_name || "N/A" },
    { field: "total_amount", headerName: "Total", width: 120, type: "number", valueFormatter: (v) => `$ ${parseFloat(v).toFixed(2)}` },
    { field: "status", headerName: "Pago", width: 110, renderCell: (p) => {
      const s = p.row.order?.status || 'PENDING';
      return <Chip label={s} color={s === "PAID" ? "success" : "error"} size="small" variant="outlined" />;
    }},
    { field: "fch_serv_vto_pago", headerName: "Vencimiento", width: 120, valueFormatter: (v) => v ? new Date(v).toLocaleDateString() : 'N/A' },
    {
      field: "actions",
      headerName: "Acciones",
      width: 200,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Ver Detalle">
            <IconButton size="small" onClick={() => handleViewDetail(p.row)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Descargar PDF">
            <span>
              <IconButton 
                size="small" 
                onClick={() => handleDownload(p.row.full_pdf_url)} 
                disabled={!p.row.full_pdf_url}
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Registrar Cobro">
            <span>
              <IconButton 
                size="small" 
                color="success" 
                onClick={() => handleMarkPaid(p.row)} 
                disabled={p.row.order?.status === "PAID"}
              >
                <PaymentsIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Anular Factura">
            <span>
              <IconButton 
                size="small" 
                color="error" 
                onClick={() => handleVoid(p.id)} 
                disabled={p.row.arca_status === "VOIDED" || isEmployee}
              >
                <BlockIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box sx={{ width: "100%", p: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Facturación Electrónica (TFA)</Typography>
        <Box>
          <Button variant="outlined" startIcon={<ReceiptIcon />} onClick={handleOpenPending} sx={{ mr: 1 }}>Órdenes Pendientes</Button>
          <IconButton onClick={handleRefresh}><RefreshIcon /></IconButton>
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Buscar por cliente o nro..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </Box>

      <Paper sx={{ height: 600, width: "100%" }}>
        <DataGrid 
          rows={filteredInvoices} 
          columns={columns} 
          loading={loading} 
          pageSizeOptions={[10, 25, 50]} 
          initialState={{ 
            pagination: { paginationModel: { pageSize: 10 } },
            sorting: {
              sortModel: [{ field: 'created_at', sort: 'desc' }],
            },
          }} 
          disableRowSelectionOnClick 
        />
      </Paper>

      {/* Modal Opciones */}
      <Dialog open={openOptionsDialog} onClose={() => setOpenOptionsDialog(false)} fullWidth maxWidth="md">
        <DialogTitle>Opciones de Emisión</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" color="primary">Datos Fiscales del Cliente</Typography>
                <IconButton size="small" color="primary" onClick={() => handleOpenCustomerModal(selectedCustomer?.full_name === "Consumidor Final" ? null : selectedCustomer)}>
                  {selectedCustomer?.full_name === "Consumidor Final" ? <AddIcon /> : <EditIcon />}
                </IconButton>
              </Box>
              <Autocomplete fullWidth size="small" options={customerOptions}
                getOptionLabel={(o) => typeof o === 'string' ? o : `${o.full_name} (${o.doc_number || ''})`}
                isOptionEqualToValue={(o, v) => o.id === v?.id} value={selectedCustomer}
                onChange={(e, v) => {
                  setSelectedCustomer(v);
                  if (v) setInvoiceOptions(prev => ({ ...prev, customer_name: v.full_name, customer_doc_number: v.doc_number, customer_doc_type: v.doc_type === '80' ? 'CUIT' : (v.doc_type === '96' ? 'DNI' : 'OTRO'), iva_condition_id: v.iva_condition === 'Responsable Inscripto' ? 'RI' : 'CF' }));
                }}
                onInputChange={(e, v) => setCustomerSearchTerm(v)}
                renderInput={(p) => <TextField {...p} label="Buscar Cliente" margin="dense" required />} freeSolo />
              <Grid container spacing={1}>
                <Grid item xs={4}><TextField fullWidth select label="Tipo Doc." size="small" margin="dense" value={invoiceOptions.customer_doc_type} onChange={(e) => setInvoiceOptions({...invoiceOptions, customer_doc_type: e.target.value})}>{documentTypes.map(d => <MenuItem key={d.id} value={d.id}>{d.nombre}</MenuItem>)}</TextField></Grid>
                <Grid item xs={8}><TextField fullWidth label="Número Documento" size="small" margin="dense" value={invoiceOptions.customer_doc_number} onChange={(e) => setInvoiceOptions({...invoiceOptions, customer_doc_number: e.target.value})} disabled={invoiceOptions.customer_doc_type === 'OTRO'} /></Grid>
              </Grid>
              <TextField fullWidth select label="Condición IVA" size="small" margin="dense" value={invoiceOptions.iva_condition_id} onChange={(e) => setInvoiceOptions({...invoiceOptions, iva_condition_id: e.target.value})}>{ivaConditions.map(c => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}</TextField>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom color="primary">Configuración Comprobante</Typography>
              <TextField fullWidth select label="Tipo de Factura" size="small" margin="dense" value={invoiceOptions.comprobante_tipo} onChange={(e) => setInvoiceOptions({...invoiceOptions, comprobante_tipo: e.target.value})}>{invoiceTypes.map(t => <MenuItem key={t.id} value={String(t.id)}>{t.nombre}</MenuItem>)}</TextField>
              <TextField fullWidth select label="Alícuota IVA" size="small" margin="dense" value={invoiceOptions.iva_id} onChange={(e) => setInvoiceOptions({...invoiceOptions, iva_id: e.target.value})} disabled={String(invoiceOptions.comprobante_tipo) !== '1' && !String(invoiceOptions.comprobante_tipo).includes('A')}>{vatRates.map(r => <MenuItem key={r.id} value={r.id}>{r.nombre}</MenuItem>)}</TextField>
              <TextField fullWidth select label="Condición de Pago" size="small" margin="dense" value={invoiceOptions.condicion_pago_id} onChange={(e) => setInvoiceOptions({...invoiceOptions, condicion_pago_id: e.target.value})}>{paymentConditions.map(c => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}</TextField>
              <TextField fullWidth label="Punto de Venta" size="small" margin="dense" value={invoiceOptions.punto_venta_display || invoiceOptions.punto_venta} disabled={true} />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2">Detalle de la Orden</Typography>
              <TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow><TableCell>Producto</TableCell><TableCell align="right">Cant.</TableCell><TableCell align="right">Subtotal</TableCell></TableRow></TableHead><TableBody>{selectedOrder?.order_items?.map((item, idx) => (<TableRow key={idx}><TableCell>{item.inventory_items?.name}</TableCell><TableCell align="right">{item.quantity}</TableCell><TableCell align="right">$ {(item.quantity * item.unit_price).toFixed(2)}</TableCell></TableRow>))}<TableRow><TableCell colSpan={2} align="right"><b>TOTAL</b></TableCell><TableCell align="right"><b>$ {selectedOrder?.total_amount.toFixed(2)}</b></TableCell></TableRow></TableBody></Table></TableContainer>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpenOptionsDialog(false)}>Cancelar</Button><Button variant="contained" color="success" onClick={handleGenerateInvoice} disabled={isProcessing} startIcon={isProcessing ? <CircularProgress size={20} /> : <ReceiptIcon />}>Emitir Factura</Button></DialogActions>
      </Dialog>

      {/* Modal Detalle */}
      <Dialog open={openDetailDialog} onClose={() => setOpenDetailDialog(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>Comprobante {selectedInvoice?.punto_venta}-{selectedInvoice?.cbte_nro}<Box><IconButton onClick={() => setDetailTab(0)} color={detailTab === 0 ? "primary" : "default"}><VisibilityIcon /></IconButton><IconButton onClick={() => setDetailTab(1)} color={detailTab === 1 ? "primary" : "default"}><ListAltIcon /></IconButton><IconButton onClick={() => setDetailTab(2)} color={detailTab === 2 ? "primary" : "default"}><HistoryIcon /></IconButton></Box></DialogTitle>
        <DialogContent dividers>
          {selectedInvoice && (
            <>
              {detailTab === 0 && (<Grid container spacing={2}><Grid item xs={6}><Typography variant="caption">Número Legal</Typography><Typography>{selectedInvoice.punto_venta}-{selectedInvoice.cbte_nro}</Typography></Grid><Grid item xs={6}><Typography variant="caption">Fecha</Typography><Typography>{new Date(selectedInvoice.created_at).toLocaleString()}</Typography></Grid><Grid item xs={12}><Typography variant="caption">Cliente</Typography><Typography>{selectedInvoice.order?.customer_name || "N/A"}</Typography></Grid><Grid item xs={6}><Typography variant="caption">CAE</Typography><Typography sx={{ wordBreak: "break-all" }}>{selectedInvoice.arca_cae}</Typography></Grid><Grid item xs={12}><Box sx={{ p: 2, bgcolor: "action.hover" }}><Typography variant="h6" align="right">$ {parseFloat(selectedInvoice.total_amount).toFixed(2)}</Typography></Box></Grid></Grid>)}
              {detailTab === 1 && (<Box><Typography variant="subtitle2">Ítems</Typography><DataGrid autoHeight density="compact" rows={selectedInvoice.order?.order_items?.map((item, idx) => ({ ...item, id: idx })) || []} columns={[{ field: "inventory_items", headerName: "Producto", flex: 1, valueGetter: (p, r) => r.inventory_items?.name }, { field: "quantity", headerName: "Cant.", width: 80 }, { field: "unit_price", headerName: "Precio", width: 120, valueFormatter: (v) => `$ ${v.toFixed(2)}` }]} hideFooter /></Box>)}
              {detailTab === 2 && (<Box><Typography variant="subtitle2">Historial API</Typography><DataGrid autoHeight density="compact" rows={invoiceLogs.map(l => ({ ...l, id: l.id }))} columns={[{ field: "created_at", headerName: "Fecha", width: 160, valueFormatter: (v) => new Date(v).toLocaleString() }, { field: "operation_name", headerName: "Operación", width: 180 }, { field: "status", headerName: "Estado" }]} hideFooter /></Box>)}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between" }}><Box><IconButton color="success" onClick={() => handleShare(selectedInvoice.full_pdf_url, "whatsapp")}><WhatsAppIcon /></IconButton><IconButton color="primary" onClick={() => handleShare(selectedInvoice.full_pdf_url, "email")}><EmailIcon /></IconButton></Box><Box><Button onClick={() => setOpenDetailDialog(false)}>Cerrar</Button>{selectedInvoice?.full_pdf_url && <Button variant="contained" onClick={() => handleDownload(selectedInvoice.full_pdf_url)}>Descargar PDF</Button>}</Box></DialogActions>
      </Dialog>

      {/* Modal Pendientes */}
      <Dialog open={openPendingDialog} onClose={() => setOpenPendingDialog(false)} fullWidth maxWidth="md">
        <DialogTitle>Órdenes Pendientes de Facturación</DialogTitle>
        <DialogContent dividers>
          <DataGrid autoHeight rows={pendingOrders} columns={[
            { field: "created_at", headerName: "Fecha", width: 150, valueFormatter: (v) => new Date(v).toLocaleString() },
            { field: "business", headerName: "Sucursal", width: 150, valueGetter: (p, r) => r.businesses?.name || "N/A" },
            { field: "customer_name", headerName: "Cliente", flex: 1 },
            { field: "total_amount", headerName: "Total", width: 120, valueFormatter: (v) => `$ ${parseFloat(v).toFixed(2)}` },
            { field: "status", headerName: "Pago", width: 110, renderCell: (p) => <Chip label={p.value} size="small" color={p.value === 'PAID' ? 'success' : 'error'} variant="outlined" /> },
            { 
              field: "actions", 
              headerName: "Acción", 
              width: 130, 
              renderCell: (p) => (
                <Button 
                  variant="outlined" 
                  size="small" 
                  startIcon={<ReceiptIcon />} 
                  onClick={() => handleSelectOrder(p.row)}
                >
                  Facturar
                </Button>
              ) 
            }
          ]} 
          pageSizeOptions={[5]} 
          initialState={{ pagination: { paginationModel: { pageSize: 5 } } }} 
        />
        </DialogContent>
        <DialogActions><Button onClick={() => setOpenPendingDialog(false)}>Cerrar</Button></DialogActions>
      </Dialog>

      {/* Modal Cliente */}
      <Dialog open={openCustomerDialog} onClose={() => setOpenCustomerDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>{selectedCustomer?.full_name === "Consumidor Final" ? "Agregar Nuevo Cliente" : "Editar Cliente"}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}><TextField fullWidth label="Nombre / Razón Social" size="small" margin="dense" value={customerForm.full_name} onChange={(e) => setCustomerForm({...customerForm, full_name: e.target.value})} /></Grid>
            <Grid item xs={6}><TextField fullWidth select label="Tipo Documento" size="small" margin="dense" value={customerForm.doc_type} onChange={(e) => setCustomerForm({...customerForm, doc_type: e.target.value})}><MenuItem value="80">CUIT</MenuItem><MenuItem value="96">DNI</MenuItem><MenuItem value="99">Sin Documento</MenuItem></TextField></Grid>
            <Grid item xs={6}><TextField fullWidth label="Nro Documento" size="small" margin="dense" value={customerForm.doc_number} onChange={(e) => setCustomerForm({...customerForm, doc_number: e.target.value})} disabled={customerForm.doc_type === "99"} /></Grid>
            <Grid item xs={12}><TextField fullWidth select label="Condición IVA" size="small" margin="dense" value={customerForm.iva_condition} onChange={(e) => setCustomerForm({...customerForm, iva_condition: e.target.value})}><MenuItem value="Responsable Inscripto">Responsable Inscripto</MenuItem><MenuItem value="Monotributista">Monotributista</MenuItem><MenuItem value="Consumidor Final">Consumidor Final</MenuItem><MenuItem value="Exento">Exento</MenuItem></TextField></Grid>
                        <Grid item xs={12}>
                          <TextField fullWidth label="Email" size="small" margin="dense"
                            value={customerForm.email}
                            onChange={(e) => setCustomerForm({...customerForm, email: e.target.value})} />
                        </Grid>
                        <Grid item xs={12}>
                          <TextField fullWidth label="Número Teléfono" size="small" margin="dense"
                            value={customerForm.phone_number}
                            onChange={(e) => setCustomerForm({...customerForm, phone_number: e.target.value})} />
                        </Grid>
                        <Grid item xs={12}>
                          <TextField fullWidth label="Dirección / Domicilio" size="small" margin="dense"
                            value={customerForm.address}
                            onChange={(e) => setCustomerForm({...customerForm, address: e.target.value})} />
                        </Grid>
          </Grid>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpenCustomerDialog(false)}>Cancelar</Button><Button variant="contained" onClick={handleSaveCustomer} disabled={isProcessing}>{isProcessing ? <CircularProgress size={20} /> : "Guardar y Vincular"}</Button></DialogActions>
      </Dialog>

      {/* Modal Cobro (Mismo del POS) */}
      <Dialog open={openPaymentDialog} onClose={handleClosePayment} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 600 }}>Registrar Cobro</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mb: 3, p: 2, bgcolor: '#f1f5f9', borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="subtitle2" color="textSecondary">Total a Cobrar:</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main' }}>
              $ {invoiceToPay?.total_amount ? parseFloat(invoiceToPay.total_amount).toFixed(2) : '0.00'}
            </Typography>
          </Box>

          {!paymentMethod ? (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Button fullWidth variant="outlined" size="large" startIcon={<PaymentsIcon />} onClick={() => handleManualPayment('CASH')} sx={{ py: 2, justifyContent: 'flex-start', px: 3 }}>
                  Efectivo
                </Button>
              </Grid>
              <Grid item xs={12}>
                <Button fullWidth variant="outlined" size="large" startIcon={<CreditCardIcon />} onClick={() => handleSelectPaymentMethod('POINT_MP')} sx={{ py: 2, justifyContent: 'flex-start', px: 3 }}>
                  MercadoPago Point (Terminal)
                </Button>
              </Grid>
              <Grid item xs={12}>
                <Button fullWidth variant="contained" size="large" startIcon={<ShoppingCartIcon />} onClick={() => handleSelectPaymentMethod('ONLINE_MP')} sx={{ py: 2, justifyContent: 'flex-start', px: 3 }}>
                  MercadoPago Online (Bricks)
                </Button>
              </Grid>
            </Grid>
          ) : paymentMethod === 'ONLINE_MP' ? (
            <Box>
                <Button size="small" onClick={() => setPaymentMethod(null)} sx={{ mb: 2 }}>← Volver a opciones de pago</Button>
                <PaymentGateway 
                items={invoiceToPay?.order?.order_items?.map(i => ({ 
                    title: i.inventory_items?.name, 
                    quantity: i.quantity, 
                    unit_price: i.unit_price 
                }))}
                orderId={invoiceToPay?.order_id}
                payerEmail={profile?.email}
                accountId={profile?.account_id} 
                onPaymentSuccess={handleClosePayment} 
                />
            </Box>
          ) : paymentMethod === 'POINT_MP' && (
            <Box>
              <Button size="small" onClick={() => setPaymentMethod(null)} sx={{ mb: 2 }}>← Volver a opciones de pago</Button>
              <Typography variant="h6" sx={{mb: 2}}>Pagar con Terminal Point</Typography>

              {intentStatus === 'WAITING' ? (
                <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', p: 4}}>
                  <CircularProgress />
                  <Typography variant="body1" sx={{mt: 2}}>Esperando pago en la terminal...</Typography>
                  <Typography variant="body2" color="text.secondary">El estado se actualizará automáticamente.</Typography>
                </Box>
              ) : intentStatus === 'SUCCESS' ? (
                <Box sx={{textAlign: 'center', p: 3}}>
                  <Alert severity="success" sx={{mb: 2}}>Cobro procesado correctamente.</Alert>
                  <Button variant="contained" onClick={handleClosePayment}>Aceptar</Button>
                </Box>
              ) : (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField fullWidth select label="Seleccionar Terminal" value={selectedPointDeviceId} onChange={(e) => setSelectedPointDeviceId(e.target.value)} disabled={pointDevices.length === 0}>
                      {pointDevices.map((d) => (
                        <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <Button fullWidth variant="contained" onClick={handleSendPointIntent} disabled={mpPointLoading || !selectedPointDeviceId}>
                      {mpPointLoading ? <CircularProgress size={24} /> : 'Enviar Cobro a Terminal'}
                    </Button>
                  </Grid>
                  {intentStatus === 'ERROR' && <Grid item xs={12}><Alert severity="error">{mpPointError}</Alert></Grid>}
                </Grid>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          {!paymentMethod && (
             <Button onClick={handleClosePayment} fullWidth variant="outlined" color="inherit">
                Pagar Después
             </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
