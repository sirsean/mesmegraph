import { useEffect, type CSSProperties } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle";
import { useGalleryFill } from "../context/GalleryFillContext";
import "../App.css";

function routeReadout(pathname: string): string {
  if (pathname === "/") return "MESMEGRAPH · OPTICAL DECK · v0";
  if (pathname.startsWith("/camera")) return "MESMEGRAPH · LENS STACK · v0";
  if (pathname === "/gallery") return "MESMEGRAPH · FIELD LOG · v0";
  return "MESMEGRAPH";
}

export function AppShell() {
  const { pathname } = useLocation();
  const { fillRatio, refreshGalleryFill } = useGalleryFill();

  useEffect(() => {
    void refreshGalleryFill();
  }, [pathname, refreshGalleryFill]);

  const tension = fillRatio > 0.001;

  return (
    <div
      className={`shell${tension ? " shell--storage-tension" : ""}`}
      style={{ "--gallery-degrade": String(fillRatio) } as CSSProperties}
    >
      <div className="top-bar">
        <div className="top-bar__left">
          {pathname !== "/" && (
            <Link to="/" className="nav-pill">
              ← Deck
            </Link>
          )}
          <Link to="/gallery" className="nav-pill">
            Gallery
          </Link>
          <p className="machine-readout" aria-hidden>
            {routeReadout(pathname)}
          </p>
        </div>
        <ThemeToggle />
      </div>

      <Outlet />
    </div>
  );
}
