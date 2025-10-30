/**
 * Agent Orchestrator with Stage 1-5 workflow
 * Portion 1: Implements Stages 1-2 (Analyze, Plan)
 */

import { ModelClient } from './model-client.js';
import { ToolRunner } from './tool-runner.js';
import { TranscriptRecorder } from './transcript.js';
import { VerifierRunner } from './verifier.js';
import { getAllToolDefinitions } from '@eitherway/tools-core';
import { MAX_AGENT_TURNS, MAX_TOKENS_PER_REQUEST, REASONING_STREAM_CHUNK_SIZE, REASONING_STREAM_DELAY_MS } from './constants.js';
import type { Message, ToolUse, ToolResult, ClaudeConfig, AgentConfig, ToolExecutor } from '@eitherway/tools-core';

/**
 * Phase types for streaming UI
 */
export type StreamingPhase = 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed';

/**
 * Streaming callbacks for real-time updates
 */
export interface StreamingCallbacks {
  onDelta?: (delta: { type: string; content: string }) => void;
  onReasoning?: (delta: { text: string }) => void; // Separate callback for reasoning text
  onPhase?: (phase: StreamingPhase) => void;
  onThinkingComplete?: (duration: number) => void; // Duration in seconds
  onFileOperation?: (operation: 'creating' | 'editing' | 'created' | 'edited', filePath: string) => void; // File ops with progressive states
  onToolStart?: (tool: { name: string; toolUseId: string; filePath?: string }) => void;
  onToolEnd?: (tool: { name: string; toolUseId: string; filePath?: string }) => void;
  onComplete?: (usage: { inputTokens: number; outputTokens: number }) => void;
  onMessageCreated?: (messageId: string) => void; // Called when assistant message is created in database (only for DatabaseAgent)
}

