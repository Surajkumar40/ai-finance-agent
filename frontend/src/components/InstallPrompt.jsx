import { useEffect, useState } from "react";

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferred) return null;

  const install = async () => {
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <button
      onClick={install}
      className="fixed bottom-4 right-4 rounded-lg bg-indigo-600 px-4 py-2 text-white shadow-lg"
    >
      Install app
    </button>
  );
}