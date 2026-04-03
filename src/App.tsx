import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { CameraPage } from "./pages/CameraPage";
import { CameraRedirectPage } from "./pages/CameraRedirectPage";
import { DeckPage } from "./pages/DeckPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DeckPage />} />
          <Route path="/camera" element={<CameraRedirectPage />} />
          <Route path="/camera/:specId" element={<CameraPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
