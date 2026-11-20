import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { Usuarios } from './pages/admin/Usuarios'
import { EditarAccion } from './pages/EditarAccion'
import { FichaAccion } from './pages/FichaAccion'
import { GestionPlan } from './pages/GestionPlan'
import { Importar } from './pages/Importar'
import { InformeSeguimiento } from './pages/InformeSeguimiento'
import { Inicio } from './pages/Inicio'
import { Login } from './pages/Login'
import { NoEncontrada } from './pages/NoEncontrada'
import { Perfil } from './pages/Perfil'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Fase 5: rutas públicas /plan/:titulacion/:anyo */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Inicio />} />
        <Route path="gestion/:codigo" element={<GestionPlan />} />
        <Route path="gestion/:codigo/importar" element={<Importar />} />
        <Route path="gestion/:codigo/nueva" element={<EditarAccion />} />
        <Route path="gestion/:codigo/accion/:id" element={<FichaAccion />} />
        <Route path="gestion/:codigo/accion/:id/editar" element={<EditarAccion key="editar" />} />
        <Route path="gestion/:codigo/informe" element={<InformeSeguimiento />} />
        <Route path="perfil" element={<Perfil />} />
        <Route
          path="admin/usuarios"
          element={
            <RequireAuth admin>
              <Usuarios />
            </RequireAuth>
          }
        />
      </Route>
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  )
}
