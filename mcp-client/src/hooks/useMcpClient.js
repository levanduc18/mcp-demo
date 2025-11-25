import { useEffect, useRef, useState } from "react";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * MCP Client hook
 * @param {string} serverUrl - server url
 * @returns
 */
export function useMcpClient(serverUrl) {
  const clientRef = useRef(null);
  const transportRef = useRef(null);

  // React-safe state to expose to UI
  const [client, setClient] = useState(null);

  useEffect(() => {
    if (clientRef.current) return; // Prevent re-init

    const init = async () => {
      try {
        const newClient = new Client({
          name: "streamable-http-client",
          version: "1.0.0",
        });

        const newTransport = new StreamableHTTPClientTransport(new URL(serverUrl));

        await newClient.connect(newTransport);
        console.log("MCP connected");

        // Store in refs
        clientRef.current = newClient;
        transportRef.current = newTransport;

        // Expose to React UI via state
        setClient(newClient);
      } catch (err) {
        console.error("Connect failed:", err);
      }
    };

    init();

    return () => {
      if (transportRef.current) {
        try {
          transportRef.current.close();
        } catch (err) {
          console.error("Disconnect failed:", err);
        }
      }
    };
  }, [serverUrl]);

  return {
    client,
  };
}
