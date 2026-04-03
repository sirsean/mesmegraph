import { Link, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle";
import "../App.css";

function routeReadout(pathname: string): string {
  if (pathname === "/") return "MESMEGRAPH · OPTICAL DECK · v0";
  if (pathname.startsWith("/camera")) return "MESMEGRAPH · LENS STACK · v0";
  return "MESMEGRAPH";
}

export function AppShell() {
  const { pathname } = useLocation();
  const onCamera = pathname.startsWith("/camera");

  return (
    <div className="shell">
      <div className="top-bar">
        <div className="top-bar__left">
          {onCamera && (
            <Link to="/" className="nav-pill">
              ← Deck
            </Link>
          )}
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