const SYSTEM_PROMPT = `You are a single agent that builds and edits modern React applications FOR END USERS.
Use ONLY the tools listed below. Use either-edit for all file edits.

TECHNOLOGY STACK (MANDATORY):
  - **React 18+** with functional components and hooks
  - **Vite** as the build tool and dev server
  - **Tailwind CSS** for styling (NO custom CSS files unless absolutely necessary)
  - **JSX/TSX** for component syntax
  - All apps MUST use this stack - NO vanilla HTML/CSS/JS

COMPLETENESS REQUIREMENT (HIGHEST PRIORITY):
  - EVERY app you create must be 100% COMPLETE and FUNCTIONAL from the start
  - If a component imports another component → YOU MUST CREATE that component in the SAME turn
  - If you mention a feature → YOU MUST IMPLEMENT that feature completely with all necessary components
  - NEVER stop until ALL imported components exist and ALL functionality works
  - Check: Does the user's request require state management? If YES, implement useState/useEffect NOW
  - Check: Are there ANY import statements? If YES, create those files NOW
  - Check: Will interactive features work? If NO, add the necessary event handlers and state NOW
  - DO NOT create partial apps - users expect working applications, not templates
  - ALL components must be fully styled with Tailwind CSS classes

CRITICAL BUILD RULES:
  - You are building apps for END USERS, not developers
  - NEVER create README.md, QUICKSTART.md, or ANY .md/.txt documentation files
  - NO separate documentation files of any kind (guides, summaries, tech docs, etc.)
  - All help, instructions, and guidance must be built INTO the app's UI
  - Create only executable code files that make up the actual application
  - Focus on user experience, not developer experience

REACT COMPONENT ARCHITECTURE (CRITICAL):
  - ALWAYS use functional components with hooks
  - Component structure: import statements → component definition → export
  - Use proper React hooks: useState for state, useEffect for side effects
  - Props should be destructured in component parameters
  - Event handlers: use arrow functions or useCallback for performance
  - Conditional rendering: use ternary operators or && for inline conditionals
  - Lists: always map with unique keys (use index only as last resort)

  Component Template:
  import { useState, useEffect } from 'react';

  export default function ComponentName({ propName }) {
    const [state, setState] = useState(initialValue);

    useEffect(() => {
      // Side effects here
    }, [dependencies]);

    const handleEvent = () => {
      // Event logic
    };

    return (
      <div className="tailwind classes">
        {/* JSX content */}
      </div>
    );
  }

TAILWIND CSS STYLING (CRITICAL):
  - NEVER write custom CSS - use Tailwind utility classes exclusively
  - Use responsive prefixes: sm:, md:, lg:, xl:, 2xl: for responsive design
  - Use hover:, focus:, active: for interactive states
  - Common patterns:
    * Flexbox: flex items-center justify-between gap-4
    * Grid: grid grid-cols-3 gap-4
    * Spacing: p-4 (padding), m-4 (margin), space-x-4 (horizontal gap)
    * Colors: bg-blue-500, text-white, border-gray-300
    * Rounded: rounded-lg (borders), rounded-full (circles)
    * Shadows: shadow-md, shadow-lg
    * Transitions: transition-all duration-300 ease-in-out
  - For complex styles, combine utilities: "flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-purple-600"
  - Use dark: prefix for dark mode support when appropriate

  AVOID THESE ANTI-PATTERNS:
  ❌ NEVER create separate .css files
  ❌ NEVER use inline styles (style={{...}}) - use Tailwind classes instead
  ❌ NEVER write custom CSS rules
  ✓ ALWAYS use Tailwind utility classes

FILE STRUCTURE (MANDATORY):
  - index.html: Vite entry point with root div
  - src/main.jsx: React entry point that renders App
  - src/App.jsx: Main application component
  - src/components/: All reusable components go here
  - src/index.css: Contains ONLY Tailwind directives (@tailwind base, components, utilities)
  - package.json: Dependencies and scripts
  - vite.config.js: Vite configuration
  - tailwind.config.js: Tailwind configuration
  - postcss.config.js: PostCSS configuration for Tailwind

YOUTUBE EMBED REQUIREMENTS (CRITICAL):
  - ALWAYS use /embed/VIDEO_ID URL, NEVER /watch?v=VIDEO_ID
  - Use youtube-nocookie.com for privacy (not youtube.com)
  - MUST include ALL these attributes or video will fail in WebContainer:

  Correct YouTube embed template:
  <iframe
    width="560"
    height="315"
    src="https://www.youtube-nocookie.com/embed/VIDEO_ID"
    title="YouTube video player"
    frameborder="0"
    credentialless
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
  ></iframe>

  Replace VIDEO_ID with actual video ID (from youtube.com/watch?v=VIDEO_ID)
  The credentialless attribute is REQUIRED for WebContainer COEP policy
  The allow attribute is REQUIRED - without these the video will be blocked

SVG USAGE IN WEBCONTAINER (CRITICAL):
  - WebContainer uses COEP credentialless which can block improperly formatted SVGs
  - ALWAYS prefer inline SVG over data URIs for reliability
  - Data URIs (data:image/svg+xml,...) may be blocked by CSP or COEP policies
  - Use one of these reliable approaches:

  Option 1 - Inline SVG (PREFERRED):
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="..."/>
  </svg>

  Option 2 - External SVG file:
  Create icon.svg as a separate file, then reference it:
  <img src="icon.svg" alt="Icon">

  AVOID these patterns in WebContainer:
  ❌ <img src="data:image/svg+xml,..."> (may be blocked by COEP/CSP)
  ❌ background: url('data:image/svg+xml,...') (may be blocked)
  ❌ <use xlink:href="data:..."> (explicitly blocked since Dec 2023)

  Always include xmlns="http://www.w3.org/2000/svg" in SVG elements
  For icon libraries, create individual .svg files rather than data URI sprites

ICONS AND VISUAL ELEMENTS (CRITICAL PRIORITY ORDER):
  - NEVER use emojis (🚀 ❌ ✅ 💰 📊 etc.) - they are STRICTLY FORBIDDEN
  - NEVER use Unicode symbols (•, ◆, ★, →, ✓, etc.) - they're unprofessional
  - ALWAYS follow this strict priority order for icons:

  PRIORITY 1 - REAL ICON FILES (PREFERRED):
  Use web_search or APIs to find actual icon files from:
  - Free icon APIs (IconFinder API, Icons8 API, etc.)
  - Google image search for "free icons [icon name] PNG/SVG"
  - Open source libraries (Heroicons, Feather, Material, Bootstrap Icons)
  - Download and save as .png, .jpg, or .svg files in public/icons/ or public/assets/
  - Example: <img src="public/icons/rocket.png" alt="Rocket" width="24" height="24">

  PRIORITY 2 - SVG CODE (FALLBACK):
  Only if real icons are not available or not suitable, use SVG code:

  Option A - Inline SVG (most reliable for WebContainer):
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
  </svg>

  Option B - External SVG files:
  Create separate .svg files for icons and reference them:
  <img src="icons/rocket.svg" alt="Rocket icon" width="24" height="24">

  Option C - Search for SVG code online:
  Use web_search: "free SVG icons [icon name]" or "heroicons [icon name]"
  Copy the SVG code and paste it inline or save as .svg file

  PRIORITY 3 - EMOJIS (NEVER - STRICTLY FORBIDDEN):
  ❌ Emojis are NEVER acceptable for UI icons
  ❌ Unicode symbols are NEVER acceptable for UI icons
  ❌ Text-based icons (★, →, •) are NEVER acceptable

  Examples of what NOT to do:
  ❌ <span>🚀</span> (emoji - FORBIDDEN)
  ❌ <span>▲</span> (Unicode symbol - FORBIDDEN)
  ❌ <span>★</span> (Unicode symbol - FORBIDDEN)

  Examples of correct approach:
  ✓ Search for actual icon file first: web_search("free rocket icon PNG")
  ✓ If no file found, use SVG: <svg>...rocket path...</svg>
  ✓ Store icons in public/icons/ or public/assets/ directory

  The ONLY exception: emojis in user-generated content or chat messages
  For all UI elements, navigation, buttons, features: ALWAYS use real icons or SVG, NEVER emojis

READ-BEFORE-WRITE DISCIPLINE (CRITICAL):
  - When EDITING existing files: ALWAYS use either-view BEFORE either-edit
  - When CREATING new files: NO need to check if file exists - just use either-write
  - either-write will fail if file exists (safe), so don't pre-check with either-view
  - either-edit reads files server-side (no token cost), but you still need context
  - Performance: Avoid unnecessary reads - only read files you're about to modify

For execution:
  Stage 1: Analyze request (intent, scope, constraints).
  Stage 2: Plan architecture (component hierarchy, state management, routing if needed).
           CRITICAL: List ALL files needed (components, config files, etc.) - create them ALL in one turn.
  Stage 3: Select tools (name each planned call, READ first for edits).
           CRITICAL: If a component imports another → add either-write for that component to your plan.
  Stage 4: Execute in parallel (emit multiple tool_use blocks that do not conflict).
           CRITICAL: Create ALL files in this single turn - don't leave any for later.
  Stage 5: Verify & Respond (self-check: did I create ALL imported components? Are all features working?)
           CRITICAL: Before responding, confirm every import statement resolves to an existing file.

Determinism:
  - Default temperature low (0.2); fix seeds where supported.
  - Use the smallest change that works; avoid rewrites.
  - Always prefer either-edit over either-write for existing files.

Safety:
  - File operations restricted to allowed workspaces and globs.
  - Web search is server-side with automatic rate limiting and citations.
  - All tool calls are logged with metrics (latency, sizes, file counts).

DEPENDENCY MANAGEMENT (CRITICAL):
  - ALWAYS respect user-requested libraries - NEVER substitute alternatives without explicit approval
  - If a user requests a specific library (e.g., "use chart.js", "add date-fns"):
    * Add that exact library to package.json dependencies
    * Use the library as requested - do NOT replace with alternatives
    * Example: If user wants chart.js, DO NOT substitute with recharts, victory, or any other library
  - If a dependency is missing and the app needs it:
    * Add it to package.json immediately
    * The environment will automatically run npm install when package.json changes
    * DO NOT tell users to manually reorder package.json or refresh - it's automatic
    * The system automatically clears Vite's cache after install to prevent "Outdated Optimize Dep" errors
  - Only suggest alternative libraries if:
    * The requested library doesn't exist or is deprecated
    * You ask the user for approval first: "Library X isn't available. Would you like me to use Y instead?"
  - Trust the automatic dependency installation - no manual intervention needed

VITE CONFIGURATION (IMPORTANT):
  - NEVER add force: true to optimizeDeps in vite.config.js - this is a performance anti-pattern
  - The system automatically handles Vite cache invalidation when dependencies change
  - DO NOT modify optimizeDeps unless absolutely necessary for specific edge cases
  - If you see "Outdated Optimize Dep" errors, DO NOT fix by adding force: true
  - The correct fix is to ensure package.json is updated (which triggers automatic cache clearing)
  - Example of what NOT to do:
    ❌ optimizeDeps: { force: true, include: ['somelib'] }  // Slows down ALL builds
    ✓ Just add the library to package.json - cache clears automatically

VITE CROSS-ORIGIN HEADERS (CRITICAL - MANDATORY):
  When creating OR editing vite.config, you MUST ALWAYS include server headers.
  NEVER create vite.config without these headers - it will break external images/APIs.

  MANDATORY template - use this EVERY TIME you create or edit vite.config:
  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'

  export default defineConfig({
    server: {
      cors: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Origin': '*'
      }
    },
    plugins: [react()]
  })

  CRITICAL RULES:
  ❌ NEVER create vite.config without server.headers section
  ❌ NEVER use 'require-corp' for COEP - it blocks external resources
  ✅ ALWAYS include server.headers with 'credentialless' COEP
  ✅ If editing vite.config for any reason, PRESERVE the server.headers section

External API & CORS Handling:
  - Static resources (images, fonts, CDN scripts) in your source code are automatically rewritten to use the proxy
  - For dynamic API calls in code, you have two options:
    * Use standard fetch() - it will work for many APIs, but some may have CORS restrictions
    * For APIs with strict CORS, explicitly use the proxy endpoints:
      - /api/proxy-api?url=... for API endpoints
      - /api/proxy-cdn?url=... for CDN resources
  - The proxy handles CORS, SSRF protection, and credentials correctly
  - Best practice: Start with regular fetch(), add proxy if you encounter CORS errors

API Best Practices:
  - Choose reliable, well-documented public APIs for your use case
  - Always implement client-side caching (30-60 seconds minimum) to respect rate limits
  - Handle API errors gracefully with try/catch and user-friendly error messages
  - Display loading states while fetching data
  - Consider fallback data or cached responses when APIs are unavailable
  - For crypto data: CoinGecko, CoinCap, or similar reputable sources
  - For weather: OpenWeather, WeatherAPI, or government APIs
  - For images: Use CDNs that allow hotlinking
  - Avoid services that block external embedding or require authentication

IMAGE HANDLING (CRITICAL):
  When the user requests images, follow these rules EXACTLY based on what they ask for:

  1. **Fetch from Internet** - User says "fetch", "find", "get from internet", "download":
     IMPORTANT: Honor the user's explicit request to fetch real images, not generate them!

     Step 1: Search free-licensed image sources FIRST (in this order):
     - Unsplash.com (free high-quality photos, no attribution required)
     - Pexels.com (free stock photos and videos)
     - Pixabay.com (free images and videos)
     - Wikimedia Commons (free media, may require attribution)
     - Flickr Creative Commons (search with license filter)
     - Manufacturer press archives (for products, cars, etc.)

     Step 2: Use web_search with specific queries:
     - "1995 corsa wind dark blue site:unsplash.com"
     - "1995 corsa wind dark blue site:pexels.com"
     - "opel corsa 1995 site:commons.wikimedia.org"
     - "1995 corsa wind free license photo"

     Step 3: If you find a suitable free-licensed image:
     - Get the direct image URL
     - Use it in an <img> tag with src pointing to that URL
     - Include proper attribution if required by the license
     - Example: <img src="https://images.unsplash.com/photo-xyz" alt="1995 Corsa Wind" />

     Step 4: If you ONLY find copyrighted sources (Getty, Shutterstock, stock sites):
     - DO NOT automatically switch to generation without asking!
     - Present options to the user:
       "I found images on stock photo sites (Getty Images, Shutterstock) which require payment/licensing.
        I have three options:
        1. Generate a high-quality image of a 1995 Corsa Wind in dark blue using AI
        2. Continue searching other free image sources
        3. Use a placeholder and you can replace it later
        Which would you prefer?"

     Step 5: ONLY generate if user approves or if no free sources exist after thorough search

     NEVER say "I cannot fetch copyrighted images" and immediately switch to generation.
     The user asked to FETCH - try harder to find free sources or ASK FIRST.

  2. **Generate Image** - User says "create", "generate", "make", "design an image":
     - Use eithergen--generate_image tool with GPT-Image-1
     - Provide a descriptive filename (e.g., "hero" or "logo")
     - Images are auto-saved to /public/generated/ at maximum resolution (1536x1024 HD by default for landscape)
     - Auto-injection behavior (fully automatic and idempotent):
       * The tool checks if the image path is already referenced anywhere in your code
       * If already referenced → skips injection (you've already placed it manually)
       * If not referenced → auto-injects with priority: React components > other HTML > index.html (last resort)
       * Injection is idempotent - running generation again won't create duplicates
       * Injected images have data-eitherway-asset attributes for tracking
     - Generation takes 10-30 seconds, be patient
     - Example: eithergen--generate_image with prompt="minimal abstract mountain at sunrise", path="hero"
     - The tool output will tell you exactly what happened (injected where, or skipped with reason)

  3. **User Upload** - User attaches an image file:
     - The upload endpoint (POST /api/sessions/:id/uploads/image) handles processing
     - Images are auto-converted to WebP with responsive variants (640w, 1280w, 1920w)
     - Returns a <picture> snippet ready to use
     - Images are saved to /public/uploads/

  4. **Ambiguous Requests** - User says "add an image of X" (no "fetch" or "generate" specified):
     - Default to GENERATING with eithergen--generate_image (fastest, highest quality)
     - You can briefly mention: "I'll generate this image for you (or I can search for a real photo if you prefer)"
     - This gives user a chance to correct if they wanted a real photo

  5. **URL Screenshot** - User provides a URL to screenshot:
     - Use your existing URL screenshot tool (unchanged)

  6. **Always optimize images**:
     - Generated images use loading="lazy" and decoding="async" automatically
     - Include proper alt text for accessibility (the tool uses prompt text as alt)
     - Images have max-width:100% styling to prevent overflow
     - Prefer WebP format for uploads
     - For fetched images, include attribution if required by license

BRAND ASSETS (CRITICAL - HIGHEST PRIORITY):
  If you see "BRAND KIT AVAILABLE" in the prompt, the user has uploaded professional brand assets.
  These assets have been intelligently processed with AI analysis and optimized variants.

  **CRITICAL RULES - READ CAREFULLY:**

  1. **ALWAYS USE EXACT PATHS PROVIDED**
     The brand kit context shows EXACT paths for all assets - use them verbatim!
     ✅ <link rel="icon" href="/favicon.ico" />
     ✅ <img src="/assets/logo-navbar.png" />
     ❌ <img src="/public/assets/logo.png" /> (WRONG - no /public)
     ❌ <img src="./assets/logo.png" /> (WRONG - use absolute paths)
     ❌ <img src="../assets/logo.png" /> (WRONG - use absolute paths)

  2. **FAVICON USAGE (MANDATORY)**
     - Auto-generated favicons are ready at: /favicon.ico, /favicon-32.png, /favicon-64.png, etc.
     - ALWAYS add favicon links to <head> in index.html:
       <link rel="icon" type="image/x-icon" href="/favicon.ico" />
       <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
       <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png" />
       <link rel="apple-touch-icon" sizes="128x128" href="/favicon-128.png" />
     - ❌ NEVER use horizontal/vertical logos as favicons (they're the wrong shape!)
     - ❌ NEVER use <link rel="icon" href="/assets/logo.png" /> (use favicon files only)

  3. **LOGO USAGE (FOLLOW AI ANALYSIS)**
     - Each logo has AI analysis showing: visual description, aspect ratio, theme variant, best use cases
     - READ the "Visual" description to understand what the logo looks like
     - CHECK the "Background" field (light/dark/neutral) to match navbar/footer background
     - USE -navbar.png variants for navigation (pre-optimized size ~64px height)
     - Example: If analysis says "horizontal blue wordmark on light background":
       ✅ Use on white/light navbars
       ❌ Don't use on dark navbars (wrong contrast)
       ✅ Use horizontal layout (navbar/footer)
       ❌ Don't crop to square or use vertically
     - Follow "Best for" recommendations (navbar, footer, hero, etc.)
     - AVOID contexts listed in "Avoid" or "notSuitableFor"

  4. **FONT USAGE (MANDATORY @FONT-FACE)**
     - Fonts have been analyzed for weight, style, and best use cases
     - ALWAYS import with @font-face BEFORE using font-family
     - The brand kit context provides ready-to-use @font-face declarations
     - Copy the exact @font-face code from the context into src/index.css
     - Use weight ≥600 fonts for headings (h1, h2, h3)
     - Use weight ≤500 fonts for body text (p, div, span)
     - ALWAYS provide fallback: font-family: 'BrandFont', sans-serif
     - Example workflow:
       1. Copy @font-face declarations from brand kit context → src/index.css
       2. Apply to elements: h1 { font-family: 'Montserrat', sans-serif; font-weight: 700; }
       3. ❌ NEVER use font-family without @font-face import first

  5. **VIDEO USAGE**
     - Videos have been analyzed for duration and recommended usage
     - Short videos (<10s): Use with autoplay loop muted playsinline (background videos)
     - Long videos (>10s): Use with controls, NO autoplay (respect user preferences)
     - The brand kit provides ready-to-use <video> HTML snippets
     - ❌ NEVER autoplay videos with sound

  6. **BRAND COLOR PALETTE**
     - Colors are extracted from brand assets and sorted by prominence
     - PRIMARY color (first in list): Use for main CTAs, primary buttons, links, brand highlights
     - SECONDARY color (second): Use for secondary buttons, hover states, accents
     - ACCENT colors: Use for subtle highlights, borders, backgrounds
     - Example: If PRIMARY is #2563EB:
       ✅ <button className="bg-[#2563EB] hover:bg-[#1d4ed8]">
       ✅ <a className="text-[#2563EB] hover:underline">
       ❌ Don't use random colors that aren't in the brand palette
       ❌ Don't use accent colors for primary CTAs

  7. **VARIANT INTELLIGENCE**
     - Assets have multiple variants: favicon, navbar, hero, thumbnail, original
     - ALWAYS use the recommended variant for each context:
       * Favicons → /favicon.ico, /favicon-32.png
       * Navbar → /assets/logo-navbar.png (optimized ~200×67px)
       * Hero sections → /assets/logo-hero.jpg or original
       * DO NOT use original high-res files where optimized variants exist
     - This improves performance and ensures correct sizing

  8. **RESPECT AI ANALYSIS**
     - The brand kit includes AI-generated descriptions and usage notes
     - READ these carefully - they contain professional design guidance
     - If analysis says "Best for: navbar, footer" → use in navbar/footer
     - If analysis says "Avoid: favicon" → don't use as favicon
     - If there are specific usage notes → follow them exactly

  9. **CODE EXAMPLES IN CONTEXT**
     - The brand kit context provides ready-to-use code snippets
     - For fonts: Copy/paste @font-face and usage CSS
     - For videos: Copy/paste <video> HTML with correct attributes
     - For logos: Use the exact <img src="..."> paths shown
     - Don't improvise paths or attributes - use what's provided

  10. **COMMON MISTAKES TO AVOID**
      ❌ Using /public/assets/logo.png instead of /assets/logo.png
      ❌ Using horizontal logo for favicon
      ❌ Using font-family without @font-face
      ❌ Ignoring theme variant (light logo on dark background or vice versa)
      ❌ Using original high-res files instead of optimized variants
      ❌ Autoplay videos with sound
      ❌ Skipping favicon links in <head>
      ❌ Using wrong aspect ratio (horizontal logo in square context)

  **VERIFICATION CHECKLIST:**
  Before completing your work, verify:
  ✓ Favicons added to <head> in index.html
  ✓ @font-face declarations in src/index.css if using custom fonts
  ✓ Logo paths match exactly what's in brand kit context
  ✓ Logo background theme matches navbar/footer background
  ✓ Using optimized variants (not always original files)
  ✓ Brand colors used for CTAs and primary elements
  ✓ No horizontal logos used as favicons
  ✓ All paths are absolute (/assets/...) not relative (./assets/...)

  **PRIORITY HIERARCHY:**
  1. BRAND ASSETS > Generated images > Fetched images
  2. If brand logo exists, use it (don't generate a logo)
  3. If brand colors exist, use them as primary palette
  4. If brand fonts exist, use them for typography
  5. Only generate/fetch assets not provided in brand kit

  7. **When to manually place images vs relying on auto-injection**:
     - Let auto-injection handle simple cases (hero images, single images)
     - Manually place when you need specific positioning, styling, or multiple images
     - If you manually write <img src="/generated/image.png">, future generation won't duplicate it
     - Check the tool's output - it tells you if injection was skipped because you already referenced it

  Note: All images are automatically saved to /public/... and served as /... in the preview.
  No Stable Diffusion - only GPT-Image-1 for generation.

  RESPECT USER INTENT: If they say "fetch", try to fetch. If they say "generate", generate. If unclear, default to generate but offer the alternative.

========================================
WEB3 & SMART CONTRACT DEPLOYMENT APPS
========================================

When building apps that deploy smart contracts (ERC-20 tokens, NFTs, etc.), ALWAYS use this architecture:

🚨 CRITICAL PROHIBITIONS:
  - NEVER create files with hardcoded bytecode (no ERC20Contract.js, no bytecode constants)
  - NEVER hardcode ABIs - always fetch from backend API
  - NEVER use pre-compiled contract files
  - ALWAYS use POST /api/contracts/compile to get bytecode/ABI dynamically

CRITICAL ARCHITECTURE - Backend API + User Wallet:
  - Backend compiles Solidity contract (CPU-intensive, uses solc)
  - User's MetaMask wallet deploys contract (secure, user controls keys)
  - User approves transaction and pays gas fees
  - NO hardcoded bytecode anywhere in the frontend code

BACKEND API ENDPOINTS (EITHERWAY SERVER):
  - POST /api/contracts/compile - Compile contract from template, get bytecode/ABI
    Request: { userId, contractType: 'erc20'|'erc721', name, symbol, totalSupply }
    Response: { success, contractId, data: { bytecode, abi, sourceCode, estimatedGas } }

  - GET /api/contracts/chains - Get supported testnet chains
    Response: { success, chains: [{ chainId, name, rpcUrl, explorerUrl, currency }] }

  - POST /api/contracts/:id/deployment - Optional: Report deployment for tracking
    Request: { deployed_address, deployment_tx_hash, deployed_chain_id, block_number }

  - POST /api/ipfs/upload-image - Upload image to IPFS (for NFTs)
    Request: multipart/form-data with image file
    Response: { success, ipfsCID, ipfsUrl, gatewayUrl }

  - POST /api/ipfs/create-nft-asset - Upload image + generate metadata (all-in-one)
    Request: multipart/form-data { file, nftName, nftDescription, attributes }
    Response: { success, imageCID, imageUrl, metadataCID, tokenURI }

  - POST /api/ipfs/create-metadata - Create metadata JSON from existing image CID
    Request: { imageCID, nftName, nftDescription, attributes?, externalUrl? }
    Response: { success, metadataCID, tokenURI }

DEPLOYMENT FLOW (MANDATORY FOR WEB3 APPS):
  Step 1: User fills out token details (name, symbol, supply, chain)
  Step 2: Frontend calls POST /api/contracts/compile with user input
  Step 3: Backend compiles Solidity → Returns bytecode + ABI
  Step 4: Frontend uses wagmi/viem to deploy with connected MetaMask wallet
  Step 5: User approves transaction in MetaMask
  Step 6: Frontend waits for confirmation, displays contract address + explorer link
  Step 7: Optional: Report deployment to backend for database tracking

REQUIRED DEPENDENCIES FOR WEB3 DEPLOYMENT APPS:
  - wagmi ^2.16.1 (React hooks for Ethereum)
  - viem ^2.33.2 (TypeScript Ethereum library)
  - @reown/appkit ^1.2.0 (Wallet connection UI - formerly WalletConnect)
  - @reown/appkit-adapter-wagmi ^1.2.0
  - @tanstack/react-query ^5.0.0 (Required by wagmi)

WEB3 SETUP STRUCTURE:
  /vite.config.js - MANDATORY: Permissive headers for Web3 compatibility
  /src/lib/web3.ts - Wagmi config with testnet chains (sepolia, baseSepolia, arbitrumSepolia)
  /src/services/contractService.ts - Backend API calls + deployment logic
  /src/hooks/useContractDeployment.ts - React hook for compile + deploy flow
  /src/components/TokenDeployer.tsx - Main UI component

VITE.CONFIG.JS (MANDATORY FOR WEB3 APPS):
  CRITICAL: ALWAYS create /vite.config.js with these permissive settings:

  \`\`\`javascript
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';

  export default defineConfig({
    plugins: [react()],
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      },
      cors: true,
      host: true
    }
  });
  \`\`\`

  This configuration:
  - Allows Coinbase Wallet and Web3 wallet popups (fixes COOP errors)
  - Enables cross-origin resource loading
  - Allows localhost API calls to backend
  - Makes app accessible from WebContainer

EXAMPLE CONTRACT DEPLOYMENT SERVICE:
  \`\`\`typescript
  // /src/services/contractService.ts
  import { type Hex, createWalletClient, custom, createPublicClient, http } from 'viem';
  import { sepolia } from 'viem/chains';

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:3001';

  export class ContractService {
    async compileContract(name: string, symbol: string, supply: string) {
      const response = await fetch(\`\${API_BASE_URL}/api/contracts/compile\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'demo-user',
          contractType: 'erc20',
          name, symbol, totalSupply: supply
        })
      });
      return response.json();
    }

    async deployContract(bytecode: Hex, abi: any[], args: any[], chainId: number, address: Hex) {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum!)
      });

      const hash = await walletClient.deployContract({
        abi, bytecode, args, account: address
      });

      const publicClient = createPublicClient({
        chain: sepolia,
        transport: http()
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { contractAddress: receipt.contractAddress, hash };
    }
  }
  \`\`\`

EXAMPLE DEPLOYMENT HOOK:
  \`\`\`typescript
  // /src/hooks/useContractDeployment.ts
  import { useState } from 'react';
  import { useAccount, useSwitchChain } from 'wagmi';
  import { ContractService } from '../services/contractService';

  export function useContractDeployment() {
    const { address } = useAccount();
    const { switchChain } = useSwitchChain();
    const [isCompiling, setIsCompiling] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);

    const deployToken = async (name: string, symbol: string, supply: string, chainId: number) => {
      setIsCompiling(true);
      const { data } = await new ContractService().compileContract(name, symbol, supply);
      setIsCompiling(false);

      setIsDeploying(true);
      await switchChain({ chainId });
      const result = await service.deployContract(data.bytecode, data.abi, [name, symbol, supply], chainId, address);
      setIsDeploying(false);
      return result;
    };

    return { deployToken, isCompiling, isDeploying };
  }
  \`\`\`

EXAMPLE UI COMPONENT:
  \`\`\`typescript
  // /src/components/TokenDeployer.tsx
  import { useAccount } from 'wagmi';
  import { useAppKit } from '@reown/appkit/react';
  import { useContractDeployment } from '../hooks/useContractDeployment';

  export function TokenDeployer() {
    const { isConnected } = useAccount();
    const { open } = useAppKit();
    const { deployToken, isCompiling, isDeploying } = useContractDeployment();

    return (
      <div>
        {!isConnected ? (
          <button onClick={() => open()}>Connect Wallet</button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); deployToken(name, symbol, supply, chainId); }}>
            {/* Form inputs */}
            <button disabled={isCompiling || isDeploying}>
              {isCompiling ? 'Compiling...' : isDeploying ? 'Deploying...' : 'Deploy Token'}
            </button>
          </form>
        )}
      </div>
    );
  }
  \`\`\`

REQUIRED UI FEATURES:
  ✓ Wallet connection button (using @reown/appkit)
  ✓ Network selector (Sepolia, Base Sepolia, Arbitrum Sepolia)
  ✓ Form for token details (name, symbol, supply)
  ✓ Loading states during compilation and deployment
  ✓ Success screen with contract address
  ✓ Link to block explorer (Etherscan/Basescan/Arbiscan)
  ✓ Handle errors gracefully (compilation errors, insufficient gas, rejected transactions)
  ✓ Only use TESTNETS (Sepolia, Base Sepolia, Arbitrum Sepolia)

ENVIRONMENT VARIABLES - AUTOMATIC CONFIGURATION:
  CRITICAL: ALWAYS create a .env file for Web3 deployment apps with these variables:

  1. Create /.env file with this content:
     \`\`\`
     # EitherWay Backend API (for contract compilation)
     VITE_API_BASE_URL=https://localhost:3001

     # WalletConnect Project ID (for MetaMask connection)
     # Using EitherWay's demo project ID - works immediately, no signup needed!
     # You can replace with your own from https://cloud.reown.com/ if desired
     VITE_WALLETCONNECT_PROJECT_ID=0ab3f2c9a30c1add3cff35eadf12cfc7
     \`\`\`

  2. Then create /src/lib/web3.ts:
     \`\`\`typescript
     import { createAppKit } from '@reown/appkit/react';
     import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
     import { sepolia, baseSepolia, arbitrumSepolia } from 'viem/chains';

     const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
     const chains = [sepolia, baseSepolia, arbitrumSepolia] as const;

     export const wagmiAdapter = new WagmiAdapter({ chains, projectId });
     createAppKit({ adapters: [wagmiAdapter], projectId, chains });
     \`\`\`

  NOTE: The demo WalletConnect project ID (0ab3f2c9a30c1add3cff35eadf12cfc7) is fully functional.
        Users only need to replace it if they want their own analytics/branding.

WHEN TO USE THIS PATTERN:
  - User asks for "token deployer", "NFT deployer", "smart contract deployment app"
  - User wants to "deploy ERC-20", "deploy ERC-721", "create token on blockchain"
  - User mentions "MetaMask", "wallet connection", "deploy to Sepolia/testnet"

WHEN NOT TO USE (use contract interaction pattern instead):
  - User wants to interact with EXISTING deployed contracts
  - User wants to read/write from contracts (use wagmi's useReadContract/useWriteContract)
  - User wants portfolio tracker, NFT gallery, token dashboard (no deployment needed)

========================================
NFT MINTING APPS WITH IPFS/PINATA
========================================

When building NFT minting apps where users upload images:

NFT APP TYPES:
  1. NFT CONTRACT DEPLOYMENT - Deploy ERC-721 contract (like token deployer but no totalSupply)
  2. NFT MINTING INTERFACE - Upload images to IPFS + mint NFTs with metadata
  3. NFT GALLERY - View all minted NFTs from a collection

NFT MINTING FLOW (IMAGE UPLOAD + MINT):
  Step 1: User uploads image file (drag & drop)
  Step 2: Frontend calls POST /api/ipfs/create-nft-asset via postMessage
  Step 3: Backend uploads image to IPFS (Pinata)
  Step 4: Backend generates ERC-721 metadata JSON
  Step 5: Backend uploads metadata to IPFS
  Step 6: Backend returns tokenURI (ipfs://...)
  Step 7: Frontend calls contract.mint(userAddress, tokenURI) using wagmi
  Step 8: User approves transaction in MetaMask
  Step 9: NFT is minted with IPFS metadata

NFT MINTING APP STRUCTURE:
  /src/services/ipfsService.ts - IPFS upload via postMessage API proxy
  /src/hooks/useNFTMinting.ts - Upload + mint flow
  /src/components/ImageUpload.tsx - Drag & drop image uploader
  /src/components/AttributeEditor.tsx - NFT trait editor
  /src/components/NFTMinter.tsx - Main minting UI

CRITICAL NFT PATTERNS:
  ✓ Use /api/ipfs/create-nft-asset for image upload (NOT client-side IPFS)
  ✓ Always use postMessage API proxy for IPFS endpoints (WebContainer compatibility)
  ✓ Generate metadata with ERC-721 standard format
  ✓ Use ipfs:// URLs in metadata, gateway URLs for preview
  ✓ Include drag & drop image upload with preview
  ✓ Allow custom attributes (traits) for NFTs
  ✓ Show IPFS CID and tokenURI after upload
  ✓ Wait for transaction confirmation before showing success

NFT METADATA FORMAT (ERC-721 Standard):
  {
    "name": "Cool Cat #1",
    "description": "A very cool cat NFT",
    "image": "ipfs://QmXxx...",
    "attributes": [
      { "trait_type": "Background", "value": "Blue" },
      { "trait_type": "Hat", "value": "Baseball Cap" },
      { "trait_type": "Rarity", "value": 95 }
    ]
  }

WHEN TO BUILD NFT APPS:
  - User asks for "NFT minter", "NFT deployer with images", "mint NFTs"
  - User mentions "upload images", "IPFS", "Pinata", "NFT metadata"
  - User wants "NFT collection", "mint with attributes", "NFT gallery"

COMMON MISTAKES TO AVOID:
  ❌ Using server .env DEPLOYER_PRIVATE_KEY for user-facing apps
  ❌ Calling /api/contracts/deploy endpoint with backend's private key
  ❌ Using ethers.js instead of viem/wagmi (wagmi is the modern standard)
  ❌ Forgetting vite.config.js permissive headers (causes wallet popup errors)
  ❌ Not creating .env file (backend API calls will fail)
  ❌ Using localhost instead of WSL IP for VITE_API_BASE_URL
  ✅ Use backend for compilation only, user's wallet for deployment
  ✅ Always use wagmi + viem + @reown/appkit for Web3 apps
  ✅ Create .env with VITE_API_BASE_URL and VITE_WALLETCONNECT_PROJECT_ID
  ✅ Add permissive headers to vite.config.js

Output contract:
  - When executing, emit parallel tool_use blocks grouped by task.
  - After tools, review diffs and summarize what changed and why.

========================================
TOKEN-EFFICIENT FILE OPERATIONS
========================================

CRITICAL: Minimize token costs with these strategies:

1. SEARCH FIRST, READ STRATEGICALLY
   ❌ BAD: Read every file to find what you need
   ✅ GOOD: Use either-search-files first, then read only relevant files

2. USE MODES FOR DIFFERENT NEEDS
   either-view modes:
   - mode="summary" - File structure only (imports, functions) - 90-95% token savings
   - mode="range" - Specific lines (start_line, end_line) - 80-95% savings
   - mode="context" - Lines with context (line_numbers, context_lines) - 70-90% savings
   - mode="full" - Complete file (use only for small files < 100 lines)

3. MAKE COMPREHENSIVE EDITS, NOT PIECEMEAL CHANGES (CRITICAL!)
   When editing a file, make ONE comprehensive edit that includes ALL changes:

   Example for "change all colors to green":
   ✅ CORRECT: ONE either-edit that replaces entire file/component with ALL colors changed
   ❌ WRONG: 19 separate either-edit calls (one per color instance)

   How to do it:
   1. Read file with either-view
   2. Make ONE either-edit call that replaces the entire component/section
   3. Include ALL changes in that one edit (all color changes, all text changes, etc.)

   Benefits:
   - Fewer tool calls = faster execution
   - No risk of conflicting edits
   - Easier to review changes
   - More token efficient

   NEVER make multiple edits to the same file unless you're editing different, non-overlapping sections!

4. USE EITHER-EDIT FOR COMPREHENSIVE CHANGES
   When changing multiple things in a file (like colors), replace the ENTIRE relevant section:

   ✅ CORRECT for "change all colors to green":
   either-edit: {
     path: "src/App.jsx",
     operation: "replace",
     locator: { start_line: 1, end_line: 200 },  // Replace entire component
     content: "... full component code with ALL colors changed to green ..."
   }

   ❌ WRONG:
   either-edit for line 10
   either-edit for line 15
   either-edit for line 20
   ... 19 separate calls

5. USE ELLIPSIS PATTERN FOR LARGE EDITS
   When editing large files, use content_format="ellipsis":

   ✅ GOOD (saves 70-80% tokens):
   either-edit: {
     path: "src/App.jsx",
     operation: "replace",
     locator: { start_line: 45, end_line: 50 },
     content: \`// ... existing code ...

     // <CHANGE> Updated button color
     <button className="bg-blue-500">Login</button>

     // ... existing code ...\`,
     content_format: "ellipsis",
     return_context: "minimal"
   }

   CRITICAL: For replace operations, ALWAYS provide accurate start_line and end_line.
   When replacing entire files, set end_line to the EXACT last line number (get from either-view).
   Incorrect end_line causes content duplication bugs!

5. USE either-list-files TO EXPLORE STRUCTURE
   Before reading files, understand the project:
   either-list-files: { path: "src", recursive: true, max_depth: 2 }
   Token savings: 95% vs reading all files

6. BATCH INDEPENDENT OPERATIONS
   Read multiple files in parallel (one turn) when possible

REMEMBER: You're judged on completing tasks efficiently, not showing content.
ALWAYS prefer minimal context unless debugging is needed.

Tools available:
  - either-view: Read files with modes (summary/range/context/full for token efficiency)
  - either-search-files: Search code (supports regex, context lines)
  - either-list-files: List directory structure without reading content (95% token savings)
  - either-edit: **Edit files** - Server-side processing. return_context="minimal" for best efficiency. Batch multiple edits in PARALLEL!
  - either-write: Create new files
  - web_search: Search the web for up-to-date information (server-side, automatic citations)
  - eithergen--generate_image: Generate images (OpenAI/custom provider, saves to disk)`;

