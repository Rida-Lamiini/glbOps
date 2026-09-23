import React, { useEffect, useState } from "react";
import GlobetudesProjets from "./GlobetudesProjets";
import LoginScreen from "./components/LoginScreen";
import ResourceScan from "./components/ResourceScan";
import { Toaster } from "@/components/ui/sonner";
import { clearScannedResource, scannedResourceId } from "./utils/resourceLink";
import { apiGet, clearTokens, isAuthenticated, login as apiLogin, restoreSession } from "./lib/api";

export default function App() {
  const [status, setStatus] = useState("checking"); // checking | anonymous | authenticated
  const [authUser, setAuthUser] = useState(null);
  // A QR label opens the app with ?ressource=ID: show that resource's scan page after login.
  const [scanId, setScanId] = useState(() => scannedResourceId());
  const [openResourceId, setOpenResourceId] = useState(null);

  const loadCurrentUser = async () => {
    const me = await apiGet("/auth/me/");
    setAuthUser(me);
    setStatus("authenticated");
  };

  useEffect(() => {
    (async () => {
      if (isAuthenticated() && (await restoreSession())) {
        try {
          await loadCurrentUser();
          return;
        } catch {
          clearTokens();
        }
      }
      setStatus("anonymous");
    })();
  }, []);

  const handleLogin = async (username, password, sharedDevice) => {
    await apiLogin(username, password, { sharedDevice });
    await loadCurrentUser();
  };

  const handleLogout = () => {
    clearTokens();
    setAuthUser(null);
    setStatus("anonymous");
  };

  if (status === "checking") return null;
  if (status === "anonymous") return <LoginScreen onLogin={handleLogin} />;

  if (scanId) {
    const leaveScan = () => { clearScannedResource(); setScanId(null); };
    return (
      <>
        <Toaster />
        <ResourceScan
          id={scanId}
          authUser={authUser}
          onClose={leaveScan}
          onOpenFiche={(rid) => { setOpenResourceId(rid); leaveScan(); }}
        />
      </>
    );
  }

  return <GlobetudesProjets authUser={authUser} onLogout={handleLogout} initialResource={openResourceId} />;
}
