import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@/lib/api-client-react";
import App from "./App";
import "./index.css";

// Configure API base URL
setBaseUrl(null);

createRoot(document.getElementById("root")!).render(<App />);