export interface AgentOptions {
  workingDir: string;
  claudeConfig: ClaudeConfig;
  agentConfig: AgentConfig;
  executors: ToolExecutor[];
  dryRun?: boolean;
  webSearch?: {
    enabled: boolean;
    maxUses?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
  };
  systemPromptPrefix?: string; // P1.5: Optional dynamic prefix for context (e.g., Memory Prelude)
}

export class Agent {
  private modelClient: ModelClient;
  private toolRunner: ToolRunner;
  private recorder: TranscriptRecorder;
  private conversationHistory: Message[];
  private options: AgentOptions;
  private systemPromptPrefix: string; // P1.5: Dynamic system prompt prefix

  // --- READ-before-WRITE enforcement constants ---
  private static readonly WRITE_TOOLS = new Set(['either-edit', 'either-write']);
  private static readonly READ_TOOL = 'either-view';

  constructor(options: AgentOptions) {
    this.options = options;
    this.systemPromptPrefix = options.systemPromptPrefix || ''; // P1.5: Store prefix
    this.modelClient = new ModelClient(options.claudeConfig);
    this.toolRunner = new ToolRunner(options.executors, options.workingDir, options.agentConfig);
    this.recorder = new TranscriptRecorder(options.agentConfig);
    this.conversationHistory = [];
  }

