import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Link,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Grid,
} from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function SignUp() {
  const [formData, setFormData] = useState({
    businessName: '',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    terms: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.terms) {
      setError('Debes aceptar los términos y condiciones.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      // 1. Crear el usuario en auth.users
      const { data, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
          },
        },
      });

      if (authError) throw authError;

      // Nota: En un flujo multi-tenant real, aquí llamaríamos a una Edge Function
      // para crear la core.account y el core.user_profile de forma atómica.
      // Como estamos en la Fase 2, informamos al usuario.

      alert('Registro iniciado. Por favor verifica tu email (si aplica) o procede al login.');
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
      }}
    >
      <Card sx={{ maxWidth: 500, width: '90%', p: 2 }}>
        <CardContent>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: 'primary.main', mb: 1 }}>
              PerPel
            </Typography>
            <Typography variant="h6" color="textSecondary">
              Crear cuenta de negocio
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  name="businessName"
                  label="Nombre de la empresa / Negocio"
                  variant="outlined"
                  value={formData.businessName}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  name="fullName"
                  label="Nombre completo del administrador"
                  variant="outlined"
                  value={formData.fullName}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  name="email"
                  label="Email corporativo"
                  type="email"
                  variant="outlined"
                  value={formData.email}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  name="password"
                  label="Contraseña"
                  type="password"
                  variant="outlined"
                  value={formData.password}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  name="confirmPassword"
                  label="Confirmar contraseña"
                  type="password"
                  variant="outlined"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      name="terms"
                      checked={formData.terms}
                      onChange={handleChange}
                      color="primary"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      Acepto los{' '}
                      <Link component={RouterLink} to="/terms" sx={{ fontWeight: 600 }}>
                        términos y condiciones
                      </Link>
                    </Typography>
                  }
                />
              </Grid>
            </Grid>

            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ py: 1.5, mt: 3, mb: 3 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Registrar Empresa'}
            </Button>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="textSecondary">
                ¿Ya tienes una cuenta?{' '}
                <Link component={RouterLink} to="/login" sx={{ fontWeight: 600 }}>
                  Inicia sesión
                </Link>
              </Typography>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
