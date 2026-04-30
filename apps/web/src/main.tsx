import React from "react";
import ReactDOM from "react-dom/client";
import { Providers } from "./app/providers.js";
import { App } from "./app/App.js";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("No root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>
);