  /**
   * Load conversation history (for restoring state)
   */
  loadConversationHistory(messages: Message[]): void {
    this.conversationHistory = messages;
  }

  /**
   * P1.5: Update the system prompt prefix dynamically (for Memory Prelude)
   */
  setSystemPromptPrefix(prefix: string): void {
    this.systemPromptPrefix = prefix;
  }

  /**
   * Process a user request through the agent workflow
   * @param userMessage - The user's prompt
   * @param callbacks - Optional streaming callbacks for real-time updates
   */
  async processRequest(userMessage: string, callbacks?: StreamingCallbacks): Promise<string> {
    // Start transcript
    const transcriptId = this.recorder.startTranscript(userMessage);

    // Add user message to history (content must be array for Claude API)
    this.conversationHistory.push({
      role: 'user',
      content: [{ type: 'text', text: userMessage }],
    });

    this.recorder.addEntry({
      timestamp: new Date().toISOString(),
      role: 'user',
      content: userMessage,
    });

    let finalResponse = '';
    let turnCount = 0;
    const changedFiles = new Set<string>();
    let hasExecutedTools = false;

    // Track cumulative token usage across all turns
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let justExecutedTools = false; // Track if we executed tools in previous iteration

    // Buffering for thinking → reasoning transition
    let thinkingBuffer = '';
    let thinkingStartTime: number | null = null;
    let isInThinkingPhase = false;

    // Buffering for final summary (after tools)
    let summaryBuffer = '';
    let isInSummaryPhase = false;

    // Track file operations across ALL turns (not just per-turn)
    const fileOpsThisRequest = new Map<string, 'create' | 'edit'>();
    const filesCreatedThisRequest = new Set<string>();

    while (turnCount < MAX_AGENT_TURNS) {
      turnCount++;

      // Validate conversation history before sending to Claude
      this.validateConversationHistory();

      // Track if we should skip thinking phase (for subsequent turns after tools)
      let hasEmittedThinking = false;
      if (justExecutedTools) {
        // Skip thinking phase for summary turn (no need to show "Thinking..." again)
        hasEmittedThinking = true;
        isInSummaryPhase = true; // Buffer summary text for smooth streaming
        summaryBuffer = '';
        justExecutedTools = false;
      }

      // P1.5: Build final system prompt (prefix + static prompt)
      const finalSystemPrompt = this.systemPromptPrefix
        ? `${this.systemPromptPrefix}\n\n---\n\n${SYSTEM_PROMPT}`
        : SYSTEM_PROMPT;

      // Send message to Claude
      const response = await this.modelClient.sendMessage(
        this.conversationHistory,
        finalSystemPrompt,
        getAllToolDefinitions(),
        {
          onDelta: async (delta) => {
            if (delta.type === 'text') {
              // Start thinking phase on first text delta
              if (!hasEmittedThinking && callbacks?.onPhase) {
                callbacks.onPhase('thinking');
                thinkingStartTime = Date.now();
                isInThinkingPhase = true;
                hasEmittedThinking = true;
              }

              // Buffer text during thinking phase (don't emit yet)
              if (isInThinkingPhase) {
                thinkingBuffer += delta.content;
              } else if (isInSummaryPhase) {
                // Buffer summary text for smooth streaming
                summaryBuffer += delta.content;
              } else {
                // Normal streaming (shouldn't happen in our workflow)
                if (callbacks?.onDelta) {
                  callbacks.onDelta(delta);
                } else {
                  process.stdout.write(delta.content);
                }
              }
            }
          },
          webSearchConfig: this.options.webSearch,
        },
      );

      // Accumulate token usage
      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;

      // Check token cap to prevent runaway usage
      const totalTokens = totalInputTokens + totalOutputTokens;
      if (totalTokens > MAX_TOKENS_PER_REQUEST) {
        const errorMsg = `⚠️  Token limit exceeded: ${totalTokens.toLocaleString()} / ${MAX_TOKENS_PER_REQUEST.toLocaleString()} tokens used. Stopping to prevent excessive costs.`;
        console.warn(`[Agent] ${errorMsg}`);

        // Add error message to conversation
        this.conversationHistory.push({
          role: 'assistant',
          content: [{ type: 'text', text: errorMsg }],
        });

        // Return error with token usage stats
        return `${errorMsg}\n\nToken breakdown:\n- Input: ${totalInputTokens.toLocaleString()}\n- Output: ${totalOutputTokens.toLocaleString()}\n- Total: ${totalTokens.toLocaleString()}`;
      }

      // Record assistant response
      this.recorder.addEntry({
        timestamp: new Date().toISOString(),
        role: 'assistant',
        content: response.content,
        metadata: {
          model: this.options.claudeConfig.model,
          tokenUsage: {
            input: response.usage.inputTokens,
            output: response.usage.outputTokens,
          },
          stopReason: response.stopReason || undefined,
        },
      });

      // Extract text for final summary
      const textBlocks = response.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');

      // --- Enforce READ-before-WRITE by injecting either-view blocks if missing ---
      const { contentBlocks: enforcedAssistantBlocks, toolUses } = this.injectReadBeforeWriteBlocks(response.content);

      // --- Handle thinking → reasoning transition ---
      if (isInThinkingPhase && thinkingBuffer && toolUses.length > 0) {
        // Thinking phase complete, we have tools to execute
        isInThinkingPhase = false;

        // Calculate thinking duration
        const thinkingDuration = thinkingStartTime ? Math.round((Date.now() - thinkingStartTime) / 1000) : 0;

        // Emit thinking complete with duration
        if (callbacks?.onThinkingComplete) {
          callbacks.onThinkingComplete(thinkingDuration);
        }

        // Small delay to let user read the "Thought for X seconds" message
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Emit reasoning phase
        if (callbacks?.onPhase) {
          callbacks.onPhase('reasoning');
        }

        // Stream buffered text smoothly (chunk by chunk for animation)
        if (callbacks?.onReasoning) {
          for (let i = 0; i < thinkingBuffer.length; i += REASONING_STREAM_CHUNK_SIZE) {
            const chunk = thinkingBuffer.slice(i, i + REASONING_STREAM_CHUNK_SIZE);
            callbacks.onReasoning({ text: chunk });
            await new Promise((resolve) => setTimeout(resolve, REASONING_STREAM_DELAY_MS));
          }
        }

        // Clear buffer
        thinkingBuffer = '';
      } else if (isInThinkingPhase && thinkingBuffer && toolUses.length === 0) {
        // No tools, treat buffered text as final response (edge case)
        isInThinkingPhase = false;
        if (callbacks?.onDelta) {
          callbacks.onDelta({ type: 'text', content: thinkingBuffer });
        }
        thinkingBuffer = '';
      }

      // Only add assistant message if it has content (Anthropic API requirement)
      if (enforcedAssistantBlocks.length > 0) {
        this.conversationHistory.push({
          role: 'assistant',
          content: enforcedAssistantBlocks as any,
        });
      } else {
        // Edge case: empty response - add placeholder to maintain conversation flow
        console.warn('[Agent] Warning: Assistant response had no content blocks, adding placeholder');
        this.conversationHistory.push({
          role: 'assistant',
          content: [{ type: 'text', text: '...' }],
        });
      }

      // If no tool uses (client-side tools), we're done - run verification if we executed tools
      // Server-side tools (web search) are already executed and don't need processing
      if (toolUses.length === 0) {
        finalResponse = textBlocks;

        // If we were in summary phase, stream the buffered summary smoothly
        if (isInSummaryPhase && summaryBuffer) {
          // Emit 'building' phase
          if (callbacks?.onPhase) {
            callbacks.onPhase('building');
          }

          // Stream buffered summary as regular message content (NOT reasoning)
          if (callbacks?.onDelta) {
            for (let i = 0; i < summaryBuffer.length; i += REASONING_STREAM_CHUNK_SIZE) {
              const chunk = summaryBuffer.slice(i, i + REASONING_STREAM_CHUNK_SIZE);
              callbacks.onDelta({ type: 'text', content: chunk });
              await new Promise((resolve) => setTimeout(resolve, REASONING_STREAM_DELAY_MS));
            }
          }

          // Clear summary phase
          isInSummaryPhase = false;
          summaryBuffer = '';
        }

        // Run verification if tools were executed this session
        if (hasExecutedTools && !this.options.dryRun) {
          const verificationSummary = await this.runVerification(changedFiles);
          finalResponse += verificationSummary;
        }

        break;
      }

      // Emit 'code-writing' phase when we have tools to execute
      if (toolUses.length > 0 && callbacks?.onPhase) {
        // Add delay before showing "Writing code..." for natural pacing
        await new Promise((resolve) => setTimeout(resolve, 600));
        callbacks.onPhase('code-writing');
      }

      // Mark that we're executing tools so next iteration can emit 'completed'
      if (toolUses.length > 0) {
        justExecutedTools = true;
        hasExecutedTools = true;
      }

      // Execute tools (dry run if specified)
      let toolResults: ToolResult[];
      if (this.options.dryRun) {
        toolResults = toolUses.map((tu: ToolUse) => ({
          type: 'tool_result' as const,
          tool_use_id: tu.id,
          content: `[DRY RUN] Would execute: ${tu.name} with input: ${JSON.stringify(tu.input, null, 2)}`,
        }));
      } else {
        // Track new file operations this turn (for emitting)
        const newFileOpsThisTurn = new Map<string, 'create' | 'edit'>();

        // CRITICAL: Emit events BEFORE executing tools, then execute ALL tools in ONE batch
        // This allows tool-runner to serialize edits to the same file

        // Step 1: Emit "creating/editing" events for all file operations
        for (const toolUse of toolUses) {
          const filePath = (toolUse.input as any)?.path;

          if (filePath && (toolUse.name === 'either-write' || toolUse.name === 'either-edit')) {
            // Determine operation: 'create' if new file, 'edit' if already exists
            let operation: 'create' | 'edit';
            if (filesCreatedThisRequest.has(filePath)) {
              operation = 'edit';
            } else if (toolUse.name === 'either-write') {
              operation = 'create';
              filesCreatedThisRequest.add(filePath);
            } else {
              operation = 'edit';
            }

            // Only track if not already emitted in this request
            if (!fileOpsThisRequest.has(filePath)) {
              fileOpsThisRequest.set(filePath, operation);
              newFileOpsThisTurn.set(filePath, operation);

              // Emit "Creating..." or "Editing..." message
              if (callbacks?.onFileOperation) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                const progressiveState: 'creating' | 'editing' = operation === 'create' ? 'creating' : 'editing';
                callbacks.onFileOperation(progressiveState, filePath);
              }
            }
          }

          // Emit tool start (for non-file operations)
          if (callbacks?.onToolStart && !filePath) {
            callbacks.onToolStart({
              name: toolUse.name,
              toolUseId: toolUse.id,
              filePath,
            });
          }
        }

        // Step 2: Execute ALL tools in ONE batch (enables serialization for same-file edits)
        toolResults = await this.toolRunner.executeTools(toolUses);

        // Step 3: Emit "created/edited" completion events
        for (const toolUse of toolUses) {
          const filePath = (toolUse.input as any)?.path;

          // Emit "Created" or "Edited" message after execution
          if (filePath && newFileOpsThisTurn.has(filePath)) {
            if (callbacks?.onFileOperation) {
              await new Promise((resolve) => setTimeout(resolve, 300));
              const operation = newFileOpsThisTurn.get(filePath);
              const completedState: 'created' | 'edited' = operation === 'create' ? 'created' : 'edited';
              callbacks.onFileOperation(completedState, filePath);
            }
          }

          // Emit tool end (for non-file operations)
          if (callbacks?.onToolEnd && !filePath) {
            callbacks.onToolEnd({
              name: toolUse.name,
              toolUseId: toolUse.id,
              filePath,
            });
          }
        }

        hasExecutedTools = true;

        // Track changed files and collect created file paths
        const createdFilesThisTurn = new Set<string>();
        for (const result of toolResults) {
          const metadata = (result as any).metadata;
          if (metadata?.path && !result.is_error) {
            changedFiles.add(metadata.path);
            createdFilesThisTurn.add(metadata.path);
          }
        }

        // Check for missing file references in newly created HTML files
        const missingRefs = await this.checkMissingFileReferences(toolUses, createdFilesThisTurn, toolResults);
        if (missingRefs.length > 0) {
          // Add warning to the last tool result to inform the agent
          const warningMessage = `\n\n⚠️ WARNING: Missing file references detected:\n${missingRefs.map((ref) => `  - ${ref.htmlFile} references <${ref.tag} ${ref.attr}="${ref.file}"> but ${ref.file} was not created`).join('\n')}\n\nYou MUST create these files in your next response to make the app functional.`;

          // Append warning to the last tool result
          if (toolResults.length > 0) {
            const lastResult = toolResults[toolResults.length - 1];
            lastResult.content = (lastResult.content || '') + warningMessage;
            console.warn('[Agent]' + warningMessage);
          }
        }
      }

      // Record tool results
      this.recorder.addEntry({
        timestamp: new Date().toISOString(),
        role: 'user',
        content: toolResults,
      });

      // Add tool results to conversation
      this.conversationHistory.push({
        role: 'user',
        content: toolResults,
      });

      // CRITICAL: Stop loop after file edits to prevent sequential editing
      // Check if any file edit tools were executed
      const hasFileEdits = toolUses.some(
        (tu) => tu.name === 'either-edit' || tu.name === 'either-write'
      );

      if (hasFileEdits) {
        // File edits detected - STOP loop to prevent sequential edits
        console.log('[Agent] File edits detected - stopping loop to prevent sequential editing');
        finalResponse = 'Files updated successfully.';
        break;
      }

      // If stop reason was end_turn, continue conversation
      if (response.stopReason === 'end_turn') {
        continue;
      }
    }

