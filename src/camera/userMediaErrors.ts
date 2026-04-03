export function formatUserMediaError(err: unknown): string {
  if (!window.isSecureContext) {
    return "Camera needs a secure context (HTTPS or localhost). Open the app over HTTPS or from http://localhost.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser does not expose a camera API.";
  }

  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return "Camera access was blocked. Allow the permission in the browser or OS settings, then try again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No camera was found on this device.";
      case "NotReadableError":
      case "TrackStartError":
        return "The camera is in use or could not be started. Close other apps using the camera and try again.";
      case "OverconstrainedError":
      case "ConstraintNotSatisfiedError":
        return "The camera could not satisfy the requested settings. Try again with default settings.";
      case "AbortError":
        return "Camera startup was interrupted.";
      case "SecurityError":
        return "Camera access was blocked for security reasons.";
      default:
        return err.message || "Could not open the camera.";
    }
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return "Could not open the camera.";
}
