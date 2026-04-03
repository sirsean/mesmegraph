import { Navigate } from "react-router-dom";
import { readSelectedSpecId } from "../storage/selectedSpec";

/** `/camera` without a spec segment — use last stored (or default) selection. */
export function CameraRedirectPage() {
  const id = readSelectedSpecId();
  return <Navigate to={`/camera/${id}`} replace />;
}