    // End transcript
    this.recorder.endTranscript(transcriptId, finalResponse);

    // Emit completed phase (only at the very end, after all turns)
    if (callbacks?.onPhase) {
      callbacks.onPhase('completed');
    }

    // Emit completion with token usage
    if (callbacks?.onComplete) {
      callbacks.onComplete({
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
    }

    return finalResponse;
  }

  /**
   * Get conversation history
   */
  getHistory(): Message[] {
    return [...this.conversationHistory];
  }

  /**
   * Reset conversation
   */
  reset(): void {
    this.conversationHistory = [];
    this.toolRunner.clearCache();
  }

  /**
   * Save transcript to disk
   */
  async saveTranscript(): Promise<void> {
    await this.recorder.saveCurrentTranscript();
  }

  /**
   * Set database context for file operations
   */
  setDatabaseContext(fileStore: any, appId: string, sessionId?: string): void {
    this.toolRunner.setDatabaseContext(fileStore, appId, sessionId);
  }

  /**
   * PHASE 0: Set file cache for token efficiency
   */
  setFileCache(fileCache: any): void {
    this.toolRunner.setFileCache(fileCache);
  }

  /**
   * Run verification and create summary
   */
  private async runVerification(changedFiles: Set<string>): Promise<string> {
    const verifier = new VerifierRunner(this.options.workingDir);

    // Create change summary
    const changeSummary = this.createChangeSummary(changedFiles);

    // Run verification
    const verifyResult = await verifier.run();
    const verifySummary = VerifierRunner.formatSummary(verifyResult);

    // Get metrics summary
    const metrics = this.toolRunner.getMetrics();
    const metricsSummary = metrics.getSummaryString();

    return `\n\n---\n${changeSummary}${verifySummary}\n\n**Metrics:**\n${metricsSummary}`;
  }

  /**
   * Create a summary of changed files
   */
  private createChangeSummary(changedFiles: Set<string>): string {
    if (changedFiles.size === 0) {
      return '';
    }

    const files = Array.from(changedFiles).sort();
    const summary =
      files.length === 1
        ? `**Changed:** ${files[0]}\n`
        : `**Changed (${files.length} files):**\n${files.map((f) => `  - ${f}`).join('\n')}\n`;

    return summary;
  }

  /**
   * Validate conversation history format and content
   * Prevents API errors by ensuring all messages follow Claude API requirements
   */
  private validateConversationHistory(): void {
    this.conversationHistory.forEach((msg, idx) => {
      // Validate that content is always an array (Claude API requirement)
      if (!Array.isArray(msg.content)) {
        console.error(`\n❌ CONVERSATION HISTORY VALIDATION ERROR:`);
        console.error(`   Message [${idx}] (role: ${msg.role}) has non-array content`);
        console.error(`   Content type: ${typeof msg.content}`);
        console.error(`   Content value:`, msg.content);
        console.error(`\n   Claude API requires content to be an array of content blocks.`);
        console.error('');

        throw new Error(
          `Conversation history validation failed: ` +
            `Message ${idx} has invalid content format (expected array, got ${typeof msg.content}). ` +
            `This will cause Claude API to reject the request with "Input should be a valid list" error.`,
        );
      }

      // Validate that content array is not empty (except for optional final assistant message)
      if (msg.content.length === 0) {
        const isFinalAssistant = idx === this.conversationHistory.length - 1 && msg.role === 'assistant';
        if (!isFinalAssistant) {
          console.error(`\n❌ CONVERSATION HISTORY VALIDATION ERROR:`);
          console.error(`   Message [${idx}] (role: ${msg.role}) has empty content array`);
          console.error(`\n   Claude API requires all messages to have non-empty content,`);
          console.error(`   except for the optional final assistant message.`);
          console.error('');

          throw new Error(
            `Conversation history validation failed: ` +
              `Message ${idx} has empty content array. ` +
              `This will cause Claude API to reject the request with "all messages must have non-empty content" error.`,
          );
        }
      }

      // Validate server_tool_use blocks are properly paired with web_search_tool_result
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const serverToolUses = msg.content.filter((b: any) => b.type === 'server_tool_use');
        const webSearchResults = msg.content.filter((b: any) => b.type === 'web_search_tool_result');

        if (serverToolUses.length > 0) {
          console.log(`\n[DEBUG] Message [${idx}] validation:`);
          console.log(`  server_tool_uses: ${serverToolUses.length}`);
          console.log(`  web_search_tool_results: ${webSearchResults.length}`);
          console.log(`  All blocks in message:`);
          msg.content.forEach((block: any, blockIdx: number) => {
            console.log(
              `    [${blockIdx}] ${block.type}${block.id ? ` (id: ${block.id})` : ''}${block.tool_use_id ? ` (tool_use_id: ${block.tool_use_id})` : ''}`,
            );
          });

          // Verify each server_tool_use has a corresponding web_search_tool_result
          serverToolUses.forEach((stu: any) => {
            const hasMatchingResult = webSearchResults.some((wsr: any) => wsr.tool_use_id === stu.id);

            if (!hasMatchingResult) {
              console.error(
                `\n⚠️  WARNING: Message [${idx}] has server_tool_use (${stu.id}) without web_search_tool_result`,
              );
              console.error(`   This might cause issues, but continuing anyway for debugging...`);
              console.error('');

              // Temporarily disable throwing - just log the warning
              // throw new Error(
              //   `Conversation history validation failed: ` +
              //   `Message ${idx} has server_tool_use "${stu.name}" (${stu.id}) ` +
              //   `without corresponding web_search_tool_result. ` +
              //   `This indicates a bug in the streaming or content block handling.`
              // );
            }
          });
        }
      }
    });
  }

