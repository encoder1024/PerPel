import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  Box,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Typography,
  Divider,
  CircularProgress,
  Alert,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { useWorkBoxes } from '../../hooks/useWorkBoxes';
import { useProfessionals } from '../../hooks/useProfessionals';
import { useAuthStore } from '../../stores/authStore';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function BoxesConfigModal({ open, onClose, businessId }) {
  const { profile } = useAuthStore();
  const [tabValue, setTabValue] = useState(0);
  const { boxes, loading: boxesLoading, createBox, updateBox, deleteBox } = useWorkBoxes();
  const { professionals, loading: profsLoading, createProfessional, updateProfessional, deleteProfessional } = useProfessionals();

  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', full_name: '', specialty: '' });
  const [isSaving, setIsSaving] = useState(false);

  // Filtrar por negocio si se proporciona ID
  const filteredBoxes = businessId ? boxes.filter(b => b.business_id === businessId) : boxes;
  const filteredProfs = businessId ? professionals.filter(p => p.business_id === businessId) : professionals;

  const handleSave = async () => {
    setIsSaving(true);
    let res;
    if (tabValue === 0) { // Boxes
      if (editingItem) {
        res = await updateBox(editingItem.id, { name: formData.name });
      } else {
        res = await createBox({ name: formData.name, business_id: businessId });
      }
    } else { // Professionals
      if (editingItem) {
        res = await updateProfessional(editingItem.id, { full_name: formData.full_name, specialty: formData.specialty });
      } else {
        res = await createProfessional({ full_name: formData.full_name, specialty: formData.specialty, business_id: businessId });
      }
    }
    setIsSaving(false);
    if (res.success) {
      setEditingItem(null);
      setFormData({ name: '', full_name: '', specialty: '' });
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    if (tabValue === 0) {
      setFormData({ ...formData, name: item.name });
    } else {
      setFormData({ ...formData, full_name: item.full_name, specialty: item.specialty || '' });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configuración de Boxes y Profesionales</DialogTitle>
      <DialogContent>
        <Tabs value={tabValue} onChange={(e, v) => { setTabValue(v); setEditingItem(null); setFormData({ name: '', full_name: '', specialty: '' }); }}>
          <Tab label="Boxes" />
          <Tab label="Profesionales" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Box sx={{ mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={9}>
                <TextField
                  fullWidth
                  label="Nombre del Box (ej: Silla 1)"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={3}>
                <Button 
                  variant="contained" 
                  onClick={handleSave} 
                  disabled={!formData.name || isSaving}
                  fullWidth
                >
                  {editingItem ? 'Editar' : 'Agregar'}
                </Button>
              </Grid>
            </Grid>
          </Box>
          <Divider />
          <List>
            {boxesLoading ? <CircularProgress size={24} /> : filteredBoxes.map((box) => (
              <ListItem key={box.id}>
                <ListItemText primary={box.name} />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleEdit(box)}><EditIcon /></IconButton>
                  <IconButton edge="end" onClick={() => deleteBox(box.id)}><DeleteIcon color="error" /></IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box sx={{ mb: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Nombre del Profesional"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={9}>
                <TextField
                  fullWidth
                  label="Especialidad (opcional)"
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  size="small"
                />
              </Grid>
              <Grid item xs={3}>
                <Button 
                  variant="contained" 
                  onClick={handleSave} 
                  disabled={!formData.full_name || isSaving}
                  fullWidth
                >
                  {editingItem ? 'Editar' : 'Agregar'}
                </Button>
              </Grid>
            </Grid>
          </Box>
          <Divider />
          <List>
            {profsLoading ? <CircularProgress size={24} /> : filteredProfs.map((prof) => (
              <ListItem key={prof.id}>
                <ListItemText primary={prof.full_name} secondary={prof.specialty} />
                <ListItemSecondaryAction>
                  <IconButton edge="end" onClick={() => handleEdit(prof)}><EditIcon /></IconButton>
                  <IconButton edge="end" onClick={() => deleteProfessional(prof.id)}><DeleteIcon color="error" /></IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
