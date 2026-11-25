import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { Avisos } from './pages/admin/Avisos'
import { Consultas } from './pages/admin/Consultas'
import { Usuarios } from './pages/admin/Usuarios'
import { EditarAccion } from './pages/EditarAccion'
import { FichaAccion } from './pages/FichaAccion'
import { GestionPlan } from './pages/GestionPlan'
import { Importar } from './pages/Importar'
import { Indicadores } from './pages/Indicadores'
import { ActualizarCatalogo } from './pages/ActualizarCatalogo'
import { InformeSeguimiento } from './pages/InformeSeguimiento'
import { Inicio } from './pages/Inicio'
import { Login } from './pages/Login'
import { NoEncontrada } from './pages/NoEncontrada'
import { Perfil } from './pages/Perfil'
import { Restablecer } from './pages/Restablecer'
import { IndicePlanes, PlanPublico } from './pages/PlanPublico'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/restablecer" element={<Restablecer />} />
      {/* Rutas públicas (sin iniciar sesión) */}
      <Route path="/plan" element={<IndicePlanes />} />
      <Route path="/plan/:codigo" element={<PlanPublico />} />
      <Route path="/plan/:codigo/:anyo" element={<PlanPublico />} />
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
        <Route path="indicadores" element={<Indicadores />} />
        <Route path="indicadores/actualizar" element={<ActualizarCatalogo />} />
        <Route
          path="admin/consultas"
          element={
            <RequireAuth admin>
              <Consultas />
            </RequireAuth>
          }
        />
        <Route
          path="admin/ajustes"
          element={
            <RequireAuth admin>
              <Avisos />
            </RequireAuth>
          }
        />
        {/* dirección anterior de los ajustes */}
        <Route
          path="admin/avisos"
          element={
            <RequireAuth admin>
              <Avisos />
            </RequireAuth>
          }
        />
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