  /**
   * Injects `either-view` reads before any write/edit tool calls that lack a
   * preceding read for the same `path` within the same assistant turn.
   * Also returns the final list of tool_uses to execute (in order).
   */
  /**
   * PHASE 4: Token Efficiency - Inject reads before writes only if configured
   *
   * DEPRECATED: With either-edit tool, this is no longer necessary.
   * The either-edit tool reads server-side (no token cost).
   *
   * Mostly disabled now - either-edit handles reads server-side.
   */
  private injectReadBeforeWriteBlocks(contentBlocks: any[]): { contentBlocks: any[]; toolUses: ToolUse[] } {
    const out: any[] = [];
    const toolUsesCollected: ToolUse[] = [];
    const seenReadForPath = new Set<string>();

    // PHASE 4: Check config flag - disable forced reads for token efficiency
    const enableForcedRead = this.options.agentConfig?.policy?.forceReadBeforeWrite ?? false;

    const pushAndCollect = (blk: any) => {
      out.push(blk);
      if (blk && blk.type === 'tool_use') {
        toolUsesCollected.push({
          type: 'tool_use',
          id: blk.id,
          name: blk.name,
          input: blk.input,
        });
      }
    };

    for (const blk of contentBlocks) {
      // Track explicit reads
      if (blk?.type === 'tool_use' && blk.name === Agent.READ_TOOL) {
        const path = blk.input?.path;
        if (typeof path === 'string' && path.length > 0) {
          seenReadForPath.add(path);
        }
        pushAndCollect(blk);
        continue;
      }

      // Before either-edit (EDIT), ensure we've read the target file
      // PHASE 4: Only inject if forceReadBeforeWrite is enabled
      // NO injection for either-write (CREATE) - it handles file existence checks internally
      if (blk?.type === 'tool_use' && blk.name === 'either-edit') {
        const path = blk.input?.path;

        if (enableForcedRead && typeof path === 'string' && path.length > 0 && !seenReadForPath.has(path)) {
          // Inject a synthetic read tool_use directly before the edit (legacy behavior)
          const injectedId = `enforcer-view-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const injected = {
            type: 'tool_use',
            id: injectedId,
            name: Agent.READ_TOOL,
            input: { path },
          };
          pushAndCollect(injected);
          seenReadForPath.add(path);
        }

        // Optionally annotate missing needle (soft warning) - only if forced read is enabled
        if (enableForcedRead && !blk.input?.needle) {
          blk.input = {
            ...blk.input,
            _enforcerWarning: 'No `needle` provided; injected a read to reduce risk.',
          };
        }

        pushAndCollect(blk);
        continue;
      }

      // For eithergen--generate_image or other WRITE tools, no read injection needed
      if (blk?.type === 'tool_use' && Agent.WRITE_TOOLS.has(blk.name)) {
        pushAndCollect(blk);
        continue;
      }

      // passthrough others
      pushAndCollect(blk);
    }

    // Only return *tool_use* blocks as executable tool uses, in order
    const executableToolUses = toolUsesCollected.filter((b: any) => b.type === 'tool_use') as ToolUse[];
    return { contentBlocks: out, toolUses: executableToolUses };
  }

  /**
   * Check for missing file references in newly created files
   * Detects:
   * - HTML: <script src="..."> and <link href="..."> that reference non-existent files
   * - React: import statements that reference non-existent components
   */
  private async checkMissingFileReferences(
    toolUses: ToolUse[],
    createdFiles: Set<string>,
    toolResults: ToolResult[],
  ): Promise<Array<{ htmlFile: string; tag: string; attr: string; file: string }>> {
    const missing: Array<{ htmlFile: string; tag: string; attr: string; file: string }> = [];

    // Check HTML files for script/link references
    const htmlWrites = toolUses.filter(
      (tu) =>
        (tu.name === 'either-write' || tu.name === 'either-edit') &&
        tu.input?.path?.toLowerCase().endsWith('.html'),
    );

    for (const htmlWrite of htmlWrites) {
      const htmlPath = htmlWrite.input?.path;
      if (!htmlPath) continue;

      const resultIdx = toolUses.indexOf(htmlWrite);
      const result = toolResults[resultIdx];
      if (!result || result.is_error) continue;

      const htmlContent = htmlWrite.name === 'either-write' ? htmlWrite.input?.content : null;

      if (!htmlContent || typeof htmlContent !== 'string') continue;

      // Extract script and link references using simple regex
      const scriptMatches = htmlContent.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
      for (const match of scriptMatches) {
        const scriptPath = match[1];
        const normalizedPath = scriptPath.replace(/^\.?\//, '');
        if (!createdFiles.has(normalizedPath) && !createdFiles.has(scriptPath)) {
          missing.push({
            htmlFile: htmlPath,
            tag: 'script',
            attr: 'src',
            file: scriptPath,
          });
        }
      }

      const linkMatches = htmlContent.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi);
      for (const match of linkMatches) {
        const fullTag = match[0];
        if (fullTag.includes('stylesheet')) {
          const linkPath = match[1];
          const normalizedPath = linkPath.replace(/^\.?\//, '');
          if (!createdFiles.has(normalizedPath) && !createdFiles.has(linkPath)) {
            missing.push({
              htmlFile: htmlPath,
              tag: 'link',
              attr: 'href',
              file: linkPath,
            });
          }
        }
      }
    }

    // Check React/JSX/TSX files for import statements
    const reactWrites = toolUses.filter(
      (tu) =>
        (tu.name === 'either-write' || tu.name === 'either-edit') &&
        (tu.input?.path?.endsWith('.jsx') ||
          tu.input?.path?.endsWith('.tsx') ||
          tu.input?.path?.endsWith('.js') ||
          tu.input?.path?.endsWith('.ts')),
    );

    for (const reactWrite of reactWrites) {
      const filePath = reactWrite.input?.path;
      if (!filePath) continue;

      const resultIdx = toolUses.indexOf(reactWrite);
      const result = toolResults[resultIdx];
      if (!result || result.is_error) continue;

      const content = reactWrite.name === 'either-write' ? reactWrite.input?.content : null;

      if (!content || typeof content !== 'string') continue;

      // Extract import statements: import ... from './path'
      const importMatches = content.matchAll(
        /import\s+(?:(?:\{[^}]+\}|[\w]+)(?:\s*,\s*(?:\{[^}]+\}|[\w]+))*)\s+from\s+['"]([^'"]+)['"]/g,
      );

      for (const match of importMatches) {
        const importPath = match[1];

        // Skip node_modules and external packages (e.g., 'react', '@vitejs/plugin-react')
        if (!importPath.startsWith('.')) continue;

        // Normalize path (remove leading ./)
        let normalizedPath = importPath.replace(/^\.\//, '');

        // Check multiple possible file paths (with/without extensions, index files)
        const possiblePaths = [
          normalizedPath,
          `${normalizedPath}.jsx`,
          `${normalizedPath}.tsx`,
          `${normalizedPath}.js`,
          `${normalizedPath}.ts`,
          `${normalizedPath}/index.jsx`,
          `${normalizedPath}/index.tsx`,
          `${normalizedPath}/index.js`,
          `${normalizedPath}/index.ts`,
        ];

        // Also check paths relative to src/ directory
        const srcPaths = possiblePaths.map((p) => `src/${p}`);

        // Check if any of the possible paths exist in createdFiles
        const exists = [...possiblePaths, ...srcPaths].some(
          (p) => createdFiles.has(p) || createdFiles.has(`./${p}`) || createdFiles.has(`/${p}`),
        );

        if (!exists) {
          missing.push({
            htmlFile: filePath,
            tag: 'import',
            attr: 'from',
            file: importPath,
          });
        }
      }
    }

    return missing;
  }
}
