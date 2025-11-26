import { useEffect, useState } from "react";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UIResourceRenderer } from "@mcp-ui/client";
import "./App.css";

const SERVER_URL = import.meta.env.VITE_MCP_SERVER_URL;

export default function App() {
  const [client, setClient] = useState(null);
  const [resource, setResource] = useState(null);

  // Connect MCP client
  useEffect(() => {
    const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL));
    const mcpClient = new Client({ name: "Todo React Client", version: "1.0.0" });
    mcpClient.connect(transport).then(async () => {
      setClient(mcpClient);
      await loadTodos(mcpClient);
    });
  }, []);

  // Load MCP Todo UI resource
  const loadTodos = async (mcpClient) => {
    const data = await mcpClient.callTool({ name: "todo_list", arguments: {} });
    console.log(data);
    const ui = data.content.find((c) => c.type === "resource");
    console.log(ui.resource);
    if (ui) setResource(ui.resource);
  };

  if (!resource) return <p>Loading MCP Todo UI...</p>;

  return (
    <div style={{ height: "100vh", overflow: "hidden" }}>
      <UIResourceRenderer
        resource={resource}
        onUIAction={async (result) => {
          try {
            await client.callTool({ name: result.action, arguments: result });
            await loadTodos(client); // refresh UI if needed
          } catch (err) {
            console.error(err);
          }
        }}
      />
    </div>
  );
}
