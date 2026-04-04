import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GalleryFillProvider } from "./context/GalleryFillContext";
import { AppShell } from "./layout/AppShell";
import CameraPage from "./pages/CameraPage";
import { CameraRedirectPage } from "./pages/CameraRedirectPage";
import { DeckPage } from "./pages/DeckPage";
import { GalleryPage } from "./pages/GalleryPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <GalleryFillProvider>
              <AppShell />
            </GalleryFillProvider>
          }
        >
          <Route path="/" element={<DeckPage />} />
          <Route path="/camera" element={<CameraRedirectPage />} />
          <Route path="/camera/:specId" element={<CameraPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
