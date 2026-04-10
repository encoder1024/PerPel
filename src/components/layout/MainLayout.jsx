import React, { useState } from 'react';
import { styled, useTheme } from '@mui/material/styles';
import {
  Box,
  Drawer as MuiDrawer,
  AppBar as MuiAppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  Collapse,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AccountCircle from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { navigationGroups } from '../../utils/navigation';
import clientLogo from '../../assets/logoAE_full.jpg';

const drawerWidth = 240;

const openedMixin = (theme) => ({
  width: drawerWidth,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
});

const closedMixin = (theme) => ({
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  width: `calc(${theme.spacing(7)} + 1px)`,
  [theme.breakpoints.up('sm')]: {
    width: `calc(${theme.spacing(8)} + 1px)`,
  },
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
});

const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: theme.spacing(0, 1),
  ...theme.mixins.toolbar,
}));

const AppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
  zIndex: theme.zIndex.drawer + 1,
  transition: theme.transitions.create(['width', 'margin'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  backgroundColor: '#ffffff',
  color: theme.palette.text.primary,
  boxShadow: 'none',
  borderBottom: '1px solid #e2e8f0',
  ...(open && {
    marginLeft: drawerWidth,
    width: `calc(100% - ${drawerWidth}px)`,
    transition: theme.transitions.create(['width', 'margin'], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
}));

const Drawer = styled(MuiDrawer, { shouldForwardProp: (prop) => prop !== 'open' })(
  ({ theme, open }) => ({
    width: drawerWidth,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    ...(open && {
      ...openedMixin(theme),
      '& .MuiDrawer-paper': openedMixin(theme),
    }),
    ...(!open && {
      ...closedMixin(theme),
      '& .MuiDrawer-paper': closedMixin(theme),
    }),
  }),
);

export default function MainLayout({ children }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const { profile, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleDrawerOpen = () => setOpen(true);
  const handleDrawerClose = () => setOpen(false);
  const handleMenu = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    handleClose();
    await logout();
    navigate('/login');
  };

  // Filtrado de grupos y sus ítems por rol
  const filteredGroups = navigationGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => !item.roles || item.roles.includes(profile?.app_role))
    }))
    .filter(group => group.items.length > 0);

  // Estado para manejar qué grupos están expandidos
  const [expandedGroups, setExpandedGroups] = useState({});

  const handleToggleGroup = (title) => {
    if (!open) {
      setOpen(true); // Abrir el drawer si está cerrado al clickear un grupo
    }
    setExpandedGroups(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" open={open}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={handleDrawerOpen}
            edge="start"
            sx={{ marginRight: 5, ...(open && { display: 'none' }) }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <Box
              component="img"
              src={clientLogo}
              alt="Logo"
              sx={{ height: 32, mr: 2 }}
            />
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600 }}>
              {profile?.account_name || 'PerPel ERP'}
            </Typography>
          </Box>
          <div>
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleMenu}
              color="inherit"
            >
              {profile?.avatar_url ? (
                <Avatar src={profile.avatar_url} sx={{ width: 32, height: 32 }} />
              ) : (
                <AccountCircle />
              )}
            </IconButton>
            <Menu
              id="menu-appbar"
              anchorEl={anchorEl}
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              keepMounted
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              open={Boolean(anchorEl)}
              onClose={handleClose}
            >
              <MenuItem disabled sx={{ opacity: '1 !important', fontWeight: 600 }}>
                {profile?.full_name || 'Usuario'}
              </MenuItem>
              <MenuItem disabled sx={{ fontSize: '0.8rem' }}>
                {profile?.app_role}
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { handleClose(); navigate('/perfil'); }}>Perfil</MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                Cerrar Sesión
              </MenuItem>
            </Menu>
          </div>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" open={open}>
        <DrawerHeader>
          <Typography variant="h6" sx={{ color: 'white', flexGrow: 1, textAlign: 'center', fontWeight: 700 }}>
            
          </Typography>
          <IconButton onClick={handleDrawerClose} sx={{ color: 'white' }}>
            {theme.direction === 'rtl' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </DrawerHeader>
        <Divider sx={{ backgroundColor: 'rgba(255,255,255,0.12)' }} />
        <List sx={{ px: 0 }}>
          {filteredGroups.map((group) => (
            <React.Fragment key={group.title}>
              <ListItem disablePadding sx={{ display: 'block' }}>
                <Tooltip title={!open ? group.title : ''} placement="right">
                  <ListItemButton
                    onClick={() => handleToggleGroup(group.title)}
                    sx={{
                      minHeight: 48,
                      justifyContent: open ? 'initial' : 'center',
                      px: 2.5,
                      '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 0,
                        mr: open ? 3 : 'auto',
                        justifyContent: 'center',
                        color: 'rgba(255,255,255,0.9)',
                      }}
                    >
                      {group.icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={group.title} 
                      sx={{ 
                        opacity: open ? 1 : 0,
                        '& .MuiTypography-root': { fontWeight: 600, fontSize: '0.9rem' }
                      }} 
                    />
                    {open && (expandedGroups[group.title] ? <ExpandLess /> : <ExpandMore />)}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
              
              <Collapse in={expandedGroups[group.title] && open} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {group.items.map((item) => (
                    <ListItemButton
                      key={item.text}
                      onClick={() => navigate(item.path)}
                      sx={{
                        minHeight: 40,
                        pl: 4,
                        backgroundColor: location.pathname === item.path ? 'rgba(255,255,255,0.15)' : 'transparent',
                        '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' },
                      }}
                    >
                      <ListItemIcon
                        sx={{
                          minWidth: 0,
                          mr: 2,
                          color: location.pathname === item.path ? '#ffffff' : 'rgba(255,255,255,0.6)',
                        }}
                      >
                        {React.cloneElement(item.icon, { sx: { fontSize: '1.2rem' } })}
                      </ListItemIcon>
                      <ListItemText 
                        primary={item.text} 
                        sx={{ 
                          '& .MuiTypography-root': { 
                            fontWeight: location.pathname === item.path ? 600 : 400,
                            fontSize: '0.85rem'
                          }
                        }} 
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </React.Fragment>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, backgroundColor: '#f8fafc', minHeight: '100vh' }}>
        <DrawerHeader />
        {children}
      </Box>
    </Box>
  );
}
