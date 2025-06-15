const urlInput = document.getElementById('urlInput');
const goButton = document.getElementById('goButton');
const iframe = document.getElementById('contentFrame');
const fetchLog = document.getElementById('fetchLog');

// This script will be injected into the fetched HTML to intercept network requests.
const interceptorScript = `
<script>
    // --- Intercept Fetch API ---
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        // Create a new Request object to normalize the arguments
        const request = new Request(...args);

        // We only care about GET requests for this tool
        if (request.method.toUpperCase() === 'GET') {
            // Post the absolute URL to the parent window for logging
            window.parent.postMessage({
                type: 'fetch-intercept',
                url: request.url // request.url is always an absolute URL
            }, '*');
        }

        // Proceed with the original fetch call
        return originalFetch.apply(this, args);
    };

    // --- Intercept XMLHttpRequest ---
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (method.toUpperCase() === 'GET') {
            // Resolve the URL to be absolute before posting
            const absoluteUrl = new URL(url, window.location.href).href;
            window.parent.postMessage({
                type: 'fetch-intercept',
                url: absoluteUrl
            }, '*');
        }
        // Proceed with the original open call
        return originalOpen.apply(this, [method, url, ...rest]);
    };
<\/script>
`;

async function loadAndInspect() {
    const url = urlInput.value;
    if (!url) {
        alert('Please enter a URL.');
        return;
    }

    fetchLog.textContent = 'Loading...';
    goButton.disabled = true;
    goButton.textContent = 'Loading...';
    iframe.srcdoc = `<h1 style="font-family: sans-serif; text-align: center; padding: 2rem;">Loading ${url}...</h1><p style="font-family: sans-serif; text-align: center;">If this takes too long, the website may not be compatible with this tool.</p>`;

    try {
        // We need to use a CORS proxy to fetch cross-domain content in JavaScript.
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch from proxy. Status: ${response.status} ${response.statusText}`);
        }
        
        let html = await response.text();
        
        const pageUrl = new URL(url);

        // Inject a <base> tag into the <head>. This is crucial for fixing relative paths
        // for resources like images, CSS, and other scripts on the proxied page.
        const baseTag = `<base href="${pageUrl.origin}${pageUrl.pathname}">`;

        // Inject our interceptor script and the base tag right after the <head> tag.
        html = html.replace(/(<head[^>]*>)/i, `$1${baseTag}${interceptorScript}`);

        // Load the modified HTML into the iframe.
        iframe.srcdoc = html;

        fetchLog.textContent = `Successfully loaded ${url}. Waiting for network activity...\n\n`;

    } catch (error) {
        console.error('Error loading page:', error);
        fetchLog.textContent = `Error loading ${url}:\n${error.message}\n\nThis could be due to CORS issues not handled by the proxy, or the website may use security features that prevent this kind of inspection. Try another URL or open the browser's DevTools (F12) to debug.`;
        iframe.srcdoc = `<h1 style="font-family: sans-serif; text-align: center; padding: 2rem; color: #d93025;">Error</h1><p style="font-family: sans-serif; text-align: center;">Could not load content from ${url}.</p>`;
    } finally {
        goButton.disabled = false;
        goButton.textContent = 'Load & Inspect';
    }
}

// Listen for the 'fetch-intercept' messages from the sandboxed iframe
window.addEventListener('message', (event) => {
    // Basic security: check if the message has the expected structure.
    // We can't check event.origin because srcdoc-based iframes have a null origin.
    if (event.data && event.data.type === 'fetch-intercept') {
        const logLine = document.createElement('div');
        logLine.textContent = event.data.url;
        fetchLog.appendChild(logLine);
        // Auto-scroll to the bottom of the log
        fetchLog.scrollTop = fetchLog.scrollHeight;
    }
});

// Add event listener for the button
goButton.addEventListener('click', loadAndInspect);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loadAndInspect();
    }
});

// Set initial state message
window.addEventListener('DOMContentLoaded', () => {
   fetchLog.textContent = 'Enter a URL and click "Load & Inspect" to begin.';
});

