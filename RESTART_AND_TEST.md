# How to Test the Fix

## Step 1: Stop the Server

In the terminal running `npm run server`, press `Ctrl+C` to stop it.

## Step 2: Restart the Server

```bash
npm run server
```

Wait for the message: `🚀 EitherWay UI Server running on http://localhost:3001`

## Step 3: Run the Live WebSocket Test

In a separate terminal:

```bash
npx tsx test-live-websocket.ts
```

## What to Look For

### In the Server Terminal:

You should see detailed streaming logs like:
```
[STREAM] content_block_start: text
[STREAM] content_block_start: server_tool_use
[STREAM] 🔍 server_tool_use detected: srvtoolu_xxxxx
[STREAM] Pushing server_tool_use: web_search (srvtoolu_xxxxx)
[STREAM] content_block_start: web_search_tool_result
[STREAM] ✅ web_search_tool_result detected for: srvtoolu_xxxxx
[STREAM] content_block_start: text
[STREAM] Pushing text block (xxx chars)

[STREAM] Response complete. Content blocks:
  [0] text
  [1] server_tool_use (srvtoolu_xxxxx)
  [2] web_search_tool_result -> srvtoolu_xxxxx
  [3] text
  [4] tool_use (toolu_xxxxx)
```

### What We're Looking For:

1. **server_tool_use** block is detected ✅
2. **web_search_tool_result** block is detected immediately after ✅
3. Both blocks are in the final content array ✅

### If the Error Still Occurs:

The logs will show us EXACTLY which block is missing. For example:

```
[STREAM] Response complete. Content blocks:
  [0] text
  [1] server_tool_use (srvtoolu_xxxxx)
  [2] text  ← Missing web_search_tool_result here!
  [3] tool_use (toolu_xxxxx)
```

This would tell us that `web_search_tool_result` is NOT being sent by Claude's API or NOT being captured in our streaming handler.

## Step 4: Test Through the Frontend

If the test passes, try the frontend again:

1. Go to `http://localhost:5173`
2. Enter a prompt that uses web search:
   - "Create a modern portfolio website with 2025 design trends"
   - "Build a todo app researching current UI best practices"

## Expected Outcome

With the logging in place, we'll see one of three scenarios:

### Scenario A: Works Perfectly ✅
- Logs show both `server_tool_use` and `web_search_tool_result`
- No error occurs
- **This means the fix worked!**

### Scenario B: Missing Block 🔍
- Logs show `server_tool_use` but NO `web_search_tool_result`
- Error still occurs
- **This means Claude's API isn't sending the result block - possible API bug**

### Scenario C: Validation Catches It 🛡️
- Validation error thrown BEFORE Claude API error
- Detailed error message shows which block is missing
- **This means our defensive code is working**

---

**Next:** Restart the server and run the test, then share the server logs with me.
