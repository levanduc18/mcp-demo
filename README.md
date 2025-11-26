# MCP Todo Demo

## Structure

- mcp-server: Node server with 4 tools: todo_create, todo_list, todo_update, todo_delete and in-memory db. Expose with the StreamableHttpServerTransport. The todo_list will return an UI resource (@mcp-ui/server) for using in react client.

- mcp-client: React UI with the UI allow the user to create new todo, see the list of todos, update and delete the specific todo. Using the UIResourceRenderer (@mcp-ui/client) for render the ui resource from server. When user interacts with UI, calling the corresponding tools to update db and refresh ui.


## Note
- 2 Projects use the StreamableHttp transport, 
- Each project has its own README.md file. Please read this file to install and get started.