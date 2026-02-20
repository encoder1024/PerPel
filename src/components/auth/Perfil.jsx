import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Snackbar,
  CircularProgress,
  TextField,
} from "@mui/material";
import { supabase } from "../../services/supabaseClient"; // Assuming this path
import { useAuthStore } from "../../stores/authStore"; // Assuming this path for Zustand store

export const Perfil = () => {
  const { user, app_role } = useAuthStore(); // Get user and app_role from authStore. account_id will be handled locally after code validation.
  const [selectedRole, setSelectedRole] = useState("");
  const [requestStatus, setRequestStatus] = useState(null); // null, 'success', 'error'
  const [loading, setLoading] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [accountId, setAccountId] = useState(""); // Local state for the account ID determined by the access code

  // New state for code validation
  const [accessCode, setAccessCode] = useState("");
  const [validatedAccountName, setValidatedAccountName] = useState("");
  const [validationError, setValidationError] = useState("");
  const [isCodeValidated, setIsCodeValidated] = useState(false);
  const [validatingCode, setValidatingCode] = useState(false);

  // Roles that a regular user can request
  const selectableRoles = ["ADMIN", "EMPLOYEE", "AUDITOR"];

  // Function to validate the access code
  const handleValidateCode = async () => {
    setValidatingCode(true);
    setValidationError("");
    setValidatedAccountName("");
    setIsCodeValidated(false);
    setAccountId(""); // Clear previous accountId

    if (!accessCode) {
      setValidationError("Por favo ingrese un código de cuenta.");
      setValidatingCode(false);
      return;
    }

    if (!user?.id) {
      setValidationError(
        "La información del usuario no está. Por favor haga login de nuevo.",
      );
      setValidatingCode(false);
      return;
    }

    try {
      // Query the accounts table for the given code. The user explicitely stated: "se verifique solo por este código"
      const { data, error } = await supabase
        .schema("core")
        .from("accounts")
        .select("id, account_name")
        .eq("registration_code", accessCode) // Assuming 'registration_code' is the column name
        // .eq('id', account_id) // This filter is intentionally commented out as per user's instruction.
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        setValidatedAccountName(data.account_name);
        setAccountId(data.id); // Set the accountId from the validated code
        setIsCodeValidated(true);
        setSnackbarMessage("Código valido!");
        setRequestStatus("success");
      } else {
        setValidationError("Código invalido. Por favor intenta de nuevo.");
        setSnackbarMessage("Código no valido!");
        setRequestStatus("error");
      }
    } catch (error) {
      console.error("Error validating access code:", error.message);
      setValidationError(`Validation Error: ${error.message}`);
      setRequestStatus("error");
    } finally {
      setValidatingCode(false);
      setSnackbarOpen(true);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault(); // Prevent default form submission for role request
    if (!selectedRole || !user?.id || !accountId) {
      // Use the local accountId state
      setRequestStatus("error");
      setSnackbarMessage("Falta información del usuario o definir el rol.");
      setSnackbarOpen(true);
      return;
    }
    if (!isCodeValidated) {
      setRequestStatus("error");
      setSnackbarMessage("Por favor valide primero el código.");
      setSnackbarOpen(true);
      return;
    }

    setLoading(true);
    setRequestStatus(null);

    try {
      const { data, error } = await supabase
        .schema("core")
        .from("role_requests")
        .insert([
          {
            user_id: user.id,
            account_id: accountId, // Use the local accountId state
            requested_role: selectedRole,
            status: "PENDING", // Default status
          },
        ]);

      if (error) {
        throw error;
      }

      setRequestStatus("success");
      setSnackbarMessage("Se envió con éxito tu solicitud!");
      setSnackbarOpen(true);
      setSelectedRole(""); // Clear selected role after successful submission
    } catch (error) {
      console.error("Error sending role request:", error.message);
      setRequestStatus("error");
      setSnackbarMessage(`Error: ${error.message}`);
      setSnackbarOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Handler for the validation form submission (on Enter key press)
  const handleValidationFormSubmit = (event) => {
    event.preventDefault(); // Prevent default form submission (page reload)
    handleValidateCode(); // Call the validation function
  };

  const handleSnackbarClose = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setSnackbarOpen(false);
  };

  // EFFECT ADDED: Reset loading states on mount/remount to prevent being stuck
  useEffect(() => {
    setValidatingCode(false);
    setLoading(false);
    // Optionally, you might want to reset other transient states like requestStatus and snackbar here
    // setRequestStatus(null);
    // setSnackbarOpen(false);
  }, []); // Empty dependency array means this runs once on mount

  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: "auto" }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Solicitud de Rol y Validación de Cuenta
      </Typography>

      <Typography variant="body1" paragraph>
        Tu rol actual es: <strong>{app_role || "No asignado"}</strong>. Puedes
        solicitar un cambio de rol a través del siguiente formulario, previa
        validación de la cuenta a la que deseas unirte.
      </Typography>

      {/* Validation Form */}
      <Box
        component="form"
        noValidate
        autoComplete="off"
        sx={{ mt: 3 }}
        onSubmit={handleValidationFormSubmit}
      >
        <Typography variant="h6" gutterBottom>
          Validar Código de Cuenta
        </Typography>
        <TextField
          fullWidth
          label="Código de Acceso de la Cuenta"
          value={accessCode}
          onChange={(e) => {
            setAccessCode(e.target.value);
            setValidationError(""); // Clear error on change
            setIsCodeValidated(false); // Reset validation status
            setValidatedAccountName("");
            setAccountId(""); // Also clear accountId if code changes
          }}
          margin="normal"
          disabled={validatingCode}
          error={!!validationError}
          helperText={validationError}
        />
        <Button
          variant="outlined"
          type="submit" // Set type to submit so Enter key triggers this form
          onClick={handleValidateCode} // Keep onClick for direct button clicks
          disabled={validatingCode || !accessCode}
          startIcon={
            validatingCode ? (
              <CircularProgress size={20} color="inherit" />
            ) : null
          }
        >
          {validatingCode ? "Validando..." : "Validar Código"}
        </Button>
        {validatedAccountName && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Código validado. Estás solicitando un rol para la cuenta:{" "}
            <strong>{validatedAccountName}</strong>.
          </Alert>
        )}
      </Box>

      {isCodeValidated && (
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            Solicitar Rol
          </Typography>
          <FormControl fullWidth margin="normal">
            <InputLabel id="role-select-label">Rol a solicitar</InputLabel>
            <Select
              labelId="role-select-label"
              id="role-select"
              value={selectedRole}
              label="Rol a solicitar"
              onChange={(e) => setSelectedRole(e.target.value)}
              disabled={loading}
            >
              <MenuItem value="">
                <em>Selecciona un rol</em>
              </MenuItem>
              {selectableRoles.map((role) => (
                <MenuItem key={role} value={role}>
                  {role}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            sx={{ mt: 2 }}
            disabled={loading || !selectedRole}
            startIcon={
              loading ? <CircularProgress size={20} color="inherit" /> : null
            }
          >
            {loading ? "Enviando..." : "Enviar Solicitud"}
          </Button>
        </Box>
      )}

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={requestStatus === "success" ? "success" : "error"}
          sx={{ width: "100%" }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Perfil;
