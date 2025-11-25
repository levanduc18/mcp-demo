import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Edit2, Check, X, RefreshCw } from "lucide-react";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { v4 as uuidv4 } from "uuid";

// Read the API URL from environment variable
const MCP_BRIDGE_URL = import.meta.env.VITE_MCP_SERVER_URL;

export default function App() {
  // Client and transport state
  const [client, setClient] = useState(null);
  const [transport, setTransport] = useState(null);
  const [sessionId, setSessionId] = useState(undefined);

  // Todos state
  const [todos, setTodos] = useState([]);

  // Title and description state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Loading and error state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const originalFetchRef = useRef(window.fetch);

  // Load todos on mount
  useEffect(() => {
    loadTodos();

    const setupClient = async () => {
      console.log(import.meta.env.VITE_MCP_SERVER_URL);
      const newTransport = new StreamableHTTPClientTransport(new URL(import.meta.env.VITE_MCP_SERVER_URL));
      const newClient = new Client({ transport });
      try {
        await newClient.connect(newTransport);
        setClient(newClient);
        setTransport(newTransport);

        console.log("Connected to MCP Server");
      } catch (err) {
        setError("Failed to connect to MCP Server: " + err.message);
        console.error("Failed to connect to MCP Server", err);
      }
    };

    setupClient();

    return () => {
      transport?.close();
    };
  }, []);

  const handleConnect = async (url) => {
    if (client) {
      return;
    }

    console.log("Connecting to MCP server at", url);

    try {
      // Generate a new session ID if we don't have one
      const currentSessionId = sessionId || uuidv4();
      setSessionId(currentSessionId);

      // Create a new client
      const newClient = new Client({
        name: "mcp-interactive-client",
        version: "1.0.0",
      });

      newClient.onerror = (error) => {
        console.error("Client error:", error);
        addOutput(`Error: ${error}`);
      };

      // Save original fetch
      originalFetchRef.current = window.fetch;

      // Override fetch method to ensure the header is set for ALL requests
      window.fetch = function (input, init) {
        // Create a new init object to avoid modifying the original
        const newInit = { ...init };

        // Initialize headers if not present
        if (!newInit.headers) {
          newInit.headers = new Headers();
        } else if (!(newInit.headers instanceof Headers)) {
          // Convert to Headers object if it's not already
          const headers = new Headers();
          Object.entries(newInit.headers).forEach(([key, value]) => {
            headers.append(key, String(value));
          });
          newInit.headers = headers;
        }

        // Add the session ID header to ALL requests (not just /mcp)
        // This ensures it's added regardless of how the transport makes requests
        newInit.headers.set("Mcp-Session-Id", currentSessionId);

        // Set CORS mode explicitly
        newInit.mode = "cors";

        // Don't send credentials by default to avoid preflight issues
        if (newInit.credentials === undefined) {
          newInit.credentials = "same-origin";
        }

        console.log(
          "Fetch intercepted:",
          typeof input === "string" ? input : input.toString(),
          "headers:",
          Object.fromEntries([...newInit.headers.entries()])
        );

        return originalFetchRef.current.call(window, input, newInit);
      };

      // Create transport
      const newTransport = new StreamableHTTPClientTransport(new URL(MCP_BRIDGE_URL));

      // Set up onclose handler to restore original fetch
      newTransport.onclose = () => {
        window.fetch = originalFetchRef.current;
        console.log("HTTP transport closed");
        setConnectionStatus("Connection Closed");
      };

      newTransport.onerror = (error) => {
        window.fetch = originalFetchRef.current;
        console.error("HTTP Transport Error:", error);
        setConnectionStatus(`Transport Error: ${error.message}`);
        setIsLoading(false);
      };

      // Set up notification handlers
      newClient.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
        setNotificationCount((prev) => prev + 1);
        const message = `Notification #${notificationCount + 1}: ${notification.params.level} - ${
          notification.params.data
        }`;
        addOutput(message);
        setNotifications((prev) => [...prev, message]);
      });

      newClient.setNotificationHandler(ResourceListChangedNotificationSchema, async (notification) => {
        addOutput("Resource list changed notification received!");
        try {
          if (!newClient) {
            addOutput("Client disconnected, cannot fetch resources");
            return;
          }
          const resourcesResult = await newClient.request(
            {
              method: "resources/list",
              params: {},
            },
            ListResourcesResultSchema
          );

          setAvailableResources(resourcesResult.resources);
          addOutput(`Available resources count: ${resourcesResult.resources.length}`);
        } catch (error) {
          addOutput("Failed to list resources after change notification");
        }
      });

      // Connect the client
      await newClient.connect(newTransport);

      // Send initialization notification
      try {
        addOutput("Sending notifications/initialized");
        await newClient.notification({
          method: "notifications/initialized",
          params: {},
        });
        addOutput("Initialization notification sent successfully");
      } catch (error) {
        addOutput(`Failed to send initialization notification: ${error.message}`);
      }

      setConnectionStatus(`Connected (Session: ${currentSessionId})`);
      addOutput(`Connected to MCP server with session ID: ${currentSessionId}`);

      setClient(newClient);
      setTransport(newTransport);

      // Automatically fetch available tools
      await listTools(newClient);
    } catch (error) {
      addOutput(`Failed to connect: ${error.message}`);
      setConnectionStatus(`Connection Failed: ${error.message}`);
      setClient(null);
      setTransport(null);
      // Restore original fetch on error
      window.fetch = originalFetchRef.current;
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!client || !transport) {
      addOutput("Not connected.");
      return;
    }

    setIsLoading(true);
    try {
      await transport.close();
      addOutput("Disconnected from MCP server");
      setConnectionStatus("Disconnected");
      setClient(null);
      setTransport(null);
      // Restore original fetch
      window.fetch = originalFetchRef.current;
    } catch (error) {
      addOutput(`Error disconnecting: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTerminateSession = async () => {
    if (!client || !transport) {
      addOutput("Not connected.");
      return;
    }

    setIsLoading(true);
    try {
      addOutput(`Terminating session with ID: ${sessionId}`);
      await transport.terminateSession();
      addOutput("Session terminated successfully");

      // Also close the transport and clear client objects
      await transport.close();
      addOutput("Transport closed after session termination");
      setClient(null);
      setTransport(null);
      setConnectionStatus("Disconnected (Session Terminated)");
      // Restore original fetch
      window.fetch = originalFetchRef.current;
    } catch (error) {
      addOutput(`Error terminating session: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = async () => {
    if (client) {
      await handleDisconnect();
    }
    await handleConnect();
  };

  /**
   * Load todos from API
   */
  const loadTodos = async () => {
    try {
      // Set loading state and clear error
      setLoading(true);
      setError("");

      // Fetch todos
      const response = await client.callTool({
        name: "todo_list",
        arguments: {},
      });

      const data = response.structuredContent;
      setTodos(data);
    } catch (err) {
      // Set error
      setError("Could not connect to server. Make sure the server is running on port 3000.");
      console.error(err);
    } finally {
      // Set loading to false
      setLoading(false);
    }
  };

  /**
   * Handle create todo
   * @returns {Promise<void>}
   */
  const handleCreate = async () => {
    // Do nothing if title is empty
    if (!title.trim()) return;

    try {
      // Clear error
      setError("");

      // Create todo
      const response = await client.callTool({
        name: "todo_create",
        arguments: { title, description },
      });

      const newTodo = response.structuredContent;
      setTodos([...todos, newTodo]);
      setTitle("");
      setDescription("");
    } catch (err) {
      // Set error
      setError("Failed to create todo");
      console.error(err);
    }
  };

  /**
   * Handle delete todo
   * @param {string} id - todo id.
   */
  const handleDelete = async (id) => {
    try {
      // Clear error
      setError("");

      // Delete todo
      await client.callTool({
        name: "todo_delete",
        arguments: { id },
      });

      setTodos(todos.filter((t) => t.id !== id));
    } catch (err) {
      // Set error
      setError("Failed to delete todo");
      console.error(err);
    }
  };

  /**
   * Start editing todo
   * @param {*} todo - todo
   */
  const startEdit = (todo) => {
    setEditingId(todo.id);
    setEditTitle(todo.title);
    setEditDesc(todo.description || "");
  };

  /**
   * Handle update
   * @param {string} id - id of todo
   */
  const handleUpdate = async (id) => {
    try {
      // Clear error
      setError("");

      // Update todo
      const response = await client.callTool({
        name: "todo_update",
        arguments: {
          id,
          title: editTitle,
          description: editDesc,
        },
      });

      const updated = response.structuredContent;
      setTodos(todos.map((t) => (t.id === id ? updated : t)));
      setEditingId(null);
    } catch (err) {
      // Set error
      setError("Failed to update todo");
      console.error(err);
    }
  };

  /**
   * Toggle todo completion
   * @param {*} todo - todo
   */
  const toggleComplete = async (todo) => {
    try {
      // Clear error
      setError("");

      // Update todo
      const response = await client.callTool({
        name: "todo_update",
        arguments: {
          id: todo.id,
          completed: !todo.completed,
        },
      });

      const updated = response.structuredContent;
      setTodos(todos.map((t) => (t.id === todo.id ? updated : t)));
    } catch (err) {
      // Set error
      setError("Failed to toggle completion");
      console.error(err);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.maxWidth}>
        <div style={styles.card}>
          <h1 style={styles.title}>MCP Todo App</h1>
          <p style={styles.subtitle}>Model Context Protocol Demo</p>

          {error && (
            <div style={styles.error}>
              {error}
              <button onClick={loadTodos} style={styles.retryBtn}>
                <RefreshCw size={16} /> Retry
              </button>
            </div>
          )}

          <div style={styles.inputGroup}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Todo title..."
              style={styles.input}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)..."
              rows="2"
              style={{ ...styles.input, resize: "none" }}
            />
            <button onClick={handleCreate} style={styles.createBtn}>
              <Plus size={20} />
              Add Todo
            </button>
          </div>
        </div>

        {loading ? (
          <div style={styles.loading}>Loading...</div>
        ) : todos.length === 0 ? (
          <div style={styles.empty}>No todos yet. Create your first one!</div>
        ) : (
          <div style={styles.todoList}>
            {todos.map((todo) => (
              <div key={todo.id} style={styles.todoCard}>
                {editingId === todo.id ? (
                  <div style={styles.editForm}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      style={styles.editInput}
                    />
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows="2"
                      style={{ ...styles.editInput, resize: "none" }}
                    />
                    <div style={styles.editBtnGroup}>
                      <button onClick={() => handleUpdate(todo.id)} style={styles.saveBtn}>
                        <Check size={18} />
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} style={styles.cancelBtn}>
                        <X size={18} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={styles.todoContent}>
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleComplete(todo)}
                      style={styles.checkbox}
                    />
                    <div style={styles.todoText}>
                      <div
                        style={{
                          ...styles.todoTitle,
                          ...(todo.completed && styles.completed),
                        }}
                      >
                        {todo.title}
                      </div>
                      {todo.description && (
                        <p
                          style={{
                            ...styles.todoDesc,
                            ...(todo.completed && styles.completed),
                          }}
                        >
                          {todo.description}
                        </p>
                      )}
                    </div>
                    <div style={styles.btnGroup}>
                      <button onClick={() => startEdit(todo)} style={styles.editBtn}>
                        <Edit2 size={18} />
                      </button>
                      <button onClick={() => handleDelete(todo.id)} style={styles.deleteBtn}>
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #e0f2fe 0%, #e0e7ff 100%)",
    padding: "24px",
  },
  maxWidth: {
    maxWidth: "800px",
    margin: "0 auto",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
    padding: "32px",
    marginBottom: "24px",
  },
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: "8px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#6b7280",
    marginBottom: "24px",
  },
  error: {
    background: "#fee2e2",
    color: "#991b1b",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  retryBtn: {
    background: "#dc2626",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "6px 12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "14px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  input: {
    padding: "12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "16px",
    outline: "none",
  },
  createBtn: {
    width: "100%",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "8px",
    padding: "12px",
    fontSize: "16px",
    fontWeight: "500",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  loading: {
    background: "white",
    borderRadius: "12px",
    padding: "32px",
    textAlign: "center",
    color: "#6b7280",
  },
  empty: {
    background: "white",
    borderRadius: "12px",
    padding: "32px",
    textAlign: "center",
    color: "#9ca3af",
  },
  todoList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  todoCard: {
    background: "white",
    borderRadius: "12px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.07)",
    padding: "20px",
  },
  todoContent: {
    display: "flex",
    alignItems: "flex-start",
    gap: "16px",
  },
  checkbox: {
    width: "20px",
    height: "20px",
    marginTop: "4px",
    cursor: "pointer",
  },
  todoText: {
    flex: 1,
  },
  todoTitle: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: "4px",
  },
  todoDesc: {
    fontSize: "14px",
    color: "#6b7280",
  },
  completed: {
    textDecoration: "line-through",
    color: "#9ca3af",
  },
  btnGroup: {
    display: "flex",
    gap: "8px",
  },
  editBtn: {
    background: "none",
    border: "none",
    color: "#2563eb",
    padding: "8px",
    borderRadius: "8px",
    cursor: "pointer",
  },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "#dc2626",
    padding: "8px",
    borderRadius: "8px",
    cursor: "pointer",
  },
  editForm: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  editInput: {
    padding: "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "14px",
    outline: "none",
  },
  editBtnGroup: {
    display: "flex",
    gap: "8px",
  },
  saveBtn: {
    flex: 1,
    background: "#16a34a",
    color: "white",
    border: "none",
    borderRadius: "8px",
    padding: "8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
  },
  cancelBtn: {
    flex: 1,
    background: "#9ca3af",
    color: "white",
    border: "none",
    borderRadius: "8px",
    padding: "8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
  },
};
