/**
 * Return MCP response
 * @param {*} data
 * @returns
 */
export const wrap = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
});
