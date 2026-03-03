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
import { useInvoices } from "../../hooks/useInvoices";
import { useAuthStore } from "../../stores/authStore";

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
  } = useInvoices();

  const { profile } = useAuthStore();
  const [pendingOrders, setPendingOrders] = useState([]);
  const [vatRates, setVatRates] = useState([]);
  const [ivaConditions, setIvaConditions] = useState([]);
  const [paymentConditions, setPaymentConditions] = useState([]);
  const [openPendingDialog, setOpenPendingDialog] = useState(false);
  const [openDetailDialog, setOpenDetailDialog] = useState(false);
  const [openOptionsDialog, setOpenOptionsDialog] = useState(false);
  
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceLogs, setInvoiceLogs] = useState([]);
  const [detailTab, setDetailTab] = useState(0);
  
  const [invoiceOptions, setInvoiceOptions] = useState({
    comprobante_tipo: "11",
    iva_id: "5", // 21% default
    punto_venta: 1,
    customer_name: "",
    customer_doc_number: "",
    customer_doc_type: "99",
    iva_condition_id: "CF", // Usaremos IDs de TFA
    condicion_pago_id: "1", // Contado por defecto
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

  const handleSelectOrder = async (order) => {
    setSelectedOrder(order);
    
    // Obtener los valores predeterminados de la sucursal
    const business = order.businesses || {};
    const defaultPV = business.default_punto_venta || 1;
    const defaultType = business.default_comprobante_tipo || '11';

    setInvoiceOptions({
      comprobante_tipo: order.customers?.doc_type === '80' ? '1' : defaultType,
      iva_id: "5",
      punto_venta: defaultPV,
      customer_name: order.customer_name || order.customers?.full_name || "",
      customer_doc_number: order.customer_doc_number || order.customers?.doc_number || "0",
      customer_doc_type: order.customer_doc_type || order.customers?.doc_type || "99",
      iva_condition_id: order.customers?.doc_type === '80' ? 'RI' : 'CF',
      condicion_pago_id: "1",
      observaciones: "",
    });
    
    // Cargar referencias desde TFA si no están cargadas
    if (vatRates.length === 0 || ivaConditions.length === 0 || paymentConditions.length === 0) {
      setIsProcessing(true);
      try {
        const [rates, conds, payments] = await Promise.all([
          fetchVatRates(order.business_id),
          fetchIvaConditions(order.business_id),
          fetchPaymentConditions(order.business_id)
        ]);
        setVatRates(rates);
        setIvaConditions(conds);
        setPaymentConditions(payments);
      } catch (err) {
        console.error("Error loading TFA references:", err);
      } finally {
        setIsProcessing(false);
      }
    }
    
    setOpenOptionsDialog(true);
  };

  const handleGenerateInvoice = async () => {
    setIsProcessing(true);
    const result = await generateInvoice(selectedOrder.id, invoiceOptions);
    if (result.success) {
      setSnackbar({
        open: true,
        message: "Factura generada con éxito.",
        severity: "success",
      });
      setOpenOptionsDialog(false);
      setOpenPendingDialog(false);
    } else {
      setSnackbar({
        open: true,
        message: "Error: " + result.error,
        severity: "error",
      });
    }
    setIsProcessing(false);
  };

  // Cálculo dinámico de totales basado en alícuota elegida
  // Si es factura A, discriminamos IVA. Si es B/C, el total es el precio de venta.
  const calculateTotalPreview = () => {
    if (!selectedOrder) return 0;
    return selectedOrder.total_amount;
  };

  const handleDownload = async (storagePath) => {
    if (!storagePath) return;
    const url = await getInvoiceDownloadUrl(storagePath);
    if (url) {
      window.open(url, "_blank");
    } else {
      setSnackbar({
        open: true,
        message: "No se pudo obtener la URL del documento.",
        severity: "error",
      });
    }
  };

  const handleShare = async (storagePath, method) => {
    const url = await getInvoiceDownloadUrl(storagePath);
    if (!url) return;
    
    const clientName = selectedInvoice?.order?.customer_name || "Cliente";
    const text = `Hola ${clientName}, adjunto tu factura de PerPel: ${url}`;
    
    if (method === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    } else if (method === "email") {
      window.open(`mailto:?subject=Tu Factura PerPel&body=${encodeURIComponent(text)}`, "_blank");
    }
  };

  const handleVoid = async (id) => {
    if (isEmployee) return;
    if (window.confirm("¿Está seguro de anular esta factura fiscalmente?")) {
      setIsProcessing(true);
      const result = await voidInvoice(id);
      if (result.success) {
        setSnackbar({
          open: true,
          message: "Factura anulada correctamente.",
          severity: "success",
        });
      } else {
        setSnackbar({
          open: true,
          message: "Error al anular: " + result.error,
          severity: "error",
        });
      }
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id) => {
    if (isEmployee) return;
    if (window.confirm("¿Desea eliminar este registro de la base de datos?")) {
      const result = await deleteInvoice(id);
      if (result.success) {
        setSnackbar({
          open: true,
          message: "Registro eliminado.",
          severity: "success",
        });
      }
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
    return (
      clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      nro.includes(searchTerm) ||
      inv.arca_cae?.includes(searchTerm)
    );
  });

  const columns = [
    {
      field: "created_at",
      headerName: "Fecha",
      width: 110,
      valueFormatter: (value) => new Date(value).toLocaleDateString(),
    },
    {
      field: "number",
      headerName: "Nro Comprobante",
      width: 150,
      valueGetter: (params, row) => `${row.punto_venta}-${row.cbte_nro}`,
    },
    {
      field: "client",
      headerName: "Cliente",
      flex: 1,
      minWidth: 200,
      valueGetter: (params, row) => row.order?.customer_name || row.order?.customers?.full_name || "N/A",
    },
    {
      field: "total_amount",
      headerName: "Total",
      width: 130,
      type: "number",
      valueFormatter: (value) => `$ ${parseFloat(value).toFixed(2)}`,
    },
    {
      field: "arca_status",
      headerName: "Estado AFIP",
      width: 130,
      renderCell: (params) => {
        const color = params.value === "APPROVED" ? "success" : "warning";
        return <Chip label={params.value} color={color} size="small" variant="outlined" />;
      },
    },
    {
      field: "actions",
      type: "actions",
      headerName: "Acciones",
      width: 150,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<VisibilityIcon />}
          label="Detalle"
          onClick={() => handleViewDetail(params.row)}
        />,
        <GridActionsCellItem
          icon={<DownloadIcon />}
          label="Descargar"
          onClick={() => handleDownload(params.row.full_pdf_url)}
          disabled={!params.row.full_pdf_url}
        />,
        <GridActionsCellItem
          icon={<BlockIcon />}
          label="Anular"
          onClick={() => handleVoid(params.id)}
          disabled={params.row.arca_status === "VOIDED" || isEmployee}
        />,
      ],
    },
  ];

  return (
    <Box sx={{ width: "100%", p: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Facturación Electrónica (TusFacturasApp)
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<ReceiptIcon />}
            onClick={handleOpenPending}
            sx={{ mr: 1 }}
          >
            Órdenes Pendientes
          </Button>
          <IconButton onClick={handleRefresh}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ mb: 2, display: "flex", gap: 1 }}>
        <TextField
          size="small"
          placeholder="Buscar por cliente o nro..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }} />,
          }}
          sx={{ width: 300 }}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ height: 600, width: "100%" }}>
        <DataGrid
          rows={filteredInvoices}
          columns={columns}
          loading={loading}
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
          }}
          disableRowSelectionOnClick
        />
      </Paper>

      {/* Modal Opciones de Facturación */}
      <Dialog open={openOptionsDialog} onClose={() => setOpenOptionsDialog(false)} fullWidth maxWidth="md">
        <DialogTitle>Opciones de Emisión de Factura</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={3}>
            {/* Columna Izquierda: Datos del Cliente */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom color="primary">Datos Fiscales del Cliente</Typography>
              <TextField
                fullWidth label="Nombre / Razón Social" size="small" margin="dense"
                value={invoiceOptions.customer_name}
                onChange={(e) => setInvoiceOptions({...invoiceOptions, customer_name: e.target.value})}
              />
              <Grid container spacing={1}>
                <Grid item xs={4}>
                  <TextField
                    fullWidth select label="Tipo Doc." size="small" margin="dense"
                    value={invoiceOptions.customer_doc_type}
                    onChange={(e) => setInvoiceOptions({...invoiceOptions, customer_doc_type: e.target.value})}
                  >
                    <MenuItem value="80">CUIT</MenuItem>
                    <MenuItem value="96">DNI</MenuItem>
                    <MenuItem value="99">S/D</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={8}>
                  <TextField
                    fullWidth label="Número Documento" size="small" margin="dense"
                    value={invoiceOptions.customer_doc_number}
                    onChange={(e) => setInvoiceOptions({...invoiceOptions, customer_doc_number: e.target.value})}
                  />
                </Grid>
              </Grid>
              <TextField
                fullWidth select label="Condición IVA" size="small" margin="dense"
                value={invoiceOptions.iva_condition_id}
                onChange={(e) => setInvoiceOptions({...invoiceOptions, iva_condition_id: e.target.value})}
              >
                {ivaConditions.map(cond => (
                  <MenuItem key={cond.id} value={cond.id}>{cond.nombre}</MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Columna Derecha: Configuración Comprobante */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom color="primary">Configuración de Comprobante</Typography>
              <TextField
                fullWidth select label="Tipo de Factura" size="small" margin="dense"
                value={invoiceOptions.comprobante_tipo}
                onChange={(e) => setInvoiceOptions({...invoiceOptions, comprobante_tipo: e.target.value})}
              >
                <MenuItem value="1">Factura A</MenuItem>
                <MenuItem value="6">Factura B</MenuItem>
                <MenuItem value="11">Factura C</MenuItem>
              </TextField>
              
              <TextField
                fullWidth select label="Alícuota IVA" size="small" margin="dense"
                value={invoiceOptions.iva_id}
                onChange={(e) => setInvoiceOptions({...invoiceOptions, iva_id: e.target.value})}
              >
                {vatRates.map(rate => (
                  <MenuItem key={rate.id} value={rate.id}>{rate.nombre}</MenuItem>
                ))}
              </TextField>

              <TextField
                fullWidth select label="Condición de Pago" size="small" margin="dense"
                value={invoiceOptions.condicion_pago_id}
                onChange={(e) => setInvoiceOptions({...invoiceOptions, condicion_pago_id: e.target.value})}
              >
                {paymentConditions.map(p => (
                  <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>
                ))}
              </TextField>

              <TextField
                fullWidth label="Punto de Venta" size="small" margin="dense"
                value={invoiceOptions.punto_venta}
                onChange={(e) => setInvoiceOptions({...invoiceOptions, punto_venta: e.target.value})}
                disabled={isEmployee}
                helperText="Número del punto de venta registrado en TFA/AFIP"
              />
            </Grid>

            {/* Detalle de Items (Read Only) */}
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" gutterBottom>Detalle de la Orden (Lectura)</Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Producto/Servicio</TableCell>
                      <TableCell align="right">Cant.</TableCell>
                      <TableCell align="right">P. Unit</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedOrder?.order_items?.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.inventory_items?.name}</TableCell>
                        <TableCell align="right">{item.quantity}</TableCell>
                        <TableCell align="right">$ {item.unit_price.toFixed(2)}</TableCell>
                        <TableCell align="right">$ {(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} align="right"><Typography sx={{ fontWeight: 'bold' }}>TOTAL A FACTURAR</Typography></TableCell>
                      <TableCell align="right"><Typography color="primary" sx={{ fontWeight: 'bold' }}>$ {calculateTotalPreview().toFixed(2)}</Typography></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenOptionsDialog(false)}>Cancelar</Button>
          <Button
            variant="contained" color="success"
            onClick={handleGenerateInvoice}
            disabled={isProcessing}
            startIcon={isProcessing ? <CircularProgress size={20} /> : <ReceiptIcon />}
          >
            Emitir Factura Oficial AFIP
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Detalle (Existente) */}
      <Dialog open={openDetailDialog} onClose={() => setOpenDetailDialog(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Comprobante {selectedInvoice?.punto_venta}-{selectedInvoice?.cbte_nro}
          <Box>
            <IconButton onClick={() => setDetailTab(0)} color={detailTab === 0 ? "primary" : "default"}>
              <VisibilityIcon />
            </IconButton>
            <IconButton onClick={() => setDetailTab(1)} color={detailTab === 1 ? "primary" : "default"}>
              <ListAltIcon />
            </IconButton>
            <IconButton onClick={() => setDetailTab(2)} color={detailTab === 2 ? "primary" : "default"}>
              <HistoryIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedInvoice && (
            <>
              {detailTab === 0 && (
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="textSecondary">Número Legal</Typography>
                    <Typography variant="body1">{selectedInvoice.punto_venta}-{selectedInvoice.cbte_nro}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="textSecondary">Fecha Emisión</Typography>
                    <Typography variant="body1">{new Date(selectedInvoice.created_at).toLocaleString()}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="caption" color="textSecondary">Cliente</Typography>
                    <Typography variant="body1">{selectedInvoice.order?.customer_name || "N/A"}</Typography>
                    <Typography variant="body2" color="textSecondary">
                      {selectedInvoice.order?.customer_doc_type}: {selectedInvoice.order?.customer_doc_number}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Condición IVA: {selectedInvoice.order?.iva_condition || "Consumidor Final"}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="textSecondary">CAE / Autorización</Typography>
                    <Typography variant="body1" sx={{ wordBreak: "break-all", fontWeight: "bold" }}>
                      {selectedInvoice.arca_cae}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="textSecondary">Vencimiento CAE</Typography>
                    <Typography variant="body1">{selectedInvoice.cae_vencimiento || "N/A"}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ mt: 2, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                      <Typography variant="subtitle2" align="right">Importe Total</Typography>
                      <Typography variant="h5" align="right" color="primary" sx={{ fontWeight: "bold" }}>
                        $ {parseFloat(selectedInvoice.total_amount).toFixed(2)}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              )}

              {detailTab === 1 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>Ítems Facturados</Typography>
                  <DataGrid
                    autoHeight
                    density="compact"
                    rows={selectedInvoice.order?.order_items?.map((item, idx) => ({ ...item, id: idx })) || []}
                    columns={[
                      { field: "inventory_items", headerName: "Producto/Servicio", flex: 1, valueGetter: (params, row) => row.inventory_items?.name },
                      { field: "quantity", headerName: "Cant.", width: 80 },
                      { field: "unit_price", headerName: "Precio Unit.", width: 120, valueFormatter: (v) => `$ ${v.toFixed(2)}` },
                      {
                        field: "subtotal",
                        headerName: "Subtotal",
                        width: 120,
                        valueGetter: (params, row) => row.quantity * row.unit_price,
                        valueFormatter: (v) => `$ ${v.toFixed(2)}`
                      }
                    ]}
                    hideFooter
                  />
                </Box>
              )}

              {detailTab === 2 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 2 }}>Historial de Auditoría (TFA API)</Typography>
                  <DataGrid
                    autoHeight
                    density="compact"
                    rows={invoiceLogs.map(log => ({ ...log, id: log.id }))}
                    columns={[
                      { field: "created_at", headerName: "Fecha/Hora", width: 160, valueFormatter: (v) => new Date(v).toLocaleString() },
                      { field: "operation_name", headerName: "Operación", width: 180 },
                      {
                        field: "status",
                        headerName: "Estado",
                        width: 100,
                        renderCell: (params) => (
                          <Chip
                            label={params.value}
                            size="small"
                            color={params.value === "SUCCESS" ? "success" : "error"}
                            variant="outlined"
                          />
                        )
                      }
                    ]}
                    hideFooter
                  />
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between", px: 3, py: 2 }}>
          <Box>
            <Tooltip title="Compartir por WhatsApp">
              <IconButton color="success" onClick={() => handleShare(selectedInvoice.full_pdf_url, "whatsapp")}>
                <WhatsAppIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Compartir por Email">
              <IconButton color="primary" onClick={() => handleShare(selectedInvoice.full_pdf_url, "email")}>
                <EmailIcon />
              </IconButton>
            </Tooltip>
          </Box>
          <Box>
            <Button onClick={() => setOpenDetailDialog(false)}>Cerrar</Button>
            {selectedInvoice?.full_pdf_url && (
              <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => handleDownload(selectedInvoice.full_pdf_url)}>
                PDF Oficial
              </Button>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      {/* Modal Órdenes Pendientes */}
      <Dialog open={openPendingDialog} onClose={() => setOpenPendingDialog(false)} fullWidth maxWidth="md">
        <DialogTitle>Órdenes Pagadas Pendientes de Facturación</DialogTitle>
        <DialogContent dividers>
          {pendingOrders.length === 0 ? (
            <Typography variant="body1" sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
              No hay órdenes pendientes de facturación.
            </Typography>
          ) : (
            <DataGrid
              autoHeight
              rows={pendingOrders}
              columns={[
                { field: "created_at", headerName: "Fecha", width: 150, valueFormatter: (v) => new Date(v).toLocaleString() },
                { field: "customer_name", headerName: "Cliente", flex: 1 },
                { field: "total_amount", headerName: "Total", width: 120, valueFormatter: (v) => `$ ${parseFloat(v).toFixed(2)}` },
                {
                  field: "actions",
                  type: "actions",
                  headerName: "Facturar",
                  width: 100,
                  getActions: (params) => [
                    <GridActionsCellItem
                      icon={isProcessing ? <CircularProgress size={20} /> : <ReceiptIcon color="primary" />}
                      label="Generar Factura"
                      onClick={() => handleSelectOrder(params.row)}
                      disabled={isProcessing}
                    />,
                  ],
                },
              ]}
              pageSizeOptions={[5]}
              initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPendingDialog(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
