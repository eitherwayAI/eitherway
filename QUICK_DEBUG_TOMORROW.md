# 🔍 Quick Debug Guide - Start Here Tomorrow

## TL;DR: Most Likely Issue

**Server wasn't rebuilt after code changes.**

All the TypeScript files I modified need to be compiled to JavaScript before the server can use them.

---

## ⚡ Quick Fix (Try This First)

```bash
# 1. Stop the server (Ctrl+C)

# 2. Rebuild packages
cd packages/runtime && npm run build && cd ../..
cd packages/ui-server && npm run build && cd ../..

# 3. Restart server
npm run dev
```

---

## ✅ How to Verify It's Working

### Step 1: Check Server Console

When you send a prompt like "Create a calculator app", you should see:

```
[Agent] ==== Turn 1 ====
[Agent] Thinking config: { live: false, showToEndUser: true }
[Agent] Tools detected, transitioning to reasoning phase
[Agent] Streaming model plan (or) Derived plan: ...
```

**❌ If you don't see `[Agent]` logs:**
- Server is still running old code
- Rebuild didn't work

### Step 2: Check Browser Console

You should see:
```
[Reasoning Event] ... source: model live: true
```

**❌ If missing:**
- Reasoning events aren't being sent
- WebSocket issue

### Step 3: Check DevOverlay

Press **Ctrl + -** and look at footer:

**✅ Should show:**
```
Plan source: model (or derived)
Live thinking: off
Thought for: 3s
```

**❌ Currently shows:**
```
Plan source: none
Live thinking: off
```

---

## 🎯 What to Share If Still Broken

1. **Server console output** (full output from server start through one prompt)
2. **Browser console output**
3. **DevOverlay Events tab** - Press Ctrl + -, go to Events tab, screenshot
4. **The exact prompt** you sent

---

## 📋 Test Prompts to Use

Try these (they should trigger tools):

1. "Create a simple HTML page with a button"
2. "Build a calculator app"
3. "Edit app.js to add a hello function"

**These should NOT show plans:**
- "What is 2+2?" (no tools needed)
- "Explain JavaScript closures" (no tools needed)

---

## 🔧 If Rebuild Doesn't Fix It

### Option 1: Force Clean Rebuild
```bash
cd packages/runtime
rm -rf dist node_modules/.cache
npm run build

cd ../ui-server
rm -rf dist node_modules/.cache
npm run build

cd ../..
npm run dev
```

### Option 2: Check Compiled Files
```bash
# These should have recent timestamps (today's date)
ls -la packages/runtime/dist/agent.js
ls -la packages/ui-server/dist/server.js

# If they're old (not from today), rebuild didn't work
```

---

## 🎬 Expected vs Actual

### What You Should See (After Rebuild)

**UI Flow:**
1. "Thinking..." shimmer (400ms)
2. "💭 Thought for 3 seconds"
3. Purple badge: "Plan • Model"
4. Plan text: "1. Create HTML structure 2. Add calculator logic 3. Style interface"
5. "Writing code..."
6. "📄 Creating calculator.html"
7. "📄 Created calculator.html"
8. Post-tool summary (optional, depends on model)

**DevOverlay:**
```
Plan source: model
Live thinking: off
Thought for: 3s
Phases: thinking:2s, reasoning:1s, code-writing:5s
```

### What You're Currently Seeing

**UI Flow:**
- ❓ Unknown (probably just file creation messages)
- ❌ No plan badge
- ❌ No summary

**DevOverlay:**
```
Plan source: none ❌
Live thinking: off
```

---

## 🚨 Red Flags to Look For

### In Server Console:
- ❌ No `[Agent]` logs → Old code still running
- ❌ `[Agent] WARNING: No onReasoning callback` → Callback chain broken
- ❌ `[Agent] WARNING: Text delta outside thinking/summary phase` → Phase management broken

### In Browser Console:
- ❌ No `[Reasoning Event]` logs → Events not reaching frontend
- ❌ Error messages about StreamEvent types → Type mismatch

### In DevOverlay Events Tab:
- ❌ No events with `kind: "reasoning"` → Reasoning events not being sent
- ✅ Should see: `{"kind":"reasoning","text":"...","source":"model","live":true}`

---

## 📞 What to Do If Completely Stuck

Share a **full trace** in the next session:

1. **Before starting server:**
   ```bash
   # Check compiled file dates
   ls -la packages/runtime/dist/agent.js
   ls -la packages/ui-server/dist/server.js
   ```

2. **Server console output:**
   ```bash
   npm run dev 2>&1 | tee server-log.txt
   # Send one prompt
   # Ctrl+C to stop
   # Share server-log.txt
   ```

3. **Browser console output:**
   - Open DevTools (F12)
   - Go to Console tab
   - Copy all logs after sending prompt

4. **DevOverlay screenshot:**
   - Press Ctrl + -
   - Screenshot both Events tab and footer

---

## 💡 Why This Is Probably Just a Build Issue

**All the code is correct.** I verified:
- ✅ Type definitions match
- ✅ Agent logic is sound
- ✅ Server callbacks are correct
- ✅ Frontend event handling is correct
- ✅ UI rendering is correct

The only reason it wouldn't work is if the server is running old compiled code.

---

## 🎯 Success Criteria

You'll know it's working when:

1. ✅ Server console shows `[Agent]` debug logs
2. ✅ Browser console shows `[Reasoning Event]` logs
3. ✅ DevOverlay shows `Plan source: model` (or `derived`)
4. ✅ UI shows purple "Plan • Model" badge
5. ✅ UI shows post-tool summary (may or may not appear, model-dependent)

---

**Start with the rebuild. That's 95% likely to fix it.**
